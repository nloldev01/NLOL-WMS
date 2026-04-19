from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError
from django.db.models import Sum

from master_data.models import Location
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
    filterset_fields   = ['material', 'location', 'movement_type']
    search_fields      = ['material__name', 'reference', 'notes']
    ordering_fields    = ['created_at', 'material__name', 'quantity']
    ordering           = ['-created_at']

    def get_queryset(self):
        return RawMaterialStockLog.objects.select_related(
            'material', 'material__unit',
            'location', 'counterpart_location',
            'performed_by',
        ).all()

    @action(detail=False, methods=['post'], url_path='record')
    def record(self, request):
        """
        POST /stock-movements/record/
        Record any stock movement: purchase, usage, wastage, transfer, adjustment, return.

        Request body:
        {
            "material": 1,
            "location": 2,
            "movement_type": "purchase",   // or usage / wastage / transfer_out / adjustment / return
            "quantity": 500,
            "counterpart_location": 3,     // required only for transfer_out
            "reference": "PO-2024-0081",   // optional
            "notes": "Supplier: ABC Mills" // optional
        }

        For transfers: supply movement_type="transfer_out" + counterpart_location.
        The paired transfer_in is created automatically.
        """
        serializer = StockMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            log = RawMaterialStockLog.create_movement(
                material=serializer.validated_data['material'],
                location=serializer.validated_data['location'],
                movement_type=serializer.validated_data['movement_type'],
                quantity=serializer.validated_data['quantity'],
                counterpart_location=serializer.validated_data.get('counterpart_location'),
                reference=serializer.validated_data.get('reference', ''),
                notes=serializer.validated_data.get('notes', ''),
                performed_by=request.user,
            )
        except ValidationError as e:
            return Response(
                {'detail': e.message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            RawMaterialStockLogSerializer(log).data,
            status=status.HTTP_201_CREATED,
        )
