from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Batch, LPN
from .serializers import BatchSerializer, LPNSerializer
from .services.batch_service import BatchService


class BatchViewSet(viewsets.ModelViewSet):
    queryset = Batch.objects.all().order_by('-created_at')
    serializer_class = BatchSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['raw_material', 'product', 'batch_type']
    search_fields = ['batch_code']

    def perform_create(self, serializer):
        """
        Instead of trusting frontend batch_code,
        we generate it centrally.
        """
        batch_type = self.request.data.get('batch_type', 'RAW')
        batch_code = BatchService.generate_code(batch_type=batch_type)
        serializer.save(batch_code=batch_code)

    @action(detail=False, methods=['post'])
    def generate_only(self, request):
        """
        Just returns a new batch code without saving
        """
        batch_type = request.data.get('batch_type', 'RAW')
        batch_code = BatchService.generate_code(batch_type=batch_type)

        return Response({
            "batch_code": batch_code
        })


class LPNViewSet(viewsets.ModelViewSet):
    queryset = LPN.objects.all().order_by('-created_at')
    serializer_class = LPNSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['lpn_code']