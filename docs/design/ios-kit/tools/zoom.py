"""Crop the same region from reference and render, side by side, to judge shadows, glass and type by eye.
usage: python3 tools/zoom.py <ref.png> <render.png> <x0> <y0> <x1> <y1> <out.png>"""
import sys
from PIL import Image
ref, out = (Image.open(p).convert("RGB") for p in sys.argv[1:3])
box = tuple(int(v) for v in sys.argv[3:7])
a, b = ref.crop(box), out.crop(box); w, h = a.size
sheet = Image.new("RGB", (w * 2 + 10, h), "red"); sheet.paste(a, (0, 0)); sheet.paste(b, (w + 10, 0)); sheet.save(sys.argv[7])
