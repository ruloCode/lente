"""Lente clip v3: the second built clip, laid out like the first working bench rig.

v1 worked on the bench (2026-10-29) with the XIAO stack held upside down
compared with the v1 case: both USB-C ports point at the floor and the camera
sits at the lower end of the Sense board. This case follows that rig. Ports at
the bottom, the switch at the top of the back wall:

- XIAO stack on edge at the front, camera looking forward, its USB-C down
  (flashing, serial log).
- A 1S USB-C charger module (the blue TP4056-class board) stands right behind
  the XIAO, its USB-C down too. It charges the battery before the switch, so it
  charges with the clip off.
- Both ports open through slots in the floor, in one shallow recess so a plug
  seats deep enough. Their 6.8 mm pitch takes two slim plugs at once.
- The slide switch rides at the top of the back wall, lever out the back,
  sliding up and down. A pillar holds it from below and the lid lip from above.
- Battery, motor and antenna stay in the tail as in v1; the motor moves forward
  to make room for the switch.

(clip-v2 is a different, unbuilt concept with the board flat against the temple.)
An optional second print, the HUD arm, carries a 0.91" OLED, a magnifier and a
45° acrylic combiner in front of the lens (concept, optics not validated).

Sizes are nominal (Seeed spec 21 x 17.8 x 15 mm for the stack; charger module
and camera offset estimated from a photo). Measure the real parts and update the
numbers below before printing.

Writes out/clip-base.stl, out/clip-lid.stl, out/hud-arm.stl,
out/assembly.glb (every part, named) and out/dimensions.json.

Axes (mm): X = forward (toward the lenses), Y = outward (away from the head),
Z = up. Origin = outer corner of the shell at back / head side / bottom.

Run: python hardware/clip-v3/clip.py   (needs manifold3d, trimesh, numpy)
"""

import json
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import Manifold

OUT = Path(__file__).parent / "out"
SEG = 48

# --- Parts (nominal; measure yours and adjust) ---------------------------
XIAO = (21.0, 17.8)              # XIAO ESP32-S3 board outline (Z, Y as mounted)
STACK_D = 12.0                   # depth from the back of the XIAO to the camera module face
LENS_D, LENS_L = 6.5, 3.0        # camera lens barrel: diameter (estimated from a photo, not calipered yet), length past the module
CAM = (9.0, 9.0)                 # OV3660 module face (estimated from a photo, not calipered yet)
CAM_DZ = -6.0                    # camera centre below the board centre, toward the USB-C end (bench photo 2026-10-29, not calipered)
CHARGER = (17.0, 25.0, 1.0)      # 1S USB-C charger module (TP4056 class): width (Y), height (Z), PCB thickness; USB-C on its back face
CHG_GAP = 2.5                    # charger PCB to the XIAO's USB-C: wires, and a 6.8 mm port pitch for two plugs at once
USB_C = (8.9, 3.3, 7.3)          # receptacle: width, height, length
BATTERY = (40.0, 7.5, 25.0)      # bay for a LiPo 502540 ~550 mAh (40 x 25 x 5 with its protection board) or smaller, 2.5 mm spare thickness
MOTOR_D, MOTOR_T = 10.0, 2.7     # coin vibration motor
SWITCH = (8.6, 3.5, 4.0)         # SS12D00 slide switch body: length (Z, standing), thickness (Y), depth (X, lever face to pins)
SW_TRAVEL = 2.0                  # lever travel
PLUG = (12.4, 6.6)               # USB-C plug overmould footprint (Y, X), slim cables
ANTENNA = (28.0, 6.6, 0.3)       # 2.4 GHz FPC antenna on U.FL (size to confirm)
OLED = (38.0, 3.5, 12.0)         # 0.91" 128x32 SSD1306 module: length, thickness, height
MAGNIFIER_D, MAGNIFIER_T = 11.0, 2.0
COMBINER = (13.0, 1.5, 9.0)      # clear acrylic plate at 45°

# --- Shell --------------------------------------------------------------
WALL = 1.6
TAIL_IN = (42.0, 12.2)           # tail cavity: length (X), width (Y); battery layer, then motor and switch layer
CHG_D = USB_C[1] + CHARGER[2]    # charger depth: USB-C plus PCB
HEAD_IN = (CHG_D + CHG_GAP + STACK_D + 0.6, 18.4)  # head cavity: length (X), width (Y); charger, gap, XIAO stack
IN_Z = 27.5                      # cavity height, shared (battery 25 mm + antenna above it)
RADIUS = 2.5
LID_LIP = 1.5
FIT = 0.2
RIB_T, RIB_H, TEMPLE_W = 1.6, 3.0, 7.0   # TEMPLE_W: nominal temple height, used by the HUD arm clip
TEMPLE_MIN, TEMPLE_MAX = 2.0, 10.0       # temple heights the clamp pin takes (Z extent of the temple)
PIN_XS = ((10.0, 18.0), (34.0, 42.0))    # two clamp blocks under the temple, one each side of the band groove at x=28
PIN_ENGAGE = 6.0                         # minimum block height under the tallest temple (thread engagement)
GRIP_T = 0.6                             # recess under the top rib for a 1 mm rubber strip (grip on any temple)
PIN_BLOCK_Y = 4.5                        # block depth toward the head, hole centred in it
PIN_HOLE_D = 2.6                         # M3 self-tapping in PLA/PETG
PIN_LEN = 16.0                           # M3 x 16 mm screw (range for temples 2 to 10 mm tall)
BAND_W, BAND_D = 2.4, 0.8

w = WALL
HX0 = w + TAIL_IN[0]             # head cavity starts here
HX1 = HX0 + HEAD_IN[0]
OUTER = (HX1 + w, HEAD_IN[1] + 2 * w, IN_Z + 2 * w)
TAIL_OUT_Y = TAIL_IN[1] + 2 * w


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
    """Tail and head cavities as one solid, shrunk on every side by inset, top raised by grow_up."""
    i, top = inset, w + IN_Z - inset + grow_up
    return (box(w + i, w + i, w + i, HX0 + 0.01, w + TAIL_IN[1] - i, top)
            + box(HX0 - 0.01, w + i, w + i, HX1 - i, w + HEAD_IN[1] - i, top))


# --- Parts placed in the shell ---------------------------------------------
P = {}
# Charger module, back to front: USB-C and its chips facing the battery, then its PCB.
cx0, sy0, sz0 = HX0 + 0.1, w + 0.3, w + 0.2
sy1, sz1 = sy0 + XIAO[1], sz0 + XIAO[0]
SY_C, SZ_C = (sy0 + sy1) / 2, (sz0 + sz1) / 2
cy0, cy1 = SY_C - CHARGER[0] / 2, SY_C + CHARGER[0] / 2
P["charger"] = (box(cx0 + USB_C[1], cy0, sz0, cx0 + CHG_D, cy1, sz0 + CHARGER[1])                    # PCB
                + box(cx0 + 1.8, SY_C - 5.0, sz0 + 9.0, cx0 + USB_C[1], SY_C + 5.0, sz0 + 20.0))     # TP4056, DW01, MOSFET
P["charger_usb"] = box(cx0, SY_C - USB_C[0] / 2, sz0 - 0.4, cx0 + USB_C[1], SY_C + USB_C[0] / 2, sz0 - 0.4 + USB_C[2])
# XIAO stack, back to front: USB-C and shield, XIAO PCB, B2B, Sense PCB, SD/mic, camera.
sx0 = cx0 + CHG_D + CHG_GAP
P["xiao"] = (box(sx0 + 3.3, sy0, sz0, sx0 + 4.3, sy1, sz1)                               # PCB
             + box(sx0 + 0.9, sy0 + 2.4, sz0 + 6.5, sx0 + 3.3, sy1 - 2.4, sz1 - 1.5))   # shield can
P["usb_c"] = box(sx0, SY_C - USB_C[0] / 2, sz0 - 0.4, sx0 + USB_C[1], SY_C + USB_C[0] / 2, sz0 - 0.4 + USB_C[2])
P["sense"] = (box(sx0 + 5.8, sy0, sz0, sx0 + 6.8, sy1, sz1)                              # Sense PCB
              + box(sx0 + 4.3, SY_C - 4.0, sz0 + 2.0, sx0 + 5.8, SY_C + 4.0, sz0 + 5.0)  # board-to-board
              + box(sx0 + 6.8, sy0 + 1.5, sz0 + 1.0, sx0 + 8.3, sy1 - 4.0, sz0 + 9.0))   # microSD slot
MIC_X = sx0 + 7.3
P["mic"] = box(sx0 + 6.8, sy1 - 3.5, sz1 - 4.5, MIC_X + 1.0, sy1 - 0.5, sz1 - 1.5)
CAM_C = (SY_C, SZ_C + CAM_DZ)
P["camera"] = box(sx0 + 8.3, CAM_C[0] - CAM[0] / 2, CAM_C[1] - CAM[1] / 2,
                  sx0 + STACK_D, CAM_C[0] + CAM[0] / 2, CAM_C[1] + CAM[1] / 2)
P["lens"] = cyl_x(LENS_D, LENS_L, sx0 + STACK_D, *CAM_C)
ANT_Z = w + IN_Z - 0.9
P["antenna"] = box(w + 3.0, w + 1.6, ANT_Z, w + 3.0 + ANTENNA[0], w + 1.6 + ANTENNA[1], ANT_Z + ANTENNA[2])
P["battery"] = box(w + 0.5, w + 0.3, w + 0.4, w + 0.5 + BATTERY[0], w + 0.3 + BATTERY[1], w + 0.4 + BATTERY[2])
MOTOR_C = (w + 12.0, w + 12.0)
SW_Y0 = w + 0.3 + BATTERY[1] + 0.4      # motor and switch layer starts after the battery bay
P["motor"] = cyl_y(MOTOR_D, MOTOR_T, MOTOR_C[0], SW_Y0, MOTOR_C[1])
# Switch standing against the back wall, as high as the lid lip allows; lever out the back, sliding in Z.
sw_z1 = w + IN_Z - LID_LIP - 0.3
sw_z0, sw_zc = sw_z1 - SWITCH[0], sw_z1 - SWITCH[0] / 2
sw_yc = SW_Y0 + SWITCH[1] / 2
P["switch"] = box(w, SW_Y0, sw_z0, w + SWITCH[2], SW_Y0 + SWITCH[1], sw_z1)
P["switch_lever"] = box(-2.2, sw_yc - 0.75, sw_zc - 1.0, w, sw_yc + 0.75, sw_zc + 1.0)

# --- Shell -------------------------------------------------------------------
tail_outer = rounded_box((HX0 + w, TAIL_OUT_Y, OUTER[2]), RADIUS)
head_outer = rounded_box((HEAD_IN[0] + 2 * w, OUTER[1], OUTER[2]), RADIUS).translate([HX0 - w, 0, 0])
outer = tail_outer + head_outer
split_z = w + IN_Z                      # base below, lid on top
# Temple at camera height when the clamp blocks under it still get PIN_ENGAGE of thread; v3's camera
# sits low, so the temple rides higher and the lens looks out below its line.
temple_z = max(CAM_C[1], PIN_ENGAGE + TEMPLE_MAX - 3.2)


def slot_z(xc, yc, sx, sy, z0, z1):
    """Vertical stadium slot: sx across (X), sy long (Y), round ends."""
    r = sx / 2
    return Manifold.batch_hull([Manifold.cylinder(z1 - z0, r, r, SEG).translate([xc, y, z0])
                                for y in (yc - sy / 2 + r, yc + sy / 2 - r)])


usb_xcs = (cx0 + USB_C[1] / 2, sx0 + USB_C[1] / 2)        # charger, XIAO
PLUG_RECESS = 0.6                                          # lets the plugs seat 0.6 mm deeper into the floor

holes = [
    cyl_x(LENS_D + 2.0, WALL + 2, HX1 - 1, *CAM_C),                                     # camera, 1 mm of slack per side
    *[slot_z(xc, SY_C, USB_C[1] + 1.2, USB_C[0] + 1.2, -1, WALL + 1) for xc in usb_xcs],  # USB-C slots, charger and XIAO
    box(usb_xcs[0] - PLUG[1] / 2, SY_C - PLUG[0] / 2, -1, usb_xcs[1] + PLUG[1] / 2,
        SY_C + PLUG[0] / 2, PLUG_RECESS),                                                # shared plug recess under both
    cyl_y(1.6, WALL + 2, MIC_X, OUTER[1] - WALL - 1, sz1 - 3.0),                        # mic port, outer side
    box(-1, sw_yc - 1.0, sw_zc - 1.0 - SW_TRAVEL / 2 - 0.3, WALL + 1,
        sw_yc + 1.0, sw_zc + 1.0 + SW_TRAVEL / 2 + 0.3),                                 # switch lever slot, back wall
]
for i in range(3):                                                                       # vents over the XIAO
    y0 = w + 3.0 + i * 5.0
    holes.append(box(HX0 + 2.5, y0, split_z - 1, HX1 - 2.5, y0 + 1.4, OUTER[2] + 1))
for x in (5.0, 28.0):                                                                    # band grooves, tail
    ring = box(x, -RIB_H - 1, -1, x + BAND_W, TAIL_OUT_Y + 1, OUTER[2] + 1)
    keep = box(x - 1, BAND_D, BAND_D, x + BAND_W + 1, TAIL_OUT_Y - BAND_D, OUTER[2] - BAND_D)
    holes.append(ring - keep)

above = box(-1, -RIB_H - 1, split_z, OUTER[0] + 1, OUTER[1] + 1, OUTER[2] + 1)
base = outer - above - cavity()
base = base + box(w - 0.01, SW_Y0, w - 0.01, w + SWITCH[2], w + TAIL_IN[1] + 0.01, sw_z0)   # pillar under the switch
# Clamp pin: the temple's top edge sits against a fixed rib; an M3 screw rising through a
# block under the channel pushes on its bottom edge, so any temple from TEMPLE_MIN to TEMPLE_MAX
# tall is held without changing the part.
rib_z0 = temple_z + 3.2                                  # rib underside: 0.2 mm above the top edge of a 6 mm temple centred on temple_z
pin_top = rib_z0 - TEMPLE_MAX                            # block top: tallest temple still clears it
pin_xcs = [(a + b) / 2 for a, b in PIN_XS]
pin_yc = -PIN_BLOCK_Y / 2 + 0.5 / 2
base = base + box(0, -RIB_H, rib_z0, OUTER[0] - 3, 0.5, rib_z0 + RIB_T)
for (x0, x1), xc in zip(PIN_XS, pin_xcs):
    base = base + box(x0, -PIN_BLOCK_Y + 0.5, 0, x1, 0.5, pin_top)
    base = base - Manifold.cylinder(pin_top + 2.0, PIN_HOLE_D / 2, PIN_HOLE_D / 2, SEG).translate([xc, pin_yc, -1.0])
base = base - box(4.0, -RIB_H + 0.5, rib_z0 - 0.01, OUTER[0] - 7.0, 0.0, rib_z0 + GRIP_T)   # rubber strip recess
lip = cavity(FIT, grow_up=1.0) - cavity(FIT + 1.2, grow_up=5.0)
lid = (outer ^ above) + (lip ^ box(-1, -1, split_z - LID_LIP, OUTER[0] + 1, OUTER[1] + 1, split_z + 0.01))
for h in holes:
    base = base - h
    lid = lid - h

# --- Glasses context (renders only) and the HUD arm -----------------------------
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

# HUD arm: U-clip on the temple in front of the pod, a beam outside the hinge
# holding the OLED face-in, and a tip in front of the lens's outer corner.
# Light path: OLED (facing -Y) -> magnifier -> combiner at 45° -> back to the eye (-X).
tz = temple_z
ax0, ax_tip = OUTER[0] + 1.0, fx1 + 16.0
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


tip_z = temple_z - 3.0                                   # the 6 mm temple modelled in the glasses
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
    "stl_mm": {name: [round(float(v), 1) for v in to_trimesh(part).extents]
               for name, part in (("clip-base", base), ("clip-lid", lid), ("hud-arm", hud_arm))},
    "shell_volume_cm3": round(volume / 1000, 2),
    "shell_mass_g_pla_100pct": round(volume / 1000 * 1.24, 1),
    "hud_arm_mass_g_pla_100pct": round(hud_arm.volume() / 1000 * 1.24, 1),
    "camera_center_yz": [round(v, 2) for v in CAM_C],
    "camera_below_temple_mm": round(temple_z - CAM_C[1], 2),
    "usb_c_ports": {"x_mm": [round(v, 2) for v in usb_xcs], "pitch_mm": round(usb_xcs[1] - usb_xcs[0], 2),
                    "recess_mm": PLUG_RECESS, "order_back_to_front": ["charger", "xiao"]},
    "switch": {"wall": "back", "center_yz": [round(sw_yc, 2), round(sw_zc, 2)], "travel_mm": SW_TRAVEL},
    "temple_channel": {"width": TEMPLE_W, "depth": RIB_H, "center_z": round(temple_z, 2)},
    "clamp_pin": {"screw": "M3 x %d mm" % PIN_LEN, "temple_height_mm": [TEMPLE_MIN, TEMPLE_MAX],
                  "block_x_mm": [list(b) for b in PIN_XS], "top_rib_z_mm": round(rib_z0, 2), "block_top_z_mm": round(pin_top, 2)},
    "parts": {
        "xiao_stack": [XIAO[0], XIAO[1], STACK_D + LENS_L],
        "camera": [CAM[0], CAM[1]], "usb_c": list(USB_C), "battery": list(BATTERY), "charger": list(CHARGER),
        "motor": [MOTOR_D, MOTOR_T], "switch": list(SWITCH), "antenna": list(ANTENNA),
        "oled": list(OLED), "magnifier": [MAGNIFIER_D, MAGNIFIER_T], "combiner": list(COMBINER),
    },
}
(OUT / "dimensions.json").write_text(json.dumps(dims, indent=2))
print(json.dumps(dims, indent=2))

shell_walls = outer - cavity()
check = {"stack": box(sx0, sy0, sz0, sx0 + STACK_D, sy1, sz1),
         "charger": box(cx0, cy0, sz0, cx0 + CHG_D, cy1, sz0 + CHARGER[1]),
         **{k: P[k] for k in ("antenna", "battery", "motor", "switch")}}
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
for name, part in P_HUD.items():
    if not (part ^ hud_arm).is_empty():
        print(f"warning: {name} intersects the HUD arm"); problems += 1
for name in ("hinge", "frame", "temple_right"):
    if not (hud_arm ^ glasses[name]).is_empty():
        print(f"warning: HUD arm hits {name}"); problems += 1
    if not ((base + lid) ^ glasses[name]).is_empty():
        print(f"warning: shell hits {name}"); problems += 1
print("clearance check:", "ok" if problems == 0 else f"{problems} problems")
