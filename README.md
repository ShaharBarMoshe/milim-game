# Balloon Archer

A Phaser 3 arrow-shooting game: a mounted hunter (`hunter.jpeg`) shoots rising balloons.

## Play

```bash
npm install
npm run dev        # open the printed http://localhost URL
```

- **Mouse**: aim. The hunter turns and picks the bow pose closest to your angle.
- **Left click**: shoot. Arrows fly with gravity and wind, so a bad angle misses.
- **A / D** or **← / →**: ride left/right (the horse gallops).

You get 60 seconds. Smaller balloons are worth more, consecutive hits build a combo, and one arrow through several balloons multiplies the points. Your best score is saved in the browser.

## Sprites

`tools/slice_sprites.py` (Pillow + NumPy) cuts `hunter.jpeg` into frames along the white gaps between poses, makes the white background transparent, and writes `public/assets/hunter.png`.

The arrow, balloon and pop assets were cut from an earlier balloon/arrow sheet (`Gemini_Generated_Image_ujowyqujowyqujow.jpeg`). That sheet is no longer in the folder, so the script keeps the existing files; put it back to regenerate them.

```bash
npm run sprites    # regenerate public/assets/ from the source JPEGs
```
