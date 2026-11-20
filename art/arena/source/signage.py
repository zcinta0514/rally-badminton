"""Brand artwork shared by architectural, floor, perimeter and LED signage."""
from pathlib import Path
import bpy

BRAND = "开拍 RALLY"


def apply_brand_font(curve):
    if curve.body != BRAND:
        return
    directory = Path(__file__).resolve().parent
    curve.font = bpy.data.fonts.load(str(directory / "court-han.ttf"), check_existing=True)
    curve.font_bold = bpy.data.fonts.load(str(directory / "court-latin.ttf"), check_existing=True)
    for font in (curve.font, curve.font_bold):
        if not font.packed_file:
            font.pack()
    for char, style in zip(curve.body, curve.body_format):
        style.use_bold = char.isascii()
    curve.space_character = 1.05
