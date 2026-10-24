"""Cut the diver and the shark of the Shark Lake game out of gemini-pics/diver.jpeg and shark.jpeg.

  diver.png, diver_<suit>.png  4x5 frames of 160x160 (rows: swim right, left, up, down), the teal
                               wetsuit recoloured for each suit sold in the shop
  shark.png                    4x5 frames of 200x200, rows in the same order

Each figure is centred in its frame at one scale per sheet. Frame order is SWIM_ROWS in src/sharkChase.js.
Run: python3 -I tools/slice_divers.py (add --preview <path> to also write a contact sheet).
"""
import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice_characters import components, flood, border_seeds, grow  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "gemini-pics"
OUT = ROOT / "public" / "assets"

# Cell boxes (x0, y0, x1, y1) per row, measured on the sheets: white gutters between the diver's cells,
# black around the shark's (and three decorative water strips between its first two rows, skipped).
DIVER_COLS = [(5, 276), (286, 558), (568, 840), (850, 1122), (1132, 1403)]
DIVER_ROWS = [(6, 177), (187, 359), (369, 581), (591, 763)]
SHARK_CELLS = [
    [(x0, 66, x1, 190) for x0, x1 in [(5, 210), (215, 410), (415, 609), (614, 809), (814, 1019)]],
    [(x0, 321, x1, 444) for x0, x1 in [(5, 210), (215, 410), (415, 609), (614, 809), (814, 1019)]],
    [(x0, 515, x1, 764) for x0, x1 in [(62, 192), (256, 384), (448, 577), (640, 768), (832, 962)]],
    [(x0, 771, x1, 1020) for x0, x1 in [(62, 192), (256, 384), (447, 578), (640, 768), (832, 962)]],
]
DIVER_FRAME, DIVER_SIZE = 160, 150  # frame side, longest figure side across the sheet
SHARK_FRAME, SHARK_SIZE = 200, 192

# Suit colours sold in the shop: hue in degrees (None keeps the hue), saturation and brightness factors.
SUITS = {
    "red": (355, 1.0, 1.0),
    "orange": (25, 1.05, 1.15),
    "purple": (275, 0.9, 1.0),
    "pink": (320, 0.75, 1.3),
    "black": (None, 0.15, 0.45),
}


def keep_big(mask, min_size):
    """`mask` without blobs smaller than `min_size` (bubbles and specks)."""
    out = np.zeros_like(mask)
    for ys, xs in components(mask, min_size):
        out[ys, xs] = True
    return out


def diver_mask(cell):
    """The diver on its black background: anything not near-black, filled, without the bubbles."""
    mx = cell.max(axis=2).astype(int)
    h, w = mx.shape
    fig = mx > 38
    # Dark fins and outlines touch the black: close small gaps, then fill what the border can't reach.
    r = 2
    outside = flood(~grow(fig, r), border_seeds(w, h))
    solid = ~grow(outside, r)
    return keep_big(solid & (fig | grow(fig, 1)), 600)


def shark_mask(cell):
    """The shark inside its black outline; the blue water around it is the background."""
    mx = cell.max(axis=2).astype(int)
    h, w = mx.shape
    outline = mx < 48
    # The water near the cell edge is never black, so flood it from the border, stopped by the outline
    # (thickened a little to bridge gaps in the JPEG), then give back what the thickening took.
    r = 2
    water = flood(~grow(outline, r), border_seeds(w, h))
    water = grow(water, r) & ~outline
    shark = ~water
    # The cell's own black frame touches the border: drop dark bits joined only to it.
    return keep_big(shark, 800)


def cut(sheet, box, mask_fn):
    x0, y0, x1, y1 = box
    cell = sheet[y0:y1, x0:x1]
    mask = mask_fn(cell)
    ys, xs = np.where(mask)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([cell, np.where(mask, 255, 0).astype(np.uint8)])[by0:by1, bx0:bx1]
    return Image.fromarray(rgba, "RGBA")


def pack(figures, frame, size):
    """Paste rows of figures into one sheet, one scale for all, each centred in its frame."""
    scale = size / max(max(im.size) for row in figures for im in row)
    sheet = Image.new("RGBA", (frame * len(figures[0]), frame * len(figures)), (0, 0, 0, 0))
    for r, row in enumerate(figures):
        for c, im in enumerate(row):
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            sheet.alpha_composite(im, (c * frame + (frame - im.width) // 2, r * frame + (frame - im.height) // 2))
    return sheet


def is_suit(rgb):
    """The teal wetsuit (not the pale mask glass and tank, the yellow stripes, skin or fins)."""
    f = rgb.astype(float) / 255
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.zeros_like(mx)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == g, 60 * ((b - r) / d) + 120, hue)
    hue = np.where(mx == b, 60 * ((r - g) / d) + 240, hue)
    return (hue > 150) & (hue < 200) & (sat > 0.45) & (mx > 0.18) & (mx < 0.85)


def recolour(sheet, suit):
    hue, sat_k, val_k = SUITS[suit]
    a = np.array(sheet)
    rgb = a[..., :3]
    m = is_suit(rgb) & (a[..., 3] > 0)
    out = rgb.copy()
    for y, x in zip(*np.where(m)):
        h, s, v = colorsys.rgb_to_hsv(*(rgb[y, x] / 255))
        if hue is not None:
            h = hue / 360
        out[y, x] = np.clip(np.array(colorsys.hsv_to_rgb(h, min(1, s * sat_k), min(1, v * val_k))) * 255, 0, 255)
    a[..., :3] = out
    return Image.fromarray(a, "RGBA")


def preview(path, sheets):
    bg = Image.new("RGBA", (max(s.width for s in sheets), sum(s.height for s in sheets) + 10 * len(sheets)), (60, 140, 200, 255))
    y = 0
    for s in sheets:
        bg.alpha_composite(s, (0, y))
        y += s.height + 10
    bg.convert("RGB").save(path)
    print("wrote", path)


def main():
    diver_src = np.array(Image.open(SRC / "diver.jpeg").convert("RGB"))
    shark_src = np.array(Image.open(SRC / "shark.jpeg").convert("RGB"))
    # Inset the diver's cells: their edges blend into the white gutters.
    i = 5
    divers = [[cut(diver_src, (x0 + i, y0 + i, x1 - i, y1 - i), diver_mask) for x0, x1 in DIVER_COLS] for y0, y1 in DIVER_ROWS]
    sharks = [[cut(shark_src, box, shark_mask) for box in row] for row in SHARK_CELLS]
    diver = pack(divers, DIVER_FRAME, DIVER_SIZE)
    shark = pack(sharks, SHARK_FRAME, SHARK_SIZE)
    OUT.mkdir(parents=True, exist_ok=True)
    diver.save(OUT / "diver.png")
    shark.save(OUT / "shark.png")
    suits = [recolour(diver, s) for s in SUITS]
    for s, im in zip(SUITS, suits):
        im.save(OUT / f"diver_{s}.png")
    print("wrote diver.png, shark.png and", ", ".join(f"diver_{s}.png" for s in SUITS))
    if "--preview" in sys.argv:
        preview(sys.argv[sys.argv.index("--preview") + 1], [shark, diver, *suits])


if __name__ == "__main__":
    main()
