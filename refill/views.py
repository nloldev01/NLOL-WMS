from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from .models import RefillOrder
from .serializers import RefillOrderSerializer


class RefillOrderViewSet(viewsets.ModelViewSet):
    queryset = (
        RefillOrder.objects
        .select_related(
            'source_variant__finished_product__base_product',
            'source_variant__volume_unit',
            'source_variant__unit',
            'source_batch',
            'source_location',
            'destination_variant__finished_product',
            'destination_variant__volume_unit',
            'destination_variant__unit',
            'destination_location',
            'recovery_batch',
            'linked_assembly_order',
            'linked_production_order',
            'performed_by',
        )
        .all()
    )
    serializer_class   = RefillOrderSerializer
    permission_classes = ModulePermission.read_write('refill')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'mode', 'source_variant', 'destination_variant']
    search_fields      = ['refill_number', 'notes']
    ordering_fields    = ['created_at']
    ordering           = ['-created_at']

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        order = self.get_object()
        try:
            order.start(performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(order)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in ('draft',):
            return Response(
                {'detail': 'Only draft refill orders can be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = 'cancelled'
        order.save()
        serializer = self.get_serializer(order)
        return Response(serializer.data)
