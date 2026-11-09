"""The QR code on the Florida page (assets/ksc-qr.png): https://astroradar.io/ksc/ as a 164 px PNG, dark on white with a quiet zone.
    pip install qrcode pillow && python3 scripts/make_qr.py
The PNG is committed, so the build needs neither library."""
import pathlib

import qrcode

ROOT = pathlib.Path(__file__).resolve().parent.parent
q = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=4)
q.add_data("https://astroradar.io/ksc/")
q.make(fit=True)
img = q.make_image(fill_color="#03050B", back_color="white").get_image().convert("L")
img = img.resize((164, 164), 0)  # nearest, so the modules stay sharp
img.save(ROOT / "assets" / "ksc-qr.png", optimize=True)
print("wrote assets/ksc-qr.png", img.size)
