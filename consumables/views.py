from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from master_data.models import Location

from .models import ConsumableRequest, ConsumableRequestItem
from .serializers import ConsumableRequestSerializer, ConsumableRequestItemSerializer


class ConsumableRequestViewSet(viewsets.ModelViewSet):
    serializer_class   = ConsumableRequestSerializer
    permission_classes = ModulePermission.read_write('consumables')
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'source_location', 'destination_location']
    search_fields      = ['request_number', 'assembly_reference']
    ordering_fields    = ['created_at']
    ordering           = ['-created_at']

    def get_queryset(self):
        return (
            ConsumableRequest.objects
            .select_related(
                'source_location', 'destination_location',
                'created_by', 'approved_by', 'dispatched_by', 'returned_by',
            )
            .prefetch_related('items__material__unit')
            .all()
        )

    def _respond(self, request, obj):
        return Response(ConsumableRequestSerializer(obj, context={'request': request}).data)

    def create(self, request, *args, **kwargs):
        """Create a request together with its line items in a single step."""
        items_data = request.data.get('items', [])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            req = serializer.save()
            for item in items_data:
                ser = ConsumableRequestItemSerializer(data={**item, 'request': req.id})
                ser.is_valid(raise_exception=True)
                ser.save()
        return Response(
            ConsumableRequestSerializer(req, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        req = self.get_object()
        if req.status != 'draft':
            return Response({'detail': 'Items can only be added to draft requests.'}, status=status.HTTP_400_BAD_REQUEST)
        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'No items provided.'}, status=status.HTTP_400_BAD_REQUEST)

        for item in items_data:
            material_id = item.get('material')
            quantity    = item.get('requested_quantity', 0)
            existing    = req.items.filter(material_id=material_id).first()
            if existing:
                existing.requested_quantity = F('requested_quantity') + quantity
                existing.save(update_fields=['requested_quantity'])
            else:
                ser = ConsumableRequestItemSerializer(data={**item, 'request': req.id})
                ser.is_valid(raise_exception=True)
                ser.save()
        req.refresh_from_db()
        return self._respond(request, req)

    @action(detail=True, methods=['delete'], url_path=r'remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        req = self.get_object()
        if req.status != 'draft':
            return Response({'detail': 'Items can only be removed from draft requests.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            req.items.get(id=item_id).delete()
        except ConsumableRequestItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        req.refresh_from_db()
        return self._respond(request, req)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        req = self.get_object()
        try:
            req.submit()
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return self._respond(request, req)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        req = self.get_object()
        # Optional per-item approved quantities: [{ id, approved_quantity }]
        item_quantities = {}
        for upd in request.data.get('items', []):
            if upd.get('id') is not None and upd.get('approved_quantity') is not None:
                item_quantities[str(upd['id'])] = upd['approved_quantity']
        try:
            req.approve(performed_by=request.user, item_quantities=item_quantities)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return self._respond(request, req)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        req = self.get_object()
        try:
            req.reject(reason=request.data.get('reason', ''), performed_by=request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return self._respond(request, req)

    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_request(self, request, pk=None):
        req = self.get_object()
        dest_id = request.data.get('destination_location')
        destination = None
        if dest_id:
            try:
                destination = Location.objects.get(id=dest_id)
            except Location.DoesNotExist:
                return Response({'detail': 'Destination location not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            req.dispatch(performed_by=request.user, destination_location=destination)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return self._respond(request, req)

    @action(detail=True, methods=['post'], url_path='record-return')
    def record_return(self, request, pk=None):
        req = self.get_object()
        # Per-item used quantities: [{ id, used_quantity }]
        used_quantities = {}
        for upd in request.data.get('items', []):
            if upd.get('id') is not None and upd.get('used_quantity') is not None:
                used_quantities[str(upd['id'])] = upd['used_quantity']
        try:
            req.record_return(performed_by=request.user, used_quantities=used_quantities)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return self._respond(request, req)
