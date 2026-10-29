"""Lente clip v2: the XIAO ESP32-S3 Sense lies flat against the temple.

v1 stood the board on edge (21.6 mm of shell sticking out sideways). Here the
board is parallel to the temple, so the shell is about 13 mm thick. The camera
is unplugged from its stock position and sits at the front of the pod on its
flexible cable, folded 90 degrees so the lens looks forward. The battery lies
behind the board, along the temple, and the motor sits on top of it.

Sizes are nominal (Seeed spec, Sigma Electronica listings and the ROB-08449
datasheet). Measure the real parts and update the numbers below before printing.
Not yet verified on hardware: the flex cable reaching the front of the pod.

Writes out/clip-base.stl, out/clip-lid.stl, out/assembly.glb (every part,
named) and out/dimensions.json.

Axes (mm): X = forward (toward the lenses), Y = outward (away from the head),
Z = up. Origin = outer corner of the shell at back / head side / bottom.

Run: python hardware/clip-v2/clip.py   (needs manifold3d, trimesh, numpy)
"""

import json
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import Manifold

OUT = Path(__file__).parent / "out"
SEG = 48

# --- Parts (nominal; measure yours and adjust) ---------------------------
XIAO = (17.8, 21.0)              # XIAO ESP32-S3 outline: width (X), length (Z, USB-C at the bottom)
STACK_T = 8.3                    # board thickness along Y: shield, XIAO, B2B, Sense, microSD
CAM = (8.5, 8.5, 3.7)            # OV3660 module: width (Y), height (Z), depth (X)
LENS_D, LENS_L = 8.0, 3.0        # camera lens barrel: diameter, length past the module
USB_C = (8.9, 3.3, 7.3)          # receptacle: width (X), thickness (Y), length (Z)
BATTERY = (35.0, 6.0, 20.0)      # BATLI 3.7V 400 mAh, 6 x 20 x 35 (axes unlabelled on the page)
MOTOR_D, MOTOR_T = 10.0, 3.4     # ROB-08449 coin motor, 10 mm x 3.4 mm (datasheet)
DRIVER = (8.0, 1.5, 6.0)         # 2N7002 + two 0805 resistors + 1N4148 on a scrap of perfboard
ANTENNA = (28.0, 0.3, 6.6)       # 2.4 GHz FPC antenna on U.FL (size to confirm)
FPC_T, FPC_W = 0.2, 8.0          # flexible cable of the camera

# --- Shell --------------------------------------------------------------
WALL = 1.6
IN_Y = 10.4                      # cavity width, shared
IN_Z = 23.0                      # cavity height, shared
RADIUS = 2.5
LID_LIP = 1.5
FIT = 0.2
RIB_T, RIB_H, TEMPLE_W = 1.6, 3.0, 7.0
BAND_W, BAND_D = 2.4, 0.8

w = WALL
# X layout inside the cavity, back to front: battery, gap, board, gap, camera.
BAT_X0 = w + 0.4
BOARD_X0 = BAT_X0 + BATTERY[0] + 0.8
BOARD_X1 = BOARD_X0 + XIAO[0]
CAM_X0 = BOARD_X1 + 0.4
CAM_X1 = CAM_X0 + CAM[2]
HX1 = CAM_X1 + 0.4                # cavity ends here
OUTER = (HX1 + w, IN_Y + 2 * w, IN_Z + 2 * w)


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


def cavity(inset=0.0, grow_up=0.0):
    """The cavity as one solid, shrunk on every side by inset, top raised by grow_up."""
    i = inset
    return box(w + i, w + i, w + i, HX1 - i, w + IN_Y - i, w + IN_Z - i + grow_up)


# --- Parts placed in the shell ---------------------------------------------
P = {}
# XIAO stack, head side to outer side: USB-C and shield, XIAO PCB, B2B, Sense PCB, microSD.
by0, bz0 = w + 0.3, w + 0.2
by1, bz1 = by0 + STACK_T, bz0 + XIAO[1]
BX_C = (BOARD_X0 + BOARD_X1) / 2
P["xiao"] = (box(BOARD_X0, by0 + 3.3, bz0, BOARD_X1, by0 + 4.3, bz1)                               # PCB
             + box(BOARD_X0 + 2.4, by0 + 0.9, bz0 + 6.5, BOARD_X1 - 2.4, by0 + 3.3, bz1 - 1.5))    # shield can
P["usb_c"] = box(BX_C - USB_C[0] / 2, by0, bz0 - 0.4, BX_C + USB_C[0] / 2, by0 + USB_C[1], bz0 - 0.4 + USB_C[2])
P["sense"] = (box(BOARD_X0, by0 + 5.8, bz0, BOARD_X1, by0 + 6.8, bz1)                              # Sense PCB
              + box(BX_C - 4.0, by0 + 4.3, bz0 + 2.0, BX_C + 4.0, by0 + 5.8, bz0 + 5.0)            # board-to-board
              + box(BOARD_X0 + 1.5, by0 + 6.8, bz0 + 1.0, BOARD_X1 - 4.0, by1, bz0 + 9.0))         # microSD slot
MIC_X, MIC_Z = BOARD_X0 + 3.0, bz1 - 3.0
P["mic"] = box(MIC_X - 1.5, by0 + 6.8, MIC_Z - 1.5, MIC_X + 1.5, by0 + 7.8, MIC_Z + 1.5)

CAM_YZ = (w + 5.4, w + 15.5)      # camera centre (Y, Z); also where the temple runs
P["camera"] = box(CAM_X0, CAM_YZ[0] - CAM[0] / 2, CAM_YZ[1] - CAM[1] / 2,
                  CAM_X1, CAM_YZ[0] + CAM[0] / 2, CAM_YZ[1] + CAM[1] / 2)
P["lens"] = cyl_x(LENS_D, LENS_L, CAM_X1, *CAM_YZ)
# Flexible cable: leaves the Sense connector at the board's top front corner, runs forward along its outer face.
FPC_Y = by1 + 0.1
P["fpc"] = box(BOARD_X1 - 4.0, FPC_Y, CAM_YZ[1] - FPC_W / 2, CAM_X0, FPC_Y + FPC_T, CAM_YZ[1] + FPC_W / 2)

P["battery"] = box(BAT_X0, w + 0.3, w + 0.4, BAT_X0 + BATTERY[0], w + 0.3 + BATTERY[1], w + 0.4 + BATTERY[2])
MOTOR_C = (BAT_X0 + 7.0, w + 11.0)   # X, Z
P["motor"] = cyl_y(MOTOR_D, MOTOR_T, MOTOR_C[0], w + 6.5, MOTOR_C[1])
P["driver"] = box(BAT_X0 + 18.0, w + 6.5, w + 11.0, BAT_X0 + 18.0 + DRIVER[0], w + 6.5 + DRIVER[1], w + 11.0 + DRIVER[2])
# Antenna stands against the outer wall, low, clear of the microphone port.
P["antenna"] = box(BAT_X0 + 14.0, w + IN_Y - 0.6, w + 1.5, BAT_X0 + 14.0 + ANTENNA[0], w + IN_Y - 0.3, w + 1.5 + ANTENNA[2])

# --- Shell -------------------------------------------------------------------
outer = rounded_box(OUTER, RADIUS)
split_z = w + IN_Z                      # base below, lid on top
temple_z = CAM_YZ[1]                    # temple at camera height

holes = [
    cyl_x(LENS_D + 1.0, WALL + 2, HX1 - 1, *CAM_YZ),                                    # camera
    box(BX_C - USB_C[0] / 2 - 0.6, by0 - 0.6, -1, BX_C + USB_C[0] / 2 + 0.6,
        by0 + USB_C[1] + 0.6, WALL + 1),                                                 # USB-C, from below
    cyl_y(1.6, WALL + 2, MIC_X, OUTER[1] - WALL - 1, MIC_Z),                            # mic port, outer side
]
for i in range(3):                                                                       # vents over the XIAO
    y0 = w + 1.5 + i * 3.0
    holes.append(box(BOARD_X0 + 2.5, y0, split_z - 1, BOARD_X1 - 2.5, y0 + 1.4, OUTER[2] + 1))
for x in (5.0, OUTER[0] - 5.0 - BAND_W):                                                 # band grooves
    ring = box(x, -RIB_H - 1, -1, x + BAND_W, OUTER[1] + 1, OUTER[2] + 1)
    keep = box(x - 1, BAND_D, BAND_D, x + BAND_W + 1, OUTER[1] - BAND_D, OUTER[2] - BAND_D)
    holes.append(ring - keep)

above = box(-1, -RIB_H - 1, split_z, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1)
base = outer - above - cavity()
for sgn in (1, -1):
    z_edge = temple_z + sgn * TEMPLE_W / 2
    base = base + box(0, -RIB_H, z_edge + (0 if sgn > 0 else -RIB_T), OUTER[0] - 3, 0.5,
                      z_edge + (RIB_T if sgn > 0 else 0))
lip = cavity(FIT, grow_up=1.0) - cavity(FIT + 1.2, grow_up=5.0)
lid = (outer ^ above) + (lip ^ box(-1, -1, split_z - LID_LIP, OUTER[0] + 1, OUTER[1] + 1, split_z + 0.01))
for h in holes:
    base = base - h
    lid = lid - h

# --- Glasses context (renders only) ----------------------------------------------
temple_y0 = -RIB_H
fx0, fx1 = OUTER[0] + 20, OUTER[0] + 25          # frame front, 5 mm thick
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


def to_trimesh(m: Manifold) -> trimesh.Trimesh:
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts), process=False)


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
    "shell_volume_cm3": round(volume / 1000, 2),
    "shell_mass_g_pla_100pct": round(volume / 1000 * 1.24, 1),
    "camera_center_yz": [round(v, 2) for v in CAM_YZ],
    "temple_channel": {"width": TEMPLE_W, "depth": RIB_H, "center_z": round(temple_z, 2)},
    "parts": {
        "xiao_stack": [XIAO[0], XIAO[1], STACK_T],
        "camera": list(CAM), "usb_c": list(USB_C), "battery": list(BATTERY),
        "motor": [MOTOR_D, MOTOR_T], "driver": list(DRIVER), "antenna": list(ANTENNA),
    },
}
(OUT / "dimensions.json").write_text(json.dumps(dims, indent=2))
print(json.dumps(dims, indent=2))

shell_walls = outer - cavity()
check = {"board": box(BOARD_X0, by0, bz0, BOARD_X1, by1, bz1),
         **{k: P[k] for k in ("antenna", "battery", "motor", "driver", "camera", "fpc")}}
problems = 0
for name, part in check.items():
    if not (part ^ shell_walls).is_empty():
        print(f"warning: {name} intersects the shell"); problems += 1
    if not (part ^ (lid - box(-1, -RIB_H - 1, split_z, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1))).is_empty():
        print(f"warning: {name} hits the lid lip"); problems += 1
names = list(check)
for i, a in enumerate(names):
    for b in names[i + 1:]:
        if not (check[a] ^ check[b]).is_empty():
            print(f"warning: {a} collides with {b}"); problems += 1
for name in ("hinge", "frame", "temple_right"):
    if not ((base + lid) ^ glasses[name]).is_empty():
        print(f"warning: shell hits {name}"); problems += 1
print("clearance check:", "ok" if problems == 0 else f"{problems} problems")
