from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from .models import Recipe, ProductionOrder, ProductionOrderMaterial, FirstFillTest, FirstFillTestResult
from .serializers import (
    RecipeSerializer, ProductionOrderSerializer, FirstFillTestSerializer,
)


class RecipeViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.require('production_recipes')
    queryset = Recipe.objects.all().prefetch_related(
        'items', 'items__material', 'items__material__unit'
    )
    serializer_class = RecipeSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'is_active']
    search_fields    = ['name', 'product__name']
    ordering_fields  = ['created_at', 'name']
    ordering         = ['-created_at']


class ProductionOrderViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('production')
    queryset = ProductionOrder.objects.all().prefetch_related(
        'materials', 'materials__material', 'materials__material__unit',
        'recipe', 'recipe__product', 'kettle'
    )
    serializer_class = ProductionOrderSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'kettle', 'recipe']
    search_fields    = ['order_number', 'recipe__product__name', 'recipe__name']
    ordering_fields  = ['created_at', 'expected_end_time', 'start_time']
    ordering         = ['-created_at']

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        data = request.data.copy()

        # Auto-generate order number if not provided
        if not data.get('order_number'):
            prefix = timezone.now().strftime('PO-%Y%m%d')
            last = (
                ProductionOrder.objects
                .filter(order_number__startswith=prefix)
                .order_by('-order_number')
                .first()
            )
            seq = 1
            if last:
                try:
                    seq = int(last.order_number.split('-')[-1]) + 1
                except ValueError:
                    seq = ProductionOrder.objects.filter(order_number__startswith=prefix).count() + 1
            data['order_number'] = f"{prefix}-{seq:04d}"

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        # Populate materials from recipe items
        if order.recipe:
            for item in order.recipe.items.all():
                ProductionOrderMaterial.objects.get_or_create(
                    order=order,
                    material=item.material,
                    defaults={'planned_qty': item.quantity * order.target_quantity},
                )

        headers = self.get_success_headers(serializer.data)
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], url_path='update-materials')
    @transaction.atomic
    def update_materials(self, request, pk=None):
        order = self.get_object()
        if order.status not in ['draft', 'planned']:
            return Response(
                {'error': 'Materials can only be updated on draft or planned orders.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        materials_data = request.data.get('materials', [])
        if not isinstance(materials_data, list):
            return Response({'error': 'materials must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        order.materials.all().delete()
        for m in materials_data:
            ProductionOrderMaterial.objects.create(
                order=order,
                material_id=int(m['material']),
                planned_qty=m['planned_qty'],
            )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='update-actual-qty')
    def update_actual_qty(self, request, pk=None):
        order = self.get_object()
        if order.status not in ['draft', 'planned']:
            return Response({'error': 'Cannot update on this order status.'}, status=status.HTTP_400_BAD_REQUEST)
        material_id = request.data.get('material_id')
        actual_qty = request.data.get('actual_load_qty')
        if not material_id or actual_qty is None:
            return Response({'error': 'material_id and actual_load_qty are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            actual_qty = float(actual_qty)
            if actual_qty < 0:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'error': 'actual_load_qty must be a non-negative number.'}, status=status.HTTP_400_BAD_REQUEST)
        updated = order.materials.filter(material_id=material_id).update(actual_load_qty=actual_qty)
        if not updated:
            return Response({'error': 'Material not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='start-mixing')
    def start_mixing(self, request, pk=None):
        order = self.get_object()
        if order.status not in ['planned', 'draft']:
            return Response({'error': 'Only draft or planned orders can be started.'}, status=status.HTTP_400_BAD_REQUEST)

        minutes = int(request.data.get('processing_minutes', 60))
        temperature = request.data.get('mixing_temperature')
        notes = request.data.get('operator_notes', '')

        order.status = 'in_progress'
        order.start_time = timezone.now()
        order.expected_end_time = order.start_time + timedelta(minutes=minutes)
        if temperature is not None:
            order.mixing_temperature = temperature
        if notes:
            order.operator_notes = notes
        order.save()
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='toggle-material-loaded')
    def toggle_material_loaded(self, request, pk=None):
        order = self.get_object()
        material_id = request.data.get('material_id')
        is_loaded = bool(request.data.get('is_loaded', True))
        if not material_id:
            return Response({'error': 'material_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        updated = order.materials.filter(material_id=material_id).update(is_loaded=is_loaded)
        if not updated:
            return Response({'error': 'Material not found on this order.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='confirm-materials')
    def confirm_materials(self, request, pk=None):
        order = self.get_object()
        if order.status not in ['draft', 'planned']:
            return Response(
                {'error': 'Only draft or planned orders can have materials confirmed.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        order.materials_confirmed = True
        order.save(update_fields=['materials_confirmed'])
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='complete-order')
    @transaction.atomic
    def complete_order(self, request, pk=None):
        from django.core.exceptions import ValidationError
        try:
            order = self.get_object()
            if order.status != 'in_progress':
                return Response({'error': 'Only in-progress orders can be completed.'}, status=status.HTTP_400_BAD_REQUEST)

            produced_quantity = request.data.get('produced_quantity')
            destination_location_id = request.data.get('destination_location_id')
            wastage_data = request.data.get('wastage', []) # list of dicts: {'material_id': ID, 'wastage_qty': QTY}

            if not produced_quantity or not destination_location_id:
                return Response({'error': 'produced_quantity and destination_location_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                produced_quantity = float(produced_quantity)
            except ValueError:
                return Response({'error': 'Invalid produced_quantity.'}, status=status.HTTP_400_BAD_REQUEST)

            from master_data.models import Location
            try:
                destination_location = Location.objects.get(id=destination_location_id)
            except Location.DoesNotExist:
                return Response({'error': 'Destination location not found.'}, status=status.HTTP_400_BAD_REQUEST)

            # 1. Update order status and actuals
            order.status = 'completed'
            order.produced_quantity = produced_quantity
            order.actual_end_time = timezone.now()
            order.save()

            # 2. Consume Raw Materials — kettle location first, then any other location
            from decimal import Decimal
            from raw_materials_stock.models import RawMaterialStock, RawMaterialStockLog
            from django.db.models import Case, When, IntegerField, Value

            wastage_map = {
                int(w['material_id']): Decimal(str(w.get('wastage_qty', 0)))
                for w in wastage_data
            }

            for order_mat in order.materials.all():
                mat_id = order_mat.material_id
                # Use actual_load_qty if operator specified; fall back to planned_qty
                planned = order_mat.actual_load_qty if order_mat.actual_load_qty is not None else order_mat.planned_qty
                w_qty   = min(wastage_map.get(mat_id, Decimal('0')), planned)

                # Prioritise kettle stock; fall back to any location so consumption
                # is always recorded even if no system transfer was done beforehand.
                all_stocks = RawMaterialStock.objects.filter(
                    material_id=mat_id, quantity__gt=0
                ).annotate(
                    priority=Case(
                        When(location=order.kettle, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField()
                    )
                ).order_by('priority', '-quantity')

                remaining_wastage = w_qty
                remaining_usage   = planned - w_qty
                total_consumed    = Decimal('0')
                total_wasted      = Decimal('0')

                for stock in all_stocks:
                    if remaining_wastage <= 0 and remaining_usage <= 0:
                        break
                    available = stock.quantity  # Decimal from DecimalField

                    to_waste = min(remaining_wastage, available)
                    to_use   = min(remaining_usage, available - to_waste)

                    if to_waste > 0:
                        RawMaterialStockLog.create_movement(
                            material=stock.material,
                            location=stock.location,
                            movement_type='wastage',
                            quantity=to_waste,
                            batch=stock.batch,
                            lpn=stock.lpn,
                            performed_by=request.user,
                            reference=f"Wastage for Order {order.order_number}",
                        )
                        remaining_wastage -= to_waste
                        total_wasted      += to_waste

                    if to_use > 0:
                        RawMaterialStockLog.create_movement(
                            material=stock.material,
                            location=stock.location,
                            movement_type='usage',
                            quantity=to_use,
                            batch=stock.batch,
                            lpn=stock.lpn,
                            performed_by=request.user,
                            reference=f"Usage for Order {order.order_number}",
                        )
                        remaining_usage -= to_use
                        total_consumed  += to_use

                order_mat.actual_consumed_qty = total_consumed
                order_mat.wastage_qty         = total_wasted
                order_mat.save()

            # 3. Create a PRD batch + LPN and record product stock
            produced_batch = None
            if order.recipe:
                from inventory_core.models import Batch, LPN
                from inventory_core.services.batch_service import BatchService
                from products_stock.models import ProductStockLog

                batch_code = BatchService.generate_code('PRD')
                produced_batch = Batch.objects.create(
                    batch_code=batch_code,
                    batch_type='PRD',
                    product=order.recipe.product,
                    quality_status='pending',
                )
                lpn_code = BatchService.generate_lpn_code(produced_batch)
                produced_lpn = LPN.objects.create(lpn_code=lpn_code, batch=produced_batch)

                ProductStockLog.create_movement(
                    product=order.recipe.product,
                    location=destination_location,
                    movement_type='production',
                    quantity=produced_quantity,
                    batch=produced_batch,
                    lpn=produced_lpn,
                    performed_by=request.user,
                    reference=f"Produced from Order {order.order_number}",
                )

            # 4. Link the batch back to the order for full traceability
            order.produced_batch = produced_batch
            order.save(update_fields=['produced_batch'])

            return Response(self.get_serializer(order).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class FirstFillTestViewSet(viewsets.ModelViewSet):
    """
    First Fill Test stage — sits between Mixing and Assembly. Driven entirely
    by data (TestDefinition / TestDefinitionParameter / Parameter): the
    characteristics shown and their limits come from whichever report format
    is resolved for the batch's product. Adding a new format or changing a
    limit is a data change there, never a change to this view.

    POST /first-fill-tests/start/ {batch_id}
    POST /first-fill-tests/{id}/submit/ {results: [{id, result_text}], remarks?, batch_quantity?}
        → recomputes every row's verdict + the overall verdict, status -> Reviewed
    POST /first-fill-tests/{id}/issue/
        → finalizes the certificate, status -> Issued, updates Batch.quality_status
    POST /first-fill-tests/{id}/reject-batch/
    """
    permission_classes = ModulePermission.read_write('first_fill_test')
    queryset = FirstFillTest.objects.select_related(
        'batch', 'batch__product', 'test_definition', 'created_by', 'approved_by'
    ).prefetch_related('results')
    serializer_class = FirstFillTestSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['batch', 'status', 'overall_verdict']
    ordering_fields  = ['created_at']
    ordering         = ['-created_at']
    http_method_names = ['get', 'post', 'head', 'options']  # immutable audit trail — no PUT/PATCH/DELETE

    @action(detail=False, methods=['post'], url_path='start')
    @transaction.atomic
    def start(self, request):
        from inventory_core.models import Batch
        from master_data.models import TestDefinition

        batch_id = request.data.get('batch_id')
        if not batch_id:
            return Response({'error': 'batch_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            batch = Batch.objects.get(id=batch_id, batch_type='PRD')
        except Batch.DoesNotExist:
            return Response({'error': 'PRD batch not found.'}, status=status.HTTP_404_NOT_FOUND)

        if batch.quality_status not in ('pending', 'failed'):
            return Response(
                {'error': f"Batch is '{batch.quality_status}' and cannot be (re)tested."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Resolve the report format. Priority:
        #   1. a test format the operator explicitly chose at start time,
        #   2. the product's own default_test,
        #   3. the single active TestDefinition, if exactly one exists.
        test_definition = None
        td_id = request.data.get('test_definition_id')
        if td_id:
            try:
                test_definition = TestDefinition.objects.get(id=td_id, is_active=True)
            except TestDefinition.DoesNotExist:
                return Response(
                    {'error': 'The selected test format was not found or is inactive.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if not test_definition:
            test_definition = batch.product.default_test if batch.product else None
        if not test_definition:
            active = list(TestDefinition.objects.filter(is_active=True)[:2])
            if len(active) == 1:
                test_definition = active[0]
        if not test_definition:
            return Response(
                {'error': 'No First Fill Test format is configured for this product. '
                          'Choose a test format, set Product.default_test, or seed '
                          'exactly one active TestDefinition.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-fetch batch quantity from the Mixing order that produced this
        # batch — the operator shouldn't have to type a number that's already
        # on record.
        production_order = batch.production_orders.first()
        batch_quantity = production_order.produced_quantity if production_order else None
        quantity_unit = batch.product.unit.symbol if batch.product and batch.product.unit else ''

        test = FirstFillTest.objects.create(
            batch=batch,
            test_definition=test_definition,
            status='draft',
            date_of_sample_receipt=timezone.now().date(),
            batch_quantity=batch_quantity,
            quantity_unit=quantity_unit,
            created_by=request.user,
        )
        for dp in test_definition.parameters.select_related('parameter').all():
            FirstFillTestResult.objects.create(
                test=test,
                parameter=dp.parameter,
                sr_no=dp.sort_order,
                mandatory=dp.mandatory,
                characteristic=dp.parameter.name,
                unit=dp.resolved_unit(),
                test_method=dp.resolved_method(),
                spec_type=dp.spec_type,
                min_value=dp.min_value,
                max_value=dp.max_value,
            )
        return Response(self.get_serializer(test).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='submit')
    @transaction.atomic
    def submit(self, request, pk=None):
        from .verdict import parse_numeric_result, compute_verdict, compute_overall_verdict

        test = self.get_object()
        if test.status == 'issued':
            return Response({'error': 'An issued certificate cannot be edited.'}, status=status.HTTP_400_BAD_REQUEST)

        results_data = request.data.get('results', [])
        if not isinstance(results_data, list):
            return Response({'error': 'results must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        results_by_id = {r.id: r for r in test.results.all()}
        for r in results_data:
            row = results_by_id.get(r.get('id'))
            if not row:
                continue
            row.result_text = r.get('result_text', row.result_text)
            row.result_numeric = parse_numeric_result(row.result_text, row.parameter.value_type)
            if row.parameter.value_type == 'text':
                # Qualitative — only a human can say Pass/Fail/NA
                row.verdict = r.get('verdict') or row.verdict or 'NA'
            else:
                row.verdict = compute_verdict(row.spec_type, row.min_value, row.max_value, row.result_numeric, row.parameter.value_type)
            row.entered_by = request.user
            row.entered_at = timezone.now()
            row.save()

        test.overall_verdict = compute_overall_verdict(test.results.all())
        test.status = 'reviewed'
        test.remarks = request.data.get('remarks', test.remarks)
        if request.data.get('batch_quantity') is not None:
            test.batch_quantity = request.data.get('batch_quantity')
        test.date_of_analysis = timezone.now().date()
        test.save()

        return Response(self.get_serializer(test).data)

    @action(detail=True, methods=['post'], url_path='issue')
    @transaction.atomic
    def issue(self, request, pk=None):
        test = self.get_object()
        if test.status != 'reviewed':
            return Response({'error': 'Only a reviewed test can be issued.'}, status=status.HTTP_400_BAD_REQUEST)
        if test.overall_verdict == 'pending':
            return Response({'error': 'Submit results before issuing.'}, status=status.HTTP_400_BAD_REQUEST)

        test.status = 'issued'
        test.date_of_issue = timezone.now().date()
        test.issued_at = timezone.now()
        test.approved_by = request.user
        test.save()

        test.batch.quality_status = 'passed' if test.overall_verdict == 'conforms' else 'failed'
        test.batch.save(update_fields=['quality_status'])

        return Response(self.get_serializer(test).data)

    @action(detail=True, methods=['post'], url_path='reject-batch')
    @transaction.atomic
    def reject_batch(self, request, pk=None):
        test = self.get_object()
        if test.batch.quality_status != 'failed':
            return Response({'error': 'Only a batch with a failed (issued) test can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        test.batch.quality_status = 'rejected'
        test.batch.save(update_fields=['quality_status'])
        return Response(self.get_serializer(test).data)
