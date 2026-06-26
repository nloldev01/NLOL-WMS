from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status

from .models import User, UserRole


class UserManagerTest(TestCase):
    def setUp(self):
        self.role = UserRole.objects.create(role='tester')

    def test_create_user_hashes_password(self):
        user = User.objects.create_user(
            username='alice', email='alice@example.com', password='Secret123!',
            fullname='Alice', user_role=self.role,
        )
        self.assertNotEqual(user.password, 'Secret123!')
        self.assertTrue(user.check_password('Secret123!'))

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(username='bob', email='', password='x', user_role=self.role)

    def test_user_string_representation(self):
        user = User.objects.create_user(
            username='carol', email='carol@example.com', password='x', user_role=self.role,
        )
        self.assertEqual(str(user), 'carol')


class LoginViewTest(APITestCase):
    def setUp(self):
        self.role = UserRole.objects.create(role='tester')
        self.user = User.objects.create_user(
            username='dave', email='dave@example.com', password='Secret123!',
            fullname='Dave', user_role=self.role,
        )

    def test_login_success_returns_tokens(self):
        res = self.client.post('/api/login/', {'username': 'dave', 'password': 'Secret123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data['user']['username'], 'dave')

    def test_login_wrong_password_returns_401(self):
        res = self.client.post('/api/login/', {'username': 'dave', 'password': 'wrong'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_fields_returns_400(self):
        res = self.client.post('/api/login/', {'username': 'dave'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_blocked_account_returns_403(self):
        self.user.status = User.STATUS_BLOCKED
        self.user.save(update_fields=['status'])
        res = self.client.post('/api/login/', {'username': 'dave', 'password': 'Secret123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_unauthenticated_endpoint_is_reachable(self):
        # Regression guard for the DEFAULT_PERMISSION_CLASSES=IsAuthenticated change —
        # login must stay reachable with no Authorization header at all.
        res = self.client.post('/api/login/', {'username': 'dave', 'password': 'Secret123!'}, format='json')
        self.assertNotEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordViewTest(APITestCase):
    def setUp(self):
        self.role = UserRole.objects.create(role='tester')
        self.user = User.objects.create_user(
            username='erin', email='erin@example.com', password='OldPass123!',
            fullname='Erin', user_role=self.role,
        )
        self.client.force_authenticate(user=self.user)

    def test_change_password_requires_correct_old_password(self):
        res = self.client.post('/api/change-password/', {'old_password': 'wrong', 'new_password': 'NewPass123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_success(self):
        res = self.client.post('/api/change-password/', {'old_password': 'OldPass123!', 'new_password': 'NewPass123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass123!'))

    def test_change_password_requires_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/change-password/', {'old_password': 'OldPass123!', 'new_password': 'NewPass123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
