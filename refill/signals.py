from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='production.ProductionOrder')
def on_production_complete(sender, instance, **kwargs):
    """When a ProductionOrder linked to a RefillOrder completes, create the AssemblyOrder."""
    if instance.status != 'completed':
        return

    try:
        refill = instance.refill_order
    except Exception:
        return

    if refill.status != 'awaiting_kettle':
        return

    from assembly.models import AssemblyOrder
    from django.db import transaction

    with transaction.atomic():
        asm = AssemblyOrder.objects.create(
            assembly_number=AssemblyOrder.generate_order_number(),
            finished_product_variant=refill.destination_variant,
            source_location=refill.assembly_location,
            source_batch=instance.produced_batch,
            destination_location=refill.destination_location,
            target_quantity=refill.output_quantity,
            notes=f"Created by refill order {refill.refill_number}",
            performed_by=refill.performed_by,
        )
        refill.linked_assembly_order = asm
        refill.status = 'awaiting_assembly'
        refill.save()


@receiver(post_save, sender='assembly.AssemblyOrder')
def on_assembly_complete(sender, instance, **kwargs):
    """When an AssemblyOrder linked to a RefillOrder completes, mark the RefillOrder complete."""
    if instance.status not in ('assembled', 'completed'):
        return

    try:
        refill = instance.refill_order
    except Exception:
        return

    if refill.status != 'awaiting_assembly':
        return

    refill.status = 'completed'
    refill.save()
