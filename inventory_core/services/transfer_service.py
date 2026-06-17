from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum


class TransferService:

    @classmethod
    def validate(cls, *, from_location, items):
        """
        Check every item has sufficient stock at from_location before touching anything.
        Returns a list of error dicts; empty list means all clear.
        """
        from products_stock.models import FinishedProductStock, ProductStock
        from raw_materials_stock.models import RawMaterialStock

        errors = []
        for item in items:
            qty  = Decimal(str(item['quantity']))
            b_id = item.get('batch_id')
            l_id = item.get('lpn_id')

            if item['stock_type'] == 'FIN':
                qs = FinishedProductStock.objects.filter(
                    finished_product_variant_id=item['variant_id'],
                    location=from_location,
                )
                if b_id: qs = qs.filter(batch_id=b_id)
                if l_id: qs = qs.filter(lpn_id=l_id)

            elif item['stock_type'] == 'PRD':
                qs = ProductStock.objects.filter(
                    product_id=item['product_id'],
                    location=from_location,
                )
                if b_id: qs = qs.filter(batch_id=b_id)
                if l_id: qs = qs.filter(lpn_id=l_id)

            elif item['stock_type'] == 'RAW':
                qs = RawMaterialStock.objects.filter(
                    material_id=item['material_id'],
                    location=from_location,
                )
                if b_id: qs = qs.filter(batch_id=b_id)
                if l_id: qs = qs.filter(lpn_id=l_id)

            else:
                qs = None

            available = qs.aggregate(total=Sum('quantity'))['total'] or 0 if qs is not None else 0

            if available < qty:
                errors.append({
                    'item_label': item.get('item_label', f"batch_id={b_id}"),
                    'requested': float(qty),
                    'available': float(available),
                    'location': from_location.get_full_path(),
                })

        return errors

    @classmethod
    def execute(cls, *, from_location, to_location, items, performed_by, notes=''):
        """
        Validates stock first, then runs all movements atomically.
        Raises ValidationError if pre-flight fails — no stock is modified.
        """
        from inventory_core.models import Batch, LPN
        from master_data.models import FinishedProductVariant, Product, RawMaterialAndConsumable
        from products_stock.models import FinishedProductStockLog, ProductStockLog
        from raw_materials_stock.models import RawMaterialStockLog

        errors = cls.validate(from_location=from_location, items=items)
        if errors:
            raise ValidationError({'stock_errors': errors})

        with transaction.atomic():
            for item in items:
                qty   = Decimal(str(item['quantity']))
                batch = Batch.objects.get(id=item['batch_id']) if item.get('batch_id') else None
                lpn   = LPN.objects.get(id=item['lpn_id'])     if item.get('lpn_id')   else None

                if item['stock_type'] == 'FIN':
                    variant = FinishedProductVariant.objects.get(id=item['variant_id'])
                    FinishedProductStockLog.create_movement(
                        finished_product_variant=variant,
                        location=from_location,
                        movement_type='transfer_out',
                        quantity=qty,
                        batch=batch,
                        lpn=lpn,
                        counterpart_location=to_location,
                        performed_by=performed_by,
                        notes=notes,
                    )

                elif item['stock_type'] == 'PRD':
                    product = Product.objects.get(id=item['product_id'])
                    ProductStockLog.create_movement(
                        product=product,
                        location=from_location,
                        movement_type='transfer_out',
                        quantity=qty,
                        batch=batch,
                        lpn=lpn,
                        counterpart_location=to_location,
                        performed_by=performed_by,
                        notes=notes,
                    )

                elif item['stock_type'] == 'RAW':
                    material = RawMaterialAndConsumable.objects.get(id=item['material_id'])
                    RawMaterialStockLog.create_movement(
                        material=material,
                        location=from_location,
                        movement_type='transfer_out',
                        quantity=qty,
                        batch=batch,
                        lpn=lpn,
                        counterpart_location=to_location,
                        performed_by=performed_by,
                        notes=notes,
                    )

        return {'transferred': len(items)}

    @classmethod
    def validate_multi(cls, *, items, location_map):
        """
        Per-item source location validation.
        items: list of dicts each with from_location_id
        location_map: {id: Location}
        """
        from products_stock.models import FinishedProductStock, ProductStock
        from raw_materials_stock.models import RawMaterialStock

        errors = []
        for item in items:
            from_loc = location_map[int(item['from_location_id'])]
            qty  = Decimal(str(item['quantity']))
            b_id = item.get('batch_id')
            l_id = item.get('lpn_id')

            if item['stock_type'] == 'FIN':
                qs = FinishedProductStock.objects.filter(
                    finished_product_variant_id=item['variant_id'], location=from_loc)
            elif item['stock_type'] == 'PRD':
                qs = ProductStock.objects.filter(
                    product_id=item['product_id'], location=from_loc)
            elif item['stock_type'] == 'RAW':
                qs = RawMaterialStock.objects.filter(
                    material_id=item['material_id'], location=from_loc)
            else:
                qs = None

            if qs is not None:
                if b_id: qs = qs.filter(batch_id=b_id)
                if l_id: qs = qs.filter(lpn_id=l_id)
                available = qs.aggregate(total=Sum('quantity'))['total'] or 0
            else:
                available = 0

            if available < qty:
                errors.append({
                    'item_label': item.get('item_label', f"batch_id={b_id}"),
                    'requested': float(qty),
                    'available': float(available),
                    'location': from_loc.get_full_path(),
                })

        return errors

    @classmethod
    def execute_multi(cls, *, to_location, items, location_map, performed_by, notes=''):
        """Per-item source location transfer. Validates first, then runs atomically."""
        from inventory_core.models import Batch, LPN
        from master_data.models import FinishedProductVariant, Product, RawMaterialAndConsumable
        from products_stock.models import FinishedProductStockLog, ProductStockLog
        from raw_materials_stock.models import RawMaterialStockLog

        errors = cls.validate_multi(items=items, location_map=location_map)
        if errors:
            raise ValidationError({'stock_errors': errors})

        with transaction.atomic():
            for item in items:
                from_loc = location_map[int(item['from_location_id'])]
                qty   = Decimal(str(item['quantity']))
                batch = Batch.objects.get(id=item['batch_id']) if item.get('batch_id') else None
                lpn   = LPN.objects.get(id=item['lpn_id'])     if item.get('lpn_id')   else None

                if item['stock_type'] == 'FIN':
                    variant = FinishedProductVariant.objects.get(id=item['variant_id'])
                    FinishedProductStockLog.create_movement(
                        finished_product_variant=variant, location=from_loc,
                        movement_type='transfer_out', quantity=qty,
                        batch=batch, lpn=lpn, counterpart_location=to_location,
                        performed_by=performed_by, notes=notes,
                    )
                elif item['stock_type'] == 'PRD':
                    product = Product.objects.get(id=item['product_id'])
                    ProductStockLog.create_movement(
                        product=product, location=from_loc,
                        movement_type='transfer_out', quantity=qty,
                        batch=batch, lpn=lpn, counterpart_location=to_location,
                        performed_by=performed_by, notes=notes,
                    )
                elif item['stock_type'] == 'RAW':
                    material = RawMaterialAndConsumable.objects.get(id=item['material_id'])
                    RawMaterialStockLog.create_movement(
                        material=material, location=from_loc,
                        movement_type='transfer_out', quantity=qty,
                        batch=batch, lpn=lpn, counterpart_location=to_location,
                        performed_by=performed_by, notes=notes,
                    )

        return {'transferred': len(items)}
