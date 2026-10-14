#!/usr/bin/env python3
"""Post-processing of the Blender preview renders (needs Pillow; videos also need ffmpeg with libx264).

- Every still gets a narrow bar at the bottom: "Vorschau – Blender-Nachbau des Unity-Testgeländes (kein Unity-Screenshot)".
- The map (04) gets readable area names, wolf markers, a legend with the material and rarity colours, a 10 m scale bar
  and a north arrow (positions come from 04_karte_beschriftung.json, written by testgelaende_preview.py).
- Frame sequences become MP4 (H.264, 30 fps) with the bar; the jump test also gets the movement values per frame.

Usage:
    python3 -I Tools/Preview/nachbearbeiten.py bilder --dir OUTPUT_DIR
    python3 -I Tools/Preview/nachbearbeiten.py video --dir OUTPUT_DIR --name 05_rundflug
    python3 -I Tools/Preview/nachbearbeiten.py video --dir OUTPUT_DIR --name 06_sprungtest
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/Library/Fonts", "C:/Windows/Fonts"]
BAR_STILL = "Vorschau – Blender-Nachbau des Unity-Testgeländes (kein Unity-Screenshot)"
BAR_FLIGHT = "Vorschau – Blender-Nachbau des Unity-Testgeländes (keine Unity-Aufnahme)"
BAR_JUMP = "Vorschau – Bewegungsbahn aus den Spielwerten berechnet (Blender-Nachbau, keine Unity-Aufnahme)"

STILLS = ["01_uebersicht", "02_arena", "02b_truhen", "03_spielersicht"]

# Same colours as testgelaende_preview.py (from TestGroundMaterials / RarityRules).
LEGEND_MATERIALS = [
    ((0.92, 0.55, 0.18), "Rampe"),
    ((0.25, 0.5, 0.85), "Treppe"),
    ((0.35, 0.7, 0.35), "Plattform / Block"),
    ((0.7, 0.3, 0.28), "Wand, Säulen, Felsen"),
    ((0.5, 0.35, 0.7), "Tunnel"),
    ((0.4, 0.33, 0.27), "Arena-Boden"),
    ((0.82, 0.7, 0.42), "Trainingspuppe"),
    ((0.85, 0.9, 0.95), "Spieler (Kapsel 1,8 m)"),
    ((0.55, 0.36, 0.2), "Holztruhe"),
    ((0.55, 0.58, 0.62), "Eisentruhe"),
    ((0.32, 0.22, 0.45), "Versteckte Truhe"),
    ((0.46, 0.43, 0.4), "Grauwolf"),
    ((0.27, 0.33, 0.4), "Aether-Wolf (Kern türkis)"),
]
LEGEND_RARITIES = [
    ("A6A6A6", "Gewöhnlich", "kein Strahl"),
    ("4CC35A", "Ungewöhnlich", "kein Strahl (Standard)"),
    ("3D8BFF", "Selten", "Strahl 1,5 m"),
    ("A855F7", "Episch", "Strahl 3 m"),
    ("FF8C1A", "Legendär", "Strahl 6 m"),
    ("E53935", "Mythisch", "Strahl 8 m"),
    ("F2D23C", "Set", "Strahl 4 m"),
]

# Short facts for the map legend (TestGround*.cs, PlayerMovementSettings, camera rig).
KEY_VALUES = [
    "Spieler: Kapsel 1,8 m hoch, Radius 0,35 m; Start am Ursprung, Blick nach Norden",
    "Laufen 5 m/s, Sprint 7 m/s, Sprunghöhe 1,2 m (Plattform 1,5 m ist zu hoch)",
    "Kamera: 4 m hinter dem Spieler, Drehpunkt 1,6 m, 15° Neigung, Sichtfeld 55°",
    "Rampen 3 m hoch, 4 m breit; ab 50° rutscht man (begehbar bis 45°)",
    "Truhen bei x = 5 / 8 / 11, z = 5 · Puppe bei (−12 | −16)",
    "Arena: Mitte (−28 | −42), Durchmesser 26 m",
]

# Where each map label sits relative to its anchor (pixels at 1600x900); the anchor gets a dot and a thin line.
MAP_LABEL_OFFSETS = {
    "Spawn": (75, 62),
    "Rampen": (-10, -88),
    "Treppe": (-55, -78),
    "Hohe Stufen": (95, -50),
    "Sprungplattformen": (5, -54),
    "Lücken": (120, 105),
    "Wand": (0, 40),
    "Säulen": (-105, 2),
    "Tunnel": (95, 10),
    "Truhen": (85, 40),
    "Trainingspuppe": (-55, 40),
    "Kampfarena": (215, 0),
}


def font(size, bold=False):
    names = ["DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf"] if bold else ["DejaVuSans.ttf", "arial.ttf", "Arial.ttf"]
    for folder in FONT_DIRS:
        for name in names:
            path = os.path.join(folder, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_bar(image, text, right_text="Chroniken von Aetherfall"):
    """Narrow dark bar at the bottom with white text (drawn over the image, the size stays the same)."""
    w, h = image.size
    bar = max(26, round(h * 0.038))
    overlay = Image.new("RGBA", (w, bar), (18, 20, 26, 215))
    d = ImageDraw.Draw(overlay)
    f = font(round(bar * 0.52))
    d.text((round(bar * 0.5), bar // 2), text, fill=(255, 255, 255, 255), font=f, anchor="lm")
    fr = font(round(bar * 0.45))
    d.text((w - round(bar * 0.5), bar // 2), right_text, fill=(200, 205, 215, 255), font=fr, anchor="rm")
    base = image.convert("RGBA")
    base.alpha_composite(overlay, (0, h - bar))
    return base.convert("RGB")


def rounded_box(draw, box, fill, outline=None, radius=6):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1)


def rgb255(c):
    return tuple(round(v * 255) for v in c)


def make_map(directory):
    raw = Image.open(os.path.join(directory, "04_karte_roh.png")).convert("RGBA")
    with open(os.path.join(directory, "04_karte_beschriftung.json"), encoding="utf-8") as f:
        data = json.load(f)
    w, h = raw.size
    sx = w / data["size"][0]
    sy = h / data["size"][1]
    layer = Image.new("RGBA", raw.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_name = font(round(17 * sx), bold=True)
    f_detail = font(round(13 * sx))
    f_small = font(round(12 * sx), bold=True)

    # Wolves as small rings with a name.
    for point in data["points"]:
        x, y = point["x"] * sx, point["y"] * sy
        r = 7 * sx
        d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, 255), width=max(1, round(2 * sx)))
        d.text((x + r + 3, y), point["name"], font=f_small, fill=(255, 255, 255, 255), anchor="lm",
               stroke_width=max(1, round(2 * sx)), stroke_fill=(30, 30, 30, 255))

    # Area labels with leader lines.
    for anchor in data["anchors"]:
        ax, ay = anchor["x"] * sx, anchor["y"] * sy
        dx, dy = MAP_LABEL_OFFSETS.get(anchor["name"], (0, 40))
        cx, cy = ax + dx * sx, ay + dy * sy
        lines = [(anchor["name"], f_name)] + ([(anchor["detail"], f_detail)] if anchor["detail"] else [])
        widths = [d.textbbox((0, 0), text, font=fnt)[2] for text, fnt in lines]
        heights = [fnt.size + 4 for _, fnt in lines]
        bw, bh = max(widths) + 16 * sx, sum(heights) + 10 * sy
        box = (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
        d.line((ax, ay, cx, cy), fill=(20, 20, 20, 230), width=max(1, round(2 * sx)))
        r = 4.5 * sx
        d.ellipse((ax - r, ay - r, ax + r, ay + r), fill=(255, 220, 60, 255), outline=(20, 20, 20, 255))
        rounded_box(d, box, fill=(255, 255, 255, 235), outline=(40, 40, 40, 255))
        y = box[1] + 5 * sy
        for (text, fnt), lh in zip(lines, heights):
            d.text((cx, y), text, font=fnt, fill=(20, 20, 20, 255), anchor="ma")
            y += lh

    # Legend panel on the right.
    panel_x0 = round(890 * sx)
    panel = (panel_x0, round(16 * sy), w - round(16 * sx), h - round(50 * sy))
    rounded_box(d, panel, fill=(250, 250, 252, 242), outline=(60, 60, 60, 255), radius=10)
    x = panel[0] + 22 * sx
    y = panel[1] + 16 * sy
    d.text((x, y), "Testgelände – Draufsicht", font=font(round(24 * sx), bold=True), fill=(20, 20, 20, 255))
    y += 34 * sy
    d.text((x, y), "Norden oben · Linien alle 5 m · Boden 120 × 120 m", font=f_detail, fill=(60, 60, 60, 255))
    y += 30 * sy
    d.text((x, y), "Farben der Platzhalter (wie im Generator)", font=font(round(15 * sx), bold=True), fill=(20, 20, 20, 255))
    y += 26 * sy
    col_w = (panel[2] - panel[0] - 44 * sx) / 2
    sw = 18 * sx
    for i, (color, text) in enumerate(LEGEND_MATERIALS):
        cx = x + (i % 2) * col_w
        cy = y + (i // 2) * 26 * sy
        d.rectangle((cx, cy, cx + sw, cy + sw), fill=rgb255(color) + (255,), outline=(40, 40, 40, 255))
        d.text((cx + sw + 8 * sx, cy + sw / 2), text, font=f_detail, fill=(20, 20, 20, 255), anchor="lm")
    y += ((len(LEGEND_MATERIALS) + 1) // 2) * 26 * sy + 14 * sy
    d.text((x, y), "Seltenheit: Beutewürfel und Loot-Strahl", font=font(round(15 * sx), bold=True), fill=(20, 20, 20, 255))
    y += 26 * sy
    for i, (hexcode, name, beam) in enumerate(LEGEND_RARITIES):
        cx = x + (i % 2) * col_w
        cy = y + (i // 2) * 26 * sy
        color = tuple(int(hexcode[k:k + 2], 16) for k in (0, 2, 4))
        d.rectangle((cx, cy, cx + sw, cy + sw), fill=color + (255,), outline=(40, 40, 40, 255))
        d.text((cx + sw + 8 * sx, cy + sw / 2), name + " – " + beam, font=f_detail, fill=(20, 20, 20, 255), anchor="lm")
    y += ((len(LEGEND_RARITIES) + 1) // 2) * 26 * sy + 10 * sy
    d.text((x, y), "Strahlen erscheinen erst, wenn Beute in der Welt liegt\n(besiegter Gegner oder Debug-Knopf „Test-Beute“).",
           font=f_detail, fill=(70, 70, 70, 255), spacing=4)
    y += 56 * sy
    d.text((x, y), "Wichtige Maße aus dem Code", font=font(round(15 * sx), bold=True), fill=(20, 20, 20, 255))
    y += 26 * sy
    for line in KEY_VALUES:
        d.text((x, y), "• " + line, font=f_detail, fill=(20, 20, 20, 255))
        y += 21 * sy
    y += 16 * sy

    # Scale bar (10 m) and north arrow.
    ppm = data["pixels_per_meter"] * sx
    bx, by = x, y + 18 * sy
    d.rectangle((bx, by, bx + 5 * ppm, by + 8 * sy), fill=(20, 20, 20, 255))
    d.rectangle((bx + 5 * ppm, by, bx + 10 * ppm, by + 8 * sy), fill=(255, 255, 255, 255), outline=(20, 20, 20, 255))
    d.text((bx, by - 4 * sy), "0", font=f_detail, fill=(20, 20, 20, 255), anchor="mb")
    d.text((bx + 5 * ppm, by - 4 * sy), "5", font=f_detail, fill=(20, 20, 20, 255), anchor="mb")
    d.text((bx + 10 * ppm, by - 4 * sy), "10 m", font=f_detail, fill=(20, 20, 20, 255), anchor="mb")
    nx, ny = panel[2] - 60 * sx, y + 10 * sy
    d.polygon([(nx, ny - 22 * sy), (nx - 12 * sx, ny + 12 * sy), (nx, ny + 4 * sy), (nx + 12 * sx, ny + 12 * sy)], fill=(20, 20, 20, 255))
    d.text((nx, ny - 26 * sy), "N", font=font(round(18 * sx), bold=True), fill=(20, 20, 20, 255), anchor="mb")

    raw.alpha_composite(layer)
    result = draw_bar(raw.convert("RGB"), BAR_STILL)
    result.save(os.path.join(directory, "04_karte.png"))
    print("OK 04_karte.png")


def make_stills(directory):
    for name in STILLS:
        path = os.path.join(directory, name + "_roh.png")
        if not os.path.exists(path):
            print("FEHLT", path)
            continue
        draw_bar(Image.open(path).convert("RGB"), BAR_STILL).save(os.path.join(directory, name + ".png"))
        print("OK", name + ".png")
    if os.path.exists(os.path.join(directory, "04_karte_roh.png")):
        make_map(directory)


def german(value, digits=2):
    return (("%." + str(digits) + "f") % value).replace(".", ",")


def jump_hud(image, frame, info, movement, events):
    """Values of the jump test in the upper left corner."""
    w, h = image.size
    s = h / 720.0
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_title = font(round(16 * s), bold=True)
    f_text = font(round(15 * s))
    g = movement["gravity"]
    lines = [
        ("Werte aus PlayerMovementSettings (GDD 03, 3.1)", f_title),
        ("Laufen %s m/s · Sprunghöhe %s m · g = %s m/s² (fallend × %s)" % (
            german(movement["run_speed"], 1), german(movement["jump_height"], 1), german(g, 2), german(movement["falling_gravity_scale"], 1)), f_text),
        ("v₀ = √(2 · g · h) = %s m/s · Gipfel nach %s s · Luftkontrolle %s" % (
            german(info["v0"], 2), german(info["apex_time"], 2), german(movement["air_control"], 1)), f_text),
        ("t = %s s · Füße %s m über dem Boden · Tempo %s m/s" % (
            german(frame["t"], 2), german(frame["y"], 2), german(frame["speed"], 1)), f_title),
    ]
    widths = [d.textbbox((0, 0), text, font=fnt)[2] for text, fnt in lines]
    x0, y0 = round(16 * s), round(14 * s)
    box = (x0, y0, x0 + max(widths) + round(24 * s), y0 + round(len(lines) * 24 * s + 14 * s))
    d.rounded_rectangle(box, radius=round(8 * s), fill=(18, 20, 26, 200))
    y = y0 + round(9 * s)
    for text, fnt in lines:
        d.text((x0 + round(12 * s), y), text, font=fnt, fill=(255, 255, 255, 255))
        y += round(24 * s)
    recent = [(t_event, name) for name, t_event in events if 0 <= frame["t"] - t_event < 0.8]
    if recent:
        name = max(recent)[1]   # only the latest event, so two close events never overlap
        label = name.replace("Landung auf", "Landung auf der Plattform")
        f_big = font(round(26 * s), bold=True)
        tw = d.textbbox((0, 0), label, font=f_big)[2]
        bx = (w - tw) // 2
        d.rounded_rectangle((bx - 14 * s, 150 * s, bx + tw + 14 * s, 192 * s), radius=round(8 * s), fill=(255, 205, 60, 235))
        d.text((bx, 171 * s), label, font=f_big, fill=(20, 20, 20, 255), anchor="lm")
    base = image.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


def make_video(directory, name, fps):
    frames_dir = os.path.join(directory, name + "_frames")
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))
    if not files:
        print("FEHLT", frames_dir)
        return 1
    jump = None
    if name.startswith("06"):
        with open(os.path.join(directory, "06_sprungtest_bahn.json"), encoding="utf-8") as f:
            jump = json.load(f)
        events = []
        for event in jump["info"]["events"]:
            label = event[0]
            if label.startswith("Absprung "):
                label = label[len("Absprung "):] + ". Absprung"
            if label.startswith("Landung auf "):
                label = "Landung auf " + label[len("Landung auf "):].replace(".", ",")
            events.append((label, event[1]))
    bar_text = BAR_JUMP if jump else BAR_FLIGHT
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("FEHLER: ffmpeg nicht gefunden")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        for i, file in enumerate(files):
            image = Image.open(os.path.join(frames_dir, file)).convert("RGB")
            if jump:
                index = int(os.path.splitext(file)[0])
                image = jump_hud(image, jump["frames"][index], jump["info"], jump["movement"], events)
            draw_bar(image, bar_text).save(os.path.join(tmp, "%05d.png" % i), compress_level=1)
        out = os.path.join(directory, name + ".mp4")
        command = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp, "%05d.png"),
                   "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
        subprocess.run(command, check=True)
    print("OK", out, len(files), "Bilder")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Vorschau-Bilder und -Videos nachbearbeiten.")
    parser.add_argument("was", choices=["bilder", "video"])
    parser.add_argument("--dir", required=True, help="Ausgabeordner der Renderings")
    parser.add_argument("--name", help="05_rundflug oder 06_sprungtest")
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    if args.was == "bilder":
        make_stills(args.dir)
        return 0
    return make_video(args.dir, args.name, args.fps)


if __name__ == "__main__":
    sys.exit(main())
