import pyotp
import qrcode
import io
import base64

def generate_otp_secret():
    return pyotp.random_base32()

def get_provisioning_uri(user_email, secret, issuer_name="NLOL WMS"):
    return pyotp.totp.TOTP(secret).provisioning_uri(name=user_email, issuer_name=issuer_name)

def verify_otp_code(secret, code):
    totp = pyotp.totp.TOTP(secret)
    # Increase valid_window to 5 (allow +/- 2.5 minutes of clock drift)
    return totp.verify(code, valid_window=5)

def generate_qr_code_base64(uri):
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()
