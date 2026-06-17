from decimal import Decimal
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from master_data.models import FinishedProductVariant
from inventory_core.models import Batch

from .models import (
    DealerOrder, DealerOrderItem,
    DispatchOrder, DispatchItem,
    DealerStock,
    DealerSale, DealerSaleItem,
)
from .serializers import (
    DealerOrderSerializer, DealerOrderItemSerializer,
    DispatchOrderSerializer, DispatchItemSerializer,
    DealerStockSerializer,
    DealerSaleSerializer, DealerSaleItemSerializer,
)


def _is_dealer(user):
    """Return True if the logged-in user has the dealer or dealer_incharge role."""
    try:
        return user.user_role.role in ('dealer', 'dealer_incharge')
    except Exception:
        return False


def _dealer_customer(user):
    """Return the Customer linked to a dealer user, or None."""
    try:
        return user.customer
    except Exception:
        return None


def _parse_qr(qr_value):
    """
    Parse a QR code string into (sku_code, batch_code|None).
    Format: "SKU_CODE" or "SKU_CODE|BATCH_CODE"
    """
    if len(qr_value) > 200:
        raise ValidationError('QR code value is too long.')
    parts = qr_value.strip().split('|', 1)
    sku   = parts[0].strip()
    batch = parts[1].strip() if len(parts) > 1 else None
    return sku, batch


def _scan_qr_response(qr_value):
    """
    Shared QR scan logic — returns a dict ready for Response().
    Raises ValidationError on failure.
    """
    sku, batch_code = _parse_qr(qr_value)
    try:
        variant = FinishedProductVariant.objects.select_related(
            'finished_product', 'unit', 'volume_unit'
        ).get(sku_code=sku)
    except FinishedProductVariant.DoesNotExist:
        raise ValidationError(f'No product found for SKU "{sku}".')

    batch_id = None
    resolved_batch_code = None
    if batch_code:
        try:
            batch_obj = Batch.objects.get(batch_code=batch_code)
            batch_id = batch_obj.id
            resolved_batch_code = batch_obj.batch_code
        except Batch.DoesNotExist:
            pass  # Batch not found — ignore, don't block scanning

    try:
        label = f"{variant.finished_product.name} — {variant.volume}{variant.volume_unit.symbol} {variant.unit.name}"
    except Exception:
        label = str(variant)

    return {
        'sku_code':   variant.sku_code,
        'variant_id': variant.id,
        'variant_label': label,
        'batch_id':   batch_id,
        'batch_code': resolved_batch_code,
    }


# ── Dealer Order ──────────────────────────────────────────────────────────────

class DealerOrderViewSet(viewsets.ModelViewSet):
    serializer_class   = DealerOrderSerializer
    permission_classes = ModulePermission.read_write('dispatch')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'customer']
    search_fields      = ['order_number', 'customer__customer_name', 'customer__customer_code']
    ordering_fields    = ['created_at']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = (
            DealerOrder.objects
            .select_related('customer', 'created_by', 'approved_by')
            .prefetch_related(
                'items__finished_product_variant__finished_product',
                'items__finished_product_variant__unit',
                'items__finished_product_variant__volume_unit',
            )
        )
        if _is_dealer(self.request.user):
            customer = _dealer_customer(self.request.user)
            return qs.filter(customer=customer) if customer else qs.none()
        return qs.all()

    @action(detail=False, methods=['get'], url_path='scan-qr')
    def scan_qr(self, request):
        qr = request.query_params.get('qr', '').strip()
        if not qr:
            return Response({'detail': 'qr query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = _scan_qr_response(qr)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        from django.db.models import F
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Items can only be added to draft orders.'}, status=status.HTTP_400_BAD_REQUEST)
        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'No items provided.'}, status=status.HTTP_400_BAD_REQUEST)
        for item in items_data:
            variant_id = item.get('finished_product_variant')
            quantity   = item.get('requested_quantity', 0)
            existing   = order.items.filter(finished_product_variant_id=variant_id).first()
            if existing:
                existing.requested_quantity = F('requested_quantity') + quantity
                existing.save(update_fields=['requested_quantity'])
            else:
                DealerOrderItem.objects.create(
                    order=order,
                    finished_product_variant_id=variant_id,
                    requested_quantity=quantity,
                )
        order.refresh_from_db()
        return Response(DealerOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path=r'remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Items can only be removed from draft orders.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order.items.get(id=item_id).delete()
        except DealerOrderItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        order.refresh_from_db()
        return Response(DealerOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        order = self.get_object()
        try:
            order.submit()
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DealerOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        order = self.get_object()
        # Allow setting approved_quantity per item during approval
        approved_items = request.data.get('items', [])
        if approved_items:
            for upd in approved_items:
                item_id = upd.get('id')
                aq      = upd.get('approved_quantity')
                if item_id and aq is not None:
                    order.items.filter(id=item_id).update(approved_quantity=aq)
        try:
            order.approve(performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DealerOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        order = self.get_object()
        try:
            order.reject(reason=request.data.get('reason', ''), performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DealerOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='create-dispatch')
    def create_dispatch(self, request, pk=None):
        """Create a draft DispatchOrder linked to a DealerOrder (no items pre-populated).
        Warehouse worker scans QR codes on the Dispatch Orders page to add items with batch tracking."""
        order = self.get_object()
        if order.status not in ('draft', 'approved'):
            return Response({'detail': 'Only draft or approved orders can generate a dispatch.'}, status=status.HTTP_400_BAD_REQUEST)
        if not order.items.exists():
            return Response({'detail': 'Add at least one item before dispatching.'}, status=status.HTTP_400_BAD_REQUEST)

        dispatch = DispatchOrder.objects.create(
            dispatch_number=DispatchOrder.generate_order_number(),
            dealer_order=order,
            customer=order.customer,
            vehicle_number=request.data.get('vehicle_number', ''),
            driver_name=request.data.get('driver_name', ''),
            notes=request.data.get('notes', ''),
            created_by=request.user,
        )
        return Response(
            DispatchOrderSerializer(dispatch, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ── Dispatch Order ────────────────────────────────────────────────────────────

class DispatchOrderViewSet(viewsets.ModelViewSet):
    serializer_class   = DispatchOrderSerializer
    permission_classes = ModulePermission.read_write('dispatch')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'customer']
    search_fields      = ['dispatch_number', 'customer__customer_name', 'customer__customer_code', 'vehicle_number']
    ordering_fields    = ['created_at', 'dispatched_at']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = (
            DispatchOrder.objects
            .select_related('customer', 'dealer_order', 'dispatched_by', 'created_by')
            .prefetch_related(
                'items__finished_product_variant__finished_product',
                'items__finished_product_variant__unit',
                'items__finished_product_variant__volume_unit',
                'items__batch',
                'dealer_order__items__finished_product_variant__finished_product',
                'dealer_order__items__finished_product_variant__unit',
                'dealer_order__items__finished_product_variant__volume_unit',
            )
        )
        if _is_dealer(self.request.user):
            customer = _dealer_customer(self.request.user)
            return qs.filter(customer=customer) if customer else qs.none()
        return qs.all()

    @action(detail=False, methods=['get'], url_path='scan-qr')
    def scan_qr(self, request):
        qr = request.query_params.get('qr', '').strip()
        if not qr:
            return Response({'detail': 'qr query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = _scan_qr_response(qr)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Items can only be added to draft dispatches.'}, status=status.HTTP_400_BAD_REQUEST)
        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'No items provided.'}, status=status.HTTP_400_BAD_REQUEST)
        enriched = [{**item, 'dispatch': order.id} for item in items_data]
        ser = DispatchItemSerializer(data=enriched, many=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        order.refresh_from_db()
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='upsert-scan')
    def upsert_scan(self, request, pk=None):
        """
        Called after each QR scan during dispatch building.
        Accepts either:
          - pallet_code: bulk-adds all FIN-type items from the pallet
          - variant_id + batch_id: adds/increments a single item
        Body: { pallet_code } OR { variant_id, batch_id (nullable), quantity (default 1) }
        """
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Cannot modify a non-draft dispatch.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Pallet fast-path ─────────────────────────────────────────────────
        pallet_code = request.data.get('pallet_code', '').strip()
        if pallet_code:
            from inventory_core.models import Pallet
            try:
                pallet = Pallet.objects.prefetch_related(
                    'items__lpn__batch__finished_product_variant__finished_product',
                    'items__lpn__batch__finished_product_variant__unit',
                    'items__lpn__batch__finished_product_variant__volume_unit',
                ).get(pallet_code=pallet_code)
            except Pallet.DoesNotExist:
                return Response({'detail': f'Pallet not found: {pallet_code}'}, status=status.HTTP_404_NOT_FOUND)

            for pi in pallet.items.all():
                batch = pi.lpn.batch
                if batch.batch_type != 'FIN':
                    continue
                variant = batch.finished_product_variant
                if not variant:
                    continue
                existing = order.items.filter(
                    finished_product_variant=variant,
                    batch=batch,
                ).first()
                if existing:
                    existing.quantity = float(existing.quantity) + float(pi.quantity)
                    existing.save()
                else:
                    DispatchItem.objects.create(
                        dispatch=order,
                        finished_product_variant=variant,
                        batch=batch,
                        quantity=pi.quantity,
                    )

            order.refresh_from_db()
            return Response(DispatchOrderSerializer(order, context={'request': request}).data)
        # ── End pallet fast-path ─────────────────────────────────────────────

        variant_id = request.data.get('variant_id')
        batch_id   = request.data.get('batch_id')
        quantity   = float(request.data.get('quantity', 1))

        if not variant_id:
            return Response({'detail': 'variant_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            variant = FinishedProductVariant.objects.get(id=variant_id)
        except FinishedProductVariant.DoesNotExist:
            return Response({'detail': 'Variant not found.'}, status=status.HTTP_404_NOT_FOUND)

        batch = None
        if batch_id:
            try:
                batch = Batch.objects.get(id=batch_id)
            except Batch.DoesNotExist:
                pass

        existing = order.items.filter(
            finished_product_variant=variant,
            batch=batch,
        ).first()

        if existing:
            existing.quantity = float(existing.quantity) + quantity
            existing.save()
        else:
            DispatchItem.objects.create(
                dispatch=order,
                finished_product_variant=variant,
                batch=batch,
                quantity=quantity,
            )

        order.refresh_from_db()
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path=r'remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Items can only be removed from draft dispatches.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order.items.get(id=item_id).delete()
        except DispatchItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        order.refresh_from_db()
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path=r'update-item/(?P<item_id>[^/.]+)')
    def update_item(self, request, pk=None, item_id=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Cannot update items of a non-draft dispatch.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = order.items.get(id=item_id)
        except DispatchItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'quantity' in request.data:
            try:
                qty = Decimal(str(request.data['quantity']))
            except Exception:
                return Response({'detail': 'Invalid quantity.'}, status=status.HTTP_400_BAD_REQUEST)
            if qty <= 0:
                return Response({'detail': 'Quantity must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
            if qty > Decimal('999999'):
                return Response({'detail': 'Quantity exceeds maximum allowed value.'}, status=status.HTTP_400_BAD_REQUEST)
            item.quantity = qty
            item.save()
        order.refresh_from_db()
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_order(self, request, pk=None):
        order = self.get_object()
        try:
            order.confirm_dispatch(performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='confirm-received')
    def confirm_received(self, request, pk=None):
        order = self.get_object()
        try:
            order.confirm_received(
                performed_by=request.user,
                notes=request.data.get('notes', ''),
            )
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='reject-delivery')
    def reject_delivery(self, request, pk=None):
        order = self.get_object()
        try:
            order.reject_delivery(
                performed_by=request.user,
                notes=request.data.get('notes', ''),
            )
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft dispatches can be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'cancelled'
        order.save()
        return Response(DispatchOrderSerializer(order, context={'request': request}).data)


# ── Dealer Stock ──────────────────────────────────────────────────────────────

class DealerStockViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class   = DealerStockSerializer
    permission_classes = ModulePermission.read_write('dispatch')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['customer', 'finished_product_variant']
    search_fields      = ['customer__customer_name', 'customer__customer_code', 'finished_product_variant__sku_code']
    ordering_fields    = ['updated_at', 'quantity']
    ordering           = ['customer', 'finished_product_variant']

    def get_queryset(self):
        qs = (
            DealerStock.objects
            .select_related(
                'customer',
                'finished_product_variant__finished_product',
                'finished_product_variant__unit',
                'finished_product_variant__volume_unit',
            )
            .filter(quantity__gt=0)
        )
        if _is_dealer(self.request.user):
            customer = _dealer_customer(self.request.user)
            return qs.filter(customer=customer) if customer else qs.none()
        return qs


# ── Dealer Sale ───────────────────────────────────────────────────────────────

class DealerSaleViewSet(viewsets.ModelViewSet):
    serializer_class   = DealerSaleSerializer
    permission_classes = ModulePermission.read_write('dispatch')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['customer', 'is_confirmed']
    search_fields      = ['sale_number', 'customer__customer_name', 'buyer_name']
    ordering_fields    = ['created_at', 'sale_date']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = (
            DealerSale.objects
            .select_related('customer', 'created_by')
            .prefetch_related(
                'items__finished_product_variant__finished_product',
                'items__finished_product_variant__unit',
                'items__finished_product_variant__volume_unit',
            )
        )
        if _is_dealer(self.request.user):
            customer = _dealer_customer(self.request.user)
            return qs.filter(customer=customer) if customer else qs.none()
        return qs.all()

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        sale = self.get_object()
        if sale.is_confirmed:
            return Response({'detail': 'Cannot modify a confirmed sale.'}, status=status.HTTP_400_BAD_REQUEST)
        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'No items provided.'}, status=status.HTTP_400_BAD_REQUEST)
        enriched = [{**item, 'sale': sale.id} for item in items_data]
        ser = DealerSaleItemSerializer(data=enriched, many=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        sale.refresh_from_db()
        return Response(DealerSaleSerializer(sale, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path=r'remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        sale = self.get_object()
        if sale.is_confirmed:
            return Response({'detail': 'Cannot modify a confirmed sale.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sale.items.get(id=item_id).delete()
        except DealerSaleItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        sale.refresh_from_db()
        return Response(DealerSaleSerializer(sale, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        sale = self.get_object()
        try:
            sale.confirm_sale(performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(DealerSaleSerializer(sale, context={'request': request}).data)
