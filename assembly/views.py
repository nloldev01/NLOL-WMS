from decimal import Decimal, InvalidOperation
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import VariantPackagingMaterial, AssemblyOrder
from .serializers import VariantPackagingMaterialSerializer, AssemblyOrderSerializer


class VariantPackagingMaterialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = VariantPackagingMaterialSerializer
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['finished_product_variant', 'material']

    def get_queryset(self):
        return VariantPackagingMaterial.objects.select_related('material', 'material__unit').all()


class AssemblyOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = AssemblyOrderSerializer
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'assembly_line', 'finished_product_variant', 'packaging_order',
                          'finished_product_variant__finished_product']
    search_fields      = ['assembly_number', 'finished_product_variant__finished_product__name']
    ordering_fields    = ['created_at', 'status']

    def get_queryset(self):
        return AssemblyOrder.objects.select_related(
            'finished_product_variant',
            'finished_product_variant__finished_product',
            'finished_product_variant__finished_product__base_product',
            'finished_product_variant__finished_product__base_product__unit',
            'finished_product_variant__unit',
            'finished_product_variant__volume_unit',
            'source_location',
            'source_batch',
            'destination_location',
            'produced_batch',
            'packaging_order',
        ).all()

    def update(self, request, *args, **kwargs):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft assembly orders can be edited.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft assembly orders can be edited.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        if order.status not in ('draft', 'cancelled'):
            return Response({'detail': 'Only draft or cancelled assembly orders can be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft orders can be started.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'in_progress'
        order.save()
        return Response(AssemblyOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='request-consumables')
    def request_consumables(self, request, pk=None):
        """Raise a Consumable Request for this assembly order, soft-linked via
        assembly_reference (= assembly_number). Any consumable-type material can be
        requested — not just ones pre-defined in the variant's Packaging BOM — with
        whatever quantity the caller sends in `items` (material id + quantity). If
        `items` is omitted, falls back to the BOM default = ceil(qty_per_unit × target_quantity)."""
        from decimal import Decimal, InvalidOperation
        from math import ceil
        from django.db import transaction
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from consumables.models import ConsumableRequest, ConsumableRequestItem
        from consumables.serializers import ConsumableRequestSerializer
        from master_data.models import RawMaterialAndConsumable

        order = self.get_object()
        if order.status in ('completed', 'cancelled'):
            return Response({'detail': 'Cannot request consumables for a completed or cancelled order.'},
                            status=status.HTTP_400_BAD_REQUEST)

        existing = (
            ConsumableRequest.objects
            .filter(assembly_reference=order.assembly_number,
                    status__in=('submitted', 'approved', 'dispatched'))
            .values_list('request_number', flat=True)
            .first()
        )
        if existing:
            return Response({'detail': f'A consumable request ({existing}) is already in progress for this order.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # No source location here — the requester only says what they need. Where
        # stock is deducted from is the approver's decision (set at approval).
        items_payload = request.data.get('items')
        items = []
        if items_payload:
            consumables = RawMaterialAndConsumable.objects.in_bulk(
                [entry.get('material') for entry in items_payload], field_name='id'
            )
            for entry in items_payload:
                material = consumables.get(entry.get('material'))
                if not material or material.type != 'consumable':
                    continue
                try:
                    qty = Decimal(str(entry.get('quantity')))
                except (InvalidOperation, TypeError):
                    continue
                if qty <= 0:
                    continue
                if qty != qty.to_integral_value():
                    return Response(
                        {'detail': f"Quantity for {material.name} must be a whole number."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                items.append((material, qty))
        else:
            basis = order.target_quantity or 0
            for b in order.finished_product_variant.packaging_materials.select_related('material').all():
                if b.material.type != 'consumable':
                    continue
                qty = int(ceil(b.quantity_per_unit * basis))
                if qty > 0:
                    items.append((b.material, qty))

        if not items:
            return Response({'detail': 'Enter a quantity greater than 0 for at least one consumable.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                req = ConsumableRequest.objects.create(
                    request_number=ConsumableRequest.generate_request_number(),
                    assembly_reference=order.assembly_number,
                    created_by=request.user,
                )
                for material, qty in items:
                    ConsumableRequestItem.objects.create(request=req, material=material, requested_quantity=qty)
                req.submit()
        except ValidationError as exc:
            raise DRFValidationError({'detail': exc.message})

        return Response(ConsumableRequestSerializer(req, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        order = self.get_object()
        try:
            actual_qty = Decimal(str(request.data.get('actual_quantity', '')))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'actual_quantity is required and must be a number.'}, status=status.HTTP_400_BAD_REQUEST)

        dest = None
        dest_id = request.data.get('destination_location')
        if dest_id:
            from master_data.models import Location
            try:
                dest = Location.objects.get(id=dest_id)
            except Location.DoesNotExist:
                return Response({'detail': 'Invalid destination_location.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            deductions, base_deducted, base_deduct_note = order.complete(actual_qty, destination_location=dest, performed_by=request.user)
        except ValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'assembly_number':     order.assembly_number,
            'actual_quantity':     float(order.actual_quantity),
            'produced_batch_code': order.produced_batch.batch_code if order.produced_batch else None,
            'base_deducted':       base_deducted,
            'base_deduct_note':    base_deduct_note,
            'deductions':          deductions,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='label')
    def label(self, request, pk=None):
        """Apply labels to an assembled order — auto-creates and completes a PackagingOrder."""
        order = self.get_object()
        if order.status != 'assembled':
            return Response({'detail': 'Only assembled orders can be labeled.'}, status=status.HTTP_400_BAD_REQUEST)

        from packaging.models import PackagingOrder
        packaging_order, created = PackagingOrder.objects.get_or_create(
            assembly_order=order,
            defaults={
                'order_number': PackagingOrder.generate_order_number(),
                'status': 'in_progress',
            },
        )
        if packaging_order.status == 'completed':
            return Response({'detail': 'This assembly has already been labeled.'}, status=status.HTTP_400_BAD_REQUEST)
        if packaging_order.status != 'in_progress':
            packaging_order.status = 'in_progress'
            packaging_order.save(update_fields=['status'])

        try:
            data = packaging_order.label(performed_by=request.user)
        except ValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='generate-labels')
    def generate_labels(self, request, pk=None):
        """Create a LabelPrintJob for this order and return all data needed to print labels.
        Allowed any time before cancellation — including pre-assembly, so the required
        quantity/content is known and printable ahead of starting the run. Pre-assembly
        jobs have no batch/LPN yet; AssemblyOrder.complete() backfills them once produced."""
        order = self.get_object()
        if order.status == 'cancelled':
            return Response({'detail': 'Cannot print labels for a cancelled order.'}, status=status.HTTP_400_BAD_REQUEST)

        from .models import LabelPrintJob
        lpn   = None
        batch = None

        if order.produced_batch:
            batch = order.produced_batch
            from inventory_core.models import LPN
            lpn = LPN.objects.filter(batch=batch).order_by('-created_at').first()

        job = LabelPrintJob.objects.create(
            assembly_order=order,
            lpn=lpn,
            batch=batch,
            quantity=int(order.actual_quantity or order.target_quantity),
            printed_by=request.user,
        )

        variant = order.finished_product_variant

        def build_variant_label(v):
            if not v:
                return None
            material = f" ({v.get_material_display()})" if v.material else ""
            return f"{v.finished_product.name} {v.volume}{v.volume_unit.symbol} {v.unit.name}{material}"

        if order.destination_location:
            location_name = order.destination_location.get_full_path()
        elif order.assembly_line:
            location_name = order.assembly_line.get_full_path()
        else:
            location_name = ''

        produced_at = (
            (order.updated_at or order.created_at).strftime('%d %b %Y') if batch
            else timezone.localdate().strftime('%d %b %Y')
        )

        return Response({
            'job_id':           job.pk,
            'redeem_code':      str(job.redeem_code),
            'assembly_number':  order.assembly_number,
            'batch_code':       batch.batch_code if batch else None,
            'lpn_code':         lpn.lpn_code if lpn else None,
            'product_name':     variant.finished_product.name if variant else None,
            'variant_label':    build_variant_label(variant),
            'quantity':         job.quantity,
            'unit_name':        variant.unit.name if variant and variant.unit else '',
            'location_name':    location_name,
            'produced_at':      produced_at,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status in ('completed', 'assembled'):
            return Response({'detail': 'Assembled/completed orders cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'cancelled'
        order.save()
        return Response(AssemblyOrderSerializer(order).data)
