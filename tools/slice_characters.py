"""Cut the shop characters out of the Gemini sprite sheets in gemini-pics/ and pack them in the frame
layouts the games use (the same as hunter.png and robot.png), so a scene only swaps the texture:

  char_<id>_archer.png  5x4 frames of 208x250, frame indices as ARCHER_FRAMES
  char_<id>_jumper.png  5x2 frames of 247x127, frame indices as ROBOT_FRAMES

Each source sheet is 4 rows (facing right, facing left, back, front) of up to 6 poses, on black with
white grid lines (figures outlined in white) or on plain white. Run: python3 -I tools/slice_characters.py
(add --preview to also write a contact sheet of every cut-out cell to the scratch path given).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "gemini-pics"
OUT = ROOT / "public" / "assets"

# id -> source sheet, its background, and which projectile the character throws in the balloon game.
CHARACTERS = {
    "axe-boy": dict(src="Gemini_Generated_Image_7z7hcv7z7hcv7z7h.jpeg", bg="black"),
    "axe-scout": dict(src="Gemini_Generated_Image_sej0q5sej0q5sej0.jpeg", bg="black"),
    "axe-girl": dict(src="Gemini_Generated_Image_v8h58qv8h58qv8h5.jpeg", bg="black"),
    "shadow-mage": dict(src="Gemini_Generated_Image_e5opuve5opuve5op.jpeg", bg="black"),
    "frost-mage": dict(src="Gemini_Generated_Image_ybzu6xybzu6xybzu.jpeg", bg="white"),
}
ROWS, COLS = 4, 6


def flood(mask, seeds):
    """Pixels of `mask` reachable from `seeds` (4-connected), using Pillow's C flood fill."""
    # .copy(): an image made from a numpy array shares its read-only buffer, and floodfill would not stick
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").copy()
    for x, y in seeds:
        if img.getpixel((x, y)) == 255:
            ImageDraw.floodfill(img, (x, y), 128, thresh=0)
    return np.array(img) == 128


def border_seeds(w, h, step=3):
    return [(x, y) for x in range(0, w, step) for y in (0, h - 1)] + [(x, y) for y in range(0, h, step) for x in (0, w - 1)]


def long_runs(mask, length, axis):
    """Pixels of `mask` lying in a straight run of at least `length` along `axis`."""
    m = mask if axis == 1 else mask.T
    h, w = m.shape
    c = np.zeros((h, w + 1), int)
    c[:, 1:] = np.cumsum(m, axis=1)
    starts = np.zeros((h, w), bool)
    starts[:, : w - length + 1] = (c[:, length:] - c[:, : w - length + 1]) == length
    out = np.zeros((h, w), bool)
    # every pixel covered by some full window
    cov = np.zeros((h, w + 1), int)
    cov[:, : w - length + 1] += starts[:, : w - length + 1]
    cov[:, length : w + 1] -= starts[:, : w - length + 1]
    out = np.cumsum(cov, axis=1)[:, :w] > 0
    return out if axis == 1 else out.T


def grow(mask, steps=1):
    """Dilate a boolean mask by `steps` pixels (4-neighbourhood)."""
    out = mask.copy()
    for _ in range(steps):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def figure_mask(rgb, bg):
    """True on the characters (with their outlines), False on the background, grid and boxes."""
    mx = rgb.max(axis=2).astype(int)
    mn = rgb.min(axis=2).astype(int)
    h, w = mx.shape
    if bg == "black":
        white = mn > 150
        # grid lines and selection boxes are long straight white runs; the figures' outlines are not
        lines = grow(long_runs(white, 70, 1) | long_runs(white, 70, 0), 2)
        outline = white & ~lines
        # The figures' own pixel art has black lines inside the white outline, and the outline has
        # small gaps. Take the silhouette by closing: thicken the outline, fill what the outside can't
        # reach, shrink back. Then peel the black left between the silhouette and the outline.
        r = 4
        thick = grow(outline, r)
        seeds = border_seeds(w, h) + [(int(x), int(y)) for y, x in zip(*np.where(lines))][::25]
        outside = flood(~thick, seeds)
        solid = ~grow(outside, r)
        near_black = mx < 60
        background = ~solid
        for _ in range(r + 1):
            background |= grow(background) & near_black & ~outline
        return ~background & ~lines
    light = mn > 228
    background = flood(light, border_seeds(w, h))
    return ~background


def components(mask, min_size):
    """List of (pixel ys, xs) for each 4-connected blob of `mask` with at least `min_size` pixels.

    Labels horizontal runs and joins runs that overlap the row above (union-find), which is quick
    in plain Python because a sheet has only tens of thousands of runs."""
    h, w = mask.shape
    parent = []

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs = []  # (row, x0, x1, id)
    prev = []
    padded = np.zeros((h, w + 2), bool)
    padded[:, 1:-1] = mask
    edges = np.diff(padded.astype(np.int8), axis=1)
    for y in range(h):
        starts = np.where(edges[y] == 1)[0]
        ends = np.where(edges[y] == -1)[0]
        cur = []
        j = 0
        for x0, x1 in zip(starts, ends):
            rid = len(parent)
            parent.append(rid)
            while j < len(prev) and prev[j][1] <= x0:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] < x1:
                a, b = find(rid), find(prev[k][2])
                if a != b:
                    parent[a] = b
                k += 1
            cur.append((x0, x1, rid))
            runs.append((y, x0, x1, rid))
        prev = cur
    blobs = {}
    for y, x0, x1, rid in runs:
        blobs.setdefault(find(rid), []).append((y, x0, x1))
    out = []
    for parts in blobs.values():
        size = sum(x1 - x0 for _, x0, x1 in parts)
        if size < min_size:
            continue
        ys = np.concatenate([np.full(x1 - x0, y) for y, x0, x1 in parts])
        xs = np.concatenate([np.arange(x0, x1) for _, x0, x1 in parts])
        out.append((ys, xs))
    return out


def solid_from_outline(outline, near_black, wall):
    """The filled silhouette inside a (gappy) white outline, closing with the smallest radius that
    gives a solid figure (at least half its box) rather than just its outline. `wall` (grid lines
    touching the figure, e.g. under its feet) also stops the outside."""
    h, w = outline.shape
    seeds = border_seeds(w, h, step=2)
    ys, xs = np.where(outline)
    box = (ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1)
    best = None
    for r in (3, 4, 5, 6, 8, 10, 13, 16):
        outside = flood(~grow(outline, r) & ~wall, seeds)
        solid = ~grow(outside, r) & ~wall
        fill = solid.sum() / box
        if best is None or fill > best[0] + 0.02:
            best = (fill, r, solid)
        if fill >= 0.5:
            break
    _, r, solid = best
    background = ~solid
    for _ in range(r + 1):
        background |= grow(background) & near_black & ~outline
    figure = ~background & ~wall
    return figure


def drop_pockets(figure, mx):
    """Background pocketed by the outline (the gap between the legs) is a compact blob of pure black;
    the art's own black lines join into thin networks that fill little of their box, and pupils are small."""
    for by, bx in components(figure & (mx < 35), 160):
        box = (by.max() - by.min() + 1) * (bx.max() - bx.min() + 1)
        if len(by) / box > 0.4:
            figure[by, bx] = False
    return figure


def cut_cells(name, bg):
    """{(row, col): RGBA image of that figure, tightly cropped} for one source sheet."""
    rgb = np.array(Image.open(SRC / name).convert("RGB"))
    h, w, _ = rgb.shape
    if bg == "white":
        mask = figure_mask(rgb, bg)
        groups = {}
        for by, bx in components(mask, 60):
            groups.setdefault((min(ROWS - 1, int(by.mean() / (h / ROWS))), cell_col(bx.mean(), w)), []).append((by, bx))
        boxes = {k: (min(b[0].min() for b in v), max(b[0].max() for b in v) + 1, min(b[1].min() for b in v), max(b[1].max() for b in v) + 1)
                 for k, v in groups.items() if sum(len(b[0]) for b in v) >= 1500}
        return {k: crop(rgb, mask, box) for k, box in boxes.items()}
    mn = rgb.min(axis=2).astype(int)
    mx = rgb.max(axis=2).astype(int)
    white = mn > 150
    lines = grow(long_runs(white, 70, 1) | long_runs(white, 70, 0), 2)
    outline = white & ~lines
    # group the outline pieces by grid cell, then fill each cell's figure on its own
    groups = {}
    for by, bx in components(grow(outline, 2), 40):
        key = (min(ROWS - 1, int(by.mean() / (h / ROWS))), cell_col(bx.mean(), w))
        groups.setdefault(key, []).append((by, bx))
    out = {}
    for key, blobs in groups.items():
        if sum(len(b[0]) for b in blobs) < 600:
            continue
        y0 = max(0, min(b[0].min() for b in blobs) - 6)
        y1 = min(h, max(b[0].max() for b in blobs) + 7)
        x0 = max(0, min(b[1].min() for b in blobs) - 6)
        x1 = min(w, max(b[1].max() for b in blobs) + 7)
        local = np.zeros((y1 - y0, x1 - x0), bool)
        for by, bx in blobs:
            local[by - y0, bx - x0] = True
        local &= outline[y0:y1, x0:x1]
        solid = drop_pockets(solid_from_outline(local, mx[y0:y1, x0:x1] < 60, lines[y0:y1, x0:x1]), mx[y0:y1, x0:x1])
        full = np.zeros((h, w), bool)
        full[y0:y1, x0:x1] = solid
        ys, xs = np.where(full)
        if len(ys) < 1500:
            continue
        out[key] = crop(rgb, full, (ys.min(), ys.max() + 1, xs.min(), xs.max() + 1))
    return out


def crop(rgb, mask, box):
    y0, y1, x0, x1 = box
    alpha = np.where(mask[y0:y1, x0:x1], 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], alpha]), "RGBA")


# Column centres as fractions of the sheet width (the sheets put a narrow first column, then five wide ones).
COL_CENTRES = [0.06, 0.16, 0.30, 0.50, 0.70, 0.90]


def cell_col(x, w):
    f = x / w
    return int(np.argmin([abs(f - c) for c in COL_CENTRES]))


def preview(path):
    tiles = []
    for cid, conf in CHARACTERS.items():
        cells = cut_cells(conf["src"], conf["bg"])
        for (r, c), im in sorted(cells.items()):
            tiles.append((f"{cid} {r},{c}", im))
    tw, th = 150, 190
    cols = 12
    sheet = Image.new("RGB", (cols * tw, ((len(tiles) + cols - 1) // cols) * th), (90, 140, 200))
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(tiles):
        im = im.copy()
        im.thumbnail((tw - 6, th - 22))
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(im, (x + 3, y + 18), im)
        d.text((x + 3, y + 2), label, fill=(255, 255, 255))
    sheet.save(path)
    print("preview", path, len(tiles), "cells")


# Which cells make which game frames. Rows: 0 facing right, 1 facing left, 3 facing the viewer.
# Axe fighters carry the axe in poses 3 and 5; mages charge (4) and cast (5) their magic.
POSES = {
    "axe": dict(run=[(0, 2), (0, 4)], aim=(0, 3), throw=(0, 5), hurt=(1, 5)),
    "mage": dict(run=[(0, 2), (0, 3)], aim=(0, 4), throw=(0, 5), hurt=(1, 5)),
}
FRONT = dict(front=(3, 2), crouch=(3, 3), cheer=(3, 5))
KIND = {"axe-boy": "axe", "axe-scout": "axe", "axe-girl": "axe", "shadow-mage": "mage", "frost-mage": "mage"}

ARCHER_W, ARCHER_H, ARCHER_FIG = 260, 250, 200  # frame size, and the figure's standing height in it
JUMPER_W, JUMPER_H, JUMPER_FIG = 247, 127, 112


def body_x(im):
    """Horizontal centre of the legs (bottom third), so weapons sticking out don't shift the figure."""
    a = np.array(im)[..., 3] > 0
    rows = a[int(a.shape[0] * 0.66):]
    ys, xs = np.where(rows)
    return xs.mean() if len(xs) else im.width / 2


def place(im, scale, fw, fh, flip=False):
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    x = round(fw / 2 - body_x(im))
    y = fh - 3 - im.height
    frame.paste(im, (x, y), im)  # clipped if a weapon sticks out of the frame
    return frame


def build(cid):
    conf = CHARACTERS[cid]
    cells = cut_cells(conf["src"], conf["bg"])
    poses = POSES[KIND[cid]]
    ref = cells[FRONT["front"]].height  # standing height, the same scale for every frame
    def frames(fw, fh, fig):
        s = fig / ref
        get = lambda key, flip=False: place(cells[key], s, fw, fh, flip)
        return get, s
    # balloon game: run, aim, throw (ARCHER_FRAMES indices)
    get, _ = frames(ARCHER_W, ARCHER_H, ARCHER_FIG)
    run = [get(poses["run"][i % 2]) for i in range(4)]
    aim, throw = get(poses["aim"]), get(poses["throw"])
    archer = {0: run[0], 1: run[1], 2: run[2], 3: run[3], 4: throw, 10: aim, 11: aim, 12: aim, 13: aim, 14: run[0], 15: aim}
    sheet = Image.new("RGBA", (ARCHER_W * 5, ARCHER_H * 4), (0, 0, 0, 0))
    for i in range(20):
        sheet.paste(archer.get(i, run[0]), ((i % 5) * ARCHER_W, (i // 5) * ARCHER_H))
    sheet.save(OUT / f"char_{cid}_archer.png")
    # lava level: ROBOT_FRAMES order ready, takeoff, air, land, settle, fall, front, frontCrouch, frontLand
    get, _ = frames(JUMPER_W, JUMPER_H, JUMPER_FIG)
    jumper = [get(poses["run"][0]), get(poses["run"][1]), get(poses["aim"]), get(poses["run"][1]), get(poses["run"][0]),
              get(poses["hurt"], flip=True), get(FRONT["front"]), get(FRONT["crouch"]), get(FRONT["cheer"])]
    sheet = Image.new("RGBA", (JUMPER_W * 5, JUMPER_H * 2), (0, 0, 0, 0))
    for i, fr in enumerate(jumper):
        sheet.paste(fr, ((i % 5) * JUMPER_W, (i // 5) * JUMPER_H))
    sheet.save(OUT / f"char_{cid}_jumper.png")
    print(f"wrote char_{cid}_archer.png and char_{cid}_jumper.png")


if __name__ == "__main__":
    if "--preview" in sys.argv:
        preview(sys.argv[sys.argv.index("--preview") + 1])
    else:
        for cid in CHARACTERS:
            build(cid)
