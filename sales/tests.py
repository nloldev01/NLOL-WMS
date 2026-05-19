from django.test import TestCase
from django.utils import timezone
from datetime import date
from accounts.models import User
from .models import Customer, Invoice, InvoiceItem


class CustomerModelTest(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            customer_code='CUST001',
            customer_name='Test Customer',
            customer_type='retail',
            phone='1234567890'
        )

    def test_customer_creation(self):
        self.assertEqual(self.customer.customer_code, 'CUST001')
        self.assertEqual(self.customer.customer_name, 'Test Customer')
        self.assertTrue(self.customer.is_active)

    def test_customer_string_representation(self):
        self.assertEqual(str(self.customer), 'CUST001 - Test Customer')


class InvoiceModelTest(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            customer_code='CUST001',
            customer_name='Test Customer'
        )
        self.invoice = Invoice.objects.create(
            invoice_number='INV001',
            customer=self.customer,
            invoice_date=date.today(),
            gross_amount=1000.00,
            discount=100.00,
            net_amount=900.00
        )

    def test_invoice_creation(self):
        self.assertEqual(self.invoice.invoice_number, 'INV001')
        self.assertEqual(self.invoice.customer, self.customer)
        self.assertEqual(self.invoice.net_amount, 900.00)

    def test_invoice_string_representation(self):
        self.assertEqual(str(self.invoice), 'INV001')


class InvoiceItemModelTest(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            customer_code='CUST001',
            customer_name='Test Customer'
        )
        self.invoice = Invoice.objects.create(
            invoice_number='INV001',
            customer=self.customer,
            invoice_date=date.today()
        )
        self.item = InvoiceItem.objects.create(
            invoice=self.invoice,
            product_name='Test Product',
            quantity=10.00,
            rate=100.00,
            amount=1000.00
        )

    def test_invoice_item_creation(self):
        self.assertEqual(self.item.product_name, 'Test Product')
        self.assertEqual(self.item.quantity, 10.00)
        self.assertEqual(self.item.amount, 1000.00)

    def test_invoice_item_string_representation(self):
        self.assertIn('INV001', str(self.item))
        self.assertIn('Test Product', str(self.item))
