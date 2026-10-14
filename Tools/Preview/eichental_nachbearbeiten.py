#!/usr/bin/env python3
"""Post-processing of the Eichental preview renders (needs Pillow; the video also needs ffmpeg with libx264).

- Stills get the bar "Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)"; the overview gets small
  name tags of the main places (screen positions from eichental_uebersicht_daten.json, written by eichental_preview.py).
- The map gets the location zones (AreaTrigger) with names, NPC markers, enemy groups, chests, quest objects, trails, the player
  start, the playable bounds, a legend, a scale bar and a north arrow (positions from eichental_karte_daten.json). A check warns
  when a name sign covers another sign or a zone it does not belong to.
- The flight frames become eichental_rundflug.mp4 (H.264, 1280x720, 30 fps; frames rendered at a lower rate are interpolated
  with ffmpeg minterpolate).

Usage:
    python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir OUTPUT_DIR [--video] [--render-fps 12]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LAYOUT = os.path.join(REPO, "Assets", "_Project", "Data", "Regions", "Eichental", "eichental_layout.json")

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/Library/Fonts", "C:/Windows/Fonts"]
BAR_STILL = "Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)"
BAR_VIDEO = BAR_STILL

# Label position of each location on the 1600 px map: offset of the label box from the zone centre (pixels). A sign must not
# cover another sign or a zone other than its own and the zones around it (check_labels prints a warning).
MAP_LABEL_OFFSETS = {
    "loc.eichental.dorf_eichental": (330, 70),
    "loc.eichental.dorfplatz": (-40, 215),
    "loc.eichental.dorfrand": (-190, 116),
    "loc.eichental.riss_eichental": (250, -95),
    "loc.eichental.lindenhain": (-170, -184),
    "loc.eichental.gasthaus_krummer_kessel": (225, -200),
    "loc.eichental.wachposten_lindenhain": (-54, 118),
    "loc.eichental.hof_hollmann": (255, 45),
    "loc.eichental.nordhang": (-110, -150),
    "loc.eichental.wolfsbau_nordhang": (300, -150),
    "loc.eichental.vergessene_gruft": (275, 55),
    "loc.eichental.muehle_muehlbach": (270, 200),
    "loc.eichental.rabenfels_spitze": (330, -95),
}

TRAIL_COLOR = (186, 120, 255)

# Quest short names for the map labels.
QUEST_SHORT = {
    "quest.main.asche_ueber_eichental": "Q1 Asche",
    "quest.side.eichental.woelfe_vom_nordhang": "Q2 Wölfe",
    "quest.dungeon.eichental.vergessene_gruft": "Q7 Gruft",
}

MARKER_STYLE = {
    "npc_always": ((242, 163, 58), "circle"),
    "npc_prolog": ((255, 214, 120), "circle"),
    "npc_after_prolog": ((200, 120, 40), "circle"),
    "spawn_always": ((220, 40, 30), "circle"),
    "spawn_quest": ((255, 140, 150), "circle"),
    "chest": ((140, 85, 40), "square"),
    "quest": ((245, 208, 107), "diamond"),
    "start": ((255, 255, 255), "ring"),
    "trail": (TRAIL_COLOR, "circle"),
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
    bar = max(26, round(h * 0.036))
    overlay = Image.new("RGBA", (w, bar), (18, 20, 26, 220))
    d = ImageDraw.Draw(overlay)
    d.text((round(bar * 0.5), bar // 2), text, fill=(255, 255, 255, 255), font=font(round(bar * 0.52)), anchor="lm")
    d.text((w - round(bar * 0.5), bar // 2), right_text, fill=(200, 205, 215, 255), font=font(round(bar * 0.45)), anchor="rm")
    base = image.convert("RGBA")
    base.alpha_composite(overlay, (0, h - bar))
    return base.convert("RGB")


def tag(draw, x, y, text, size, anchor_dot=True):
    """White name tag with a dark border above a point."""
    f = font(size, bold=True)
    tw = draw.textbbox((0, 0), text, font=f)[2]
    pad = size * 0.35
    box = (x - tw / 2 - pad, y - size * 2.3, x + tw / 2 + pad, y - size * 0.75)
    draw.line((x, y, x, box[3]), fill=(25, 25, 25, 230), width=max(1, size // 9))
    draw.rounded_rectangle(box, radius=size * 0.3, fill=(255, 255, 255, 235), outline=(40, 40, 40, 255), width=1)
    draw.text((x, (box[1] + box[3]) / 2), text, font=f, fill=(20, 20, 20, 255), anchor="mm")
    if anchor_dot:
        r = size * 0.22
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 220, 60, 255), outline=(20, 20, 20, 255))


def make_overview(directory):
    raw = os.path.join(directory, "eichental_uebersicht_roh.png")
    if not os.path.exists(raw):
        print("FEHLT", raw)
        return
    image = Image.open(raw).convert("RGBA")
    data_path = os.path.join(directory, "eichental_uebersicht_daten.json")
    if os.path.exists(data_path):
        with open(data_path, encoding="utf-8") as f:
            data = json.load(f)
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        size = round(image.size[1] / 52)
        for item in data["tags"]:
            if 0.02 < item["u"] < 0.98 and 0.08 < item["v"] < 0.97 and item["depth"] > 0:
                tag(d, item["u"] * image.size[0], (1 - item["v"]) * image.size[1], item["text"], size)
        image.alpha_composite(layer)
    draw_bar(image.convert("RGB"), BAR_STILL).save(os.path.join(directory, "eichental_uebersicht.png"))
    print("OK eichental_uebersicht.png")


def make_still(directory, name):
    raw = os.path.join(directory, name + "_roh.png")
    if not os.path.exists(raw):
        print("FEHLT", raw)
        return
    draw_bar(Image.open(raw).convert("RGB"), BAR_STILL).save(os.path.join(directory, name + ".png"))
    print("OK", name + ".png")


def marker(d, kind, x, y, s):
    color, shape = MARKER_STYLE.get(kind, ((255, 255, 255), "circle"))
    r = s
    if shape == "circle":
        d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,), outline=(20, 20, 20, 255), width=max(1, round(s / 4)))
    elif shape == "square":
        d.rectangle((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=color + (255,), outline=(255, 255, 255, 255), width=max(1, round(s / 4)))
    elif shape == "diamond":
        d.polygon([(x, y - r * 1.2), (x + r, y), (x, y + r * 1.2), (x - r, y)], fill=color + (255,), outline=(20, 20, 20, 255))
    elif shape == "ring":
        d.ellipse((x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6), outline=(20, 20, 20, 255), width=max(2, round(s / 2)) + 2)
        d.ellipse((x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6), outline=color + (255,), width=max(2, round(s / 2)))


def dashed_rect(d, box, color, width, dash):
    x0, y0, x1, y1 = box
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = max(abs(bx - ax), abs(by - ay))
        steps = int(length // (dash * 2))
        for i in range(steps + 1):
            t0 = i * dash * 2 / length
            t1 = min(1.0, (i * dash * 2 + dash) / length)
            d.line((ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1), fill=color, width=width)


def label_boxes(d, data, layout, k, f_name, f_detail):
    """Box, anchor and text lines of every zone label (the same numbers make_map draws)."""
    quests = {loc["id"]: loc.get("quests", []) for loc in layout["locations"]}
    out = {}
    for loc in data["locations"]:
        ax, ay = loc["center"]
        dx, dy = MAP_LABEL_OFFSETS.get(loc["id"], (0, -60))
        cx, cy = ax + dx * k, ay + dy * k
        short = ", ".join(QUEST_SHORT.get(q, q) for q in quests.get(loc["id"], []))
        lines = [(loc["name"], f_name), (loc["id"].replace("loc.eichental.", "loc.…") + (" · " + short if short else ""), f_detail)]
        widths = [d.textbbox((0, 0), t, font=fnt)[2] for t, fnt in lines]
        heights = [fnt.size + 6 * k for _, fnt in lines]
        bw, bh = max(widths) + 20 * k, sum(heights) + 10 * k
        out[loc["id"]] = {"box": (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), "anchor": (ax, ay), "label": (cx, cy),
                          "lines": lines, "heights": heights}
    return out


def _box_hits_zone(box, zone):
    if zone["shape"] == "circle":
        cx, cy = zone["center"]
        x = min(max(cx, box[0]), box[2])
        y = min(max(cy, box[1]), box[3])
        return (x - cx) ** 2 + (y - cy) ** 2 < zone["radius"] ** 2
    xs = [p[0] for p in zone["corners"]]
    ys = [p[1] for p in zone["corners"]]
    return not (box[2] < min(xs) or max(xs) < box[0] or box[3] < min(ys) or max(ys) < box[1])


def _point_in_zone(point, zone):
    if zone["shape"] == "circle":
        return (point[0] - zone["center"][0]) ** 2 + (point[1] - zone["center"][1]) ** 2 <= zone["radius"] ** 2
    xs = [p[0] for p in zone["corners"]]
    ys = [p[1] for p in zone["corners"]]
    return min(xs) <= point[0] <= max(xs) and min(ys) <= point[1] <= max(ys)


def check_labels(boxes, zones):
    """Problems of the sign layout: a sign covers another sign, or a zone that is neither its own nor one around its zone."""
    problems = []
    ids = list(boxes)
    for i, lid in enumerate(ids):
        box = boxes[lid]["box"]
        for oid in ids[i + 1:]:
            other = boxes[oid]["box"]
            if not (box[2] <= other[0] or other[2] <= box[0] or box[3] <= other[1] or other[3] <= box[1]):
                problems.append("Schild %s überdeckt Schild %s" % (lid, oid))
        for zone in zones:
            if zone["id"] == lid or _point_in_zone(boxes[lid]["anchor"], zone):
                continue
            if _box_hits_zone(box, zone):
                problems.append("Schild %s überdeckt die Zone %s" % (lid, zone["id"]))
    return problems


def make_map(directory):
    raw_path = os.path.join(directory, "eichental_karte_roh.png")
    data_path = os.path.join(directory, "eichental_karte_daten.json")
    if not (os.path.exists(raw_path) and os.path.exists(data_path)):
        print("FEHLT Karte")
        return
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)
    with open(LAYOUT, encoding="utf-8") as f:
        layout = json.load(f)
    raw = Image.open(raw_path).convert("RGBA")
    size = raw.size[0]
    k = size / 1600.0
    panel_w = round(700 * k)
    canvas = Image.new("RGBA", (size + panel_w, size), (244, 241, 234, 255))
    canvas.alpha_composite(raw, (0, 0))
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # Playable bounds.
    (bx0, by0), (bx1, by1) = data["bounds"]
    dashed_rect(d, (bx0, by0, bx1, by1), (255, 255, 255, 230), max(2, round(3 * k)), 14 * k)

    # Location zones.
    zone_fill = (255, 214, 64, 46)
    zone_line = (255, 214, 64, 235)
    for loc in data["locations"]:
        if loc["shape"] == "circle":
            cx, cy = loc["center"]
            r = loc["radius"]
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=zone_fill, outline=zone_line, width=max(2, round(3 * k)))
        else:
            d.polygon([tuple(p) for p in loc["corners"]], fill=zone_fill, outline=zone_line, width=max(2, round(3 * k)))

    # Trails ("Folge der Spur"): dotted line through the nodes, a ring per node trigger.
    for trail in data.get("trails", []):
        pts = trail["points"]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            length = max(1.0, ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5)
            step = 9 * k
            n = int(length // (step * 2)) + 1
            for i in range(n):
                t0 = min(1.0, i * step * 2 / length)
                t1 = min(1.0, (i * step * 2 + step) / length)
                d.line((x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1), fill=TRAIL_COLOR + (255,),
                       width=max(2, round(4 * k)))
        for x, y in pts:
            r = trail["radius"]
            d.ellipse((x - r, y - r, x + r, y + r), outline=TRAIL_COLOR + (255,), width=max(1, round(2 * k)))
            marker(d, "trail", x, y, 4 * k)

    # Markers.
    for m in data["markers"]:
        marker(d, m["type"], m["p"][0], m["p"][1], 7 * k if m["type"] != "start" else 7 * k)
    rx, ry = data["rift"]
    d.ellipse((rx - 14 * k, ry - 14 * k, rx + 14 * k, ry + 14 * k), outline=(47, 230, 214, 255), width=max(2, round(4 * k)))

    # River names.
    f_water = font(round(19 * k), bold=True)
    for label in data["labels"]:
        x, y = label["p"]
        d.text((x, y - 22 * k), label["text"], font=f_water, fill=(220, 240, 255, 255), anchor="mm", stroke_width=max(2, round(3 * k)),
               stroke_fill=(30, 60, 80, 255))

    # Trail names at the last node.
    f_trail = font(round(16 * k), bold=True)
    for trail in data.get("trails", []):
        x, y = trail["points"][-1]
        d.text((x + 10 * k, y - 10 * k), trail["name"], font=f_trail, fill=(250, 240, 255, 255), anchor="ld", stroke_width=max(2, round(3 * k)),
               stroke_fill=(60, 30, 90, 255))

    # Zone labels with leader lines.
    f_name = font(round(21 * k), bold=True)
    f_detail = font(round(16 * k))
    boxes = label_boxes(d, data, layout, k, f_name, f_detail)
    for problem in check_labels(boxes, data["locations"]):
        print("WARNUNG Karte:", problem)
    for loc in data["locations"]:
        entry = boxes[loc["id"]]
        ax, ay = entry["anchor"]
        cx, cy = entry["label"]
        lines = entry["lines"]
        heights = entry["heights"]
        box = entry["box"]
        d.line((ax, ay, cx, cy), fill=(25, 25, 25, 235), width=max(2, round(2.5 * k)))
        r = 5 * k
        d.ellipse((ax - r, ay - r, ax + r, ay + r), fill=(255, 214, 64, 255), outline=(20, 20, 20, 255))
        d.rounded_rectangle(box, radius=7 * k, fill=(255, 255, 255, 240), outline=(40, 40, 40, 255), width=max(1, round(1.5 * k)))
        y = box[1] + 5 * k
        for (text, fnt), lh in zip(lines, heights):
            d.text((cx, y), text, font=fnt, fill=(20, 20, 20, 255) if fnt is f_name else (70, 70, 70, 255), anchor="ma")
            y += lh

    # Legend panel.
    x0 = size + 30 * k
    y = 34 * k
    d.text((x0, y), "Eichental – Mini-Slice", font=font(round(38 * k), bold=True), fill=(20, 20, 20, 255))
    y += 52 * k
    d.text((x0, y), "Draufsicht, Norden oben · Blockout aus eichental_layout.json", font=font(round(18 * k)), fill=(60, 60, 60, 255))
    y += 46 * k
    d.text((x0, y), "Zeichen", font=font(round(22 * k), bold=True), fill=(20, 20, 20, 255))
    y += 36 * k
    entries = [
        ("zone", "Ort / Quest-Zone (AreaTrigger, gelb)"),
        ("npc_always", "NPC-Marker (Platzhalter)"),
        ("npc_prolog", "NPC-Marker nur im Prolog"),
        ("npc_after_prolog", "NPC-Marker nach dem Prolog"),
        ("spawn_always", "Wölfe, von Anfang an da"),
        ("spawn_quest", "Gegner, erscheinen per Quest"),
        ("chest", "Truhe"),
        ("quest", "Quest-Objekt (Hinweis, Ziel, Tür …)"),
        ("trail", "Spur „Folge der Spur“ (Knoten = Auslöser)"),
        ("start", "Spieler-Start (Erwachen im Dorf)"),
        ("rift", "Riss mit Aether-Krater (türkis)"),
        ("bounds", "Rand des begehbaren Bereichs"),
    ]
    f_leg = font(round(19 * k))
    for kind, text in entries:
        mx, my = x0 + 14 * k, y + 12 * k
        if kind == "zone":
            d.ellipse((mx - 12 * k, my - 12 * k, mx + 12 * k, my + 12 * k), fill=(255, 214, 64, 90), outline=zone_line, width=max(2, round(3 * k)))
        elif kind == "rift":
            d.ellipse((mx - 11 * k, my - 11 * k, mx + 11 * k, my + 11 * k), outline=(47, 230, 214, 255), width=max(2, round(4 * k)))
        elif kind == "bounds":
            d.rectangle((mx - 13 * k, my - 9 * k, mx + 13 * k, my + 9 * k), fill=(120, 140, 90, 255))
            dashed_rect(d, (mx - 13 * k, my - 9 * k, mx + 13 * k, my + 9 * k), (255, 255, 255, 255), max(2, round(2 * k)), 4 * k)
        else:
            if kind == "start":
                d.rectangle((mx - 15 * k, my - 15 * k, mx + 15 * k, my + 15 * k), fill=(120, 140, 90, 255))
            marker(d, kind, mx, my, 8 * k)
        d.text((x0 + 40 * k, my), text, font=f_leg, fill=(20, 20, 20, 255), anchor="lm")
        y += 36 * k
    y += 14 * k
    d.text((x0, y), "Gebäude (Dachfarbe)", font=font(round(22 * k), bold=True), fill=(20, 20, 20, 255))
    y += 34 * k
    for color, text in (((185, 151, 78), "intakt: Stroh- oder Schindeldach"), ((28, 23, 20), "verbrannt: Dach zum Teil weg, Glut"),
                        ((90, 79, 69), "eingestürzt: nur Mauerreste")):
        d.rectangle((x0 + 2 * k, y + 2 * k, x0 + 26 * k, y + 22 * k), fill=color + (255,), outline=(40, 40, 40, 255))
        d.text((x0 + 40 * k, y + 12 * k), text, font=f_leg, fill=(20, 20, 20, 255), anchor="lm")
        y += 34 * k
    y += 14 * k
    d.text((x0, y), "Zahlen aus der Datei", font=font(round(22 * k), bold=True), fill=(20, 20, 20, 255))
    y += 34 * k
    facts = [
        "Begehbar 400 × 400 m, Terrain 512 × 512 m (= 1 Zelle)",
        "Laufen 5 m/s: 80 s quer, 113 s diagonal",
        "%d Orte · %d Gebäude · %d Truhen" % (len(layout["locations"]), len(layout["buildings"]), len(layout["chests"])),
        "%d Gegnergruppen · %d NPC-Marker · %d Quest-Objekte" % (len(layout["spawners"]), len(layout["npcMarkers"]),
                                                               len(layout["questObjects"])),
        "%d Spuren mit %d Knoten" % (len(layout.get("trails", [])), sum(len(t["nodes"]) for t in layout.get("trails", []))),
        "Quests: Q1 Asche über Eichental · Q2 Die Wölfe",
        "vom Nordhang · Q7 Die vergessene Gruft (Eingang)",
    ]
    for line in facts:
        d.text((x0, y), "• " + line, font=f_leg, fill=(20, 20, 20, 255))
        y += 30 * k

    # Scale bar (50 m) and north arrow.
    ppm = data["pixels_per_meter"]
    y += 36 * k
    bx, byy = x0 + 6 * k, y
    for i in range(5):
        fill = (20, 20, 20, 255) if i % 2 == 0 else (255, 255, 255, 255)
        d.rectangle((bx + i * 10 * ppm, byy, bx + (i + 1) * 10 * ppm, byy + 10 * k), fill=fill, outline=(20, 20, 20, 255))
    f_small = font(round(16 * k))
    for i, label in ((0, "0"), (2, "20"), (5, "50 m")):
        d.text((bx + i * 10 * ppm, byy - 6 * k), label, font=f_small, fill=(20, 20, 20, 255), anchor="mb")
    nx, ny = size + panel_w - 70 * k, byy - 10 * k
    d.polygon([(nx, ny - 30 * k), (nx - 16 * k, ny + 16 * k), (nx, ny + 5 * k), (nx + 16 * k, ny + 16 * k)], fill=(20, 20, 20, 255))
    d.text((nx, ny - 36 * k), "N", font=font(round(24 * k), bold=True), fill=(20, 20, 20, 255), anchor="mb")

    canvas.alpha_composite(layer)
    result = draw_bar(canvas.convert("RGB"), BAR_STILL)
    result.save(os.path.join(directory, "eichental_karte.png"))
    print("OK eichental_karte.png")


def make_video(directory, render_fps):
    frames_dir = os.path.join(directory, "eichental_rundflug_frames")
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png")) if os.path.isdir(frames_dir) else []
    if not files:
        print("FEHLT", frames_dir)
        return 1
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("FEHLER: ffmpeg nicht gefunden")
        return 1
    out = os.path.join(directory, "eichental_rundflug.mp4")
    with tempfile.TemporaryDirectory() as tmp:
        for i, file in enumerate(files):
            draw_bar(Image.open(os.path.join(frames_dir, file)).convert("RGB"), BAR_VIDEO).save(os.path.join(tmp, "%05d.png" % i),
                                                                                               compress_level=1)
        filters = "hqdn3d=2:2:3:3"
        if render_fps < 30:
            filters = "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1," + filters
        command = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(render_fps), "-i", os.path.join(tmp, "%05d.png"),
                   "-vf", filters, "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
                   "-movflags", "+faststart", out]
        subprocess.run(command, check=True)
    print("OK", out, len(files), "Bilder mit", render_fps, "fps gerendert")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Eichental-Vorschau nachbearbeiten.")
    parser.add_argument("--dir", required=True, help="Ausgabeordner der Renderings")
    parser.add_argument("--video", action="store_true", help="auch das Video bauen")
    parser.add_argument("--render-fps", type=int, default=12, help="Bildrate, mit der die Einzelbilder gerendert wurden")
    args = parser.parse_args()
    make_overview(args.dir)
    make_still(args.dir, "eichental_dorf")
    make_map(args.dir)
    if args.video:
        return make_video(args.dir, args.render_fps)
    return 0


if __name__ == "__main__":
    sys.exit(main())
