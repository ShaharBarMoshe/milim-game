"""Draw the girl and boy players as sprite sheets (Pillow), in the same frame layouts as the art they
replace, so the scenes only swap the texture:

  kid_<who>_archer.png  5x4 frames of 208x250, frame indices as ARCHER_FRAMES (hunter.png)
  kid_<who>_jumper.png  5x2 frames of 247x127, frame indices as ROBOT_FRAMES (robot.png)

Poses are stick-figure joints in units where the kid is 100 tall, feet at y=0, facing +x; each is
drawn as outlined limbs, a body, a big head and hair. Run: python3 -I tools/draw_kids.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets"
SS = 4  # supersampling for smooth edges

OUTLINE = (34, 22, 14, 255)

KIDS = {
    "girl": dict(skin=(241, 194, 140), hair=(122, 66, 30), top=(236, 72, 153), bottom=(236, 72, 153),
                 legs=(124, 58, 237), shoes=(250, 250, 250), dress=True, long_hair=True),
    "boy": dict(skin=(224, 172, 105), hair=(43, 29, 14), top=(59, 130, 246), bottom=(30, 58, 138),
                legs=(224, 172, 105), shoes=(220, 38, 38), dress=False, long_hair=False),
}

BOW = (120, 72, 30, 255)
STRING = (240, 240, 240, 255)
ARROW = (90, 60, 30, 255)
QUIVER = (140, 80, 40, 255)


def darker(c, f=0.72):
    return tuple(int(v * f) for v in c[:3]) + (255,)


def rgba(c):
    return tuple(c[:3]) + (255,)


class Canvas:
    """Draws one frame; `unit` px per kid unit, (ox, oy) is the feet point in frame px."""

    def __init__(self, w, h, unit, ox, oy):
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.unit, self.ox, self.oy = unit, ox, oy

    def p(self, pt):
        x, y = pt
        return ((self.ox + x * self.unit) * SS, (self.oy - y * self.unit) * SS)

    def limb(self, pts, width, color):
        """A thick, round-ended, outlined line through `pts`."""
        pts = [self.p(q) for q in pts]
        w = width * self.unit * SS
        for col, extra in ((OUTLINE, 2.2 * SS), (rgba(color), 0)):
            self.d.line(pts, fill=col, width=int(w + extra), joint="curve")
            for x, y in pts:
                r = (w + extra) / 2
                self.d.ellipse((x - r, y - r, x + r, y + r), fill=col)

    def poly(self, pts, color):
        self.d.polygon([self.p(q) for q in pts], fill=rgba(color), outline=OUTLINE, width=int(2 * SS))

    def circle(self, c, r, color, outline=True):
        x, y = self.p(c)
        rr = r * self.unit * SS
        self.d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=rgba(color), outline=OUTLINE if outline else None,
                       width=int(2 * SS) if outline else 0)

    def ellipse(self, c, rx, ry, color, outline=True):
        x, y = self.p(c)
        a, b = rx * self.unit * SS, ry * self.unit * SS
        self.d.ellipse((x - a, y - b, x + a, y + b), fill=rgba(color), outline=OUTLINE if outline else None,
                       width=int(2 * SS) if outline else 0)

    def line(self, a, b, width, color):
        self.d.line([self.p(a), self.p(b)], fill=rgba(color), width=max(1, int(width * self.unit * SS)))

    def arc(self, box_c, rx, ry, start, end, width, color):
        x, y = self.p(box_c)
        a, b = rx * self.unit * SS, ry * self.unit * SS
        self.d.arc((x - a, y - b, x + a, y + b), start, end, fill=OUTLINE, width=int(width * self.unit * SS + 2 * SS))
        self.d.arc((x - a, y - b, x + a, y + b), start, end, fill=rgba(color), width=int(width * self.unit * SS))

    def done(self):
        w, h = self.img.size
        return self.img.resize((w // SS, h // SS), Image.LANCZOS)


# ------------------------------------------------------------------ the kid

def draw_kid(cv, kid, pose):
    """pose: dict of joints. Keys: head, neck, hip, shoulder, arm_f/arm_b (elbow, hand), leg_f/leg_b
    (knee, foot), front (facing the viewer), face ('happy'|'scared'|'focus'), tilt (head turn)."""
    k = KIDS[kid]
    front = pose.get("front", False)
    neck, hip, sh = pose["neck"], pose["hip"], pose["shoulder"]
    head = pose["head"]

    def leg(side, color_f):
        knee, foot = pose[side]
        cv.limb([hip, knee, foot], 7, color_f)
        dx = 4 if not front else 0
        cv.ellipse((foot[0] + dx, foot[1] + 1.5), 5.5, 3, k["shoes"])

    def arm(side, color_f):
        elbow, hand = pose[side]
        cv.limb([sh, elbow, hand], 5.5, color_f)
        cv.circle(hand, 3.2, k["skin"])

    # back limbs first, slightly darker
    if not front and k["long_hair"]:
        ponytail(cv, k, head, pose)
    if pose.get("quiver"):
        quiver(cv, neck, hip)
    arm("arm_b", darker(k["skin"]) if not front else k["skin"])
    leg("leg_b", darker(k["legs"]) if not front else k["legs"])
    if front:
        leg("leg_f", k["legs"])
    # body: a shirt (or dress) from neck to hip, and a skirt for the girl
    bw = 9 if not front else 11
    cv.poly([(neck[0] - bw * 0.8, neck[1]), (neck[0] + bw * 0.8, neck[1]),
             (hip[0] + bw, hip[1]), (hip[0] - bw, hip[1])], k["top"])
    if k["dress"]:
        cv.poly([(hip[0] - bw, hip[1] + 2), (hip[0] + bw, hip[1] + 2),
                 (hip[0] + bw + 6, hip[1] - 12), (hip[0] - bw - 6, hip[1] - 12)], k["bottom"])
    else:
        cv.poly([(hip[0] - bw, hip[1] + 1), (hip[0] + bw, hip[1] + 1),
                 (hip[0] + bw + 1, hip[1] - 8), (hip[0] - bw - 1, hip[1] - 8)], k["bottom"])
    if not front:
        leg("leg_f", k["legs"])
    arm("arm_f", k["skin"])
    draw_head(cv, k, head, front, pose.get("face", "happy"))


def ponytail(cv, k, head, pose):
    hx, hy = head
    sway = pose.get("hair_sway", 0)
    cv.limb([(hx - 10, hy + 4), (hx - 17, hy - 3 + sway), (hx - 19, hy - 12 + sway)], 7, k["hair"])


def quiver(cv, neck, hip):
    # a tube slung across the back with feathered arrow ends sticking out
    top = (neck[0] - 7, neck[1] + 6)
    bot = (hip[0] - 9, hip[1] + 10)
    cv.limb([bot, top], 6.5, QUIVER)
    for dx, col in ((-2, (220, 38, 38)), (1.5, (250, 204, 21))):
        cv.limb([(top[0] + dx, top[1]), (top[0] + dx - 1, top[1] + 6)], 1.6, col)


def draw_head(cv, k, head, front, face):
    hx, hy = head
    r = 15
    # hair behind the head
    if front and k["long_hair"]:
        cv.limb([(hx - 12, hy + 4), (hx - 18, hy - 6), (hx - 17, hy - 14)], 6.5, k["hair"])
        cv.limb([(hx + 12, hy + 4), (hx + 18, hy - 6), (hx + 17, hy - 14)], 6.5, k["hair"])
    cv.circle(head, r, k["skin"])
    # hair cap
    if k["long_hair"]:
        cv.d.chord(_box(cv, head, r + 1), 180, 360, fill=rgba(k["hair"]), outline=OUTLINE, width=int(2 * SS))
        if not front:
            cv.ellipse((hx - 6, hy + 2), 9, 9, k["hair"])
    else:
        cv.d.chord(_box(cv, (hx, hy + 1), r + 1), 190, 350, fill=rgba(k["hair"]), outline=OUTLINE, width=int(2 * SS))
        for sx in (-8, -2, 4):
            cv.poly([(hx + sx, hy + 12), (hx + sx + 3, hy + 19), (hx + sx + 6, hy + 12)], k["hair"])
    # face: two eyes (shifted toward the facing side unless facing the viewer), cheeks and a mouth
    ex = 0 if front else 5
    for side in (-1, 1):
        cv.circle((hx + ex + side * 5.5, hy + 1), 2.4, (20, 20, 30), outline=False)
        cv.circle((hx + ex + side * 5.5 + 0.8, hy + 1.8), 0.8, (255, 255, 255), outline=False)
    cv.circle((hx + ex - 8, hy - 4), 2.2, (244, 114, 182), outline=False)
    cv.circle((hx + ex + 8, hy - 4), 2.2, (244, 114, 182), outline=False)
    if face == "scared":
        cv.ellipse((hx + ex, hy - 7), 2.6, 3.2, (60, 20, 20))
    elif face == "focus":
        cv.line((hx + ex - 3, hy - 7), (hx + ex + 3, hy - 7), 1.2, (60, 20, 20))
    else:
        cv.arc((hx + ex, hy - 5), 4.5, 3.5, 20, 160, 1.3, (60, 20, 20))


def _box(cv, c, r):
    x, y = cv.p(c)
    rr = r * cv.unit * SS
    return (x - rr, y - rr, x + rr, y + rr)


def base(**over):
    pose = dict(head=(2, 84), neck=(0, 68), hip=(0, 38), shoulder=(0, 64),
                arm_f=((3, 52), (5, 41)), arm_b=((-3, 52), (-4, 41)),
                leg_f=((2, 19), (2, 0)), leg_b=((-2, 19), (-3, 0)))
    pose.update(over)
    return pose


def shift(pose, dy):
    out = {}
    for key, v in pose.items():
        if isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], (int, float)):
            out[key] = (v[0], v[1] + dy)
        elif isinstance(v, tuple) and len(v) == 2:
            out[key] = tuple((q[0], q[1] + dy) for q in v)
        else:
            out[key] = v
    return out


# ------------------------------------------------------------------ archer (balloon game)

ARCHER_W, ARCHER_H = 208, 250
ARCHER_UNIT = 2.0
ARCHER_FEET = (104, 246)
BOW_HAND_UNITS = (22, 64)  # the front hand when aiming level; GameScene's KID_BOW_HAND matches it


def rot(p, about, deg):
    a = math.radians(deg)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * math.cos(a) - y * math.sin(a), about[1] + x * math.sin(a) + y * math.cos(a))


def bow_and_string(cv, hand, deg, draw_hand=None, arrow=True):
    """A bow held at `hand`, tilted up by `deg`; its string pulled to `draw_hand`."""
    half = 22
    up = rot((hand[0], hand[1] + half), hand, deg)
    down = rot((hand[0], hand[1] - half), hand, deg)
    bulge = rot((hand[0] + 9, hand[1]), hand, deg)
    # the bow limbs as two curves through the bulge
    cv.limb([up, ((up[0] + bulge[0]) / 2 + 3 * math.cos(math.radians(deg)), (up[1] + bulge[1]) / 2), bulge], 2.6, BOW)
    cv.limb([down, ((down[0] + bulge[0]) / 2 + 3 * math.cos(math.radians(deg)), (down[1] + bulge[1]) / 2), bulge], 2.6, BOW)
    pull = draw_hand or hand
    cv.line(up, pull, 0.7, STRING)
    cv.line(down, pull, 0.7, STRING)
    if arrow and draw_hand:
        tip = rot((hand[0] + 14, hand[1]), hand, deg)
        cv.line(draw_hand, tip, 1.3, ARROW)
        cv.limb([tip, tip], 1.6, (200, 200, 210))


def archer_pose(legs, bob=0.0, deg=0.0, hand_mode="draw"):
    sh = (1, 64 + bob)
    hand = rot(BOW_HAND_UNITS, (1, 64), deg)
    hand = (hand[0], hand[1] + bob)
    elbow = ((sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2 + 1)
    if hand_mode == "draw":  # string hand pulled to the cheek
        draw_hand = rot((7, 70), (1, 64), deg * 0.6)
        draw_hand = (draw_hand[0], draw_hand[1] + bob)
        b_elbow = (-10, 66 + bob + deg * 0.15)
    elif hand_mode == "release":  # fingers just let go, hand flicked back
        draw_hand = (-8, 71 + bob)
        b_elbow = (-12, 64 + bob)
    elif hand_mode == "grab":  # reaching over the shoulder into the quiver
        draw_hand = (-8, 86 + bob)
        b_elbow = (-4, 74 + bob)
    else:  # nock: setting the arrow on the string at the bow
        draw_hand = (12, 66 + bob)
        b_elbow = (-2, 58 + bob)
    pose = dict(head=(3, 84 + bob), neck=(0, 68 + bob), hip=(0, 38 + bob), shoulder=sh,
                arm_f=(elbow, hand), arm_b=(b_elbow, draw_hand), quiver=True,
                face="focus" if hand_mode == "draw" else "happy", hair_sway=bob * 1.5)
    pose.update(legs)
    return pose, hand, draw_hand


RUN = [  # leg_f, leg_b for the four run frames
    dict(leg_f=((9, 20), (14, 3)), leg_b=((-4, 17), (-13, 7))),
    dict(leg_f=((5, 19), (3, 0)), leg_b=((0, 21), (-4, 10))),
    dict(leg_f=((-4, 17), (-13, 7)), leg_b=((9, 20), (14, 3))),
    dict(leg_f=((0, 21), (-4, 10)), leg_b=((5, 19), (3, 0))),
]
STAND = dict(leg_f=((4, 19), (5, 0)), leg_b=((-3, 19), (-5, 0)))


def archer_frame(kid, legs, bob=0.0, deg=0.0, mode="draw"):
    cv = Canvas(ARCHER_W, ARCHER_H, ARCHER_UNIT, *ARCHER_FEET)
    pose, hand, draw_hand = archer_pose(legs, bob, deg, mode)
    draw_kid(cv, kid, pose)
    if mode == "draw":
        bow_and_string(cv, hand, deg, draw_hand)
    elif mode == "nock":
        bow_and_string(cv, hand, deg, None)
        cv.line((draw_hand[0] - 8, draw_hand[1]), (hand[0] + 10, hand[1]), 1.3, ARROW)
    else:
        bow_and_string(cv, hand, deg, None)
    return cv.done()


def archer_sheet(kid):
    frames = {}
    for i, legs in enumerate(RUN):
        frames[i] = archer_frame(kid, legs, bob=1.5 if i % 2 else 0)
    frames[4] = archer_frame(kid, STAND, mode="release")
    for deg, index in ((8, 10), (14, 11), (20, 12), (26, 13)):
        frames[index] = archer_frame(kid, STAND, deg=deg)
    frames[14] = archer_frame(kid, STAND, mode="grab")
    frames[15] = archer_frame(kid, STAND, mode="nock")
    sheet = Image.new("RGBA", (ARCHER_W * 5, ARCHER_H * 4), (0, 0, 0, 0))
    for i in range(20):
        sheet.paste(frames.get(i, frames[0]), ((i % 5) * ARCHER_W, (i // 5) * ARCHER_H))
    return sheet


# ------------------------------------------------------------------ jumper (lava level)

JUMPER_W, JUMPER_H = 247, 127
JUMPER_UNIT = 1.18
JUMPER_FEET = (123, 124)

JUMPER_POSES = [
    # 0 ready: knees soft, arms relaxed
    base(hip=(0, 36), neck=(1, 66), shoulder=(1, 62), head=(3, 82),
         leg_f=((4, 18), (3, 0)), leg_b=((-2, 18), (-4, 0))),
    # 1 takeoff: deep crouch, leaning in, arms swung back
    base(hip=(-3, 27), neck=(7, 55), shoulder=(6, 52), head=(11, 69),
         arm_f=((-6, 42), (-16, 34)), arm_b=((-8, 44), (-18, 38)),
         leg_f=((8, 15), (3, 0)), leg_b=((5, 13), (-4, 0))),
    # 2 air: knees tucked, arms up
    base(hip=(0, 44), neck=(1, 74), shoulder=(1, 70), head=(3, 90),
         arm_f=((8, 84), (12, 97)), arm_b=((-5, 83), (-6, 96)),
         leg_f=((11, 34), (4, 20)), leg_b=((7, 30), (-2, 22))),
    # 3 land: knees bent, arms out for balance
    base(hip=(-1, 29), neck=(3, 59), shoulder=(3, 55), head=(6, 74),
         arm_f=((12, 56), (21, 55)), arm_b=((-8, 56), (-17, 57)),
         leg_f=((9, 14), (6, 0)), leg_b=((3, 13), (-6, 0))),
    # 4 settle: nearly standing
    base(hip=(0, 35), neck=(1, 65), shoulder=(1, 61), head=(3, 81)),
    # 5 fall: flailing, mouth open
    base(hip=(0, 44), neck=(3, 72), shoulder=(3, 68), head=(6, 88), face="scared",
         arm_f=((13, 80), (16, 96)), arm_b=((-8, 80), (-14, 94)),
         leg_f=((10, 28), (16, 14)), leg_b=((-6, 28), (-12, 16)), hair_sway=6),
    # 6 front: facing the viewer, arms up (holding on / waving)
    base(front=True, hip=(0, 36), neck=(0, 66), shoulder=(0, 62), head=(0, 82),
         arm_f=((9, 76), (8, 92)), arm_b=((-9, 76), (-8, 92)),
         leg_f=((4, 18), (5, 0)), leg_b=((-4, 18), (-5, 0))),
    # 7 front crouch: one hand higher, knees bent (climbing)
    base(front=True, hip=(0, 31), neck=(0, 61), shoulder=(0, 57), head=(0, 77),
         arm_f=((9, 74), (7, 94)), arm_b=((-9, 64), (-8, 78)),
         leg_f=((6, 14), (5, 0)), leg_b=((-6, 14), (-5, 0))),
    # 8 front land: cheering, arms in a V
    base(front=True, hip=(0, 36), neck=(0, 66), shoulder=(0, 62), head=(0, 82),
         arm_f=((12, 78), (20, 94)), arm_b=((-12, 78), (-20, 94)),
         leg_f=((5, 18), (7, 0)), leg_b=((-5, 18), (-7, 0))),
]


def jumper_sheet(kid):
    sheet = Image.new("RGBA", (JUMPER_W * 5, JUMPER_H * 2), (0, 0, 0, 0))
    for i, pose in enumerate(JUMPER_POSES):
        cv = Canvas(JUMPER_W, JUMPER_H, JUMPER_UNIT, *JUMPER_FEET)
        draw_kid(cv, kid, pose)
        sheet.paste(cv.done(), ((i % 5) * JUMPER_W, (i // 5) * JUMPER_H))
    return sheet


def main():
    for kid in KIDS:
        archer_sheet(kid).save(OUT / f"kid_{kid}_archer.png")
        jumper_sheet(kid).save(OUT / f"kid_{kid}_jumper.png")
        print(f"wrote kid_{kid}_archer.png and kid_{kid}_jumper.png")


if __name__ == "__main__":
    main()
