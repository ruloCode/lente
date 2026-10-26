"""Renders hardware/clip/out/assembly.glb to PNGs with three.js in headless Chromium.

Run with a Python that has Playwright: python hardware/clip/render.py
"""

import base64
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
OUT = HERE / "out"
VIEWS = ["gafas", "frente", "capsula", "rayosx", "despiece"]

glb = base64.b64encode((OUT / "assembly.glb").read_bytes()).decode()
html = (HERE / "render.html").read_text().replace(
    "<script type=\"module\">", f"<script>window.GLB_B64 = \"{glb}\";</script>\n<script type=\"module\">", 1
)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.on("console", lambda m: print("console:", m.text) if m.type == "error" else None)
    page.set_content(html, wait_until="load")
    page.wait_for_function("window.READY === true", timeout=60000)
    for view in VIEWS:
        page.evaluate(f"setView('{view}')")
        page.screenshot(path=str(OUT / f"render-{view}.png"))
        print("saved", OUT / f"render-{view}.png")
    browser.close()
