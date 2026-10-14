"""Render the branded Noto installer bitmaps. Requires Pillow: python -m pip install Pillow."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
S = 3
INK = "#292B3A"
INK_2 = "#222431"
PAPER = "#F7F8FA"
WHITE = "#FFFFFF"
VIOLET = "#7772D8"
VIOLET_DARK = "#6964C9"
LAVENDER = "#EEEEFF"
MUTED = "#858798"
MINT = "#79B6A1"
FONT_FILES = {
    False: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
    True: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
}


def font(size: float, bold: bool = False):
    for candidate in FONT_FILES[bold]:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, round(size * S))
    return ImageFont.load_default(size=round(size * S))


def p(value: float) -> int:
    return round(value * S)


def rect(draw: ImageDraw.ImageDraw, box, fill, radius=0, outline=None, width=1):
    box = tuple(p(value) for value in box)
    if radius:
        draw.rounded_rectangle(box, radius=p(radius), fill=fill, outline=outline, width=p(width))
    else:
        draw.rectangle(box, fill=fill, outline=outline, width=p(width))


def line(draw: ImageDraw.ImageDraw, points, fill, width=1):
    draw.line([(p(x), p(y)) for x, y in points], fill=fill, width=p(width), joint="curve")


def text(draw: ImageDraw.ImageDraw, xy, value, size, fill, bold=False, spacing=3):
    draw.multiline_text((p(xy[0]), p(xy[1])), value, font=font(size, bold), fill=fill, spacing=p(spacing))


def circle(draw: ImageDraw.ImageDraw, box, fill=None, outline=None, width=1):
    draw.ellipse(tuple(p(value) for value in box), fill=fill, outline=outline, width=p(width))


def gradient(width: int, height: int, top: str, bottom: str) -> Image.Image:
    def rgb(value: str):
        return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))
    start, end = rgb(top), rgb(bottom)
    image = Image.new("RGB", (p(width), p(height)))
    pixels = image.load()
    for y in range(image.height):
        t = y / max(1, image.height - 1)
        color = tuple(round(a * (1 - t) + b * t) for a, b in zip(start, end))
        for x in range(image.width):
            pixels[x, y] = color
    return image


def mark(draw: ImageDraw.ImageDraw, x: float, y: float, size: float, tile=LAVENDER):
    r = size / 4.1
    rect(draw, (x, y, x + size, y + size), tile, radius=r)
    # The Noto monogram: a clean, angular N with the signature violet dot.
    pts = [
        (x + size * .25, y + size * .70),
        (x + size * .25, y + size * .28),
        (x + size * .37, y + size * .28),
        (x + size * .70, y + size * .59),
        (x + size * .70, y + size * .28),
        (x + size * .82, y + size * .28),
        (x + size * .82, y + size * .70),
        (x + size * .69, y + size * .70),
        (x + size * .37, y + size * .40),
        (x + size * .37, y + size * .70),
    ]
    scaled = [(p(px), p(py)) for px, py in pts]
    draw.polygon(scaled, fill=INK)
    dot = size * .095
    circle(draw, (x + size * .70, y + size * .69, x + size * .70 + dot, y + size * .69 + dot), VIOLET)


def export(image: Image.Image, name: str, logical_size: tuple[int, int]):
    image = image.resize(logical_size, Image.Resampling.LANCZOS).convert("RGB")
    image.save(OUT / name, format="BMP")


def nsis_sidebar():
    image = gradient(164, 314, "#252638", "#34324F")
    d = ImageDraw.Draw(image)
    circle(d, (83, -80, 222, 60), fill="#302F4A")
    circle(d, (105, -50, 200, 45), outline="#464366", width=1)
    circle(d, (129, 16, 134, 21), fill=VIOLET)
    mark(d, 18, 20, 39)
    text(d, (67, 23), "Noto", 20, WHITE, bold=True)
    text(d, (20, 74), "LECTURE · ÉDITION · LOCAL", 5.9, "#BEBBEF", bold=True)
    # Slogan officiel de Noto, affiché en entier, sur deux lignes lisibles.
    text(d, (19, 96), "Noto. Vos fichiers,\nvos outils,\nun seul espace.", 12.4, WHITE, bold=True, spacing=5)
    text(d, (20, 158), "Traitement local :\nrien n’est envoyé en ligne.", 7.4, "#D2D2E0", spacing=4)

    # A quiet, polished document-card illustration.
    rect(d, (18, 214, 146, 274), "#39384F", radius=8, outline="#53516D", width=1)
    rect(d, (28, 224, 49, 251), "#EEEFFF", radius=4)
    line(d, [(34, 231), (43, 231)], VIOLET, 1.4)
    line(d, [(34, 236), (43, 236)], "#A4A0E5", 1.2)
    line(d, [(34, 241), (41, 241)], "#A4A0E5", 1.2)
    text(d, (56, 225), "AUCUN CLOUD", 6.1, WHITE, bold=True)
    text(d, (56, 239), "Vos fichiers\nrestent chez vous.", 6.2, "#C4C4D4", spacing=3)
    circle(d, (22, 291, 28, 297), fill=MINT)
    text(d, (34, 289), "PRIVÉ PAR CONCEPTION", 5.7, "#D6D5E3", bold=True)
    export(image, "nsis-sidebar.bmp", (164, 314))


def nsis_header():
    image = Image.new("RGB", (p(150), p(57)), WHITE)
    d = ImageDraw.Draw(image)
    mark(d, 9, 9, 39)
    text(d, (56, 7), "Noto", 16.5, INK, bold=True)
    # Slogan officiel, réparti sur deux lignes pour rester lisible sans troncature.
    text(d, (57, 28), "Vos fichiers, vos outils,\nun seul espace.", 4.7, MUTED, bold=True, spacing=2)
    rect(d, (143, 0, 150, 57), VIOLET)
    export(image, "nsis-header.bmp", (150, 57))


if __name__ == "__main__":
    # Seul l’installeur NSIS est produit par Noto : il n’y a donc que deux visuels.
    nsis_sidebar()
    nsis_header()
    print("Rendered branded Noto NSIS installer bitmaps in", OUT)
