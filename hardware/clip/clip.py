"""Lente clip v0: a pod that straps to the temple of any glasses.

Parametric model built from the real dimensions of off-the-shelf parts
(see hardware/README.md). Writes:
  out/clip-base.stl, out/clip-lid.stl  printable shell (PLA/PETG, no supports)
  out/assembly.glb                     every part, named, for renders
  out/dimensions.json                  numbers the drawing and docs use

Axes (mm): X = forward (toward the lenses), Y = outward (away from the head),
Z = up. Origin = outer corner of the shell at back / head side / bottom.

Run: python hardware/clip/clip.py   (needs manifold3d, trimesh, numpy)
"""

import json
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import Manifold

OUT = Path(__file__).parent / "out"
SEG = 48

# --- Parts (measure yours and adjust) ------------------------------------
BOARD = (48.0, 6.5, 28.0)        # ESP32-S3-CAM N16R8, headers removed (L, thickness, H)
CAM = (6.0, 8.5, 8.5)            # OV2640 module incl. lens holder (depth, W, H)
LENS_D = 8.0                     # lens barrel diameter
BATTERY = (43.0, 5.2, 25.0)      # LiPo 502540 550 mAh: 40 x 25 x 5 + ~3 mm protection board
MIC = (14.0, 3.0, 14.0)          # INMP441 breakout, 14 x 14 x 3, port facing the head side
MOTOR_D, MOTOR_T = 10.0, 2.7     # coin vibration motor
SWITCH = (8.6, 4.0, 3.5)         # SS12D00 slide switch body

# --- Shell --------------------------------------------------------------
WALL = 1.6
INNER = (60.0, 14.5, 29.0)       # internal cavity (X, Y, Z)
RADIUS = 2.5                     # outer edge rounding
LID_LIP = 1.5                    # lip depth into the base
FIT = 0.2                        # print clearance per side
RIB_T, RIB_H, TEMPLE_W = 1.6, 3.0, 7.0   # channel that holds the glasses temple
BAND_W, BAND_D = 2.4, 0.8        # grooves for the two silicone bands / zip ties

OUTER = tuple(i + 2 * WALL for i in INNER)


def box(x0, y0, z0, x1, y1, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def rounded_box(size, r):
    sx, sy, sz = size
    corners = [
        Manifold.sphere(r, SEG).translate([x, y, z])
        for x in (r, sx - r)
        for y in (r, sy - r)
        for z in (r, sz - r)
    ]
    return Manifold.batch_hull(corners)


def cyl_x(d, length, x0, y, z):
    return Manifold.cylinder(length, d / 2, d / 2, SEG).rotate([0, 90, 0]).translate([x0, y, z])


def cyl_y(d, length, x, y0, z):
    return Manifold.cylinder(length, d / 2, d / 2, SEG).rotate([-90, 0, 0]).translate([x, y0, z])


def cyl_z(d, length, x, y, z0):
    return Manifold.cylinder(length, d / 2, d / 2, SEG).translate([x, y, z0])


# Internal layout (cavity coordinates, then shifted by WALL).
# Head-side layer: battery + mic + motor. Outer layer: board + camera bay + switch.
w = WALL
P = {}
# Board envelope (used for clearance checks) and a visual breakdown of it.
bx0, by0, bz0 = w + 0.6, w + 7.7, w + 0.5
board_env = box(bx0, by0, bz0, bx0 + BOARD[0], by0 + BOARD[1], bz0 + BOARD[2])
pcb_y0 = by0 + 2.0                            # bottom-side parts below the PCB
P["board"] = box(bx0, pcb_y0, bz0, bx0 + BOARD[0], pcb_y0 + 1.6, bz0 + BOARD[2])
P["module"] = box(bx0 + 22.0, pcb_y0 + 1.6, bz0 + 1.5, bx0 + 47.5, pcb_y0 + 4.7, bz0 + 19.5)   # ESP32-S3-WROOM-1
P["usb_c"] = (box(bx0 - 0.6, pcb_y0 + 1.6, bz0 + 3.0, bx0 + 7.0, pcb_y0 + 4.8, bz0 + 12.0)
              + box(bx0 - 0.6, pcb_y0 + 1.6, bz0 + 16.0, bx0 + 7.0, pcb_y0 + 4.8, bz0 + 25.0))
P["chips"] = (box(bx0 + 9.0, pcb_y0 + 1.6, bz0 + 4.0, bx0 + 14.0, pcb_y0 + 2.8, bz0 + 9.0)
              + box(bx0 + 9.0, pcb_y0 + 1.6, bz0 + 18.0, bx0 + 13.0, pcb_y0 + 2.6, bz0 + 22.0)
              + box(bx0 + 4.0, by0 + 0.4, bz0 + 6.0, bx0 + 16.0, pcb_y0, bz0 + 20.0))
cam_x0 = w + INNER[0] - 0.4 - CAM[0]
cam_y0, cam_z0 = w + 5.9, w + INNER[2] - 0.5 - CAM[2]
CAM_C = (cam_y0 + CAM[1] / 2, cam_z0 + CAM[2] / 2)
P["camera"] = box(cam_x0, cam_y0, cam_z0, cam_x0 + CAM[0] - 3.0, cam_y0 + CAM[1], cam_z0 + CAM[2])
P["lens"] = cyl_x(LENS_D, 3.0, cam_x0 + CAM[0] - 3.0, *CAM_C)
P["fpc"] = box(w + 0.6 + BOARD[0], w + 12.0, cam_z0 + 1.5, cam_x0, w + 12.3, cam_z0 + 7.0)
P["battery"] = box(w + 15.5, w + 0.4, w + 2.0, w + 15.5 + BATTERY[0], w + 0.4 + BATTERY[1], w + 2.0 + BATTERY[2])
P["mic"] = box(w + 0.4, w + 0.4, w + 0.5, w + 0.4 + MIC[0], w + 0.4 + MIC[1], w + 0.5 + MIC[2])
MIC_C = (w + 0.4 + MIC[0] / 2, w + 0.5 + MIC[2] / 2)
MOTOR_C = (w + 7.4, w + 21.0)
P["motor"] = cyl_y(MOTOR_D, MOTOR_T, MOTOR_C[0], w + 0.3, MOTOR_C[1])
sw_x0 = w + 50.5
P["switch"] = box(sw_x0, w + 8.0, w + 0.4, sw_x0 + SWITCH[0], w + 8.0 + SWITCH[1], w + 0.4 + SWITCH[2])
P["switch_lever"] = box(sw_x0 + 3.3, w + 9.3, -0.8, sw_x0 + 5.3, w + 10.7, w + 0.4)

# Shell: outer rounded box minus cavity, with features.
outer = rounded_box(OUTER, RADIUS)
cavity = box(w, w, w, w + INNER[0], w + INNER[1], w + INNER[2])
split_y = w + INNER[1]                       # base below, lid above
temple_z = CAM_C[1]                          # temple at camera height, lens near eye line

holes = [
    cyl_x(LENS_D + 1.0, WALL + 2, OUTER[0] - WALL - 1, *CAM_C),               # camera
    cyl_y(1.6, WALL + 2, MIC_C[0], -1, MIC_C[1]),                             # mic port (head side)
    box(-1, w + 8.2, w + 3.0, WALL + 1, w + 14.2, w + 26.0),                  # USB-C window, trim to your board
    box(sw_x0 + 2.8, w + 8.8, -1, sw_x0 + 5.8, w + 11.2, WALL + 1),           # switch lever slot
]
for x in (12.0, 50.0):                                                         # band grooves
    ring = box(x, -1, -1, x + BAND_W, OUTER[1] + 1, OUTER[2] + 1)
    keep = box(x - 1, BAND_D, BAND_D, x + BAND_W + 1, OUTER[1] - BAND_D, OUTER[2] - BAND_D)
    holes.append(ring - keep)

base = outer - box(-1, split_y, -1, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1) - cavity
ribs = [
    box(0, -RIB_H, temple_z + sgn * TEMPLE_W / 2 + (0 if sgn > 0 else -RIB_T), OUTER[0] - 6, 0.5,
        temple_z + sgn * TEMPLE_W / 2 + (RIB_T if sgn > 0 else 0))
    for sgn in (1, -1)
]
for rib in ribs:
    base = base + rib
lid_plate = outer ^ box(-1, split_y, -1, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1)
lip_outer = box(w + FIT, split_y - LID_LIP, w + FIT, w + INNER[0] - FIT, split_y, w + INNER[2] - FIT)
lip_inner = box(w + FIT + 1.2, split_y - LID_LIP - 1, w + FIT + 1.2, w + INNER[0] - FIT - 1.2, split_y + 0.01,
                w + INNER[2] - FIT - 1.2)
lid = lid_plate + (lip_outer - lip_inner)
for h in holes:
    base = base - h
    lid = lid - h
# Light pipe for the board LED (position varies by board: drill to match).
lid = lid - cyl_y(2.0, WALL + 2, 30.0, OUTER[1] - WALL - 1, w + 24.0)


def to_trimesh(m: Manifold) -> trimesh.Trimesh:
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts), process=False)


# Glasses context for renders only (generic 140 mm frame, not printed).
temple_y0 = -RIB_H
fx0, fx1 = OUTER[0] + 12, OUTER[0] + 17           # frame front, 5 mm thick
lens_w, lens_h, rim = 52.0, 38.0, 4.0
top = temple_z + 5


def rim_ring(y_center):
    outside = rounded_box((fx1 - fx0, lens_w + 2 * rim, lens_h + 2 * rim), 2.0).translate(
        [fx0, y_center - lens_w / 2 - rim, top - lens_h - 2 * rim])
    hole = rounded_box((fx1 - fx0 + 2, lens_w, lens_h), 6.0).translate(
        [fx0 - 1, y_center - lens_w / 2, top - lens_h - rim])
    return outside - hole


right_c, left_c = temple_y0 - 2 - lens_w / 2 - rim, temple_y0 - 2 - lens_w * 1.5 - 3 * rim - 16
glasses = {
    "temple_right": box(-40, temple_y0, temple_z - 3.0, fx0, temple_y0 + 3.0, temple_z + 3.0),
    "temple_left": box(-40, left_c - lens_w / 2 - rim - 1, temple_z - 3.0, fx0,
                       left_c - lens_w / 2 - rim + 2, temple_z + 3.0),
    "hinge": box(fx0 - 4, temple_y0 - 1, temple_z - 3.5, fx0, temple_y0 + 3.0, temple_z + 3.5),
    "frame": rim_ring(right_c) + rim_ring(left_c)
             + box(fx0, left_c + lens_w / 2 + rim - 1, top - 14, fx1, right_c - lens_w / 2 - rim + 1, top - 8),
    "lens_right": box(fx0 + 1.5, right_c - lens_w / 2 + 0.5, top - lens_h - rim + 0.5, fx1 - 1.5,
                      right_c + lens_w / 2 - 0.5, top - rim - 0.5),
    "lens_left": box(fx0 + 1.5, left_c - lens_w / 2 + 0.5, top - lens_h - rim + 0.5, fx1 - 1.5,
                     left_c + lens_w / 2 - 0.5, top - rim - 0.5),
}

OUT.mkdir(exist_ok=True)
to_trimesh(base).export(OUT / "clip-base.stl")
to_trimesh(lid).export(OUT / "clip-lid.stl")

scene = trimesh.Scene()
for name, part in {"shell_base": base, "shell_lid": lid, **P, **glasses}.items():
    scene.add_geometry(to_trimesh(part), node_name=name, geom_name=name)
scene.export(OUT / "assembly.glb")

volume = base.volume() + lid.volume()
dims = {
    "outer_mm": [round(v, 1) for v in OUTER],
    "inner_mm": list(INNER),
    "shell_volume_cm3": round(volume / 1000, 2),
    "shell_mass_g_pla_100pct": round(volume / 1000 * 1.24, 1),
    "camera_center_yz": [round(v, 2) for v in CAM_C],
    "temple_channel": {"width": TEMPLE_W, "depth": RIB_H, "center_z": round(temple_z, 2)},
    "parts": {
        "board": BOARD, "camera": CAM, "battery": BATTERY, "mic": MIC,
        "motor": [MOTOR_D, MOTOR_T], "switch": SWITCH,
    },
}
(OUT / "dimensions.json").write_text(json.dumps(dims, indent=2))
print(json.dumps(dims, indent=2))
check = {"board": board_env, **{k: v for k, v in P.items()
                                 if k not in ("board", "module", "usb_c", "chips", "switch_lever", "fpc")}}
problems = 0
for name, part in check.items():
    if name != "lens" and not (part ^ (outer - cavity)).is_empty():
        print(f"warning: {name} intersects the shell"); problems += 1
names = list(check)
for i, a in enumerate(names):
    for b in names[i + 1:]:
        if {a, b} == {"camera", "lens"}:
            continue
        if not (check[a] ^ check[b]).is_empty():
            print(f"warning: {a} collides with {b}"); problems += 1
print("clearance check:", "ok" if problems == 0 else f"{problems} problems")
