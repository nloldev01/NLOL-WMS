from django.db import transaction
from django.core.exceptions import ValidationError
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError
from django.db.models import Sum

from master_data.models import Location
from inventory_core.models import Batch
from inventory_core.services.batch_service import BatchService
from .models import RawMaterialStock, RawMaterialStockLog

from .serializers import (
    LocationSerializer,
    RawMaterialStockSerializer,
    RawMaterialStockLogSerializer,
    StockMovementSerializer,
)

class LocationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = LocationSerializer
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['is_active']
    search_fields      = ['name', 'description']
    ordering_fields    = ['name']
    ordering           = ['name']

    def get_queryset(self):
        return Location.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name
        self.perform_destroy(instance)
        return Response(
            {"message": f"Location '{name}' deleted successfully"},
            status=status.HTTP_200_OK,
        )

class RawMaterialStockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only view of current stock levels.
    Stock is never written directly — use /stock-movements/record/ instead.

    Supports:
        ?material=1
        ?location=2
        ?search=flour
        ?ordering=material__name
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = RawMaterialStockSerializer
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['material', 'location', 'material__type']
    search_fields      = ['material__name', 'location__name']
    ordering_fields    = ['material__name', 'location__name', 'quantity', 'updated_at']
    ordering           = ['material__name']

    def get_queryset(self):
        return RawMaterialStock.objects.select_related(
            'material', 'material__unit', 'location'
        ).all()

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        GET /stock/summary/
        Returns total quantity per material across all locations.

        Example response:
        [
            {"material": 1, "material_name": "Wheat Flour", "unit": "KG", "total_quantity": 580.0},
            ...
        ]
        """
        qs = (
            RawMaterialStock.objects
            .values('material__id', 'material__name', 'material__unit__name')
            .annotate(total_quantity=Sum('quantity'))
            .order_by('material__name')
        )
        data = [
            {
                'material':       row['material__id'],
                'material_name':  row['material__name'],
                'unit':           row['material__unit__name'],
                'total_quantity': row['total_quantity'],
            }
            for row in qs
        ]
        return Response(data, status=status.HTTP_200_OK)


class RawMaterialStockLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only log of all stock movements (immutable ledger).

    Supports:
        ?material=1
        ?location=2
        ?movement_type=purchase
        ?movement_type=usage
        ?search=PO-2024
        ?ordering=-created_at

    Custom actions:
        POST /stock-movements/record/   → record a new movement
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = RawMaterialStockLogSerializer
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['material', 'location', 'movement_type', 'batch', 'supplier']
    search_fields      = ['material__name', 'reference', 'notes']
    ordering_fields    = ['created_at', 'material__name', 'quantity']
    ordering           = ['-created_at']

    def get_queryset(self):
        return RawMaterialStockLog.objects.select_related(
            'material', 'material__unit',
            'location', 'counterpart_location',
            'performed_by',
        ).all()

    def _create_log_from_validated(self, validated_data, user):
        """
        Shared logic: batch/supplier resolution + RawMaterialStockLog.create_movement().
        Used by both record() and bulk_record().
        """
        batch = validated_data.get('batch')
        lpn = validated_data.get('lpn')
        supplier = validated_data.get('supplier')
        material = validated_data['material']
        auto_generate = validated_data.get('auto_generate_batch', False)
        auto_generate_lpn = validated_data.get('auto_generate_lpn', False)

        # Logic: If batch is selected, take its supplier
        if batch and batch.supplier:
            supplier = batch.supplier

        if auto_generate and not batch:
            # Generate and create the batch
            batch_code = BatchService.generate_code(batch_type='RAW')
            batch = Batch.objects.create(
                batch_code=batch_code,
                batch_type='RAW',
                raw_material=material,
                supplier=supplier # Link provided supplier to new batch
            )

        # For positive adjustments (auto-generated batch), treat as inbound
        movement_type = validated_data['movement_type']
        if movement_type == 'adjustment' and auto_generate:
            movement_type = 'adjustment_in'

        return RawMaterialStockLog.create_movement(
            material=material,
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
        """
        POST /stock-movements/record/
        Record any stock movement: purchase, usage, wastage, transfer, adjustment, return.
        """
        serializer = StockMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            log = self._create_log_from_validated(serializer.validated_data, request.user)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response(
                {'error': msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            RawMaterialStockLogSerializer(log).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='bulk-record')
    @transaction.atomic
    def bulk_record(self, request):
        """
        POST /stock-movements/bulk-record/
        Record multiple stock movements (e.g. all line items on one purchase bill)
        in a single all-or-nothing transaction.
        """
        serializer = StockMovementSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        try:
            logs = [
                self._create_log_from_validated(item, request.user)
                for item in serializer.validated_data
            ]
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response(
                {'error': msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            RawMaterialStockLogSerializer(logs, many=True).data,
            status=status.HTTP_201_CREATED,
        )
