from decimal import Decimal, InvalidOperation
from django.core.exceptions import ValidationError
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import VariantPackagingMaterial, AssemblyMaterialLine, AssemblyOrder
from .serializers import VariantPackagingMaterialSerializer, AssemblyMaterialLineSerializer, AssemblyOrderSerializer


class VariantPackagingMaterialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = VariantPackagingMaterialSerializer
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['finished_product_variant', 'material']

    def get_queryset(self):
        return VariantPackagingMaterial.objects.select_related('material', 'material__unit').all()


class AssemblyMaterialLineViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = AssemblyMaterialLineSerializer
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['assembly_order', 'material']

    def get_queryset(self):
        return AssemblyMaterialLine.objects.select_related('material', 'material__unit', 'location').all()


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

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft orders can be started.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'in_progress'
        order.save()
        return Response(AssemblyOrderSerializer(order).data)

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

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status in ('completed', 'assembled'):
            return Response({'detail': 'Assembled/completed orders cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'cancelled'
        order.save()
        return Response(AssemblyOrderSerializer(order).data)
