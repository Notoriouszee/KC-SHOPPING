"""Generates placeholder product photos for the demo seed.

These are clearly stylised illustrations, not fake photographs: each product gets
its own distinct image so the storefront and share previews can be exercised
without pretending to be a real catalogue.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 900, 675
OUT = os.path.join(os.getcwd(), "data", "uploads", "product-images")


def font(size):
    for candidate in [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def gradient(top, bottom):
    img = Image.new("RGB", (W, H), top)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=color)
    return img


def label(draw, text, color="#ffffff"):
    f = font(34)
    bbox = draw.textbbox((0, 0), text, font=f)
    draw.text(((W - (bbox[2] - bbox[0])) / 2, H - 70), text, font=f, fill=color)


def bag():
    img = gradient((32, 38, 44), (64, 74, 84))
    d = ImageDraw.Draw(img)
    # Shadow
    d.ellipse([(230, 545), (670, 595)], fill=(24, 28, 33))
    # Handle
    d.arc([(365, 220), (535, 430)], start=180, end=360, fill="#c9a227", width=16)
    # Body
    d.rounded_rectangle([(300, 330), (600, 560)], radius=26, fill="#1f252b", outline="#c9a227", width=4)
    d.line([(300, 400), (600, 400)], fill="#2f3841", width=3)
    # Clasp
    d.rounded_rectangle([(432, 386), (468, 414)], radius=6, fill="#c9a227")
    label(d, "Black designer bag", "#e8eaed")
    return img


def dress():
    img = gradient((18, 78, 62), (10, 44, 36))
    d = ImageDraw.Draw(img)
    d.polygon([(380, 170), (520, 170), (600, 560), (300, 560)], fill="#e2703a")
    d.polygon([(420, 170), (480, 170), (470, 560), (430, 560)], fill="#f2a17a")
    for y in range(220, 540, 60):
        d.ellipse([(350, y), (378, y + 28)], fill="#ffd166")
        d.ellipse([(522, y + 20), (550, y + 48)], fill="#ffd166")
    d.line([(380, 170), (350, 120)], fill="#e2703a", width=10)
    d.line([(520, 170), (550, 120)], fill="#e2703a", width=10)
    label(d, "Ankara wrap dress")
    return img


def sandals():
    img = gradient((232, 211, 181), (198, 170, 132))
    d = ImageDraw.Draw(img)
    for dx in (0, 150):
        d.rounded_rectangle([(230 + dx, 300), (500 + dx, 480)], radius=70, fill="#8b5a2b")
        d.arc([(280 + dx, 320), (450 + dx, 430)], start=200, end=340, fill="#5c3a1a", width=12)
        d.line([(360 + dx, 330), (360 + dx, 460)], fill="#5c3a1a", width=6)
    label(d, "Leather sandals", "#3d2b16")
    return img


def scarf():
    img = gradient((38, 44, 92), (22, 26, 55))
    d = ImageDraw.Draw(img)
    points = []
    for i in range(0, 101):
        x = 180 + (i / 100) * 540
        y = 340 + 70 * __import__("math").sin(i / 100 * 6.28318)
        points.append((x, y))
    d.line(points, fill="#d4af37", width=60, joint="curve")
    d.line(points, fill="#f0d96b", width=14, joint="curve")
    label(d, "Silk scarf")
    return img


def necklace():
    img = gradient((80, 30, 48), (44, 16, 27))
    d = ImageDraw.Draw(img)
    d.arc([(250, 200), (650, 560)], start=200, end=340, fill="#d4af37", width=6)
    for i, (x, y) in enumerate([(360, 430), (420, 470), (480, 470), (540, 430)]):
        d.ellipse([(x - 18, y - 18), (x + 18, y + 18)], fill="#e6c15a", outline="#a8842b", width=3)
    label(d, "Beaded necklace set")
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, render in [
        ("bag", bag),
        ("dress", dress),
        ("sandals", sandals),
        ("scarf", scarf),
        ("necklace", necklace),
    ]:
        path = os.path.join(OUT, f"demo-{name}.png")
        render().save(path, "PNG", optimize=True)
        print("wrote", path, os.path.getsize(path), "bytes")

    # Shop logo (square), used by the demo storefront and its link previews.
    logo_dir = os.path.join(os.getcwd(), "data", "uploads", "shop-logos")
    os.makedirs(logo_dir, exist_ok=True)
    size = 400
    logo = Image.new("RGB", (size, size), "#1f6a54")
    ld = ImageDraw.Draw(logo)
    for i in range(0, size, 8):
        ld.line([(i, size), (0, size - i)], fill="#2b876b", width=8)
    f = font(150)
    text = "MF"
    bbox = ld.textbbox((0, 0), text, font=f)
    ld.text(
        ((size - (bbox[2] - bbox[0])) / 2 - bbox[0], (size - (bbox[3] - bbox[1])) / 2 - bbox[1]),
        text,
        font=f,
        fill="#ffffff",
    )
    logo_path = os.path.join(logo_dir, "mystore-logo.png")
    logo.save(logo_path, "PNG", optimize=True)
    print("wrote", logo_path, os.path.getsize(logo_path), "bytes")


if __name__ == "__main__":
    main()
