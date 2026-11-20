"""Make Blender-readable sign fonts from the game's two licensed title fonts."""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib.instancer import instantiateVariableFont

source = Path(__file__).resolve().parents[3] / "src" / "fonts"
output = Path(__file__).resolve().parent
for file, chars, family, target in [
    ("rally-display.woff2", "开拍", "Rally Court Han", "court-han.ttf"),
    ("rally-numerals.woff2", " RALY", "Rally Court Latin", "court-latin.ttf"),
]:
    font = TTFont(source / file)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": 650})
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    # The web rasterizer accepts overlapping strokes. Blender's curve
    # tessellation needs a single exterior outline wherever those strokes meet.
    removeOverlaps(font)
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16):
            name = family.replace(" ", "") if record.nameID == 6 else family
            record.string = name.encode(record.getEncoding())
    font.flavor = None
    font.recalcTimestamp = False
    font.save(output / target)
