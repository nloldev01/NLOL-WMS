import pyotp
import time

secret = pyotp.random_base32()
print(f"Secret: {secret}")

totp = pyotp.totp.TOTP(secret)
code = totp.now()
print(f"Current Code: {code}")

# Verify
print(f"Verification (direct): {totp.verify(code)}")
print(f"Verification (utils style): {pyotp.totp.TOTP(secret).verify(code, valid_window=1)}")

# Test with slight delay
print("Waiting 2 seconds...")
time.sleep(2)
print(f"Verification (after delay): {pyotp.totp.TOTP(secret).verify(code, valid_window=1)}")
