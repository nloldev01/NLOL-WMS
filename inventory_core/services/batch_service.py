from datetime import date
from django.db import transaction
from ..models import Batch, BatchCounter


class BatchService:

    @staticmethod
    @transaction.atomic
    def generate_code(batch_type: str):
        """
        Generates batch code string like:
        BAT-260419-RAW-A01
        BAT-260419-PRD-B12
        """

        today = date.today()
        date_str = today.strftime("%y%m%d")

        counter, _ = BatchCounter.objects.select_for_update().get_or_create(
            date=today,
            batch_type=batch_type,
            defaults={"letter": "A", "number": 0}
        )

        counter.number += 1

        if counter.number > 99:
            counter.number = 0
            counter.letter = chr(ord(counter.letter) + 1)

        counter.save()

        batch_code = f"BAT-{date_str}-{batch_type}-{counter.letter}{counter.number:02d}"

        return batch_code