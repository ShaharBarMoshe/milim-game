"""Slice the Gemini sprite sheets into transparent, uniform-size Phaser spritesheets.

Usage: python3 -I tools/slice_sprites.py
Outputs to public/assets/.
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets"
HUNTER_SRC = ROOT / "hunter.jpeg"
BALLOON_SRC = ROOT / "Gemini_Generated_Image_ujowyqujowyqujow.jpeg"

INSET = 3          # pixels trimmed inside each grid cell (JPEG bleed from the white lines)
BG_THRESHOLD = 38  # max channel value treated as background black
WHITE_THRESHOLD = 222  # min channel value treated as background white (hunter sheet)


def groups(idx):
    out = []
    for i in idx:
        if out and i - out[-1][1] <= 1:
            out[-1][1] = i
        else:
            out.append([i, i])
    return out


def cells_between(lines, min_size=40):
    return [(a[1] + 1, b[0]) for a, b in zip(lines, lines[1:]) if b[0] - a[1] > min_size]


def find_cells(img):
    """Return grid cells as rows of (x0, y0, x1, y1), detected from the white separator lines."""
    bright = np.asarray(img.convert("L")) > 180
    rows = []
    for y0, y1 in cells_between(groups(np.where(bright.mean(1) > 0.6)[0])):
        band = bright[y0:y1]
        xs = cells_between(groups(np.where(band.mean(0) > 0.6)[0]))
        rows.append([(x0, y0, x1, y1) for x0, x1 in xs])
    return rows


def flood_from_border(candidate):
    """Mark candidate pixels reachable from the image border (4-connected)."""
    h, w = candidate.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    border = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    for y, x in border:
        if candidate[y, x] and not bg[y, x]:
            bg[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def enclosed_regions(candidate, min_size):
    """Candidate pixels in connected blobs of at least min_size (e.g. sky seen between bow and string)."""
    h, w = candidate.shape
    seen = np.zeros((h, w), bool)
    out = np.zeros((h, w), bool)
    for sy, sx in zip(*np.where(candidate)):
        if seen[sy, sx]:
            continue
        blob = [(sy, sx)]
        seen[sy, sx] = True
        i = 0
        while i < len(blob):
            y, x = blob[i]
            i += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    blob.append((ny, nx))
        if len(blob) >= min_size:
            ys, xs = zip(*blob)
            out[list(ys), list(xs)] = True
    return out


def remove_background(rgb, background="black"):
    """Flood-fill the plain background from the borders and turn it transparent."""
    if background == "black":
        candidate = rgb.max(axis=2) < BG_THRESHOLD
        bg = flood_from_border(candidate)
        # Isolated dark specks (JPEG noise) that are fully enclosed are also dropped if very dark.
        bg |= rgb.max(axis=2) < 14
    else:
        candidate = rgb.min(axis=2) > WHITE_THRESHOLD
        bg = flood_from_border(candidate)
        # White pockets enclosed by the sprite (between bow and string, under the horse) are background
        # too; tiny ones are kept since they're highlights such as arrow tips.
        bg |= enclosed_regions(candidate & ~bg, min_size=25)
    return np.dstack([rgb, np.where(bg, 0, 255).astype(np.uint8)])


def bbox(alpha):
    ys, xs = np.where(alpha > 0)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def runs(mask):
    """(start, end) spans where mask is True."""
    edges = np.diff(np.concatenate([[0], mask.astype(int), [0]]))
    return list(zip(np.where(edges == 1)[0], np.where(edges == -1)[0]))


def split_at_gaps(spans, size):
    """Cut points halfway through each gap between content spans."""
    cuts = [0] + [(a[1] + b[0]) // 2 for a, b in zip(spans, spans[1:])] + [size]
    return list(zip(cuts, cuts[1:]))


def extract_gap_frames(path):
    """Frames from a sheet with no grid lines: cells are separated by plain white gaps."""
    arr = np.asarray(Image.open(path).convert("RGB"))
    fg = arr.min(axis=2) < WHITE_THRESHOLD - 7
    frames = []
    for y0, y1 in split_at_gaps(runs(fg.sum(1) > 2), arr.shape[0]):
        band = fg[y0:y1]
        for x0, x1 in split_at_gaps(runs(band.sum(0) > 1), arr.shape[1]):
            frames.append(remove_background(arr[y0:y1, x0:x1], background="white"))
    return frames


def extract_frames(path):
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img)
    frames = []
    for row in find_cells(img):
        for x0, y0, x1, y1 in row:
            cell = arr[y0 + INSET:y1 - INSET, x0 + INSET:x1 - INSET]
            frames.append(remove_background(cell))
    return frames


def pack(frames, anchor, pad=2):
    """Trim every frame to its content, then pad all to one size so they share a common anchor.

    anchor='bottom' keeps feet aligned (archer); 'center' keeps centres aligned (arrow/balloon FX).
    """
    boxes = [bbox(f[..., 3]) for f in frames]
    if anchor == "bottom":
        # align on horizontal centre of the cell and on the bottom of content
        w = max(f.shape[1] for f in frames)
        h = max(b[3] - b[1] for b in boxes) + pad * 2
        out = []
        for f, (bx0, by0, bx1, by1) in zip(frames, boxes):
            canvas = np.zeros((h, w, 4), np.uint8)
            crop = f[by0:by1, :]
            canvas[h - pad - crop.shape[0]:h - pad, :crop.shape[1]] = crop
            out.append(canvas)
        return out
    h = max(f.shape[0] for f in frames)
    w = max(f.shape[1] for f in frames)
    out = []
    for f in frames:
        canvas = np.zeros((h, w, 4), np.uint8)
        oy, ox = (h - f.shape[0]) // 2, (w - f.shape[1]) // 2
        canvas[oy:oy + f.shape[0], ox:ox + f.shape[1]] = f
        out.append(canvas)
    return out


def save_sheet(frames, name, cols=5):
    fh, fw = frames[0].shape[:2]
    rows = (len(frames) + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = f
    Image.fromarray(sheet).save(OUT / f"{name}.png")
    print(f"{name}.png  frame {fw}x{fh}  ({len(frames)} frames)")
    return fw, fh


def red_mask(rgba):
    rgb = rgba[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (rgba[..., 3] > 0) & (r > 90) & (r > g * 1.8) & (r > b * 1.8)


def hue_shift(rgba, degrees):
    """Rotate the hue of the red balloon pixels only (arrow wood / fletching untouched)."""
    if degrees == 0:
        return rgba.copy()
    mask = red_mask(rgba)
    hsv = np.asarray(Image.fromarray(rgba[..., :3]).convert("HSV")).copy()
    hsv[..., 0] = np.where(mask, (hsv[..., 0].astype(int) + int(degrees / 360 * 255)) % 256, hsv[..., 0])
    rgb = np.asarray(Image.fromarray(hsv, "HSV").convert("RGB"))
    out = rgba.copy()
    out[..., :3] = np.where(mask[..., None], rgb, rgba[..., :3])
    return out


def save_png(rgba, name):
    x0, y0, x1, y1 = bbox(rgba[..., 3])
    Image.fromarray(rgba[y0:y1, x0:x1]).save(OUT / f"{name}.png")
    print(f"{name}.png  {x1 - x0}x{y1 - y0}")


BALLOON_HUES = {"red": 0, "orange": 30, "yellow": 55, "green": 120, "blue": 215, "purple": 280}


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    hunter = pack(extract_gap_frames(HUNTER_SRC), "bottom")
    save_sheet(hunter, "hunter")

    if not BALLOON_SRC.exists():
        print(f"{BALLOON_SRC.name} not found - keeping the existing arrow/balloon/pop assets")
        return
    fx = extract_frames(BALLOON_SRC)

    # Frame 0 = arrow flying toward an intact balloon: split it into a lone arrow and a lone balloon.
    first = fx[0]
    red = red_mask(first)
    rx0 = int(np.where(red.sum(0) >= 5)[0].min())  # ignore stray reddish JPEG specks
    arrow = first.copy()
    arrow[:, rx0 - 4:] = 0
    save_png(arrow, "arrow")
    balloon = first.copy()
    balloon[:, :rx0 - 4] = 0
    for name, deg in BALLOON_HUES.items():
        save_png(hue_shift(balloon, deg), f"balloon_{name}")

    # Pop animation: horizontal, arrow pointing right (frames 1..4 of row 0).
    pop = pack([fx[i] for i in (1, 2, 3, 4)], "center")
    for name, deg in BALLOON_HUES.items():
        save_sheet([hue_shift(f, deg) for f in pop], f"pop_{name}", cols=4)


if __name__ == "__main__":
    main()
