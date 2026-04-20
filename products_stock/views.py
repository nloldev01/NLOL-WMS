from django.db import transaction
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from inventory_core.models import Batch
from inventory_core.services.batch_service import BatchService
from .models import ProductStock, ProductStockLog
from .serializers import (
    ProductStockSerializer, 
    ProductStockLogSerializer, 
    ProductMovementSerializer
)

class ProductStockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    View current product stock levels.
    """
    permission_classes = [IsAuthenticated]
    queryset = ProductStock.objects.select_related('product', 'product__unit', 'location', 'batch').all()
    serializer_class = ProductStockSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location', 'batch']
    search_fields = ['product__name', 'batch__batch_code']
    ordering_fields = ['product__name', 'quantity', 'updated_at']

class ProductStockLogViewSet(viewsets.ModelViewSet):
    """
    View and record product stock movements.
    """
    permission_classes = [IsAuthenticated]
    queryset = ProductStockLog.objects.select_related(
        'product', 'product__unit', 
        'location', 'counterpart_location', 
        'performed_by', 'batch'
    ).all()
    serializer_class = ProductStockLogSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location', 'movement_type', 'batch', 'supplier']
    search_fields = ['product__name', 'reference', 'notes']
    ordering_fields = ['created_at', 'product__name', 'quantity']
    ordering = ['-created_at']

    @action(detail=False, methods=['post'], url_path='record')
    @transaction.atomic
    def record(self, request):
        """
        POST /stock-movements/record/
        Record product movement: production, sale, etc.
        """
        serializer = ProductMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        batch = serializer.validated_data.get('batch')
        supplier = serializer.validated_data.get('supplier')
        product = serializer.validated_data['product']
        auto_generate = serializer.validated_data.get('auto_generate_batch', False)

        # Logic: If batch is selected, take its supplier
        if batch and batch.supplier:
            supplier = batch.supplier

        if auto_generate and not batch:
            # Generate and create the batch for products
            batch_code = BatchService.generate_code(batch_type='PRD')
            batch = Batch.objects.create(
                batch_code=batch_code,
                batch_type='PRD',
                product=product,
                supplier=supplier # Link provided supplier to new batch
            )

        try:
            log = ProductStockLog.create_movement(
                product=product,
                location=serializer.validated_data['location'],
                movement_type=serializer.validated_data['movement_type'],
                quantity=serializer.validated_data['quantity'],
                batch=batch,
                supplier=supplier,
                counterpart_location=serializer.validated_data.get('counterpart_location'),
                reference=serializer.validated_data.get('reference', ''),
                notes=serializer.validated_data.get('notes', ''),
                performed_by=request.user
            )
            return Response(ProductStockLogSerializer(log).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            # transaction.atomic will handle the rollback of the Batch creation
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
