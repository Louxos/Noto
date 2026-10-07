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
    text(d, (20, 76), "LECTURE · ÉDITION · LOCAL", 6.2, "#BEBBEF", bold=True)
    text(d, (19, 103), "Vos fichiers.\nÀ leur place.", 17.4, WHITE, bold=True, spacing=4)
    text(d, (20, 159), "Lisez, organisez,\nmodifiez en local.", 8.4, "#D2D2E0", spacing=4)

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
    text(d, (56, 9), "Noto", 18, INK, bold=True)
    text(d, (57, 34), "LECTURE · ÉDITION · LOCAL", 5.3, MUTED, bold=True)
    rect(d, (143, 0, 150, 57), VIOLET)
    export(image, "nsis-header.bmp", (150, 57))


def wix_banner():
    image = Image.new("RGB", (p(493), p(58)), WHITE)
    d = ImageDraw.Draw(image)
    rect(d, (0, 56, 493, 58), "#E9E9EF")
    mark(d, 15, 10, 38)
    text(d, (65, 8), "Noto", 17.5, INK, bold=True)
    text(d, (66, 34), "LECTURE · ÉDITION · LOCAL", 6.7, MUTED, bold=True)
    rect(d, (355, 17, 477, 41), LAVENDER, radius=12)
    circle(d, (366, 26, 372, 32), fill=VIOLET)
    text(d, (379, 23), "PRIVÉ PAR CONCEPTION", 5.9, VIOLET_DARK, bold=True)
    export(image, "wix-banner.bmp", (493, 58))


def wix_dialog():
    image = gradient(493, 312, "#FCFCFE", "#F4F4F8")
    d = ImageDraw.Draw(image)
    # Editorial brand panel on the left.
    rect(d, (0, 0, 174, 312), "#292B3A")
    circle(d, (64, -75, 230, 91), fill="#34344D")
    circle(d, (87, -45, 197, 65), outline="#4C4969", width=1)
    circle(d, (144, 38, 150, 44), fill=VIOLET)
    mark(d, 22, 23, 46)
    text(d, (23, 84), "Noto", 23, WHITE, bold=True)
    rect(d, (23, 122, 58, 124), VIOLET)
    text(d, (22, 142), "Vos fichiers,\nsans détour.", 15, WHITE, bold=True, spacing=5)
    text(d, (23, 198), "Un espace local pour\nlire, classer et éditer.", 8.1, "#D0D0DE", spacing=4)
    rect(d, (22, 265, 151, 289), "#3A394F", radius=12, outline="#53516D", width=1)
    circle(d, (31, 274, 37, 280), fill=MINT)
    text(d, (43, 271), "100 % LOCAL", 6.2, WHITE, bold=True)

    # App mockup: recognizable Noto workspace rather than generic stock imagery.
    rect(d, (211, 47, 466, 229), "#E6E6EF", radius=11)
    rect(d, (205, 40, 460, 222), WHITE, radius=11, outline="#E5E5ED", width=1)
    rect(d, (205, 40, 460, 66), "#FAFAFC", radius=11)
    rect(d, (205, 57, 460, 67), "#FAFAFC")
    mark(d, 216, 46, 14)
    text(d, (236, 47), "Noto", 8.4, INK, bold=True)
    circle(d, (429, 49, 435, 55), fill="#E7E6F5")
    circle(d, (440, 49, 446, 55), fill="#E7E6F5")
    rect(d, (218, 78, 280, 211), "#F6F6F9", radius=5)
    rect(d, (288, 78, 447, 211), "#FFFFFF", radius=5, outline="#EFEFF3", width=1)
    # Sidebar rows
    for y, width in [(91, 42), (108, 49), (125, 38)]:
        rect(d, (228, y, 235, y + 7), "#E4E2FB", radius=2)
        rect(d, (241, y + 2, 241 + width, y + 5), "#D7D7E0", radius=1)
    rect(d, (226, 142, 272, 161), "#EFEEFF", radius=4)
    rect(d, (231, 148, 237, 154), VIOLET, radius=2)
    rect(d, (242, 149, 266, 152), "#B7B4E9", radius=1)
    # Document page and writing lines
    rect(d, (305, 91, 429, 197), "#FFFFFF", radius=4, outline="#EDEDF2", width=1)
    rect(d, (319, 105, 371, 110), INK, radius=2)
    rect(d, (319, 121, 414, 124), "#D9D9E2", radius=1)
    rect(d, (319, 131, 405, 134), "#E1E1E8", radius=1)
    rect(d, (319, 141, 414, 144), "#E1E1E8", radius=1)
    rect(d, (319, 151, 398, 154), "#E1E1E8", radius=1)
    rect(d, (319, 168, 356, 182), "#EEEFFF", radius=3)
    rect(d, (364, 168, 414, 171), "#E1E1E8", radius=1)
    rect(d, (364, 177, 406, 180), "#E1E1E8", radius=1)

    text(d, (206, 251), "OUVREZ. CONSULTEZ.", 8, INK, bold=True)
    text(d, (206, 267), "MODIFIEZ, SI BESOIN.", 8, INK, bold=True)
    rect(d, (206, 289, 260, 292), VIOLET, radius=1)
    text(d, (269, 286), "VOTRE ESPACE, VOTRE RYTHME", 5.7, MUTED, bold=True)
    export(image, "wix-dialog.bmp", (493, 312))


if __name__ == "__main__":
    nsis_sidebar()
    nsis_header()
    wix_banner()
    wix_dialog()
    print("Rendered branded Noto installer bitmaps in", OUT)
