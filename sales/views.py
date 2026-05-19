import csv
import io
import json
import pandas as pd
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from django.db.models import Q
from .models import Customer, Invoice, InvoiceItem
from .serializers import (
    CustomerSerializer, InvoiceSerializer, InvoiceItemSerializer,
    InvoiceDetailSerializer
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_finpro_excel(file_obj) -> list[dict]:
    """
    Parse a FinPro Excel file and return a list of normalised invoice dicts.

    Each dict has the shape:
        {
            "bill_no": str,
            "bill_date": str | None,   # ISO-8601 date string
            "customer_name": str,
            "gross_amount": float,
            "discount": float,
            "net_amount": float,
            "items": [
                {
                    "product_name": str,
                    "batch": str | None,
                    "expiry": str | None,
                    "quantity": float,
                    "free_quantity": float,
                    "unit": str | None,
                    "rate": float,
                    "amount": float,
                },
                ...
            ],
        }

    Raises ValueError with a human-readable message on structural problems.
    """
    # ── Read with FinPro's header layout (data starts at row 8, header at row 7)
    df = pd.read_excel(file_obj, header=6)

    columns = [
        'Bill Date', 'Bill No', 'Temp_Info',
        'Unit 2nd', 'Unit 1st', 'Batch', 'Expiry',
        'Quantity 2nd', 'Quantity 1st', 'Free 2nd', 'Free 1st',
        'Rate', 'Amount', 'Add/Less', 'Net Amount', 'Currency_Type',
    ]
    df.columns = columns[:len(df.columns)]

    # ── Normalise dates and bill numbers (forward-fill merged cells)
    df['Bill Date'] = pd.to_datetime(df['Bill Date'], errors='coerce').ffill()
    df['Bill No']   = df['Bill No'].ffill()

    # ── Extract Customer Name and Customer Code from "Customer :" sentinel rows
    # On these rows: Bill Date col = "Sh. Name", Bill No col = customer code (e.g. CA041),
    # Temp_Info col = "Customer : <name>"
    customer_mask = df['Temp_Info'].astype(str).str.startswith('Customer :', na=False)

    df['Customer Name'] = pd.NA
    df['Customer Code'] = pd.NA

    df.loc[customer_mask, 'Customer Name'] = (
        df.loc[customer_mask, 'Temp_Info']
          .str.replace('Customer : ', '', regex=False)
          .str.strip()
    )
    # Customer code sits in the 'Bill No' column on the same row
    df.loc[customer_mask, 'Customer Code'] = (
        df.loc[customer_mask, 'Bill No']
          .astype(str)
          .str.strip()
    )

    df['Customer Name'] = df['Customer Name'].ffill()
    df['Customer Code'] = df['Customer Code'].ffill()

    # ── Extract Product Name from data rows
    df['Product Name'] = pd.NA
    product_mask = (
        df['Temp_Info'].notna()
        & ~customer_mask
        & (df['Net Amount'].notna() | df['Rate'].notna())
    )
    df.loc[product_mask, 'Product Name'] = df.loc[product_mask, 'Temp_Info'].str.strip()
    df['Product Name'] = df['Product Name'].ffill()

    # ── Keep only valid item rows
    df_clean = df[
        df['Product Name'].notna()
        & df['Net Amount'].notna()
        & ~df['Product Name'].astype(str).str.contains('Total', na=False)
    ].copy()

    if df_clean.empty:
        raise ValueError("No valid invoice data found in the file.")

    # ── Coerce numeric columns
    numeric_cols = ['Quantity 2nd', 'Quantity 1st', 'Rate', 'Amount', 'Add/Less', 'Net Amount',
                    'Free 1st', 'Free 2nd']
    for col in numeric_cols:
        if col in df_clean.columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(0)

    # ── Build structured invoice list
    invoices = []
    for bill_no, group in df_clean.groupby('Bill No'):
        first_row = group.iloc[0]

        bill_date = (
            first_row['Bill Date'].date().isoformat()
            if pd.notna(first_row['Bill Date'])
            else None
        )

        items = []
        for _, row in group.iterrows():
            expiry_val = row.get('Expiry')
            expiry_str = None
            if pd.notna(expiry_val):
                try:
                    expiry_str = pd.to_datetime(expiry_val).date().isoformat()
                except Exception:
                    expiry_str = str(expiry_val)

            # Resolve unit — both columns can be pandas NaN (a float), not None
            unit_1 = row.get('Unit 1st')
            unit_2 = row.get('Unit 2nd')
            unit   = (str(unit_1).strip() if pd.notna(unit_1)
                      else str(unit_2).strip() if pd.notna(unit_2)
                      else None)

            # Resolve quantities — pandas NaN must become 0, not float('nan')
            qty_1  = row.get('Quantity 1st')
            qty_2  = row.get('Quantity 2nd')
            qty    = float(qty_1) if pd.notna(qty_1) and qty_1 != 0 else (float(qty_2) if pd.notna(qty_2) else 0.0)

            free_1 = row.get('Free 1st')
            free_2 = row.get('Free 2nd')
            free   = float(free_1) if pd.notna(free_1) and free_1 != 0 else (float(free_2) if pd.notna(free_2) else 0.0)

            items.append({
                'product_name':  str(row['Product Name']).strip(),
                'batch':         str(row['Batch']).strip() if pd.notna(row.get('Batch')) else None,
                'expiry':        expiry_str,
                'quantity':      qty,
                'free_quantity': free,
                'unit':          unit,
                'rate':          float(row['Rate'])       if pd.notna(row.get('Rate'))       else 0.0,
                'amount':        float(row['Net Amount']) if pd.notna(row.get('Net Amount')) else 0.0,
            })

        invoices.append({
            'bill_no':       str(bill_no).strip(),
            'bill_date':     bill_date,
            'customer_name': str(first_row['Customer Name']).strip(),
            'customer_code': str(first_row['Customer Code']).strip() if pd.notna(first_row.get('Customer Code')) else None,
            'gross_amount':  float(group['Amount'].sum()),
            'discount':      float(group['Add/Less'].sum()),
            'net_amount':    float(group['Net Amount'].sum()),
            'items':         items,
        })

    return invoices


def _persist_invoices(invoices: list[dict]) -> tuple[int, list[dict]]:
    """
    Write a list of normalised invoice dicts to the database.

    Returns (created_count, errors) where errors is a list of
    {'bill_no': ..., 'error': ...} dicts.
    """
    created = 0
    errors  = []

    with transaction.atomic():
        for inv in invoices:
            try:
                customer, _ = Customer.objects.get_or_create(
                    customer_name=inv['customer_name'],
                    defaults={
                        'customer_code': inv.get('customer_code'),   # ← add this
                        'customer_type': 'retail',
                        'is_active': True,
                    },
                )

                invoice = Invoice.objects.create(
                    invoice_number=inv['bill_no'],
                    customer=customer,
                    invoice_date=inv['bill_date'],
                    gross_amount=inv['gross_amount'],
                    discount=inv['discount'],
                    net_amount=inv['net_amount'],
                )

                InvoiceItem.objects.bulk_create([
                    InvoiceItem(
                        invoice=invoice,
                        product_name=item['product_name'],
                        batch=item['batch'],
                        expiry=item['expiry'],
                        quantity=item['quantity'],
                        free_quantity=item['free_quantity'],
                        unit=item['unit'],
                        rate=item['rate'],
                        amount=item['amount'],
                    )
                    for item in inv['items']
                ])

                created += 1

            except Exception as exc:
                errors.append({'bill_no': inv.get('bill_no'), 'error': str(exc)})

    return created, errors


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer_code', 'customer_name', 'phone']
    ordering_fields = ['customer_code', 'customer_name', 'created_at']
    ordering = ['-created_at']

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active customers."""
        customers = self.get_queryset().filter(is_active=True)
        serializer = self.get_serializer(customers, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """Get customers filtered by type."""
        customer_type = request.query_params.get('type')
        if not customer_type:
            return Response(
                {'error': 'type parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        customers = self.get_queryset().filter(customer_type=customer_type)
        serializer = self.get_serializer(customers, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='bulk-upload', parser_classes=[MultiPartParser])
    def bulk_upload(self, request):
        """Bulk-create customers from a CSV file."""
        file_obj = request.FILES.get('file')

        if not file_obj:
            return Response(
                {'detail': 'No file provided. Send the CSV as multipart/form-data with key "file".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not file_obj.name.endswith('.csv'):
            return Response(
                {'detail': 'Invalid file type. Only CSV files are supported.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded = file_obj.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response(
                {'detail': 'Could not decode the file. Ensure it is UTF-8 encoded.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = csv.DictReader(io.StringIO(decoded))

        if reader.fieldnames is None:
            return Response({'detail': 'The file appears to be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]

        required_columns = {'customer_code', 'customer_name'}
        missing = required_columns - set(reader.fieldnames)
        if missing:
            return Response(
                {'detail': f'Missing required column(s): {", ".join(sorted(missing))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created, errors = [], []

        for row_number, row in enumerate(reader, start=2):
            row = {k: v.strip() if v else v for k, v in row.items()}

            if row.get('customer_name', '').lower().startswith('customer : '):
                row['customer_name'] = row['customer_name'][11:].strip()

            if not row.get('customer_code') or not row.get('customer_name'):
                errors.append({
                    'row': row_number,
                    'data': row,
                    'errors': {
                        **({'customer_code': ['This field is required.']} if not row.get('customer_code') else {}),
                        **({'customer_name': ['This field is required.']} if not row.get('customer_name') else {}),
                    },
                })
                continue

            serializer = self.get_serializer(data=row)
            if serializer.is_valid():
                serializer.save()
                created.append(serializer.data)
            else:
                errors.append({'row': row_number, 'data': row, 'errors': serializer.errors})

        return Response(
            {
                'summary': {
                    'total_rows': len(created) + len(errors),
                    'created': len(created),
                    'failed': len(errors),
                },
                'created': created,
                'errors': errors,
            },
            status=status.HTTP_207_MULTI_STATUS if errors else status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='bulk-upload/template')
    def bulk_upload_template(self, request):
        """Return a CSV template for bulk customer upload."""
        from django.http import HttpResponse

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="customers_template.csv"'
        writer = csv.writer(response)
        writer.writerow(['customer_code', 'customer_name', 'customer_type', 'phone', 'address', 'is_active'])
        writer.writerow(['CUST001', 'Retail Customer', 'retail', '1234567890', '123 Main St', 'True'])
        return response


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related('customer').prefetch_related('items')
    serializer_class = InvoiceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['invoice_number', 'customer__customer_name']
    ordering_fields = ['invoice_date', 'created_at', 'net_amount']
    ordering = ['-invoice_date']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return InvoiceDetailSerializer
        return InvoiceSerializer

    # ------------------------------------------------------------------ #
    #  STEP 1 — Parse & preview (no DB writes)                            #
    #  POST /api/invoices/upload-excel/preview/                           #
    # ------------------------------------------------------------------ #
    @action(
        detail=False,
        methods=['post'],
        url_path='upload-excel/preview',
        parser_classes=[MultiPartParser],
    )
    def upload_excel_preview(self, request):
        """
        STEP 1 — Upload a FinPro Excel file and get back normalised JSON.

        No data is written to the database.  The caller should review the
        returned `invoices` list and, if satisfied, POST it to
        `upload-excel/confirm/` to persist it.

        Request
        -------
        multipart/form-data
            file : the FinPro .xlsx / .xls export

        Response 200
        ------------
        {
            "summary": {
                "total_invoices": <int>,
                "total_items":    <int>
            },
            "invoices": [ ... ]   ← normalised invoice dicts
        }
        """
        file_obj = request.FILES.get('file')

        if not file_obj:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if not file_obj.name.endswith(('.xlsx', '.xls')):
            return Response(
                {"detail": "Only Excel files (.xlsx, .xls) are supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            invoices = _normalize_finpro_excel(file_obj)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"detail": f"Error processing file: {str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_items = sum(len(inv['items']) for inv in invoices)

        return Response(
            {
                "summary": {
                    "total_invoices": len(invoices),
                    "total_items":    total_items,
                },
                "invoices": invoices,
            },
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------ #
    #  STEP 2 — Confirm & persist                                         #
    #  POST /api/invoices/upload-excel/confirm/                           #
    # ------------------------------------------------------------------ #
    @action(
        detail=False,
        methods=['post'],
        url_path='upload-excel/confirm',
        parser_classes=[MultiPartParser],
    )
    def upload_excel_confirm(self, request):
        raw = request.data.get('invoices')   # ← arrives as string field, not JSON body

        if not raw:
            return Response({"detail": "No invoices data provided."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoices = json.loads(raw)       # ← parse the stringified JSON
        except (json.JSONDecodeError, TypeError):
            return Response({"detail": "Invalid invoices data."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(invoices, list) or len(invoices) == 0:
            return Response({"detail": "invoices must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)

        validation_errors = []
        for idx, inv in enumerate(invoices):
            missing = [f for f in ('bill_no', 'customer_name', 'items') if not inv.get(f)]
            if missing:
                validation_errors.append({"index": idx, "bill_no": inv.get("bill_no", "<unknown>"),
                                        "error": f"Missing: {', '.join(missing)}"})
        if validation_errors:
            return Response({"detail": "Validation failed. No data saved.",
                            "validation_errors": validation_errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            created_count, errors = _persist_invoices(invoices)
        except Exception as exc:
            return Response({"detail": f"Unexpected error: {str(exc)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(
            {"message": "Invoices saved successfully.",
            "summary": {"total_submitted": len(invoices), "invoices_created": created_count, "failed": len(errors)},
            "errors": errors[:20]},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=['post'],
        url_path='upload-csv',
        parser_classes=[MultiPartParser],
    )
    def upload_csv(self, request):
        import csv as csv_lib

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.endswith('.csv'):
            return Response({"detail": "Only CSV files are supported."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded = file_obj.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({"detail": "Could not decode file. Ensure UTF-8 encoding."}, status=status.HTTP_400_BAD_REQUEST)

        reader = csv_lib.DictReader(io.StringIO(decoded))
        if reader.fieldnames is None:
            return Response({"detail": "File appears to be empty."}, status=status.HTTP_400_BAD_REQUEST)

        reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]

        missing_cols = {'bill_no', 'customer_name'} - set(reader.fieldnames)
        if missing_cols:
            return Response({"detail": f"Missing columns: {', '.join(sorted(missing_cols))}"},
                            status=status.HTTP_400_BAD_REQUEST)

        # Group flat rows back into nested invoice dicts keyed by bill_no
        invoice_map = {}
        for row in reader:
            bill_no = row.get('bill_no', '').strip()
            if not bill_no:
                continue
            if bill_no not in invoice_map:
                invoice_map[bill_no] = {
                    'bill_no':       bill_no,
                    'bill_date':     row.get('bill_date') or None,
                    'customer_name': row.get('customer_name', '').strip(),
                    'customer_code': row.get('customer_code', '').strip() or None,
                    'gross_amount':  float(row.get('gross_amount') or 0),
                    'discount':      float(row.get('discount') or 0),
                    'net_amount':    float(row.get('net_amount') or 0),
                    'items': [],
                }
            invoice_map[bill_no]['items'].append({
                'product_name':  row.get('product_name', '').strip(),
                'batch':         row.get('batch') or None,
                'expiry':        row.get('expiry') or None,
                'quantity':      float(row.get('quantity') or 0),
                'free_quantity': float(row.get('free_quantity') or 0),
                'unit':          row.get('unit') or None,
                'rate':          float(row.get('rate') or 0),
                'amount':        float(row.get('amount') or 0),
            })

        invoices = list(invoice_map.values())
        if not invoices:
            return Response({"detail": "No valid data found in CSV."}, status=status.HTTP_400_BAD_REQUEST)

        created_count, errors = _persist_invoices(invoices)

        return Response(
            {"message": "CSV imported successfully.",
            "summary": {"total_submitted": len(invoices), "invoices_created": created_count, "failed": len(errors)},
            "errors": errors[:20]},
            status=status.HTTP_201_CREATED,
        )


class InvoiceItemViewSet(viewsets.ModelViewSet):
    queryset = InvoiceItem.objects.select_related('invoice')
    serializer_class = InvoiceItemSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['product_name', 'invoice__invoice_number', 'batch']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']

    @action(detail=False, methods=['get'])
    def by_invoice(self, request):
        """Get items for a specific invoice."""
        invoice_id = request.query_params.get('invoice_id')
        if not invoice_id:
            return Response({'error': 'invoice_id parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        items = self.get_queryset().filter(invoice_id=invoice_id)
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Get items expiring within the next 30 days."""
        from datetime import timedelta
        from django.utils import timezone

        today       = timezone.now().date()
        thirty_days = today + timedelta(days=30)
        items = (
            self.get_queryset()
                .filter(expiry__range=[today, thirty_days])
                .order_by('expiry')
        )
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)