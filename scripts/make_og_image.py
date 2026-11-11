"""The site's own link preview image, assets/og-image.jpg (1200 by 630): the hero's NASA night photograph (ISS030E055569, see
assets/earth/SOURCES.md) along the bottom, as on every launch's share card (launch_pages.share_image), with the mark, the name and the line
under it. Run it again if the hero photo, the mark or the line changes:  python3 scripts/make_og_image.py  (Pillow)."""
import pathlib
import random

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 1200, 630


def font(n, size):
    return ImageFont.truetype(str(ROOT / "assets" / "fonts" / n), size)


def main():
    im = Image.new("RGB", (W, H), (3, 5, 11))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=(round(3 + 3 * k), round(5 + 5 * k), round(11 + 13 * k)))
    rnd = random.Random(7)
    for _ in range(110):
        x, y, a = rnd.randrange(W), rnd.randrange(int(H * .6)), rnd.randrange(70, 220)
        d.point((x, y), fill=(a, a, min(255, a + 25)))
    pim = Image.open(ROOT / "assets/earth/hero-wide-2560.webp").convert("RGB")
    pim = pim.resize((W, round(pim.height * W / pim.width)), Image.LANCZOS)
    mask = Image.linear_gradient("L").resize((W, pim.height)).point(lambda v: min(255, v * 4))
    im.paste(pim, (0, round(H * .66 - pim.height * .3)), mask)
    d = ImageDraw.Draw(im)
    m = Image.open(ROOT / "assets/apple-touch-icon.png").convert("RGB").resize((88, 88), Image.LANCZOS)
    im.paste(m, (80, 92))
    d.text((190, 100), "ASTRO RADAR", font=font("barlow-condensed-600.woff2", 72), fill=(238, 240, 255))
    d.text((82, 214), "Every rocket launch, checked against your sky.", font=font("barlow-500.woff2", 40), fill=(196, 203, 227))
    im.save(ROOT / "assets/og-image.jpg", quality=86, optimize=True, progressive=True)
    print("assets/og-image.jpg", (ROOT / "assets/og-image.jpg").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
