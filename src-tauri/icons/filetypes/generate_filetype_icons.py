#!/usr/bin/env python3
"""Génère les icônes par type de fichier livrées par Noto.

Pourquoi ce script existe
-------------------------
Windows affiche, pour un fichier, l’icône de la classe de fichiers à laquelle il
appartient (valeur par défaut de la clé `DefaultIcon` de cette classe). Noto
n’enregistrait qu’une seule icône pour tous les fichiers (`Noto.exe,0`) : un
`.md`, un `.pdf` et une image se ressemblaient dans l’Explorateur. Ce script
produit un jeu d’icônes `.ico` multi-tailles — une par famille de formats — que
l’installeur NSIS installe dans `$INSTDIR\\filetypes` et déclare dans le
registre (voir `src-tauri/windows/installer/hooks.nsh`).

Contraintes respectées
----------------------
- **Aucune dépendance** : uniquement la bibliothèque standard (`zlib`, `struct`).
  Pillow n’est pas requis : les `.ico` sont écrits à la main, avec une entrée
  DIB pour 16 à 128 px et une entrée PNG pour 256 px, comme le format le prévoit
  depuis Windows Vista.
- **Reproductible** : chaque icône est dessinée analytiquement (distance signée
  et anticrénelage d’un demi-pixel), sans hasard ni police système. Relancer le
  script produit exactement les mêmes octets.
- **Aucune ressource tierce** : les formes et les deux polices bitmap (5×7 et
  3×5) sont définies dans ce fichier. Aucune licence externe ne porte donc sur
  les icônes livrées.

Usage
-----
    python3 src-tauri/icons/filetypes/generate_filetype_icons.py

Le script écrit `src-tauri/icons/filetypes/<nom>.ico` et l’aperçu
`docs/assets/icons-fichiers.png`, puis relit chaque fichier produit (en-tête,
tailles, profondeur, charge utile) avant de se déclarer satisfait.
"""

from __future__ import annotations

import os
import struct
import zlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ICON_DIR = os.path.join(REPO_ROOT, "src-tauri", "icons", "filetypes")
PREVIEW_PATH = os.path.join(REPO_ROOT, "docs", "assets", "icons-fichiers.png")

# Tailles présentes dans chaque .ico : petites vues de l’Explorateur (16/24/32),
# vignettes intermédiaires (48/64), grandes et très grandes icônes (128/256).
SIZES = (16, 24, 32, 48, 64, 128, 256)
SUBSAMPLES = 5  # sous-échantillonnage utilisé pour anticréneler les glyphes

# --------------------------------------------------------------------------
# Familles de formats
# --------------------------------------------------------------------------


class Family:
    """Une famille de formats de fichiers et son icône."""

    def __init__(self, name: str, color: str, badge: str | None = None, glyph: str | None = None):
        self.name = name
        self.color = color
        self.badge = badge
        self.glyph = glyph


# Alignées sur les classes déclarées dans `bundle.fileAssociations`
# (src-tauri/tauri.conf.json) et sur la table de docs/icons-fichiers.md.
FAMILIES = (
    Family("md", "#2563EB", badge="MD"),
    Family("texte", "#64748B", glyph="lignes"),
    Family("diff", "#22C55E", glyph="diff"),
    Family("configuration", "#D97706", badge="CFG"),
    Family("latex", "#0F766E", badge="TEX"),
    Family("code", "#7C3AED", glyph="code"),
    Family("web", "#EA580C", glyph="chevrons"),
    Family("commandes", "#111827", glyph="invite"),
    Family("json", "#A16207", badge="{}"),
    Family("xml", "#DB2777", badge="XML"),
    Family("yaml", "#0891B2", badge="YML"),
    Family("csv", "#047857", glyph="grille"),
    Family("tsv", "#4338CA", badge="TSV"),
    Family("pdf", "#DC2626", badge="PDF"),
    Family("image", "#0EA5E9", glyph="image"),
    Family("docx", "#1E40AF", badge="DOC"),
    Family("odt", "#3730A3", badge="ODT"),
    Family("rtf", "#475569", badge="RTF"),
    Family("pptx", "#C2410C", badge="PPT"),
    Family("odp", "#B45309", badge="ODP"),
    Family("epub", "#6B21A8", glyph="livre"),
)

# Libellés de l’aperçu documenté (police 5×7, jamais tronqués).
LABELS = {
    "md": "MD", "texte": "TEXTE", "diff": "DIFF", "configuration": "CONF", "latex": "TEX",
    "code": "CODE", "web": "WEB", "commandes": "SHELL", "json": "JSON", "xml": "XML",
    "yaml": "YAML", "csv": "CSV", "tsv": "TSV", "pdf": "PDF", "image": "IMAGE", "docx": "DOCX",
    "odt": "ODT", "rtf": "RTF", "pptx": "PPTX", "odp": "ODP", "epub": "EPUB",
}

# Entrées PNG à partir de 48 px : Windows Vista et suivants les lisent dans un
# ICO, et une image plate de 128 px passe de 64 Ko (DIB) à moins de 2 Ko (PNG).
# Les tailles 16/24/32 restent en DIB, format historique le mieux accepté.
PNG_SIZES = (48, 64, 128, 256)

# --------------------------------------------------------------------------
# Polices bitmap (aucune police système n’est lue)
# --------------------------------------------------------------------------

FONT_5x7 = {
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11111", "00010", "00100", "00010", "00001", "10001", "01110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "{": ("00011", "00100", "00100", "01000", "00100", "00100", "00011"),
    "}": ("11000", "00100", "00100", "00010", "00100", "00100", "11000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00000", "00100"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
}

FONT_3x5 = {
    "A": ("101", "111", "101", "101", "101"),
    "C": ("111", "100", "100", "100", "111"),
    "D": ("110", "101", "101", "101", "110"),
    "E": ("111", "100", "111", "100", "111"),
    "F": ("111", "100", "111", "100", "100"),
    "G": ("111", "100", "101", "101", "111"),
    "L": ("100", "100", "100", "100", "111"),
    "M": ("111", "111", "111", "101", "101"),
    "O": ("111", "101", "101", "101", "111"),
    "P": ("110", "101", "110", "100", "100"),
    "R": ("110", "101", "110", "101", "101"),
    "S": ("111", "100", "111", "001", "111"),
    "T": ("111", "010", "010", "010", "010"),
    "V": ("101", "101", "101", "101", "010"),
    "X": ("101", "101", "010", "101", "101"),
    "Y": ("101", "101", "010", "010", "010"),
    "{": ("011", "010", "010", "010", "011"),
    "}": ("110", "010", "010", "010", "110"),
    ".": ("000", "000", "000", "000", "010"),
}

FONTS = {"5x7": FONT_5x7, "3x5": FONT_3x5}


def text_bitmap(text: str, font_name: str) -> list[list[int]]:
    """Convertit un texte en masque binaire (une liste de lignes de 0/1)."""
    table = FONTS[font_name]
    height = len(next(iter(table.values())))
    rows: list[list[int]] = [[] for _ in range(height)]
    for position, character in enumerate(text):
        glyph = table.get(character)
        if glyph is None:
            raise LookupError(f"Glyphe absent de la police {font_name} : {character!r}")
        if position:
            for line in rows:
                line.append(0)
        for index, bits in enumerate(glyph):
            rows[index].extend(1 if bit == "1" else 0 for bit in bits)
    return rows


# --------------------------------------------------------------------------
# Rendu : canvas RGBA flottant et formes décrites par une distance signée
# --------------------------------------------------------------------------


def parse_color(value: str) -> tuple[float, float, float]:
    text = value.lstrip("#")
    return (float(int(text[0:2], 16)), float(int(text[2:4], 16)), float(int(text[4:6], 16)))


def shade(color: tuple[float, float, float], factor: float, offset: float = 0.0) -> tuple[float, float, float]:
    return tuple(max(0.0, min(255.0, component * factor + offset)) for component in color)  # type: ignore[return-value]


class Canvas:
    """Surface RGBA flottante (0–255), composée en « source over »."""

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.pixels = [0.0] * (width * height * 4)

    def fill(self, color: tuple[float, float, float]) -> None:
        for index in range(0, len(self.pixels), 4):
            self.pixels[index] = color[0]
            self.pixels[index + 1] = color[1]
            self.pixels[index + 2] = color[2]
            self.pixels[index + 3] = 255.0

    def blend(self, index: int, color: tuple[float, float, float], coverage: float) -> None:
        if coverage <= 0.0:
            return
        coverage = min(1.0, coverage)
        destination = self.pixels[index + 3] / 255.0
        out_alpha = coverage + destination * (1.0 - coverage)
        if out_alpha <= 0.0:
            return
        weight = destination * (1.0 - coverage)
        for channel in range(3):
            self.pixels[index + channel] = (color[channel] * coverage + self.pixels[index + channel] * weight) / out_alpha
        self.pixels[index + 3] = out_alpha * 255.0

    def paint(self, box: tuple[float, float, float, float], distance, color: tuple[float, float, float],
              opacity: float = 1.0) -> None:
        """Peint une forme dont `distance` est négative à l’intérieur."""
        left = max(0, int(box[0]) - 2)
        top = max(0, int(box[1]) - 2)
        right = min(self.width, int(box[2]) + 3)
        bottom = min(self.height, int(box[3]) + 3)
        for y in range(top, bottom):
            row = y * self.width
            for x in range(left, right):
                coverage = (0.5 - distance(x + 0.5, y + 0.5)) * opacity
                if coverage > 0.0:
                    self.blend((row + x) * 4, color, coverage)

    def paint_bitmap(self, bitmap: list[list[int]], origin_x: float, origin_y: float, cell: float,
                     color: tuple[float, float, float]) -> None:
        """Peint un masque binaire agrandi `cell` fois, avec anticrénelage."""
        rows = len(bitmap)
        columns = len(bitmap[0])
        left = max(0, int(origin_x) - 1)
        top = max(0, int(origin_y) - 1)
        right = min(self.width, int(origin_x + columns * cell) + 2)
        bottom = min(self.height, int(origin_y + rows * cell) + 2)
        total = SUBSAMPLES * SUBSAMPLES
        for y in range(top, bottom):
            row = y * self.width
            for x in range(left, right):
                hits = 0
                for sub_y in range(SUBSAMPLES):
                    grid_y = int((y + (sub_y + 0.5) / SUBSAMPLES - origin_y) / cell)
                    if grid_y < 0 or grid_y >= rows:
                        continue
                    line = bitmap[grid_y]
                    for sub_x in range(SUBSAMPLES):
                        grid_x = int((x + (sub_x + 0.5) / SUBSAMPLES - origin_x) / cell)
                        if 0 <= grid_x < columns and line[grid_x]:
                            hits += 1
                if hits:
                    self.blend((row + x) * 4, color, hits / total)

    def to_rgba(self) -> bytes:
        output = bytearray(len(self.pixels))
        for index, value in enumerate(self.pixels):
            output[index] = 255 if value >= 255.0 else 0 if value <= 0.0 else int(value + 0.5)
        return bytes(output)


def rounded_rect_distance(cx: float, cy: float, half_w: float, half_h: float, radius: float):
    radius = max(0.0, min(radius, min(half_w, half_h)))

    def distance(x: float, y: float) -> float:
        dx = abs(x - cx) - (half_w - radius)
        dy = abs(y - cy) - (half_h - radius)
        outside = (max(dx, 0.0) ** 2 + max(dy, 0.0) ** 2) ** 0.5
        return outside + min(max(dx, dy), 0.0) - radius
    return distance


def circle_distance(cx: float, cy: float, radius: float):
    def distance(x: float, y: float) -> float:
        return ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 - radius
    return distance


def segment_distance(ax: float, ay: float, bx: float, by: float, half_thickness: float):
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy or 1.0

    def distance(x: float, y: float) -> float:
        ratio = min(1.0, max(0.0, ((x - ax) * dx + (y - ay) * dy) / length_squared))
        return ((x - (ax + ratio * dx)) ** 2 + (y - (ay + ratio * dy)) ** 2) ** 0.5 - half_thickness
    return distance


def triangle_distance(first: tuple[float, float], second: tuple[float, float],
                      third: tuple[float, float]):
    """Distance signée à un triangle plein (négative à l’intérieur)."""
    def edge(a: tuple[float, float], b: tuple[float, float], x: float, y: float) -> float:
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 or 1.0
        return ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / length

    def point_segment(a: tuple[float, float], b: tuple[float, float], x: float, y: float) -> float:
        return segment_distance(a[0], a[1], b[0], b[1], 0.0)(x, y)

    def distance(x: float, y: float) -> float:
        sides = (edge(first, second, x, y), edge(second, third, x, y), edge(third, first, x, y))
        borders = (point_segment(first, second, x, y), point_segment(second, third, x, y),
                   point_segment(third, first, x, y))
        inside = all(side >= 0.0 for side in sides) or all(side <= 0.0 for side in sides)
        closest = min(borders)
        return -closest if inside else closest
    return distance


def rectangle_distance(cx: float, cy: float, half_w: float, half_h: float):
    return rounded_rect_distance(cx, cy, half_w, half_h, min(half_w, half_h))


def straights(canvas: Canvas, points: list[tuple[float, float]], thickness: float,
              color: tuple[float, float, float], box: tuple[float, float, float, float]) -> None:
    for start, end in zip(points, points[1:]):
        canvas.paint(box, segment_distance(start[0], start[1], end[0], end[1], thickness), color)


def choose_badge(text: str, size: int) -> tuple[list[list[int]], float]:
    """Choisit la police et l’échelle du badge : le plus lisible, jamais débordant."""
    candidates: list[tuple[tuple[int, float, float], list[list[int]], float]] = []
    for rank, (font_name, budget_w, budget_h, force_minimum) in enumerate(
            (("5x7", 0.64, 0.46, False), ("3x5", 0.80, 0.58, True))):
        try:
            bitmap = text_bitmap(text, font_name)
        except LookupError:
            continue
        rows = len(bitmap)
        columns = len(bitmap[0])
        exact = min(budget_w * size / columns, budget_h * size / rows)
        cell = float(int(exact)) if exact >= 1.0 or not force_minimum else 1.0
        if cell < 1.0 or cell * columns > size * 0.88 or cell * rows > size * 0.78:
            continue
        # Au-delà de trois pixels de cellule, l’échelle exacte donne un contour
        # plus net qu’un agrandissement entier.
        if cell >= 3.0:
            cell = round(exact, 3)
        # La police 5×7 est préférée dès qu’elle tient : la compacte 3×5 n’est là
        # que pour les petites tailles, où sa grossièreté ne se voit pas.
        score = (-rank, cell * rows, cell * columns)
        candidates.append((score, bitmap, cell))
    if not candidates:
        raise SystemExit(f"Le badge {text!r} ne tient pas dans une icône de {size} px.")
    candidates.sort(key=lambda item: item[0])
    _, bitmap, cell = candidates[-1]
    return bitmap, cell


def draw_glyph(canvas: Canvas, size: int, glyph: str, white: tuple[float, float, float]) -> None:
    half = size / 2.0
    thin = max(0.7, size * 0.055)
    scale = size * 0.5
    if glyph == "lignes":
        bar = max(0.55, size * 0.042)
        for index, offset in enumerate((-0.30, -0.10, 0.10, 0.30)):
            half_w = size * (0.30 if index % 2 == 0 else 0.22)
            cy = half + scale * offset
            canvas.paint((half - half_w, cy - bar, half + half_w, cy + bar),
                         rounded_rect_distance(half, cy, half_w, bar, bar), white)
        return
    if glyph == "diff":
        box = (0, 0, size, size)
        plus = half - size * 0.16
        straights(canvas, [(half - size * 0.18, plus), (half + size * 0.18, plus)], thin, white, box)
        straights(canvas, [(half, plus - size * 0.18), (half, plus + size * 0.18)], thin, white, box)
        straights(canvas, [(half - size * 0.18, half + size * 0.24), (half + size * 0.18, half + size * 0.24)],
                  thin, white, box)
        return
    if glyph == "code":
        box = (0, 0, size, size)
        stroke = max(0.55, size * 0.045)
        straights(canvas, [(half - size * 0.08, half - size * 0.28), (half - size * 0.26, half),
                           (half - size * 0.08, half + size * 0.28)], stroke, white, box)
        straights(canvas, [(half + size * 0.05, half + size * 0.30), (half - size * 0.05, half - size * 0.30)],
                  stroke, white, box)
        straights(canvas, [(half + size * 0.08, half - size * 0.28), (half + size * 0.26, half),
                           (half + size * 0.08, half + size * 0.28)], stroke, white, box)
        return
    if glyph == "chevrons":
        box = (0, 0, size, size)
        stroke = max(0.6, size * 0.05)
        straights(canvas, [(half + size * 0.08, half - size * 0.26), (half + size * 0.26, half),
                           (half + size * 0.08, half + size * 0.26)], stroke, white, box)
        straights(canvas, [(half - size * 0.08, half - size * 0.26), (half - size * 0.26, half),
                           (half - size * 0.08, half + size * 0.26)], stroke, white, box)
        return
    if glyph == "invite":
        box = (half - size * 0.42, half - size * 0.42, half + size * 0.42, half + size * 0.42)
        straights(canvas, [(half - size * 0.26, half - size * 0.20), (half - size * 0.04, half - size * 0.02),
                           (half - size * 0.26, half + size * 0.16)], thin, white, box)
        canvas.paint((half - size * 0.02, half + size * 0.14, half + size * 0.30, half + size * 0.26),
                     rounded_rect_distance(half + size * 0.14, half + size * 0.20, size * 0.16, thin * 0.7, thin * 0.7), white)
        return
    if glyph == "grille":
        cell_half = size * 0.19
        gap = size * 0.05
        radius = size * 0.05
        for row in (-1, 1):
            for column in (-1, 1):
                cx = half + column * (cell_half + gap / 2)
                cy = half + row * (cell_half + gap / 2)
                canvas.paint((cx - cell_half, cy - cell_half, cx + cell_half, cy + cell_half),
                             rounded_rect_distance(cx, cy, cell_half, cell_half, radius), white)
        return
    if glyph == "image":
        canvas.paint((0, 0, size, size), circle_distance(half + size * 0.16, half - size * 0.16, size * 0.09), white)
        canvas.paint((0, 0, size, size),
                     triangle_distance((half - size * 0.32, half + size * 0.26),
                                       (half - size * 0.10, half - size * 0.16),
                                       (half + size * 0.14, half + size * 0.26)), white)
        canvas.paint((0, 0, size, size),
                     triangle_distance((half - size * 0.02, half + size * 0.26),
                                       (half + size * 0.16, half - size * 0.02),
                                       (half + size * 0.32, half + size * 0.26)), white)
        return
    if glyph == "livre":
        canvas.paint((0, 0, size, size),
                     rounded_rect_distance(half, half, size * 0.32, size * 0.24, size * 0.04), white)
        canvas.paint((half - size * 0.02, half - size * 0.24, half + size * 0.02, half + size * 0.24),
                     rectangle_distance(half, half, size * 0.02, size * 0.24), shade(white, 0.45))
        return
    raise SystemExit(f"Glyphe inconnu : {glyph!r}")


def render(size: int, family: Family) -> Canvas:
    canvas = Canvas(size, size)
    color = parse_color(family.color)
    inset = max(0.0, round(size * 0.035))
    half = size / 2.0
    half_tile = half - inset
    radius = max(1.2, size * 0.20)
    canvas.paint((0, 0, size, size), rounded_rect_distance(half, half, half_tile, half_tile, radius), color)
    outline = max(0.5, size * 0.02)
    tile = rounded_rect_distance(half, half, half_tile, half_tile, radius)
    canvas.paint((0, 0, size, size), lambda x, y: abs(tile(x, y)) - outline / 2, shade(color, 0.62))

    white = (255.0, 255.0, 255.0)
    if family.glyph:
        draw_glyph(canvas, size, family.glyph, white)
    else:
        bitmap, cell = choose_badge(family.badge or "", size)
        rows = len(bitmap)
        columns = len(bitmap[0])
        canvas.paint_bitmap(bitmap, (size - columns * cell) / 2.0, (size - rows * cell) / 2.0, cell, white)
    return canvas


# --------------------------------------------------------------------------
# Encodage : PNG, DIB (BMP dans ICO) et conteneur ICO
# --------------------------------------------------------------------------


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def encode_png(rgba: bytes, width: int, height: int) -> bytes:
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # filtre « none »
        rows += rgba[y * width * 4:(y + 1) * width * 4]
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + png_chunk(b"IEND", b""))


def encode_dib(rgba: bytes, size: int) -> bytes:
    """DIB 32 bits attendu dans un ICO : XOR (BGRA, de bas en haut) puis masque AND."""
    xor = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            index = (y * size + x) * 4
            xor += bytes((rgba[index + 2], rgba[index + 1], rgba[index], rgba[index + 3]))
    stride = ((size + 31) // 32) * 4
    mask = bytearray()
    for y in range(size - 1, -1, -1):
        row = bytearray(stride)
        for x in range(size):
            if rgba[(y * size + x) * 4 + 3] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask += row
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0)
    return header + bytes(xor) + bytes(mask)


def encode_ico(entries: list[tuple[int, bytes]]) -> bytes:
    directory = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    offset = 6 + 16 * len(entries)
    payload = bytearray()
    for size, data in entries:
        dimension = size if size < 256 else 0
        directory += struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(data), offset)
        payload += data
        offset += len(data)
    return bytes(directory + payload)


def read_ico(path: str) -> list[tuple[int, int, str]]:
    with open(path, "rb") as handle:
        data = handle.read()
    if len(data) < 6:
        raise SystemExit(f"{path} : fichier tronqué.")
    reserved, kind, count = struct.unpack("<HHH", data[:6])
    if (reserved, kind) != (0, 1):
        raise SystemExit(f"{path} n’est pas un fichier ICO valide.")
    found = []
    for index in range(count):
        width, _, _, _, _, bit_count, length, offset = struct.unpack("<BBBBHHII", data[6 + 16 * index:22 + 16 * index])
        payload = data[offset:offset + length]
        if len(payload) != length:
            raise SystemExit(f"{path} : charge utile tronquée (entrée {index}).")
        is_png = payload.startswith(b"\x89PNG\r\n\x1a\n")
        if not is_png and struct.unpack("<I", payload[:4])[0] != 40:
            raise SystemExit(f"{path} : ni PNG ni DIB pour l’entrée {index}.")
        if bit_count != 32:
            raise SystemExit(f"{path} : profondeur {bit_count} bits au lieu de 32.")
        found.append((width or 256, length, "PNG" if is_png else "DIB"))
    return found


# --------------------------------------------------------------------------
# Aperçu documenté
# --------------------------------------------------------------------------

PREVIEW_CELL = 86
PREVIEW_COLUMNS = 7
PREVIEW_HEADER = 26


def write_preview() -> int:
    rows = (len(FAMILIES) + PREVIEW_COLUMNS - 1) // PREVIEW_COLUMNS
    width = PREVIEW_COLUMNS * PREVIEW_CELL
    height = PREVIEW_HEADER + rows * PREVIEW_CELL
    canvas = Canvas(width, height)
    canvas.fill(parse_color("#F7F8FA"))
    for position, family in enumerate(FAMILIES):
        column = position % PREVIEW_COLUMNS
        row = position // PREVIEW_COLUMNS
        left = column * PREVIEW_CELL + (PREVIEW_CELL - 64) // 2
        top = PREVIEW_HEADER + row * PREVIEW_CELL + 2
        sprite = render(64, family)
        for y in range(64):
            for x in range(64):
                source = (y * 64 + x) * 4
                alpha = sprite.pixels[source + 3] / 255.0
                if alpha <= 0.0:
                    continue
                target = ((top + y) * width + left + x) * 4
                for channel in range(3):
                    canvas.pixels[target + channel] = (sprite.pixels[source + channel] * alpha
                                                       + canvas.pixels[target + channel] * (1 - alpha))
        label = text_bitmap(LABELS[family.name], "5x7")
        cell = min(2.0, (PREVIEW_CELL - 8.0) // len(label[0]))
        canvas.paint_bitmap(label, left + (64 - len(label[0]) * cell) / 2, top + 68, cell, parse_color("#292B3A"))
    payload = encode_png(canvas.to_rgba(), width, height)
    os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)
    with open(PREVIEW_PATH, "wb") as handle:
        handle.write(payload)
    return len(payload)


def main() -> int:
    os.makedirs(ICON_DIR, exist_ok=True)
    total = 0
    for family in FAMILIES:
        entries = []
        for size in SIZES:
            pixels = render(size, family).to_rgba()
            entries.append((size, encode_png(pixels, size, size) if size in PNG_SIZES else encode_dib(pixels, size)))
        path = os.path.join(ICON_DIR, f"{family.name}.ico")
        data = encode_ico(entries)
        with open(path, "wb") as handle:
            handle.write(data)
        read = read_ico(path)
        if [entry[0] for entry in read] != list(SIZES):
            raise SystemExit(f"{path} : tailles {[entry[0] for entry in read]} au lieu de {list(SIZES)}.")
        total += len(data)
        print(f"{family.name:14s} {len(data):8d} o  {len(read)} tailles  "
              + " ".join(f"{size}:{kind[0]}" for size, _, kind in read))
    preview = write_preview()
    print(f"{'aperçu':14s} {preview:8d} o  {os.path.relpath(PREVIEW_PATH, REPO_ROOT)}")
    print(f"{'total':14s} {total:8d} o pour {len(FAMILIES)} icônes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
