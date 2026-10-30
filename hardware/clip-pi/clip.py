"""Lente clip, Pi edition: a Raspberry Pi Zero W and a Camera Module 3, packed as small as they go.

The Pi Zero W (65 x 30 mm) sets the size, so everything else stacks against it
in thin layers along the temple, from the head outward:

1. Battery layer: the LiPo at the back, the 1S USB-C charger in front of it.
   The slide switch lies on top of the battery at the back, lever up through
   the lid.
2. The Pi, ports down: its micro-USB OTG (data, SSH over USB) opens in the
   floor, the microSD card through a slot in the back wall.
3. A 3 mm layer over the Pi's flat middle: I2S microphone, coin motor and the
   5 V boost converter (the Pi needs 5 V, the battery gives 3.0-4.2 V).

The camera stands at the front in a short, wider head (its board is 25 mm
across), on the Pi Zero's 22-to-15-pin camera cable, its lens behind a bezel
that sits flush with the glass. The clamp is the v1/v3 one: a fixed rib over
the temple and two M3 screws pushing up from below.

Pi and camera sizes come from Raspberry Pi's drawings (Camera Module 3 product
brief, June 2024: 25 x 23.862 x 11.3 mm, lens 14.4 mm above the connector
edge, centred across). Charger, boost and microphone are nominal: measure the
ones you buy and update the numbers below before printing.

Writes out/clip-base.stl, out/clip-lid.stl, out/hud-arm.stl,
out/assembly.glb (every part, named) and out/dimensions.json.

Axes (mm): X = forward (toward the lenses), Y = outward (away from the head),
Z = up. Origin = outer corner of the shell at back / head side / bottom.

Run: python hardware/clip-pi/clip.py   (needs manifold3d, trimesh, numpy)
"""

import json
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import Manifold

OUT = Path(__file__).parent / "out"
SEG = 48

# --- Parts --------------------------------------------------------------
PI = (65.0, 30.0)                # Raspberry Pi Zero W board (X, Z as mounted)
PI_PCB = 1.0                     # board thickness (measure)
PI_LOW = 1.8                     # tallest part on the top side away from the port edge (SoC, passives)
PI_PORT_ZONE = 8.0               # band along the port edge where the connectors stand (mini HDMI 3.2 tall)
HDMI_XC, OTG_XC, PWR_XC = 12.4, 41.4, 54.0   # connector centres from the microSD end
SD_ZC = 15.7                     # microSD centre above the port edge (from the board layout, confirm)
SD_OUT = 2.5                     # how far the card sticks out past the board edge
CAM = (25.0, 23.862)             # Camera Module 3 board (Y, Z)
CAM_CONN = (19.61, 5.71, 2.75)   # FPC connector on its back: width, height, depth
CAM_PCB_X = 3.875                # back of connector to front of board
CAM_BODY_X = 6.98                # back of connector to front of the focus module
CAM_X = 11.3                     # back of connector to front of the lens
CAM_LENS_Z = 14.4                # lens centre above the connector edge
CAM_BODY = 10.8                  # focus module, square
LENS_D = 7.0                     # lens barrel (estimated; the drawing gives the 5.75 mm aperture)
CAM_LIFT = 3.0                   # room under the camera for the ribbon to fold back to the Pi
FFC_GAP = 2.5                    # Pi edge to the camera connector: the ribbon turns here
BATTERY = (43.0, 5.2, 25.0)      # LiPo 502540 ~500 mAh with its protection board on the end
BAT_BAY = 5.4
CHARGER = (17.0, 25.0, 1.0)      # 1S USB-C charger (TP4056 class): X, Z, PCB thickness; USB-C on its outer face
USB_C = (8.9, 3.3, 7.3)          # receptacle: width, height, length
MICRO_B = (7.5, 2.7, 5.0)        # Pi micro-USB receptacle: width, height, length
BOOST = (20.0, 12.0, 3.0)        # 5 V boost converter, at least 1 A out (nominal)
MIC = (14.0, 14.0, 3.0)          # INMP441 I2S microphone module
MOTOR_D, MOTOR_T = 10.0, 2.7     # coin vibration motor
SWITCH = (8.6, 3.5, 4.0)         # SS12D00 body: length (X), thickness (Y), height (Z, lever up)
SW_TRAVEL = 2.0
PLUG_C = (12.4, 6.6)             # USB-C plug overmould (X, Y)
PLUG_B = (10.6, 7.0)             # micro-USB plug overmould (X, Y)
OLED = (38.0, 3.5, 12.0)         # HUD arm parts, as in v1
MAGNIFIER_D, MAGNIFIER_T = 11.0, 2.0
COMBINER = (13.0, 1.5, 9.0)

# --- Shell --------------------------------------------------------------
WALL = 1.6
RADIUS = 2.5
LID_LIP = 1.5
FIT = 0.2
PARTS_T = 3.0                    # outer layer over the Pi
CAM_SLOT_WALL = 0.8              # head wall left outside the camera board's edge slots
RIB_T, RIB_H, TEMPLE_W = 1.6, 3.0, 7.0
TEMPLE_MIN, TEMPLE_MAX = 2.0, 10.0
PIN_XS = ((10.0, 18.0), (34.0, 42.0))
PIN_ENGAGE = 6.0
GRIP_T = 0.6
PIN_BLOCK_Y = 4.5
PIN_HOLE_D = 2.6
PIN_LEN = 16.0
BAND_W, BAND_D = 2.4, 0.8

w = WALL
IN_Z = PI[1] + 0.6
# Y layers, from the head-side inner wall
PY0 = w + BAT_BAY + 0.3          # Pi PCB, back face
PY1 = PY0 + PI_PCB               # Pi top side
OY0 = PY1 + PI_LOW + 0.2         # outer parts layer
TAIL_IN_Y = OY0 + PARTS_T + 0.2 - w
# Head: only the camera board is 25 mm wide; its back connector (19.61) and focus module (10.8) are
# narrower. The cavity fits the connector and the board's edges ride in slots in the side walls.
HEAD_IN_Y = CAM_CONN[0] + 0.4
CAM_Y = CAM_SLOT_WALL + FIT + CAM[0] / 2
HY0 = CAM_Y - HEAD_IN_Y / 2      # head cavity, head side
# X: Pi, ribbon gap, camera
PX0 = w + 0.2
PX1 = PX0 + PI[0]
CAM_X0 = PX1 + FFC_GAP
HX0 = CAM_X0 - 0.3               # head cavity starts here
HX1 = CAM_X0 + CAM_BODY_X + 0.3
OUTER = (HX1 + w, 2 * CAM_Y, IN_Z + 2 * w)
TAIL_OUT_Y = TAIL_IN_Y + 2 * w
split_z = w + IN_Z


def box(x0, y0, z0, x1, y1, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def rounded_box(size, r):
    sx, sy, sz = size
    corners = [Manifold.sphere(r, SEG).translate([x, y, z])
               for x in (r, sx - r) for y in (r, sy - r) for z in (r, sz - r)]
    return Manifold.batch_hull(corners)


def cyl_x(d, length, x0, y, z):
    return Manifold.cylinder(length, d / 2, d / 2, SEG).rotate([0, 90, 0]).translate([x0, y, z])


def cyl_y(d, length, x, y0, z):
    return Manifold.cylinder(length, d / 2, d / 2, SEG).rotate([-90, 0, 0]).translate([x, y0, z])


def slot_z(xc, yc, sx, sy, z0, z1):
    """Vertical stadium slot sx by sy, round ends on the long axis."""
    r = min(sx, sy) / 2
    ends = ([(xc - sx / 2 + r, yc), (xc + sx / 2 - r, yc)] if sx >= sy
            else [(xc, yc - sy / 2 + r), (xc, yc + sy / 2 - r)])
    return Manifold.batch_hull([Manifold.cylinder(z1 - z0, r, r, SEG).translate([x, y, z0]) for x, y in ends])


def cavity(inset=0.0, grow_up=0.0):
    """Tail and head cavities as one solid, shrunk on every side by inset, top raised by grow_up."""
    i, top = inset, w + IN_Z - inset + grow_up
    return (box(w + i, w + i, w + i, HX0 + 0.01, w + TAIL_IN_Y - i, top)
            + box(HX0 - 0.01, HY0 + i, w + i, HX1 - i, HY0 + HEAD_IN_Y - i, top))


# --- Parts placed in the shell ---------------------------------------------
P = {}
pz0 = w + 0.35                                           # Pi port edge; its connectors stop 0.05 above the floor
P["pi_pcb"] = box(PX0, PY0, pz0, PX1, PY1, pz0 + PI[1])
P["pi_parts"] = box(PX0 + 14.0, PY1, pz0 + PI_PORT_ZONE + 1.0, PX0 + 50.0, PY1 + PI_LOW, pz0 + 24.0)
P["pi_ports"] = (box(PX0 + HDMI_XC - 5.6, PY1, pz0 - 0.3, PX0 + HDMI_XC + 5.6, PY1 + 3.2, pz0 + 7.2)
                 + box(PX0 + OTG_XC - MICRO_B[0] / 2, PY1, pz0 - 0.3, PX0 + OTG_XC + MICRO_B[0] / 2, PY1 + MICRO_B[1], pz0 - 0.3 + MICRO_B[2])
                 + box(PX0 + PWR_XC - MICRO_B[0] / 2, PY1, pz0 - 0.3, PX0 + PWR_XC + MICRO_B[0] / 2, PY1 + MICRO_B[1], pz0 - 0.3 + MICRO_B[2]))
P["pi_csi"] = box(PX1 - 4.0, PY1, pz0 + PI[1] / 2 - 8.5, PX1 + 0.3, PY1 + 1.3, pz0 + PI[1] / 2 + 8.5)
P["sd_card"] = box(PX0 - SD_OUT, PY1 + 0.2, pz0 + SD_ZC - 5.5, PX0 + 11.0, PY1 + 1.0, pz0 + SD_ZC + 5.5)

cz0 = w + CAM_LIFT
LENS_Z = cz0 + CAM_LENS_Z
P["cam_pcb"] = (box(CAM_X0 + CAM_CONN[2], CAM_Y - CAM[0] / 2, cz0, CAM_X0 + CAM_PCB_X, CAM_Y + CAM[0] / 2, cz0 + CAM[1])
                + box(CAM_X0, CAM_Y - CAM_CONN[0] / 2, cz0, CAM_X0 + CAM_CONN[2], CAM_Y + CAM_CONN[0] / 2, cz0 + CAM_CONN[1]))
P["cam_body"] = box(CAM_X0 + CAM_PCB_X, CAM_Y - CAM_BODY / 2, LENS_Z - CAM_BODY / 2,
                    CAM_X0 + CAM_BODY_X, CAM_Y + CAM_BODY / 2, LENS_Z + CAM_BODY / 2)
P["lens"] = cyl_x(LENS_D, CAM_X - CAM_BODY_X, CAM_X0 + CAM_BODY_X, CAM_Y, LENS_Z)

P["battery"] = box(w + 0.3, w + 0.2, w + 0.3, w + 0.3 + BATTERY[0], w + 0.2 + BATTERY[1], w + 0.3 + BATTERY[2])
cx0 = w + 47.0
CXC = cx0 + CHARGER[0] / 2
CY_USB = w + 0.2 + CHARGER[2] + USB_C[1] / 2 + 0.01
P["charger"] = (box(cx0, w + 0.2, w + 0.45, cx0 + CHARGER[0], w + 0.2 + CHARGER[2], w + 0.45 + CHARGER[1])
                + box(cx0 + 3.0, w + 0.2 + CHARGER[2], w + 9.0, cx0 + 14.0, w + 0.2 + CHARGER[2] + 1.5, w + 20.0))
P["charger_usb"] = box(CXC - USB_C[0] / 2, CY_USB - USB_C[1] / 2, w + 0.05, CXC + USB_C[0] / 2, CY_USB + USB_C[1] / 2, w + 0.05 + USB_C[2])

sw_x0, sw_y0 = w + 1.8, w + 1.7                          # clear of the lid lip
sw_z1 = split_z - 0.2
SW_XC, SW_YC = sw_x0 + SWITCH[0] / 2, sw_y0 + SWITCH[1] / 2
P["switch"] = box(sw_x0, sw_y0, sw_z1 - SWITCH[2], sw_x0 + SWITCH[0], sw_y0 + SWITCH[1], sw_z1)
P["switch_lever"] = box(SW_XC - 1.0, SW_YC - 0.75, sw_z1, SW_XC + 1.0, SW_YC + 0.75, split_z + w + 1.0)

MIC_C = (w + 13.0, w + 20.0)
P["mic"] = box(MIC_C[0] - MIC[0] / 2, OY0, MIC_C[1] - MIC[1] / 2, MIC_C[0] + MIC[0] / 2, OY0 + MIC[2], MIC_C[1] + MIC[1] / 2)
P["motor"] = cyl_y(MOTOR_D, MOTOR_T, w + 28.0, OY0, w + 20.0)
P["boost"] = box(w + 38.0, OY0, w + 15.0, w + 38.0 + BOOST[0], OY0 + BOOST[2], w + 15.0 + BOOST[1])

# --- Shell -------------------------------------------------------------------
tail_outer = rounded_box((HX0 + w, TAIL_OUT_Y, OUTER[2]), RADIUS)
head_outer = rounded_box((HX1 - HX0 + 2 * w, OUTER[1], OUTER[2]), RADIUS).translate([HX0 - w, 0, 0])
outer = tail_outer + head_outer
# Temple at lens height when the clamp blocks under it still get PIN_ENGAGE of thread.
temple_z = max(LENS_Z, PIN_ENGAGE + TEMPLE_MAX - 3.2)
bezel_t = CAM_X0 + CAM_X - OUTER[0]                      # lens past the front face; the bezel covers it
otg_x, pi_usb_y = PX0 + OTG_XC, PY1 + MICRO_B[1] / 2

holes = [
    cyl_x(LENS_D + 1.0, WALL + bezel_t + 2, HX1 - 1, CAM_Y, LENS_Z),                    # lens
    slot_z(CXC, CY_USB, USB_C[0] + 1.2, USB_C[1] + 1.2, -1, WALL + 1),                  # charger USB-C
    box(CXC - PLUG_C[0] / 2, CY_USB - PLUG_C[1] / 2, -1, CXC + PLUG_C[0] / 2, CY_USB + PLUG_C[1] / 2, 0.6),
    slot_z(otg_x, pi_usb_y, MICRO_B[0] + 1.2, MICRO_B[1] + 1.2, -1, WALL + 1),          # Pi micro-USB OTG
    box(otg_x - PLUG_B[0] / 2, pi_usb_y - PLUG_B[1] / 2, -1, otg_x + PLUG_B[0] / 2, pi_usb_y + PLUG_B[1] / 2, 0.8),
    box(-1, PY1 - 0.3, pz0 + SD_ZC - 6.5, WALL + 1, PY1 + 1.8, pz0 + SD_ZC + 6.5),     # microSD, back wall
    cyl_y(1.6, WALL + 2, MIC_C[0], TAIL_OUT_Y - WALL - 1, MIC_C[1]),                    # mic port, outer side
    box(CAM_X0 + CAM_CONN[2] - FIT, CAM_Y - CAM[0] / 2 - FIT, cz0 - FIT,
        CAM_X0 + CAM_PCB_X + FIT, CAM_Y + CAM[0] / 2 + FIT, split_z + 0.01),            # camera board slots, open at the top
    box(SW_XC - 1.0 - SW_TRAVEL / 2 - 0.3, SW_YC - 1.0, split_z - 1,
        SW_XC + 1.0 + SW_TRAVEL / 2 + 0.3, SW_YC + 1.0, OUTER[2] + 1),                  # switch lever, through the lid
]
for y0 in (w + 2.5, w + 6.0):                                                            # vents over the Pi
    holes.append(box(w + 16.0, y0, split_z - 1, PX1 - 4.0, y0 + 1.4, OUTER[2] + 1))
for x in (5.0, 28.0):                                                                    # band grooves, tail
    ring = box(x, -RIB_H - 1, -1, x + BAND_W, TAIL_OUT_Y + 1, OUTER[2] + 1)
    keep = box(x - 1, BAND_D, BAND_D, x + BAND_W + 1, TAIL_OUT_Y - BAND_D, OUTER[2] - BAND_D)
    holes.append(ring - keep)

above = box(-1, -RIB_H - 1, split_z, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1)
bezel = cyl_x(LENS_D + 4.0, bezel_t, OUTER[0] - 0.01, CAM_Y, LENS_Z)
base = outer - above - cavity() + bezel
# Clamp: fixed rib on the temple's top edge, two M3 screws push on its bottom edge (as in v1).
rib_z0 = temple_z + 3.2
pin_top = rib_z0 - TEMPLE_MAX
pin_xcs = [(a + b) / 2 for a, b in PIN_XS]
pin_yc = -PIN_BLOCK_Y / 2 + 0.5 / 2
base = base + box(0, -RIB_H, rib_z0, OUTER[0] - 3, 0.5, rib_z0 + RIB_T)
for (x0, x1), xc in zip(PIN_XS, pin_xcs):
    base = base + box(x0, -PIN_BLOCK_Y + 0.5, 0, x1, 0.5, pin_top)
    base = base - Manifold.cylinder(pin_top + 2.0, PIN_HOLE_D / 2, PIN_HOLE_D / 2, SEG).translate([xc, pin_yc, -1.0])
base = base - box(4.0, -RIB_H + 0.5, rib_z0 - 0.01, OUTER[0] - 7.0, 0.0, rib_z0 + GRIP_T)
# The Pi's top edge rises into the lip's band; notch the lip there instead of making the clip taller.
lip = (cavity(FIT, grow_up=1.0) - cavity(FIT + 1.2, grow_up=5.0)
       - box(PX0 - SD_OUT - 0.5, PY0 - 0.3, pz0, PX1 + 0.3, PY1 + PI_LOW + 0.3, split_z + 2))
lid = (outer ^ above) + (lip ^ box(-1, -1, split_z - LID_LIP, OUTER[0] + 1, OUTER[1] + 1, split_z + 0.01))
for h in holes:
    base = base - h
    lid = lid - h

# --- Glasses context (renders only) and the HUD arm (as in v1) ------------------
temple_y0 = -RIB_H
fx0, fx1 = OUTER[0] + 20, OUTER[0] + 25
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

tz = temple_z
ax0, ax_tip = OUTER[0] + 1.0 + bezel_t, fx1 + 16.0
tip_x0 = fx1 + 2.0
tip_xc = (tip_x0 + ax_tip) / 2
oled_y0 = 1.0
clip_jaw = box(ax0, temple_y0 - 0.2, tz - 5.0, ax0 + 8.0, 6.0, tz + 5.0) - box(
    ax0 - 1, temple_y0 - 1.0, tz - 3.0 - FIT, ax0 + 9.0, 0.2, tz + 3.0 + FIT)
beam = box(ax0, 0.5, tz - 7.0, ax_tip, 6.0, tz + 7.0)
plates = (box(tip_x0, -15.0, tz + 5.5, ax_tip, 0.5, tz + 7.0)
          + box(tip_x0, -15.0, tz - 7.0, ax_tip, 0.5, tz - 5.5))
ring = cyl_y(MAGNIFIER_D + 2.4, 2.4, tip_xc, -3.2, tz) - cyl_y(MAGNIFIER_D + 2 * FIT, 4.0, tip_xc, -4.0, tz)
oled_pocket = box(ax_tip - 2.0 - OLED[0] - FIT, oled_y0 - FIT, tz - OLED[2] / 2 - FIT,
                  ax_tip - 2.0 + FIT, oled_y0 + OLED[1] + FIT, tz + OLED[2] / 2 + FIT)
window = box(tip_x0, -1.0, tz - 4.0, ax_tip - 2.5, oled_y0 + 0.1, tz + 4.0)
hud_arm = clip_jaw + beam + plates + ring - oled_pocket - window
P_HUD = {
    "oled": box(ax_tip - 2.0 - OLED[0], oled_y0, tz - OLED[2] / 2, ax_tip - 2.0, oled_y0 + OLED[1], tz + OLED[2] / 2),
    "magnifier": cyl_y(MAGNIFIER_D, MAGNIFIER_T, tip_xc, -3.0, tz),
    "combiner": Manifold.cube(list(COMBINER), True).rotate([0, 0, 45]).translate([tip_xc, -9.5, tz]),
}

tip_z = temple_z - 3.0
P_PIN = {}
for i, xc in enumerate(pin_xcs, 1):
    P_PIN[f"pin_screw_{i}"] = Manifold.cylinder(PIN_LEN, 1.5, 1.5, SEG).translate([xc, pin_yc, tip_z - PIN_LEN])
    P_PIN[f"pin_head_{i}"] = Manifold.cylinder(2.2, 2.75, 2.75, SEG).translate([xc, pin_yc, tip_z - PIN_LEN - 2.2])


def to_trimesh(m: Manifold) -> trimesh.Trimesh:
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts), process=False)


OUT.mkdir(exist_ok=True)
to_trimesh(base).export(OUT / "clip-base.stl")
to_trimesh(lid).export(OUT / "clip-lid.stl")
to_trimesh(hud_arm).export(OUT / "hud-arm.stl")

scene = trimesh.Scene()
for name, part in {"shell_base": base, "shell_lid": lid, **P, "hud_arm": hud_arm, **P_HUD, **P_PIN, **glasses}.items():
    scene.add_geometry(to_trimesh(part), node_name=name, geom_name=name)
scene.export(OUT / "assembly.glb")

volume = base.volume() + lid.volume()
dims = {
    "outer_mm": [round(v, 1) for v in OUTER],
    "tail_width_mm": round(TAIL_OUT_Y, 1),
    "head_mm": [round(HX1 - HX0 + 2 * w, 1), round(OUTER[1], 1)],
    "lens_bezel_mm": round(bezel_t, 2),
    "stl_mm": {name: [round(float(v), 1) for v in to_trimesh(part).extents]
               for name, part in (("clip-base", base), ("clip-lid", lid), ("hud-arm", hud_arm))},
    "shell_volume_cm3": round(volume / 1000, 2),
    "shell_mass_g_pla_100pct": round(volume / 1000 * 1.24, 1),
    "hud_arm_mass_g_pla_100pct": round(hud_arm.volume() / 1000 * 1.24, 1),
    "camera_center_yz": [round(CAM_Y, 2), round(LENS_Z, 2)],
    "camera_below_temple_mm": round(temple_z - LENS_Z, 2),
    "ports": {"charger_usb_c_x": round(CXC, 2), "pi_otg_x": round(otg_x, 2), "microsd": "back wall"},
    "switch": {"where": "top, back, lever through the lid", "center_xy": [round(SW_XC, 2), round(SW_YC, 2)], "travel_mm": SW_TRAVEL},
    "temple_channel": {"width": TEMPLE_W, "depth": RIB_H, "center_z": round(temple_z, 2)},
    "clamp_pin": {"screw": "M3 x %d mm" % PIN_LEN, "temple_height_mm": [TEMPLE_MIN, TEMPLE_MAX],
                  "block_x_mm": [list(b) for b in PIN_XS], "top_rib_z_mm": round(rib_z0, 2), "block_top_z_mm": round(pin_top, 2)},
    "parts": {
        "pi": [PI[0], PI[1]], "camera": [CAM[0], CAM[1], CAM_X], "battery": list(BATTERY),
        "charger": list(CHARGER), "boost": list(BOOST), "mic": list(MIC), "motor": [MOTOR_D, MOTOR_T],
        "switch": list(SWITCH), "usb_c": list(USB_C), "micro_b": list(MICRO_B),
        "oled": list(OLED), "magnifier": [MAGNIFIER_D, MAGNIFIER_T], "combiner": list(COMBINER),
    },
}
(OUT / "dimensions.json").write_text(json.dumps(dims, indent=2))
print(json.dumps({k: dims[k] for k in ("outer_mm", "tail_width_mm", "head_mm", "stl_mm", "shell_mass_g_pla_100pct",
                                       "camera_below_temple_mm", "lens_bezel_mm")}, indent=2))

shell_walls = outer - cavity()
for h in holes:
    shell_walls = shell_walls - h
lip_only = lid - above
check = {"pi": P["pi_pcb"] + P["pi_parts"] + P["pi_ports"] + P["pi_csi"],
         "camera": P["cam_pcb"] + P["cam_body"],
         **{k: P[k] for k in ("battery", "charger", "charger_usb", "boost", "mic", "motor", "switch")}}
problems = 0
for name, part in check.items():
    if not (part ^ shell_walls).is_empty():
        print(f"warning: {name} intersects the shell"); problems += 1
    if not (part ^ lip_only).is_empty():
        print(f"warning: {name} hits the lid lip"); problems += 1
names = list(check)
for i, a in enumerate(names):
    for b in names[i + 1:]:
        if not (check[a] ^ check[b]).is_empty():
            print(f"warning: {a} collides with {b}"); problems += 1
for name, part in P_HUD.items():
    if not (part ^ hud_arm).is_empty():
        print(f"warning: {name} intersects the HUD arm"); problems += 1
for name in ("hinge", "frame", "temple_right"):
    if not (hud_arm ^ glasses[name]).is_empty():
        print(f"warning: HUD arm hits {name}"); problems += 1
    if not ((base + lid) ^ glasses[name]).is_empty():
        print(f"warning: shell hits {name}"); problems += 1
print("clearance check:", "ok" if problems == 0 else f"{problems} problems")
