"""Compare a render with its reference: per-element ink boxes, mean pixel difference, side-by-side sheet.

usage: python3 tools/compare.py <ref.png> <render.png> <spec.json> [sheet.png]
spec.json: {"name": [x0, y0, x1, y1, threshold], ...} in 4× pixels; a pixel is ink when its luminance < threshold.
Offsets (render − reference) under 4 px at 4× are under 1 CSS px."""
import json, sys
from PIL import Image, ImageChops

def lum(p): return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def ink_box(px, x0, y0, x1, y1, thr):
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if lum(px[x, y]) < thr: xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

ref = Image.open(sys.argv[1]).convert("RGB"); out = Image.open(sys.argv[2]).convert("RGB")
spec = json.load(open(sys.argv[3]))
rp, op = ref.load(), out.load(); worst = 0
print(f"{'element':16} {'reference':>24} {'render':>24}   offset")
for name, (x0, y0, x1, y1, thr) in spec.items():
    a, b = ink_box(rp, x0, y0, x1, y1, thr), ink_box(op, x0, y0, x1, y1, thr)
    d = tuple(v - u for u, v in zip(a, b)) if a and b else None
    if d: worst = max(worst, *map(abs, d))
    print(f"{name:16} {str(a):>24} {str(b):>24}   {d}")
diff = ImageChops.difference(ref, out).convert("L")
print(f"worst offset: {worst} px at 4x ({worst / 4:.2f} CSS px) · mean pixel difference: {sum(diff.get_flattened_data()) / (diff.width * diff.height):.2f} / 255")
if len(sys.argv) > 4:
    w, h = ref.size; sheet = Image.new("RGB", (w * 3 // 2, h // 2), "white")
    sheet.paste(ref.resize((w // 2, h // 2)), (0, 0)); sheet.paste(out.resize((w // 2, h // 2)), (w // 2, 0))
    sheet.paste(Image.eval(diff, lambda v: min(255, v * 4)).convert("RGB").resize((w // 2, h // 2)), (w, 0)); sheet.save(sys.argv[4])
