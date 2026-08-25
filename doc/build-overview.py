"""Build the README overview image from the artifacts of a scanner run.

The tiles are scaled to a common height and laid out with room for their
captions, so the picture reads as what it is: the same content reflowing from
an ultrawide down to a phone.

Run a scan first, fetch the results, then build the image:

    TARGET_URL=<url> ON_EXISTING=overwrite npm start
    docker compose cp scanner:/out ./out
    npm run build:overview

The files listed in SHOTS come from that run. A different target url produces
different names — take them from `out/meta/manifest.json` and adjust the list.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SCREEN = ROOT / 'out' / 'screen'
TARGET = ROOT / 'doc' / 'overview.png'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

# caption, file name — widest first, so the picture reads left to right as
# "the same page, getting narrower"
SHOTS = [
    ('desktop-21-9  2560 × 1080',
     'desktop-21-9-2560x1080-region-001-x00000y00914-r01-main-x00000y00000.png'),
    ('full-hd  1920 × 1080',
     'full-hd-1920x1080-region-001-x00000y00914-r01-main-x00000y00000.png'),
    ('desktop-21-9-third  853 × 1080',
     'desktop-21-9-third-853x1080-region-001-x00000y00914-r01-main-x00000y00000.png'),
    ('tablet-portrait  768 × 1024',
     'tablet-portrait-768x1024-region-001-x00000y00864-r01-main-x00000y00000.png'),
    ('phone-medium  390 × 844',
     'phone-medium-390x844-region-001-x00000y00724-r01-main-x00000y00000.png'),
]

HEIGHT = 300
GAP = 22
PAD = 24
CAPTION = 30
BG = (247, 247, 248)
FRAME = (176, 176, 180)
TEXT = (68, 68, 72)


def main() -> None:
    missing = [name for _, name in SHOTS if not (SCREEN / name).exists()]
    if missing:
        raise SystemExit(
            'no run to build from, these files are absent from out/screen:\n  '
            + '\n  '.join(missing)
            + '\nrun a scan and fetch the results first, see the module docstring'
        )

    font = ImageFont.truetype(FONT, 14)
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))

    tiles = []
    for caption, name in SHOTS:
        image = Image.open(SCREEN / name).convert('RGB')
        width = round(image.width * HEIGHT / image.height)
        tiles.append((caption, image.resize((width, HEIGHT), Image.LANCZOS)))

    # a caption must never run into its neighbour: the column is as wide as
    # the wider of tile and caption
    columns = [max(tile.width, round(probe.textlength(caption, font=font)) + 12)
               for caption, tile in tiles]

    canvas = Image.new(
        'RGB',
        (PAD * 2 + sum(columns) + GAP * (len(columns) - 1), PAD * 2 + HEIGHT + CAPTION),
        BG
    )
    draw = ImageDraw.Draw(canvas)

    x = PAD
    for (caption, tile), column in zip(tiles, columns):
        left = x + (column - tile.width) // 2
        canvas.paste(tile, (left, PAD))
        draw.rectangle([left, PAD, left + tile.width - 1, PAD + HEIGHT - 1], outline=FRAME)
        text_width = probe.textlength(caption, font=font)
        draw.text((x + (column - text_width) / 2, PAD + HEIGHT + 9), caption, font=font, fill=TEXT)
        x += column + GAP

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(TARGET, optimize=True)
    print(f'{TARGET} {canvas.width}x{canvas.height}')


main()
