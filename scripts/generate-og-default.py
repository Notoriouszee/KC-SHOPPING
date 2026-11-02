"""Generates the default Open Graph card (1200x630) used when a shop or product
has no photo of its own. It is clearly a brand card, not a fake product photo.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = os.path.join(os.getcwd(), "public", "og-default.png")


def font(size):
    for candidate in [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    img = Image.new("RGB", (W, H), "#15382f")
    draw = ImageDraw.Draw(img)

    # Diagonal brand field.
    for x in range(0, W + H, 40):
        draw.line([(x, 0), (x - H, H)], fill="#1b5545", width=28)

    # Wordmark block.
    draw.rounded_rectangle([(80, 80), (196, 196)], radius=34, fill="#2b876b")
    draw.text((110, 100), "O", font=font(72), fill="#ffffff")

    draw.text((230, 104), "OrderPilot", font=font(64), fill="#ffffff")
    draw.text(
        (84, 260),
        "Every seller gets a shop link.",
        font=font(52),
        fill="#d6ede3",
    )
    draw.text(
        (84, 330),
        "Every product gets a direct link.",
        font=font(52),
        fill="#d6ede3",
    )
    draw.text(
        (84, 460),
        "Share it. Sell it. Track the order.",
        font=font(34),
        fill="#75c2a7",
    )

    draw.text((84, 560), "orderpilot.com", font=font(28), fill="#aadbc8")

    img.save(OUT, "PNG", optimize=True)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
