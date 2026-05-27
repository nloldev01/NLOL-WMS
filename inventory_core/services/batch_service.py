from django.db import transaction
from django.utils import timezone
from ..models import Batch, BatchCounter


class BatchService:

    @staticmethod
    @transaction.atomic
    def generate_code(batch_type: str):
        """
        Generates batch code string like:
        B-260423-R-A00 (Raw Materials)
        B-260423-P-A00 (Products)
        """

        today = timezone.localdate()
        date_str = today.strftime("%y%m%d")

        # Mapping RAW -> R, PRD -> P
        type_char = batch_type[0].upper()

        counter, _ = BatchCounter.objects.select_for_update().get_or_create(
            date=today,
            batch_type=batch_type,
            defaults={"letter": "A", "number": 0}
        )

        # Generate code with current values (starts at 00)
        batch_code = f"B-{date_str}-{type_char}-{counter.letter}{counter.number:02d}"

        # Increment for the next one
        counter.number += 1

        if counter.number > 99:
            counter.number = 0
            counter.letter = chr(ord(counter.letter) + 1)

        counter.save()

        return batch_code

    @staticmethod
    @transaction.atomic
    def generate_lpn_code(batch=None):
        """
        Generates global LPN code. e.g. L-000000001
        """
        from ..models import LPNCounter
        counter, _ = LPNCounter.objects.select_for_update().get_or_create(
            prefix='L', 
            defaults={'last_value': 0}
        )
        counter.last_value += 1
        counter.save()
        return f"{counter.prefix}-{counter.last_value:09d}"


class FCCService:

    @staticmethod
    @transaction.atomic
    def generate_fcc_code():
        """
        Generates a globally unique Factory Container Code.
        Format: F-000000001
        """
        from ..models import FCCCounter
        counter, _ = FCCCounter.objects.select_for_update().get_or_create(
            prefix='F',
            defaults={'last_value': 0}
        )
        counter.last_value += 1
        counter.save()
        return f"F-{counter.last_value:09d}"
