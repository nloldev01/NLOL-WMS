import json
from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from .models import Batch, LPN, Pallet, PalletItem
from .serializers import BatchSerializer, LPNSerializer, PalletSerializer
from .services.batch_service import BatchService
from .services.transfer_service import TransferService


class BatchViewSet(viewsets.ModelViewSet):
    queryset = Batch.objects.all().order_by('-created_at')
    serializer_class = BatchSerializer
    permission_classes = ModulePermission.read_write('inventory_core')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['raw_material', 'product', 'batch_type', 'quality_status', 'finished_product_variant', 'finished_product_variant__finished_product']
    search_fields = ['batch_code']

    def perform_create(self, serializer):
        batch_type = self.request.data.get('batch_type', 'RAW')
        batch_code = BatchService.generate_code(batch_type=batch_type)
        serializer.save(batch_code=batch_code)

    @action(detail=False, methods=['post'])
    def generate_only(self, request):
        batch_type = request.data.get('batch_type', 'RAW')
        batch_code = BatchService.generate_code(batch_type=batch_type)
        return Response({"batch_code": batch_code})


class LPNViewSet(viewsets.ModelViewSet):
    queryset = LPN.objects.all().order_by('-created_at')
    serializer_class = LPNSerializer
    permission_classes = ModulePermission.read_write('inventory_core')
    filter_backends = [filters.SearchFilter]
    search_fields = ['lpn_code']


class PalletViewSet(viewsets.ModelViewSet):
    serializer_class   = PalletSerializer
    permission_classes = ModulePermission.read_write('inventory_core')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['is_sealed']
    search_fields      = ['pallet_code', 'notes']
    ordering_fields    = ['created_at', 'pallet_code']

    def get_queryset(self):
        return Pallet.objects.select_related('created_by').prefetch_related(
            'items__lpn__batch__raw_material',
            'items__lpn__batch__product',
            'items__lpn__batch__finished_product_variant__finished_product',
            'items__lpn__batch__finished_product_variant__unit',
            'items__lpn__batch__finished_product_variant__volume_unit',
        ).all()

    def perform_create(self, serializer):
        serializer.save(
            pallet_code=Pallet.generate_pallet_code(),
            created_by=self.request.user,
        )

    @action(detail=False, methods=['get'], url_path='scan')
    def scan(self, request):
        """GET ?code=PAL-XXXXXX — return pallet + all items."""
        code = request.query_params.get('code', '').strip()
        if not code:
            return Response({'detail': 'Provide ?code=PAL-XXXXXXXX'}, status=400)
        try:
            pallet = self.get_queryset().get(pallet_code=code)
        except Pallet.DoesNotExist:
            return Response({'detail': f'Pallet not found: {code}'}, status=404)
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Body: { lpn_code, quantity } — upserts (creates or increments) PalletItem by LPN."""
        pallet   = self.get_object()
        if pallet.is_sealed:
            return Response({'detail': 'Cannot modify a sealed pallet.'}, status=400)
        lpn_code = request.data.get('lpn_code', '').strip()
        quantity = request.data.get('quantity')
        if not lpn_code or quantity is None:
            return Response({'detail': 'lpn_code and quantity are required.'}, status=400)
        try:
            lpn = LPN.objects.select_related('batch').get(lpn_code=lpn_code)
        except LPN.DoesNotExist:
            return Response({'detail': f'LPN not found: {lpn_code}'}, status=404)
        existing = pallet.items.filter(lpn=lpn).first()
        if existing:
            existing.quantity = float(existing.quantity) + float(quantity)
            existing.save()
        else:
            PalletItem.objects.create(pallet=pallet, lpn=lpn, quantity=quantity)
        pallet.refresh_from_db()
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path=r'remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        pallet = self.get_object()
        if pallet.is_sealed:
            return Response({'detail': 'Cannot modify a sealed pallet.'}, status=400)
        try:
            pallet.items.get(id=item_id).delete()
        except PalletItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=404)
        pallet.refresh_from_db()
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='seal')
    def seal(self, request, pk=None):
        pallet = self.get_object()
        if not pallet.items.exists():
            return Response({'detail': 'Add at least one item before sealing.'}, status=400)
        pallet.is_sealed = True
        pallet.save()
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='unseal')
    def unseal(self, request, pk=None):
        pallet = self.get_object()
        pallet.is_sealed = False
        pallet.save()
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='location-stock')
    def location_stock(self, request):
        """GET ?location_id=X — all non-zero LPN stock at a location with is_palletized annotation."""
        from master_data.models import Location
        loc_id = request.query_params.get('location_id', '').strip()
        if not loc_id:
            return Response({'detail': 'location_id is required.'}, status=400)
        try:
            location = Location.objects.get(id=loc_id)
        except Location.DoesNotExist:
            return Response({'detail': 'Location not found.'}, status=404)

        rows = _stock_at_location(location)

        for row in rows:
            row['item_label'] = (
                row.pop('variant_label', None)
                or row.pop('product_label', None)
                or row.pop('material_label', None)
                or '—'
            )

        all_lpn_ids = {r['lpn_id'] for r in rows if r['lpn_id']}
        palletized_qty_map = {}
        if all_lpn_ids:
            from django.db.models import Sum as DSum
            palletized_qty_map = dict(
                PalletItem.objects
                .filter(pallet__is_sealed=False, lpn_id__in=all_lpn_ids)
                .values('lpn_id')
                .annotate(total=DSum('quantity'))
                .values_list('lpn_id', 'total')
            )
        for row in rows:
            palletized = float(palletized_qty_map.get(row['lpn_id'], 0))
            row['palletized_qty'] = palletized
            row['available_qty']  = max(0.0, row['quantity'] - palletized)
            row['is_palletized']  = palletized > 0

        return Response(rows)

    @action(detail=True, methods=['post'], url_path='bulk-add-items')
    def bulk_add_items(self, request, pk=None):
        """Body: { items: [{ lpn_id, quantity }, ...] } — bulk upsert PalletItems."""
        from django.db import transaction
        pallet = self.get_object()
        if pallet.is_sealed:
            return Response({'detail': 'Cannot modify a sealed pallet.'}, status=400)
        items = request.data.get('items', [])
        if not items:
            return Response({'detail': 'items list is required.'}, status=400)
        try:
            with transaction.atomic():
                for entry in items:
                    lpn_id   = entry.get('lpn_id')
                    quantity = entry.get('quantity')
                    if not lpn_id or quantity is None:
                        raise ValidationError(f'Invalid entry: {entry}')
                    try:
                        lpn = LPN.objects.get(id=lpn_id)
                    except LPN.DoesNotExist:
                        raise ValidationError(f'LPN id {lpn_id} not found.')
                    existing = pallet.items.filter(lpn=lpn).first()
                    if existing:
                        existing.quantity = float(existing.quantity) + float(quantity)
                        existing.save()
                    else:
                        PalletItem.objects.create(pallet=pallet, lpn=lpn, quantity=quantity)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)
        pallet.refresh_from_db()
        return Response(PalletSerializer(pallet, context={'request': request}).data)

    @action(detail=False, methods=['post'], url_path='create-from-location')
    def create_from_location(self, request):
        """Body: { items: [{ lpn_id, quantity }, ...], notes } — atomically create pallet + add items."""
        from django.db import transaction
        items = request.data.get('items', [])
        notes = request.data.get('notes', '')
        if not items:
            return Response({'detail': 'items list is required.'}, status=400)
        try:
            with transaction.atomic():
                pallet = Pallet.objects.create(
                    pallet_code=Pallet.generate_pallet_code(),
                    notes=notes,
                    created_by=request.user,
                )
                for entry in items:
                    lpn_id   = entry.get('lpn_id')
                    quantity = entry.get('quantity')
                    if not lpn_id or quantity is None:
                        raise ValidationError(f'Invalid entry: {entry}')
                    try:
                        lpn = LPN.objects.get(id=lpn_id)
                    except LPN.DoesNotExist:
                        raise ValidationError(f'LPN id {lpn_id} not found.')
                    PalletItem.objects.create(pallet=pallet, lpn=lpn, quantity=quantity)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(
            PalletSerializer(pallet, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ── Stock Transfer ─────────────────────────────────────────────────────────────

class TransferViewSet(viewsets.ViewSet):
    permission_classes = ModulePermission.read_write('inventory_core')

    @action(detail=False, methods=['get'], url_path='scan')
    def scan(self, request):
        """
        GET ?qr=<code>
        Resolves any QR code to a typed response:
          type = "location" | "lpn" | "pallet" | "variant"
        Resolution order:
          1. JSON location QR {"type":"location","code":"..."} → location
          2. PAL- prefix → pallet
          3. LPN table exact match
          4. Location by short_code or full_code (plain text)
          5. SKU|BATCH variant format
        """
        from master_data.models import Location, FinishedProductVariant
        from products_stock.models import FinishedProductStock, ProductStock
        from raw_materials_stock.models import RawMaterialStock
        from dispatch.views import _scan_qr_response

        qr = request.query_params.get('qr', '').strip()
        if not qr:
            return Response({'detail': 'Provide ?qr=<code>'}, status=400)

        # 1. JSON location QR — new format: {"type":"location","id":123}
        #    Legacy format also supported: {"type":"location","code":"ZA-SH1"}
        location = None
        if qr.startswith('{'):
            try:
                parsed = json.loads(qr)
                if isinstance(parsed, dict) and parsed.get('type') == 'location':
                    loc_id   = parsed.get('id')
                    loc_code = parsed.get('code', '')
                    if loc_id:
                        location = Location.objects.filter(id=loc_id).first()
                    elif loc_code:
                        location = Location.objects.filter(
                            models.Q(code=loc_code) | models.Q(short_code=loc_code)
                        ).first()
            except (json.JSONDecodeError, TypeError):
                pass

        if location is not None:
            return Response({
                'type': 'location',
                'data': {
                    'location_id': location.id,
                    'location_label': location.get_full_path(),
                    'location_code': location.get_full_code(),
                    'short_code': location.short_code,
                    'stock': _stock_at_location(location),
                }
            })

        # 2. Pallet — return expanded item list with full transfer metadata
        if qr.startswith('PAL-'):
            try:
                pallet = Pallet.objects.prefetch_related(
                    'items__lpn__batch__raw_material',
                    'items__lpn__batch__product',
                    'items__lpn__batch__finished_product_variant__finished_product',
                    'items__lpn__batch__finished_product_variant__unit',
                    'items__lpn__batch__finished_product_variant__volume_unit',
                ).get(pallet_code=qr)
            except Pallet.DoesNotExist:
                return Response({'detail': f'Pallet not found: {qr}'}, status=404)

            expanded = []
            for pi in pallet.items.all():
                lpn = pi.lpn
                b   = lpn.batch
                # fetch stock entries for this lpn so FROM can be auto-set
                lpn_stock = _lpn_stock_entries(lpn, b, FinishedProductStock, ProductStock, RawMaterialStock)
                expanded.append({
                    'lpn_id': lpn.id, 'lpn_code': lpn.lpn_code,
                    'batch_id': b.id, 'batch_code': b.batch_code, 'batch_type': b.batch_type,
                    'item_label': _build_item_label(b),
                    'stock_type': 'FIN' if b.batch_type == 'FIN' else ('PRD' if b.batch_type == 'PRD' else 'RAW'),
                    'variant_id': b.finished_product_variant_id if b.batch_type == 'FIN' else None,
                    'product_id': b.product_id if b.batch_type == 'PRD' else None,
                    'material_id': b.raw_material_id if b.batch_type == 'RAW' else None,
                    'quantity': float(pi.quantity),
                    'locations': lpn_stock,
                })
            return Response({'type': 'pallet', 'data': {'pallet_code': pallet.pallet_code, 'is_sealed': pallet.is_sealed, 'items': expanded}})

        # 3. LPN
        try:
            lpn = LPN.objects.select_related(
                'batch__raw_material',
                'batch__product',
                'batch__finished_product_variant__finished_product',
                'batch__finished_product_variant__unit',
                'batch__finished_product_variant__volume_unit',
            ).get(lpn_code=qr)
            b = lpn.batch
            stock_entries = _lpn_stock_entries(lpn, b, FinishedProductStock, ProductStock, RawMaterialStock)
            data = {
                'lpn_id': lpn.id, 'lpn_code': lpn.lpn_code,
                'batch_id': b.id, 'batch_code': b.batch_code, 'batch_type': b.batch_type,
                'item_label': _build_item_label(b),
                'stock_type': 'FIN' if b.batch_type == 'FIN' else ('PRD' if b.batch_type == 'PRD' else 'RAW'),
                'variant_id': b.finished_product_variant_id if b.batch_type == 'FIN' else None,
                'product_id': b.product_id if b.batch_type == 'PRD' else None,
                'material_id': b.raw_material_id if b.batch_type == 'RAW' else None,
                'locations': stock_entries,
                'total_quantity': sum(e['quantity'] for e in stock_entries),
            }
            return Response({'type': 'lpn', 'data': data})
        except LPN.DoesNotExist:
            pass

        # 4. Location by plain short_code or full_code
        try:
            location = Location.objects.get(short_code=qr)
        except (Location.DoesNotExist, Location.MultipleObjectsReturned):
            location = None
        if location is None:
            for loc in Location.objects.all():
                if loc.get_full_code() == qr:
                    location = loc
                    break
        if location is not None:
            return Response({
                'type': 'location',
                'data': {
                    'location_id': location.id,
                    'location_label': location.get_full_path(),
                    'location_code': location.get_full_code(),
                    'short_code': location.short_code,
                    'stock': _stock_at_location(location),
                }
            })

        # 5. SKU|BATCH variant — enrich with all stock locations
        try:
            variant_data = _scan_qr_response(qr)
            variant = FinishedProductVariant.objects.get(id=variant_data['variant_id'])
            qs = FinishedProductStock.objects.select_related('location', 'batch', 'lpn').filter(
                finished_product_variant=variant, quantity__gt=0
            )
            loc_entries = []
            for s in qs:
                loc_entries.append({
                    'location_id': s.location_id,
                    'location_label': s.location.get_full_path(),
                    'batch_id': s.batch_id,
                    'batch_code': s.batch.batch_code if s.batch else None,
                    'lpn_id': s.lpn_id,
                    'lpn_code': s.lpn.lpn_code if s.lpn else None,
                    'quantity': float(s.quantity),
                })
            variant_data.update({
                'stock_type': 'FIN',
                'item_label': variant_data.get('variant_label', ''),
                'lpn_id': None, 'lpn_code': None,
                'product_id': None, 'material_id': None,
                'quantity': 1,
                'locations': loc_entries,
                'total_quantity': sum(e['quantity'] for e in loc_entries),
            })
            return Response({'type': 'variant', 'data': variant_data})
        except ValidationError as e:
            return Response({'detail': str(e.message if hasattr(e, 'message') else e)}, status=404)

    @action(detail=False, methods=['get'], url_path='locations')
    def locations(self, request):
        """GET ?q=<search> — searchable location list for destination picker."""
        from master_data.models import Location as Loc
        q = request.query_params.get('q', '').strip()
        qs = Loc.objects.filter(is_active=True).select_related('parent')
        if q:
            qs = qs.filter(models.Q(name__icontains=q) | models.Q(short_code__icontains=q))
        qs = qs.order_by('name')[:40]
        return Response([{
            'id': loc.id,
            'label': loc.get_full_path(),
            'code': loc.get_full_code(),
            'short_code': loc.short_code,
            'type': loc.type,
        } for loc in qs])

    @action(detail=False, methods=['post'], url_path='execute')
    def execute(self, request):
        """
        POST { to_location, items, notes }
        Each item carries its own from_location_id. Global from_location is an
        optional fallback for backward compatibility.
        Pre-flight validates all items, then executes atomically.
        """
        from master_data.models import Location

        to_id        = request.data.get('to_location')
        from_id_glob = request.data.get('from_location')   # legacy / fallback
        items        = list(request.data.get('items', []))
        notes        = request.data.get('notes', '')

        if not to_id:
            return Response({'detail': 'to_location is required.'}, status=400)
        if not items:
            return Response({'detail': 'No items to transfer.'}, status=400)

        # Apply global fallback
        for item in items:
            if not item.get('from_location_id') and from_id_glob:
                item['from_location_id'] = from_id_glob

        if any(not item.get('from_location_id') for item in items):
            return Response({'detail': 'Each item must have a from_location_id.'}, status=400)

        try:
            to_loc = Location.objects.get(id=to_id)
        except Location.DoesNotExist:
            return Response({'detail': 'Destination location not found.'}, status=404)

        # Block destination = source (all items must differ from to_loc)
        for item in items:
            if str(item.get('from_location_id')) == str(to_id):
                return Response({'detail': 'Source and destination cannot be the same location.'}, status=400)

        # Pre-fetch all unique source locations
        from_ids = {item['from_location_id'] for item in items}
        loc_map  = {loc.id: loc for loc in Location.objects.filter(id__in=from_ids)}
        missing  = from_ids - set(loc_map.keys())
        if missing:
            return Response({'detail': f'Source location(s) not found: {missing}'}, status=404)

        try:
            result = TransferService.execute_multi(
                to_location=to_loc,
                items=items,
                location_map=loc_map,
                performed_by=request.user,
                notes=notes,
            )
        except ValidationError as e:
            msgs = e.message_dict if hasattr(e, 'message_dict') else {'detail': str(e)}
            stock_errors = msgs.get('stock_errors', [])
            if stock_errors:
                return Response(
                    {'detail': 'Insufficient stock for some items.', 'errors': stock_errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)

    @action(
        detail=False, methods=['post'], url_path='adjust',
        permission_classes=ModulePermission.read_write('inventory_adjust'),
    )
    def adjust(self, request):
        """
        POST { stock_type, variant_id|product_id|material_id, batch_id,
               location_id, quantity, direction: 'in'|'out', reason_code, notes }
        Supervisor-only stock correction.
        """
        from master_data.models import Location, FinishedProductVariant, Product, RawMaterialAndConsumable
        from inventory_core.models import Batch, LPN
        from products_stock.models import FinishedProductStockLog, ProductStockLog
        from raw_materials_stock.models import RawMaterialStockLog

        stock_type = request.data.get('stock_type', 'FIN')
        direction  = request.data.get('direction', 'in')
        reason     = request.data.get('reason_code', 'COUNT_CORRECTION')
        extra_note = request.data.get('notes', '')
        notes      = f"[{reason}] {extra_note}".strip()

        REASON_TO_MOVEMENT = {
            'DAMAGE':     'wastage',
            'WASTAGE':    'wastage',
            'PRODUCTION': 'usage',
            'RETURN':     'return',
        }
        if direction == 'in':
            movement_type = REASON_TO_MOVEMENT.get(reason.upper(), 'adjustment_in')
            if movement_type in ('wastage', 'usage'):
                movement_type = 'adjustment_in'
        else:
            movement_type = REASON_TO_MOVEMENT.get(reason.upper(), 'adjustment')

        try:
            location = Location.objects.get(id=request.data['location_id'])
            qty      = Decimal(str(request.data['quantity']))
            batch    = Batch.objects.get(id=request.data['batch_id']) if request.data.get('batch_id') else None
        except (Location.DoesNotExist, KeyError, Exception) as e:
            return Response({'detail': f'Invalid input: {e}'}, status=400)

        try:
            if stock_type == 'FIN':
                variant = FinishedProductVariant.objects.get(id=request.data['variant_id'])
                FinishedProductStockLog.create_movement(
                    finished_product_variant=variant,
                    location=location,
                    movement_type=movement_type,
                    quantity=qty,
                    batch=batch,
                    performed_by=request.user,
                    notes=notes,
                )
            elif stock_type == 'PRD':
                product = Product.objects.get(id=request.data['product_id'])
                ProductStockLog.create_movement(
                    product=product,
                    location=location,
                    movement_type=movement_type,
                    quantity=qty,
                    batch=batch,
                    performed_by=request.user,
                    notes=notes,
                )
            elif stock_type == 'RAW':
                material = RawMaterialAndConsumable.objects.get(id=request.data['material_id'])
                RawMaterialStockLog.create_movement(
                    material=material,
                    location=location,
                    movement_type=movement_type,
                    quantity=qty,
                    batch=batch,
                    performed_by=request.user,
                    notes=notes,
                )
            else:
                return Response({'detail': f'Unknown stock_type: {stock_type}'}, status=400)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)

        return Response({'adjusted': True})


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_item_label(batch):
    if batch.batch_type == 'FIN' and batch.finished_product_variant:
        try:
            v = batch.finished_product_variant
            return f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
        except Exception:
            return str(batch.finished_product_variant)
    elif batch.batch_type == 'PRD' and batch.product:
        return str(batch.product)
    elif batch.batch_type == 'RAW' and batch.raw_material:
        return str(batch.raw_material)
    return batch.batch_code


def _stock_at_location(location):
    """Return all non-zero stock rows at a location as a unified list."""
    from products_stock.models import FinishedProductStock, ProductStock
    from raw_materials_stock.models import RawMaterialStock

    rows = []

    for s in FinishedProductStock.objects.select_related(
        'finished_product_variant__finished_product',
        'finished_product_variant__unit',
        'finished_product_variant__volume_unit',
        'batch', 'lpn',
    ).filter(location=location, quantity__gt=0):
        v = s.finished_product_variant
        try:
            label = f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
        except Exception:
            label = str(v) if v else '—'
        rows.append({
            'stock_type': 'FIN',
            'variant_id': s.finished_product_variant_id,
            'variant_label': label,
            'batch_id': s.batch_id,
            'batch_code': s.batch.batch_code if s.batch else None,
            'lpn_id': s.lpn_id,
            'lpn_code': s.lpn.lpn_code if s.lpn else None,
            'quantity': float(s.quantity),
        })

    for s in ProductStock.objects.select_related('product', 'batch', 'lpn').filter(location=location, quantity__gt=0):
        rows.append({
            'stock_type': 'PRD',
            'product_id': s.product_id,
            'product_label': str(s.product),
            'batch_id': s.batch_id,
            'batch_code': s.batch.batch_code if s.batch else None,
            'lpn_id': s.lpn_id,
            'lpn_code': s.lpn.lpn_code if s.lpn else None,
            'quantity': float(s.quantity),
        })

    for s in RawMaterialStock.objects.select_related('material', 'batch', 'lpn').filter(location=location, quantity__gt=0):
        rows.append({
            'stock_type': 'RAW',
            'material_id': s.material_id,
            'material_label': str(s.material),
            'batch_id': s.batch_id,
            'batch_code': s.batch.batch_code if s.batch else None,
            'lpn_id': s.lpn_id,
            'lpn_code': s.lpn.lpn_code if s.lpn else None,
            'quantity': float(s.quantity),
        })

    return rows


def _lpn_stock_entries(lpn, batch, FinishedProductStock, ProductStock, RawMaterialStock):
    """Return stock location entries for a single LPN across all three stock models."""
    if batch.batch_type == 'FIN':
        qs = FinishedProductStock.objects.select_related('location').filter(lpn=lpn, quantity__gt=0)
    elif batch.batch_type == 'PRD':
        qs = ProductStock.objects.select_related('location').filter(lpn=lpn, quantity__gt=0)
    else:
        qs = RawMaterialStock.objects.select_related('location').filter(lpn=lpn, quantity__gt=0)
    return [{'location_id': s.location_id, 'location_label': s.location.get_full_path(), 'quantity': float(s.quantity)} for s in qs]
