"""Build self-hosted OFL font subsets; source binaries stay outside deployment.

Requires fonttools and brotli. Pass Noto Sans SC variable TTF and Barlow Condensed
SemiBold TTF. See src/fonts/NOTICE.txt for sources and licenses.
"""
import argparse
import hashlib
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]


def export(source, output, family, text, variable=False):
    font = TTFont(source)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_legacy = True
    worker = subset.Subsetter(options=options)
    worker.populate(text=text)
    worker.subset(font)
    if variable:
        font = instantiateVariableFont(font, {'wght': (400, 650)}, inplace=True)
    # Derived subsets use new names, respecting the upstream reserved names.
    names = {1: family, 2: 'Regular', 3: family + '-Subset-1', 4: family,
             6: family.replace(' ', ''), 16: family, 17: 'Regular'}
    for name_id, name in names.items():
        font['name'].removeNames(nameID=name_id)
        font['name'].setName(name, name_id, 3, 1, 0x409)
    font.flavor = 'woff2'
    font.save(output)
    print(f'{output.name}: {output.stat().st_size} bytes; source SHA256 {hashlib.sha256(Path(source).read_bytes()).hexdigest()}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('noto')
    parser.add_argument('barlow')
    args = parser.parse_args()
    files = [ROOT / 'index.html', *sorted((ROOT / 'src').rglob('*.js')),
             *sorted((ROOT / 'shared').rglob('*.js'))]
    text = ''.join(file.read_text(encoding='utf-8-sig') for file in files)
    text += ''.join(chr(c) for c in range(32, 127))
    text = ''.join(sorted(set(text)))
    target = ROOT / 'src' / 'fonts'
    target.mkdir(parents=True, exist_ok=True)
    export(args.noto, target / 'rally-ui.woff2', 'Rally UI', text, variable=True)
    export(args.noto, target / 'rally-display.woff2', 'Rally Display', '开拍', variable=True)
    export(args.barlow, target / 'rally-numerals.woff2', 'Rally Numerals', ''.join(chr(c) for c in range(32, 127)))
