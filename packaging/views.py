from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError

from accounts.permissions import ModulePermission
from .models import PackagingOrder
from .serializers import PackagingOrderSerializer


class PackagingOrderViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('packaging')
    queryset = PackagingOrder.objects.select_related(
        'assembly_order',
        'finished_product_variant',
        'finished_product_variant__finished_product',
        'finished_product_variant__unit',
        'destination_location',
        'produced_batch',
    ).all()
    serializer_class = PackagingOrderSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'assembly_order', 'finished_product_variant',
                        'finished_product_variant__finished_product']
    search_fields = ['order_number', 'finished_product_variant__finished_product__name',
                     'assembly_order__assembly_number']
    ordering_fields = ['created_at', 'status']

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        order = self.get_object()
        if order.status != 'draft':
            return Response({'detail': 'Only draft orders can be started.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'in_progress'
        order.save()
        return Response(PackagingOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        order = self.get_object()
        sticker_confirmed = request.data.get('sticker_confirmed', False)
        if sticker_confirmed:
            order.sticker_confirmed = True
            order.save(update_fields=['sticker_confirmed'])
        try:
            data = order.label(performed_by=request.user)
        except ValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status == 'completed':
            return Response({'detail': 'Completed orders cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = 'cancelled'
        order.save()
        return Response(PackagingOrderSerializer(order).data)
