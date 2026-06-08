import decimal
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _cipher():
    return Fernet(settings.RECIPE_ENCRYPTION_KEY.encode())


def encrypt_value(value: str) -> str:
    return _cipher().encrypt(value.encode()).decode()


def decrypt_value(token: str) -> str:
    return _cipher().decrypt(token.encode()).decode()


class EncryptedDecimalField(models.TextField):
    """Stores a Decimal as a Fernet-encrypted string in the DB."""

    def from_db_value(self, value, expression, connection):
        if not value:
            return None
        try:
            return decimal.Decimal(decrypt_value(value))
        except (InvalidToken, Exception):
            # Fallback for plain values during migration window
            try:
                return decimal.Decimal(value)
            except Exception:
                return None

    def get_prep_value(self, value):
        if value is None:
            return None
        # Avoid double-encrypting: if it already decrypts cleanly, it's already a token
        try:
            decrypt_value(str(value))
            return str(value)
        except Exception:
            return encrypt_value(str(value))

    def to_python(self, value):
        if isinstance(value, decimal.Decimal) or value is None:
            return value
        try:
            return decimal.Decimal(decrypt_value(value))
        except (InvalidToken, Exception):
            try:
                return decimal.Decimal(value)
            except Exception:
                return None


class EncryptedTextField(models.TextField):
    """Stores a string as a Fernet-encrypted blob in the DB."""

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        try:
            return decrypt_value(value)
        except (InvalidToken, Exception):
            return value  # Fallback for plain values during migration window

    def get_prep_value(self, value):
        if not value:
            return value
        try:
            # Avoid double-encrypting: if it decrypts, it's already encrypted
            decrypt_value(value)
            return value
        except (InvalidToken, Exception):
            return encrypt_value(str(value))

    def to_python(self, value):
        if not value:
            return value
        try:
            return decrypt_value(value)
        except (InvalidToken, Exception):
            return value
