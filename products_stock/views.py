from django.db import transaction
from django.core.exceptions import ValidationError
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from nlol_wms.pagination import StandardResultsPagination
from inventory_core.models import Batch
from inventory_core.services.batch_service import BatchService
from .models import ProductStock, ProductStockLog, FinishedProductStock, FinishedProductStockLog
from .serializers import (
    ProductStockSerializer,
    ProductStockLogSerializer,
    ProductMovementSerializer,
    FinishedProductStockSerializer,
    FinishedProductStockLogSerializer,
    FinishedProductMovementSerializer,
)


# ── Bulk Product Stock ────────────────────────────────────────────────────────

class ProductStockViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = ModulePermission.read_write('base_product_stock')
    queryset = ProductStock.objects.select_related('product', 'product__unit', 'location', 'batch').all()
    serializer_class = ProductStockSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location', 'batch', 'batch__batch_type', 'batch__quality_status', 'location__type']
    search_fields = ['product__name', 'batch__batch_code']
    ordering_fields = ['product__name', 'quantity', 'updated_at']


class ProductStockLogViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('base_product_stock')
    queryset = ProductStockLog.objects.select_related(
        'product', 'product__unit',
        'location', 'counterpart_location',
        'performed_by', 'batch',
    ).all()
    serializer_class = ProductStockLogSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location', 'movement_type', 'batch', 'supplier']
    search_fields = ['product__name', 'reference', 'notes']
    ordering_fields = ['created_at', 'product__name', 'quantity']
    ordering = ['-created_at']

    def _create_log_from_validated(self, validated_data, user):
        """
        Shared logic: batch/supplier resolution + ProductStockLog.create_movement().
        Used by both record() and bulk_record().
        """
        batch        = validated_data.get('batch')
        lpn          = validated_data.get('lpn')
        supplier     = validated_data.get('supplier')
        product      = validated_data['product']
        auto_generate     = validated_data.get('auto_generate_batch', False)
        auto_generate_lpn = validated_data.get('auto_generate_lpn', False)
        movement_type     = validated_data['movement_type']

        if batch and batch.supplier:
            supplier = batch.supplier

        if auto_generate and not batch:
            batch_code = BatchService.generate_code(batch_type='PRD')
            batch = Batch.objects.create(
                batch_code=batch_code,
                batch_type='PRD',
                product=product,
                supplier=supplier,
            )

        if movement_type == 'adjustment' and auto_generate:
            movement_type = 'adjustment_in'

        return ProductStockLog.create_movement(
            product=product,
            location=validated_data['location'],
            movement_type=movement_type,
            quantity=validated_data['quantity'],
            batch=batch,
            lpn=lpn,
            supplier=supplier,
            counterpart_location=validated_data.get('counterpart_location'),
            reference=validated_data.get('reference', ''),
            notes=validated_data.get('notes', ''),
            performed_by=user,
            auto_generate_lpn=auto_generate_lpn,
        )

    @action(detail=False, methods=['post'], url_path='record')
    @transaction.atomic
    def record(self, request):
        serializer = ProductMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            log = self._create_log_from_validated(serializer.validated_data, request.user)
            return Response(ProductStockLogSerializer(log).data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-record')
    @transaction.atomic
    def bulk_record(self, request):
        """
        POST /stock-movements/bulk-record/
        Record multiple stock movements (e.g. all line items on one purchase bill)
        in a single all-or-nothing transaction.
        """
        serializer = ProductMovementSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        try:
            logs = [
                self._create_log_from_validated(item, request.user)
                for item in serializer.validated_data
            ]
            return Response(ProductStockLogSerializer(logs, many=True).data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ── Finished Product Stock ────────────────────────────────────────────────────

class FinishedProductStockViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = ModulePermission.read_write('finished_product_stock')
    queryset = FinishedProductStock.objects.select_related(
        'finished_product_variant',
        'finished_product_variant__finished_product',
        'finished_product_variant__unit',
        'finished_product_variant__volume_unit',
        'finished_product_variant__secondary_unit',
        'location', 'batch', 'lpn',
    ).all()
    serializer_class = FinishedProductStockSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['finished_product_variant', 'finished_product_variant__finished_product', 'location', 'batch']
    search_fields = ['finished_product_variant__finished_product__name', 'batch__batch_code', 'lpn__lpn_code']
    ordering_fields = ['finished_product_variant__finished_product__name', 'quantity', 'updated_at']


class FinishedProductStockLogViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('finished_product_stock')
    queryset = FinishedProductStockLog.objects.select_related(
        'finished_product_variant',
        'finished_product_variant__finished_product',
        'finished_product_variant__unit',
        'finished_product_variant__secondary_unit',
        'location', 'counterpart_location',
        'performed_by', 'batch', 'lpn', 'supplier',
    ).all()
    serializer_class = FinishedProductStockLogSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['finished_product_variant', 'finished_product_variant__finished_product', 'location', 'movement_type', 'batch', 'lpn', 'supplier']
    search_fields = ['finished_product_variant__finished_product__name', 'reference', 'notes', 'lpn__lpn_code']
    ordering_fields = ['created_at', 'finished_product_variant__finished_product__name', 'quantity']
    ordering = ['-created_at']

    def _create_log_from_validated(self, validated_data, user):
        """
        Shared logic: batch/LPN resolution + FinishedProductStockLog.create_movement().
        Used by both record() and bulk_record().
        """
        batch                    = validated_data.get('batch')
        lpn                      = validated_data.get('lpn')
        supplier                 = validated_data.get('supplier')
        finished_product_variant = validated_data['finished_product_variant']
        auto_generate_lpn        = validated_data.get('auto_generate_lpn', False)
        auto_generate_batch      = validated_data.get('auto_generate_batch', False)
        movement_type            = validated_data['movement_type']

        if batch and batch.supplier:
            supplier = batch.supplier

        _FIN_INBOUND = {'purchase', 'adjustment_in', 'packaging_production', 'sale_return'}
        if auto_generate_batch and not batch and movement_type in _FIN_INBOUND:
            from inventory_core.models import Batch
            from inventory_core.services.batch_service import BatchService
            batch_code = BatchService.generate_code(batch_type='FIN')
            batch = Batch.objects.create(
                batch_code=batch_code,
                batch_type='FIN',
                finished_product_variant=finished_product_variant,
            )

        # For packaging_production, always create LPN directly (don't rely on auto_generate_lpn chain)
        if batch and movement_type == 'packaging_production' and not lpn:
            from inventory_core.services.batch_service import BatchService
            from inventory_core.models import LPN as LPNModel
            lpn_code = BatchService.generate_lpn_code(batch)
            lpn = LPNModel.objects.create(lpn_code=lpn_code, batch=batch)

        return FinishedProductStockLog.create_movement(
            finished_product_variant=finished_product_variant,
            location=validated_data['location'],
            movement_type=movement_type,
            quantity=validated_data['quantity'],
            batch=batch,
            lpn=lpn,
            supplier=supplier,
            counterpart_location=validated_data.get('counterpart_location'),
            reference=validated_data.get('reference', ''),
            notes=validated_data.get('notes', ''),
            performed_by=user,
            auto_generate_lpn=auto_generate_lpn,
        )

    @action(detail=False, methods=['post'], url_path='record')
    @transaction.atomic
    def record(self, request):
        serializer = FinishedProductMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            log = self._create_log_from_validated(serializer.validated_data, request.user)
            return Response(FinishedProductStockLogSerializer(log).data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-record')
    @transaction.atomic
    def bulk_record(self, request):
        """
        POST /finished-product-stock-movements/bulk-record/
        Record multiple stock movements (e.g. all line items on one purchase bill)
        in a single all-or-nothing transaction.
        """
        serializer = FinishedProductMovementSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        try:
            logs = [
                self._create_log_from_validated(item, request.user)
                for item in serializer.validated_data
            ]
            return Response(FinishedProductStockLogSerializer(logs, many=True).data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
