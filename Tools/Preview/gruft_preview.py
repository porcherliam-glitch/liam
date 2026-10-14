"""Blender preview of "Die vergessene Gruft", rebuilt from the SAME layout file as the Unity generator.

Reads Assets/_Project/Data/Regions/Eichental/gruft_layout.json, rebuilds rooms, corridors (ramps), walls, lintels and risers
with the rules of DungeonGeometry.cs (mirrored below - change both together), places doors, puzzle objects, lights,
skeletons, the boss and the player like GruftObjectBuilder / GruftEnemyBuilder, and renders three stills:

- gruft_karte.png       top view with labelled rooms, puzzles, boss, exits (Workbench, then labels with Pillow)
- gruft_halle.png       view into the great hall with torch light (Cycles)
- gruft_bossarena.png   the knight in the seal chamber, phase-2 Aether beam (Cycles)

Every image gets the bar "Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)".

Usage:
    blender -b -P Tools/Preview/gruft_preview.py -- --out OUTPUT_DIR [--samples 48] [--only karte,halle,arena] [--test]
    python3 -I Tools/Preview/gruft_preview.py --post --out OUTPUT_DIR      (labels and bar only; run automatically)
"""
import argparse
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
LAYOUT = os.path.join(ROOT, "Assets", "_Project", "Data", "Regions", "Eichental", "gruft_layout.json")
BAR_TEXT = "Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)"

FOUNDATION_DEPTH = 1.0   # DungeonGeometry.FoundationDepth
SLAB_THICKNESS = 0.5     # DungeonGeometry.SlabThickness
HEIGHT_TOLERANCE = 0.05  # DungeonGeometry.HeightTolerance
STEP_FACE = 0.3          # GruftGeometryBuilder.StepFaceThickness

MAP_SIZE = (1000, 2000)
MAP_CENTER = (-6.0, 31.0)
MAP_ORTHO = 124.0


# --------------------------------------------------------------------------------------------------------------------
# Layout and geometry (pure Python, mirrors DungeonGeometry.cs)
# --------------------------------------------------------------------------------------------------------------------

def load_layout(path=LAYOUT):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


class Piece:
    def __init__(self, owner, is_room, min_x, max_x, min_z, max_z, along_x, y_min, y_max, height):
        self.owner = owner
        self.is_room = is_room
        self.min_x, self.max_x = min(min_x, max_x), max(min_x, max_x)
        self.min_z, self.max_z = min(min_z, max_z), max(min_z, max_z)
        self.along_x = along_x
        self.y_min = y_min
        self.y_max = y_max
        self.height = height

    @property
    def sloped(self):
        return abs(self.y_max - self.y_min) > 1e-4

    def contains(self, x, z):
        return self.min_x <= x < self.max_x and self.min_z <= z < self.max_z

    def floor_at(self, x, z):
        if not self.sloped:
            return self.y_min
        if self.along_x:
            t = (x - self.min_x) / (self.max_x - self.min_x)
        else:
            t = (z - self.min_z) / (self.max_z - self.min_z)
        t = max(0.0, min(1.0, t))
        return self.y_min + (self.y_max - self.y_min) * t

    def clamped_floor(self, x, z):
        return self.floor_at(max(self.min_x, min(self.max_x, x)), max(self.min_z, min(self.max_z, z)))


def create_pieces(layout):
    pieces = []
    for room in layout["rooms"]:
        y = room.get("floorY", 0.0)
        pieces.append(Piece(room["id"], True, room["x"], room["x"] + room["width"], room["z"], room["z"] + room["depth"], False, y, y,
                            room.get("height", 4.0)))
    for corridor in layout["corridors"]:
        points = corridor["points"]
        half = corridor.get("width", 2.0) * 0.5
        height = corridor.get("height", 3.5)
        count = len(points)
        for i in range(count - 1):
            a, b = points[i], points[i + 1]
            along_x = abs(a[1] - b[1]) < 1e-4
            ax, az, bx, bz = a[0], a[1], b[0], b[1]
            dx = (bx > ax) - (bx < ax)
            dz = (bz > az) - (bz < az)
            if i > 0:
                ax += dx * half
                az += dz * half
            if i + 2 < count:
                bx -= dx * half
                bz -= dz * half
            if along_x:
                inc = bx >= ax
                pieces.append(Piece(corridor["id"], False, min(ax, bx), max(ax, bx), a[1] - half, a[1] + half, True,
                                    a[2] if inc else b[2], b[2] if inc else a[2], height))
            else:
                inc = bz >= az
                pieces.append(Piece(corridor["id"], False, a[0] - half, a[0] + half, min(az, bz), max(az, bz), False,
                                    a[2] if inc else b[2], b[2] if inc else a[2], height))
        for i in range(1, count - 1):
            v = points[i]
            pieces.append(Piece(corridor["id"], False, v[0] - half, v[0] + half, v[1] - half, v[1] + half, False, v[2], v[2], height))
    return pieces


class Geometry:
    def __init__(self, layout):
        self.pieces = create_pieces(layout)
        min_x = min(p.min_x for p in self.pieces)
        min_z = min(p.min_z for p in self.pieces)
        max_x = max(p.max_x for p in self.pieces)
        max_z = max(p.max_z for p in self.pieces)
        self.cell_min_x = int(math.floor(min_x)) - 1
        self.cell_min_z = int(math.floor(min_z)) - 1
        self.cells_x = int(math.ceil(max_x)) + 1 - self.cell_min_x
        self.cells_z = int(math.ceil(max_z)) + 1 - self.cell_min_z
        self.cells = {}
        for iz in range(self.cells_z):
            for ix in range(self.cells_x):
                cx = self.cell_min_x + ix + 0.5
                cz = self.cell_min_z + iz + 0.5
                for index, piece in enumerate(self.pieces):
                    if piece.contains(cx, cz):
                        self.cells[(self.cell_min_x + ix, self.cell_min_z + iz)] = index
                        break
        self.walls = self._build_walls()

    def piece_at_cell(self, cx, cz):
        index = self.cells.get((cx, cz))
        return self.pieces[index] if index is not None else None

    def piece_at(self, x, z):
        for piece in self.pieces:
            if piece.contains(x, z):
                return piece
        return self.piece_at_cell(int(math.floor(x)), int(math.floor(z)))

    def floor_at(self, x, z):
        piece = self.piece_at(x, z)
        return piece.floor_at(x, z) if piece is not None else None

    def floor_near(self, x, z):
        """GruftContext.FloorNear: points on a wall line take the floor next to it."""
        floor = self.floor_at(x, z)
        if floor is not None:
            return floor
        for offset in (0.5, -0.5, 1.0, -1.0):
            for px, pz in ((x + offset, z), (x, z + offset)):
                floor = self.floor_at(px, pz)
                if floor is not None:
                    return floor
        return 0.0

    def _build_walls(self):
        edges = {}
        for (cx, cz), index in self.cells.items():
            piece = self.pieces[index]
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                self._add_edge(edges, piece, cx, cz, dx, dz)
        walls = []
        for key in sorted(edges):
            segments = sorted(edges[key], key=lambda s: s["start"])
            current = None
            for edge in segments:
                if current is not None and abs(edge["start"] - current["end"]) < 1e-4:
                    current["end"] = edge["end"]
                    current["bottom"] = min(current["bottom"], edge["bottom"])
                    current["top"] = max(current["top"], edge["top"])
                    continue
                current = edge
                walls.append(current)
        return walls

    def _add_edge(self, edges, piece, cx, cz, dx, dz):
        along_x = dz != 0
        line = cx + 1 if dx > 0 else cx if dx < 0 else cz + 1 if dz > 0 else cz
        start = cx if along_x else cz
        mid_x = line if dx != 0 else cx + 0.5
        mid_z = line if dz != 0 else cz + 0.5
        facing = dx + dz
        floor = piece.clamped_floor(mid_x, mid_z)
        ceiling = floor + piece.height
        neighbour = self.piece_at_cell(cx + dx, cz + dz)

        def add(kind, bottom, top):
            key = (kind, "x" if along_x else "z", round(line, 3), facing)
            edges.setdefault(key, []).append({"kind": kind, "along_x": along_x, "line": line, "start": start, "end": start + 1.0,
                                              "bottom": bottom, "top": top, "facing": facing})

        if neighbour is None:
            add("wall", floor - FOUNDATION_DEPTH, ceiling)
            return
        if neighbour is piece:
            return
        other_floor = neighbour.clamped_floor(mid_x, mid_z)
        other_ceiling = other_floor + neighbour.height
        if ceiling > other_ceiling + HEIGHT_TOLERANCE:
            add("lintel", other_ceiling, ceiling)
        if other_floor > floor + HEIGHT_TOLERANCE:
            add("riser", floor, other_floor)


def objects_by_id(layout):
    return {o["id"]: o for o in layout["objects"]}


def object_position(geometry, o):
    y = o.get("y")
    base = y if y is not None else geometry.floor_near(o["x"], o["z"])
    return o["x"], base + o.get("height", 0.0), o["z"]


DIRECTIONS = {"N": (0, 1), "E": (1, 0), "O": (1, 0), "S": (0, -1), "W": (-1, 0)}
YAWS = {"N": 0.0, "E": 90.0, "O": 90.0, "S": 180.0, "W": 270.0}


def mirror_solution_path(layout):
    """Beam path of the solved light puzzle (source -> mirrors -> seal), for the map."""
    objects = objects_by_id(layout)
    for puzzle in layout["puzzles"]:
        if puzzle.get("type") != "mirror":
            continue
        path = [objects[puzzle["source"]]]
        path += [objects[m["id"]] for m in puzzle["mirrors"]]
        path.append(objects[puzzle["target"]])
        return [(o["x"], o["z"]) for o in path]
    return []


# --------------------------------------------------------------------------------------------------------------------
# Blender part
# --------------------------------------------------------------------------------------------------------------------

def run_blender(argv):
    import bmesh
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Matrix, Vector

    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--only", default="karte,halle,arena")
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    jobs = [j.strip() for j in args.only.split(",") if j.strip()]

    layout = load_layout()
    geometry = Geometry(layout)
    atmosphere = layout.get("atmosphere", {})
    objects = objects_by_id(layout)

    P4 = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

    def u_euler(x, y, z):
        return (Matrix.Rotation(math.radians(y), 4, "Y") @ Matrix.Rotation(math.radians(x), 4, "X")
                @ Matrix.Rotation(math.radians(z), 4, "Z"))

    def u_trs(position=(0, 0, 0), rotation=None, scale=(1, 1, 1)):
        t = Matrix.Translation(Vector(position))
        r = rotation if rotation is not None else Matrix.Identity(4)
        s = Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0)))
        return t @ r @ s

    def bvec(x, y, z):
        return Vector((x, z, y))

    def srgb_to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    def hex_rgb(text, fallback):
        try:
            text = text.lstrip("#")
            return tuple(int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        except (AttributeError, ValueError):
            return fallback

    torch_rgb = hex_rgb(atmosphere.get("torchColor"), (1.0, 0.6, 0.29))
    aether_rgb = hex_rgb(atmosphere.get("aetherColor"), (0.18, 0.9, 0.84))
    daylight_rgb = hex_rgb(atmosphere.get("daylightColor"), (0.81, 0.87, 1.0))
    stone_rgb = hex_rgb(atmosphere.get("stoneColor"), (0.36, 0.35, 0.32))
    floor_rgb = hex_rgb(atmosphere.get("floorColor"), (0.27, 0.26, 0.24))
    ceiling_rgb = hex_rgb(atmosphere.get("ceilingColor"), (0.18, 0.17, 0.16))
    ambient_rgb = hex_rgb(atmosphere.get("ambientColor"), (0.08, 0.09, 0.12))

    # Same colours as GruftMaterials.cs.
    colors = {
        "wall": stone_rgb, "floor": floor_rgb, "ceiling": ceiling_rgb,
        "trim": tuple(min(1.0, c * 1.35) for c in stone_rgb), "relief": (0.62, 0.58, 0.5), "wood": (0.36, 0.24, 0.14),
        "iron": (0.3, 0.31, 0.33), "bone": (0.82, 0.78, 0.66), "armor": (0.42, 0.4, 0.36), "knight": (0.55, 0.52, 0.44),
        "cloth": (0.42, 0.18, 0.12), "soot": (0.05, 0.05, 0.05), "gold": (0.85, 0.66, 0.25), "mirror": (0.82, 0.88, 0.9),
        "npc": (0.45, 0.36, 0.25), "player": (0.85, 0.9, 0.95), "nose": (0.95, 0.8, 0.2),
    }

    scene = bpy.context.scene
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    root_collection = scene.collection
    collections = {}

    def collection(name):
        if name not in collections:
            col = bpy.data.collections.new(name)
            root_collection.children.link(col)
            collections[name] = col
        return collections[name]

    materials = {}

    def lit(key, rgb=None, roughness=0.85, metallic=0.0):
        name = "Lit " + key
        if name in materials:
            return materials[name]
        rgb = rgb or colors[key]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*[srgb_to_linear(c) for c in rgb], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        mat.diffuse_color = (*[srgb_to_linear(c) for c in rgb], 1.0)
        materials[name] = mat
        return mat

    def glow(key, rgb, strength):
        name = "Glow " + key
        if name in materials:
            return materials[name]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (*[srgb_to_linear(c) for c in rgb], 1.0)
        emission.inputs["Strength"].default_value = strength
        mat.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
        if hasattr(mat, "cycles") and hasattr(mat.cycles, "emission_sampling"):
            mat.cycles.emission_sampling = "NONE"
        mat.diffuse_color = (*rgb, 1.0)
        materials[name] = mat
        return mat

    base_meshes = {}

    def base_mesh(kind):
        if kind in base_meshes:
            return base_meshes[kind]
        bm = bmesh.new()
        if kind == "cube":
            bmesh.ops.create_cube(bm, size=1.0)
        elif kind == "cylinder":
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.5, radius2=0.5, depth=2.0)
        elif kind == "sphere":
            bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.5)
        me = bpy.data.meshes.new("Unity " + kind)
        bm.to_mesh(me)
        bm.free()
        base_meshes[kind] = me
        return me

    mesh_cache = {}

    def prim(kind, name, world_unity, material, col="Objekte", shadow=True):
        key = (kind, material.name)
        if key not in mesh_cache:
            me = base_mesh(kind).copy()
            me.materials.append(material)
            mesh_cache[key] = me
        ob = bpy.data.objects.new(name, mesh_cache[key])
        ob.matrix_world = P4 @ world_unity @ P4
        ob.visible_shadow = shadow
        collection(col).objects.link(ob)
        return ob

    def box(name, center, size, material, yaw=0.0, col="Objekte", shadow=True):
        return prim("cube", name, u_trs(center, u_euler(0, yaw, 0), size), material, col, shadow)

    def local(origin, yaw, offset):
        """Unity: origin + Quaternion.Euler(0, yaw, 0) * offset."""
        r = math.radians(yaw)
        ox, oy, oz = offset
        return (origin[0] + ox * math.cos(r) + oz * math.sin(r), origin[1] + oy, origin[2] - ox * math.sin(r) + oz * math.cos(r))

    def slab_mesh(name, piece, offset, thickness, material, col):
        """Floor (offset 0, below the surface) or ceiling (offset = height, above it) of a piece, ramps included."""
        corners = [(piece.min_x, piece.min_z), (piece.max_x, piece.min_z), (piece.max_x, piece.max_z), (piece.min_x, piece.max_z)]
        top = []
        bottom = []
        for x, z in corners:
            y = piece.floor_at(x, z) + offset
            if offset == 0:
                top.append(bvec(x, y, z))
                bottom.append(bvec(x, y - thickness, z))
            else:
                top.append(bvec(x, y + thickness, z))
                bottom.append(bvec(x, y, z))
        verts = bottom + top
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], faces)
        me.update()
        me.materials.append(material)
        ob = bpy.data.objects.new(name, me)
        collection(col).objects.link(ob)
        return ob

    # ---------------- shell ----------------
    room_tints = {
        "room.vorraum": (0.36, 0.33, 0.28), "room.hallen": (0.3, 0.29, 0.27), "room.seitengang": (0.26, 0.27, 0.3),
        "room.nebenkammer": (0.33, 0.28, 0.3), "room.spiegelsaal": (0.25, 0.3, 0.31), "room.siegelkammer": (0.33, 0.26, 0.24),
        "room.fluchtweg": (0.3, 0.31, 0.27),
    }
    for index, piece in enumerate(geometry.pieces):
        tint = room_tints.get(piece.owner, floor_rgb if piece.is_room else (0.31, 0.3, 0.27))
        slab_mesh("Boden %s %d" % (piece.owner, index), piece, 0.0, SLAB_THICKNESS, lit("floor " + piece.owner, tint, 0.9), "Boeden")
        slab_mesh("Decke %s %d" % (piece.owner, index), piece, piece.height, SLAB_THICKNESS, lit("ceiling"), "Decken")

    wall_thickness = layout.get("wallThickness", 0.6)
    for index, wall in enumerate(geometry.walls):
        kind = wall["kind"]
        thickness = wall_thickness if kind == "wall" else STEP_FACE
        extension = thickness if kind == "wall" else 0.0
        length = (wall["end"] - wall["start"]) + 2 * extension
        height = wall["top"] - wall["bottom"] + (SLAB_THICKNESS if kind == "wall" else 0.0)
        if height <= 0.01:
            continue
        along = (wall["start"] + wall["end"]) * 0.5
        across = wall["line"] + wall["facing"] * thickness * 0.5
        cy = wall["bottom"] + height * 0.5
        if wall["along_x"]:
            box("Wand %d" % index, (along, cy, across), (length, height, thickness), lit("wall"), col="Waende")
        else:
            box("Wand %d" % index, (across, cy, along), (thickness, height, length), lit("wall"), col="Waende")

    # ---------------- doors ----------------
    for door in layout["doors"]:
        x, z = door["x"], door["z"]
        y = door.get("y")
        base = y if y is not None else geometry.floor_near(x, z)
        yaw = 0.0 if door.get("axis", "x") == "x" else 90.0
        width, height = door.get("width", 2.0), door.get("height", 3.0)
        kind = door.get("kind")
        opened = door.get("startsOpen", False)
        if kind == "portcullis":
            lift = (height - 0.3) if opened else 0.0
            bars = max(3, int(round(width / 0.3)))
            for i in range(bars + 1):
                bx = -width * 0.5 + width * i / bars
                box("Gitter", local((x, base + lift, z), yaw, (bx, height * 0.5, 0)), (0.06, height, 0.06), lit("iron", metallic=0.6), yaw)
            for k in range(1, 4):
                box("Gitter quer", local((x, base + lift, z), yaw, (0, height * k / 4.0, 0)), (width, 0.06, 0.08), lit("iron", metallic=0.6), yaw)
        else:
            material = lit("trim") if kind == "stone_gate" else lit("relief") if kind == "seal_door" else lit("wall")
            box("Tuer " + door["id"], (x, base + height * 0.5, z), (width, height, 0.5), material, yaw)

    # ---------------- objects ----------------
    def readable(o, size, material):
        x, y, z = object_position(geometry, o)
        yaw = o.get("yaw", 0.0)
        if o["kind"] == "lore_note":
            box(o["id"], (x, y + 0.01, z), (0.3, 0.02, 0.4), lit("bone"), yaw)
        else:
            box(o["id"], local((x, y, z), yaw, (0, 0, size[2] * 0.5)), size, material, yaw)

    for o in layout["objects"]:
        kind = o["kind"]
        x, y, z = object_position(geometry, o)
        yaw = o.get("yaw", 0.0)
        size = o.get("size")
        sx, sy, sz = size if size else (None, None, None)
        if kind == "grave_slab":
            box("Sockel", (x, y + 0.17, z), (1.3, 0.34, 2.3), lit("wall"), yaw)
            box("Platte", (x, y + 0.38, z), (1.15, 0.08, 2.1), lit("relief"), yaw)
            motif = o.get("relief")
            if motif == "eiche":
                prim("sphere", "Eiche", u_trs((x, y + 0.44, z + 0.2), None, (0.6, 0.06, 0.6)), lit("trim"))
                box("Stamm", (x, y + 0.44, z - 0.35), (0.12, 0.05, 0.6), lit("trim"))
            elif motif == "krone":
                box("Krone", (x, y + 0.44, z - 0.05), (0.6, 0.05, 0.14), lit("gold", metallic=0.7, roughness=0.4))
                for i in range(3):
                    box("Zacke", (x - 0.2 + i * 0.2, y + 0.44, z + 0.15), (0.1, 0.05, 0.26), lit("gold", metallic=0.7, roughness=0.4), 25)
            else:
                box("Schild", (x, y + 0.44, z), (0.5, 0.05, 0.7), lit("iron", metallic=0.6))
        elif kind == "lever":
            box("Hebel Sockel", local((x, y, z), yaw, (0, 0.4, 0)), (0.4, 0.8, 0.3), lit("iron", metallic=0.6), yaw)
            prim("cylinder", "Hebel", u_trs(local((x, y, z), yaw, (0, 1.05, 0.25)), u_euler(-35, yaw, 0), (0.06, 0.35, 0.06)), lit("iron", metallic=0.6))
        elif kind == "pressure_plate":
            box("Druckplatte", (x, y + 0.03, z), (1.2, 0.06, 1.2), lit("relief"))
        elif kind == "mirror":
            mirror_dir = "N"
            for puzzle in layout["puzzles"]:
                for m in puzzle.get("mirrors", []):
                    if m["id"] == o["id"]:
                        mirror_dir = m["start"]
            arena = layout.get("bossArena") or {}
            if arena.get("mirror") == o["id"]:
                mirror_dir = arena.get("mirrorStart", "W")
            myaw = YAWS.get(mirror_dir, 0.0)
            prim("cylinder", "Spiegelstaender", u_trs((x, y + 0.5, z), None, (0.5, 0.5, 0.5)), lit("iron", metallic=0.6))
            box("Spiegelrahmen", local((x, y + 1.2, z), myaw, (0, 0, -0.04)), (1.0, 1.1, 0.08), lit("gold", metallic=0.7, roughness=0.4), myaw)
            box("Spiegelglas", local((x, y + 1.2, z), myaw, (0, 0, 0.01)), (0.85, 0.95, 0.02), lit("mirror", metallic=1.0, roughness=0.05), myaw)
            box("Richtung", local((x, y + 0.58, z), myaw, (0, 0, 0.35)), (0.08, 0.04, 0.5), glow("aether", aether_rgb, 4.0), myaw, shadow=False)
        elif kind == "cage":
            for i in range(12):
                angle = i * math.pi * 2.0 / 12
                prim("cylinder", "Gitterstab", u_trs((x + math.cos(angle) * 0.85, y + 1.1, z + math.sin(angle) * 0.85), None, (0.06, 1.1, 0.06)),
                     lit("iron", metallic=0.6))
            prim("cylinder", "Kaefigdeckel", u_trs((x, y + 2.22, z), None, (1.9, 0.04, 1.9)), lit("iron", metallic=0.6))
        elif kind == "npc":
            prim("cylinder", "Fenn", u_trs((x, y + 0.85, z), None, (0.55, 0.85, 0.55)), lit("npc"))
            prim("sphere", "Fenn Kopf", u_trs((x, y + 1.85, z), None, (0.36, 0.36, 0.36)), lit("bone"))
        elif kind == "seal_stone":
            prim("cylinder", "Siegelstein", u_trs((x, y + 0.12, z), None, (0.45, 0.12, 0.45)), lit("gold", metallic=0.7, roughness=0.35))
            box("Eichenzeichen", (x, y + 0.25, z), (0.22, 0.02, 0.05), glow("aether", aether_rgb, 4.0), shadow=False)
        elif kind == "reward":
            box("Klingenfragment", (x, y + 0.9, z), (0.08, 0.02, 0.7), lit("mirror", metallic=1.0, roughness=0.1), 20)
        elif kind == "chest":
            tier = o.get("tier")
            material = lit("gold", metallic=0.7, roughness=0.4) if tier == "hidden" else lit("iron", metallic=0.6) if tier == "iron" else lit("wood")
            box("Truhe", local((x, y, z), yaw, (0, 0.3, 0)), (1.0, 0.6, 0.6), material, yaw)
            box("Truhendeckel", local((x, y, z), yaw, (0, 0.67, 0)), (1.04, 0.14, 0.64), material, yaw)
        elif kind == "portal":
            box("Pfosten", local((x, y, z), yaw, (-1.6, 1.6, 0)), (0.4, 3.2, 0.4), lit("trim"), yaw)
            box("Pfosten", local((x, y, z), yaw, (1.6, 1.6, 0)), (0.4, 3.2, 0.4), lit("trim"), yaw)
            box("Sturz", local((x, y, z), yaw, (0, 3.3, 0)), (3.6, 0.4, 0.4), lit("trim"), yaw)
            box("Tageslicht", local((x, y, z), yaw, (0, 1.6, -0.15)), (2.8, 3.1, 0.05), glow("daylight", daylight_rgb, 2.5), yaw, shadow=False)
        elif kind == "inscription":
            readable(o, (sx or 2.4, sy or 1.0, 0.08), lit("relief"))
        elif kind == "relief":
            readable(o, (sx or 1.3, sy or 1.3, 0.1), lit("relief"))
            box("Relief Ritter", local((x, y, z), yaw, (0, 0, 0.13)), (0.3, 0.8, 0.05), lit("trim"), yaw)
        elif kind == "lore_tablet":
            readable(o, (sx or 1.0, sy or 1.4, 0.14), lit("relief"))
        elif kind == "lore_note":
            readable(o, (0.3, 0.02, 0.4), lit("bone"))
        elif kind == "trap_slit":
            box("Pfeilschlitz", (x, y, z), (0.5, 0.12, 0.12), lit("soot"), yaw)
        elif kind == "aether_crack":
            if o.get("height", 0.0) <= 0.01:
                box("Aetherriss", (x, y + 0.02, z), (0.25, 0.04, 3.0), glow("aether", aether_rgb, 6.0), yaw, shadow=False)
            else:
                box("Aetherspalt", local((x, y, z), yaw, (0, 0, -0.02)), (0.18, 1.4, 0.08), glow("aether", aether_rgb, 6.0), yaw, shadow=False)
        elif kind == "seal":
            prim("cylinder", "Siegel", u_trs((x, y, z), u_euler(90, yaw, 0), (1.0, 0.04, 1.0)), lit("trim"))
        elif kind == "column":
            h = sy or 4.0
            prim("cylinder", "Saeule", u_trs((x, y + h * 0.5, z), None, (sx or 0.8, h * 0.5, sz or 0.8)), lit("trim"))
        elif kind == "pillar":
            h = sy or 8.0
            box("Pfeiler", (x, y + h * 0.5, z), (sx or 1.2, h, sz or 1.2), lit("wall"), yaw)
        elif kind == "sarcophagus":
            box("Sarkophag", (x, y + 0.45, z), (sx or 1.1, 0.9, sz or 2.3), lit("wall"), yaw)
            box("Sargdeckel", (x, y + 0.97, z), ((sx or 1.1) + 0.12, 0.14, (sz or 2.3) + 0.12), lit("trim"), yaw)
        elif kind == "rubble":
            offsets = ((-0.3, -0.2, 0.7), (0.35, 0.25, 0.5), (0.05, 0.4, 0.4), (-0.4, 0.35, 0.35))
            for i, (ox, oz, s) in enumerate(offsets):
                box("Geroell", (x + ox * (sx or 2.0), y + s * 0.5, z + oz * (sz or 2.0)), (s, s, s), lit("wall"), i * 37)
        elif kind == "soot":
            box("Russ", (x, y + 0.01, z), (sx or 0.5, 0.02, sz or 1.8), lit("soot"), yaw)
        elif kind == "altar":
            box("Altar", (x, y + 0.5, z), (sx or 2.0, 1.0, sz or 1.2), lit("trim"), yaw)
        elif kind == "climb_marker":
            box("Kiste", (x, y + 0.28, z), (1.0, 0.56, 1.0), lit("wood"), yaw)

    # ---------------- figures ----------------
    def figure(name, position, yaw, scale, knight, tower_shield, telegraph=False):
        x, y, z = position
        s = scale
        hip = (x, y + 0.95 * s, z)
        torso_mat = lit("knight", metallic=0.5, roughness=0.5) if knight else lit("armor", metallic=0.4, roughness=0.6)
        lean = -14.0 if telegraph else 0.0

        def part(kind, offset, size, material):
            # Body pivot at the hips (EnemyVisuals rears the body up on the telegraph).
            rx = math.radians(lean)
            ox, oy, oz = offset
            oy2 = oy * math.cos(rx) - oz * math.sin(rx)
            oz2 = oy * math.sin(rx) + oz * math.cos(rx)
            p = local(hip, yaw, (ox * s, oy2 * s, oz2 * s))
            return prim(kind, name, u_trs(p, u_euler(lean, yaw, 0), (size[0] * s, size[1] * s, size[2] * s)), material, "Figuren")

        part("cube", (0, 0.32, 0), (0.5, 0.62, 0.28), torso_mat)
        part("sphere", (0, 0.82, 0), (0.3, 0.32, 0.3), lit("bone"))
        if knight:
            part("cylinder", (0, 0.9, 0), (0.36, 0.1, 0.36), torso_mat)
            part("cube", (0, 0.05, 0.15), (0.42, 0.8, 0.03), lit("cloth"))
        part("cube", (0.33, 0.3, 0.05), (0.12, 0.6, 0.12), lit("bone"))
        part("cube", (-0.33, 0.3, 0.05), (0.12, 0.6, 0.12), lit("bone"))
        part("cube", (0.12, -0.48, 0), (0.14, 0.92, 0.14), lit("bone"))
        part("cube", (-0.12, -0.48, 0), (0.14, 0.92, 0.14), lit("bone"))
        part("cube", (0.36, 0.05, 0.7), (0.06, 0.1, 1.0), lit("iron", metallic=0.7, roughness=0.3))
        if tower_shield:
            part("cube", (-0.36, 0.15, 0.3), (0.75, 1.35, 0.08), torso_mat if knight else lit("wood"))
        if telegraph:
            # Telegraph colour of the knight's shield bash (GDD 03 9.5).
            part("sphere", (0, 0.82, 0.18), (0.08, 0.05, 0.02), glow("telegraph", (1.0, 0.75, 0.2), 8.0))

    def player(position, yaw):
        x, y, z = position
        prim("cylinder", "Spieler", u_trs((x, y + 0.9, z), None, (0.7, 0.9, 0.7)), lit("player"), "Figuren")
        box("Nase", local((x, y, z), yaw, (0, 1.45, 0.45)), (0.18, 0.12, 0.3), lit("nose"), yaw, "Figuren")
        box("Schwert", local((x, y, z), yaw, (0.42, 1.15, 0.75)), (0.06, 0.12, 1.0), lit("iron", metallic=0.7, roughness=0.3), yaw, "Figuren")
        box("Schild", local((x, y, z), yaw, (-0.45, 1.1, 0.22)), (0.55, 0.7, 0.08), lit("wood"), yaw, "Figuren")

    for spawner in layout["spawners"]:
        for enemy in spawner["enemies"]:
            p = (enemy["x"], geometry.floor_near(enemy["x"], enemy["z"]), enemy["z"])
            figure("Skelett " + enemy["number"], p, enemy.get("yaw", 0.0), 1.0, False, enemy.get("towerShield", False))
    arena = layout.get("bossArena")
    if arena:
        p = (arena["x"], geometry.floor_near(arena["x"], arena["z"]), arena["z"])
        figure("Der Wachende Ritter", p, arena.get("yaw", 180.0), 1.22, True, True, telegraph=True)
    spawn = layout["spawn"]
    spawn_position = (spawn["x"], geometry.floor_near(spawn["x"], spawn["z"]), spawn["z"])
    player(spawn_position, spawn.get("yaw", 0.0))
    arena_player = None
    if arena:
        area = arena["encounterArea"]
        px, pz = arena["x"] + 0.6, area["z"] + 3.5
        arena_player = (px, geometry.floor_near(px, pz), pz)
        player(arena_player, 0.0)

    # ---------------- beams ----------------
    def beam(points, name, strength=6.0, col="Strahlen", width=0.12):
        for a, b in zip(points[:-1], points[1:]):
            mx, my, mz = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5
            length = math.dist((a[0], a[2]), (b[0], b[2]))
            yaw = math.degrees(math.atan2(b[0] - a[0], b[2] - a[2]))
            box(name, (mx, my, mz), (width, width, length), glow("beam", aether_rgb, strength), yaw, col, shadow=False)

    solution = mirror_solution_path(layout)
    if solution:
        hy = geometry.floor_near(solution[0][0], solution[0][1]) + 1.2
        beam([(x, hy, z) for x, z in solution], "Loesungsweg", 6.0, "Loesung")
    if arena:
        source = objects.get(arena.get("beamSource"))
        mirror = objects.get(arena.get("mirror"))
        if source and mirror:
            sy_ = object_position(geometry, source)[1]
            room = next(r for r in layout["rooms"] if r["id"] == arena["room"])
            direction = DIRECTIONS.get(arena.get("mirrorStart", "W"), (-1, 0))
            end_x = room["x"] if direction[0] < 0 else room["x"] + room["width"] if direction[0] > 0 else mirror["x"]
            end_z = room["z"] if direction[1] < 0 else room["z"] + room["depth"] if direction[1] > 0 else mirror["z"]
            beam([(source["x"], sy_, source["z"]), (mirror["x"], sy_, mirror["z"]), (end_x, sy_, end_z)], "Arena-Strahl", 8.0, "ArenaStrahl", 0.14)

    # ---------------- lights ----------------
    light_objects = []
    for index, entry in enumerate(layout["lights"]):
        kind = entry.get("kind", "torch")
        x, z = entry["x"], entry["z"]
        base = entry.get("y")
        base = base if base is not None else geometry.floor_near(x, z)
        height = entry.get("height")
        if height is None:
            height = 1.3 if kind == "brazier" else 2.2
        position = (x, base + height, z)
        rgb = hex_rgb(entry.get("color"), aether_rgb if kind == "aether" else daylight_rgb if kind == "daylight" else torch_rgb)
        data = bpy.data.lights.new("Licht %d" % index, "POINT")
        data.color = rgb
        factor = {"torch": 70.0, "brazier": 110.0, "aether": 45.0, "daylight": 160.0}.get(kind, 60.0)
        data.energy = entry.get("intensity", 1.0) * factor * (entry.get("range", 8.0) / 8.0) ** 2
        data.shadow_soft_size = 0.12
        if hasattr(data, "use_custom_distance"):
            data.use_custom_distance = True
            data.cutoff_distance = entry.get("range", 8.0) * 1.6
        ob = bpy.data.objects.new("Licht %d" % index, data)
        ob.location = bvec(*position)
        collection("Lampen").objects.link(ob)
        light_objects.append(ob)
        if kind == "torch":
            prim("cylinder", "Fackel", u_trs((x, position[1] - 0.3, z), None, (0.06, 0.25, 0.06)), lit("wood"), "Lichter")
            prim("sphere", "Flamme", u_trs((x, position[1] + 0.02, z), None, (0.16, 0.24, 0.16)), glow("flame", torch_rgb, 12.0), "Lichter", False)
        elif kind == "brazier":
            prim("cylinder", "Feuerschale Fuss", u_trs((x, base + 0.45, z), None, (0.18, 0.45, 0.18)), lit("iron", metallic=0.6), "Lichter")
            prim("cylinder", "Feuerschale", u_trs((x, position[1] - 0.35, z), None, (0.8, 0.08, 0.8)), lit("iron", metallic=0.6), "Lichter")
            prim("sphere", "Glut", u_trs((x, position[1] - 0.2, z), None, (0.5, 0.25, 0.5)), glow("flame", torch_rgb, 12.0), "Lichter", False)

    # ---------------- world and render settings ----------------
    world = bpy.data.worlds.new("Gruft")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]

    def set_cycles(samples):
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = max(8, samples // 4) if args.test else samples
        scene.cycles.use_denoising = False
        scene.cycles.use_adaptive_sampling = True
        scene.cycles.max_bounces = 3
        scene.cycles.diffuse_bounces = 2
        scene.cycles.glossy_bounces = 1
        scene.cycles.transmission_bounces = 0
        scene.cycles.volume_bounces = 0
        scene.cycles.caustics_reflective = False
        scene.cycles.caustics_refractive = False
        scene.cycles.blur_glossy = 1.0
        scene.cycles.sample_clamp_indirect = 4.0
        try:
            scene.view_settings.view_transform = "Filmic"
            scene.view_settings.look = "Medium High Contrast"
        except TypeError:
            scene.view_settings.view_transform = "Standard"
        scene.view_settings.exposure = 0.6

    def camera(name, location_unity, target_unity, fov_deg, ortho=None, size=(1600, 900)):
        data = bpy.data.cameras.new(name)
        if ortho:
            data.type = "ORTHO"
            data.ortho_scale = ortho
        else:
            data.sensor_fit = "VERTICAL"
            data.angle = math.radians(fov_deg)
        data.clip_start = 0.1
        data.clip_end = 400.0
        ob = bpy.data.objects.new(name, data)
        root_collection.objects.link(ob)
        loc = bvec(*location_unity)
        ob.location = loc
        direction = bvec(*target_unity) - loc
        ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.camera = ob
        scene.render.resolution_x, scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        return ob

    def show(name, visible):
        if name in collections:
            collections[name].hide_render = not visible

    def render(path):
        scene.render.filepath = path
        scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        print("[gruft_preview] gerendert:", path)

    # ---------------- karte ----------------
    if "karte" in jobs:
        # Map: Cycles (Workbench/EEVEE need a GPU context), bright top light instead of the dungeon lights, no ceilings.
        show("Decken", False)
        show("Lampen", False)
        show("Loesung", True)
        show("ArenaStrahl", True)
        set_cycles(min(args.samples, 24))
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = 0.0
        background.inputs["Color"].default_value = (0.55, 0.56, 0.6, 1.0)
        background.inputs["Strength"].default_value = 0.7
        sun_data = bpy.data.lights.new("Kartenlicht", "SUN")
        sun_data.energy = 2.2
        sun_data.angle = math.radians(8.0)
        sun = bpy.data.objects.new("Kartenlicht", sun_data)
        sun.rotation_euler = (math.radians(20.0), math.radians(10.0), math.radians(30.0))
        collection("Kartenlicht").objects.link(sun)
        cam = camera("Karte", (MAP_CENTER[0], 60.0, MAP_CENTER[1]), (MAP_CENTER[0], 0.0, MAP_CENTER[1] + 0.001), 0, MAP_ORTHO, MAP_SIZE)
        cam.rotation_euler = (0.0, 0.0, 0.0)
        render(os.path.join(args.out, "gruft_karte_roh.png"))
        anchors = {}

        def anchor(key, x, y, z):
            co = world_to_camera_view(scene, cam, bvec(x, y, z))
            anchors[key] = (co.x * MAP_SIZE[0], (1.0 - co.y) * MAP_SIZE[1])

        for room in layout["rooms"]:
            anchor("room:" + room["id"], room["x"] + room["width"] * 0.5, room.get("floorY", 0.0), room["z"] + room["depth"] * 0.5)
        for o in layout["objects"]:
            anchor("obj:" + o["id"], *object_position(geometry, o))
        for door in layout["doors"]:
            anchor("door:" + door["id"], door["x"], geometry.floor_near(door["x"], door["z"]), door["z"])
        for cp in layout["checkpoints"]:
            anchor("cp:" + cp["id"], cp["x"] + cp["width"] * 0.5, 0.0, cp["z"] + cp["depth"] * 0.5)
        for spawner in layout["spawners"]:
            for enemy in spawner["enemies"]:
                anchor("enemy:" + enemy["number"], enemy["x"], 0.0, enemy["z"])
        if arena:
            anchor("boss", arena["x"], 0.0, arena["z"])
            area = arena["encounterArea"]
            anchor("area:min", area["x"], 0.0, area["z"])
            anchor("area:max", area["x"] + area["width"], 0.0, area["z"] + area["depth"])
        anchor("spawn", spawn["x"], 0.0, spawn["z"])
        anchor("scale:0", -30.0, 0.0, -28.0)
        anchor("scale:10", -20.0, 0.0, -28.0)
        with open(os.path.join(args.out, "gruft_karte_anker.json"), "w", encoding="utf-8") as handle:
            json.dump(anchors, handle, ensure_ascii=False, indent=1)

    # ---------------- halle ----------------
    show("Kartenlicht", False)
    show("Lampen", True)
    background.inputs["Color"].default_value = (*[srgb_to_linear(c) for c in ambient_rgb], 1.0)
    background.inputs["Strength"].default_value = 0.35
    show("Decken", True)
    show("Loesung", False)
    if "halle" in jobs:
        set_cycles(args.samples)
        show("ArenaStrahl", False)
        hall = next(r for r in layout["rooms"] if r["id"] == "room.hallen")
        floor = hall.get("floorY", 0.0)
        camera("Halle", (1.2, floor + 1.9, hall["z"] + 1.2), (-0.8, floor + 1.4, hall["z"] + hall["depth"] - 2.0), 55, None, (1600, 900))
        render(os.path.join(args.out, "gruft_halle_roh.png"))

    # ---------------- arena ----------------
    if "arena" in jobs and arena and arena_player:
        set_cycles(args.samples)
        show("ArenaStrahl", True)
        floor = arena_player[1]
        cam_pos = (arena_player[0] + 0.9, floor + 2.3, arena_player[2] - 3.4)
        camera("Arena", cam_pos, (arena["x"], floor + 1.7, arena["z"]), 55, None, (1600, 900))
        render(os.path.join(args.out, "gruft_bossarena_roh.png"))

    # Labels and the bar need Pillow (system Python, not Blender's).
    try:
        subprocess.run(["python3", "-I", os.path.abspath(__file__), "--post", "--out", args.out], check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        print("[gruft_preview] Nachbearbeitung fehlgeschlagen:", error, "- bitte von Hand: python3 -I", __file__, "--post --out", args.out)


# --------------------------------------------------------------------------------------------------------------------
# Post-processing with Pillow (labels, legend, bar)
# --------------------------------------------------------------------------------------------------------------------

def run_post(argv):
    from PIL import Image, ImageDraw, ImageFont

    parser = argparse.ArgumentParser()
    parser.add_argument("--post", action="store_true")
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    def font(size, bold=False):
        names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"]
        for folder in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/truetype/liberation",
                       "/Library/Fonts", "C:/Windows/Fonts"):
            for name in names:
                path = os.path.join(folder, name)
                if os.path.exists(path):
                    return ImageFont.truetype(path, size)
        return ImageFont.load_default()

    def add_bar(image):
        bar_height = 34
        out = Image.new("RGB", (image.width, image.height + bar_height), (16, 16, 18))
        out.paste(image, (0, 0))
        draw = ImageDraw.Draw(out)
        f = font(17)
        width = draw.textlength(BAR_TEXT, font=f)
        draw.text(((image.width - width) / 2, image.height + 8), BAR_TEXT, fill=(225, 225, 225), font=f)
        return out

    def outlined(draw, xy, text, f, fill, outline=(0, 0, 0), width=3, anchor="la"):
        draw.text(xy, text, font=f, fill=fill, stroke_width=width, stroke_fill=outline, anchor=anchor)

    layout = load_layout()
    out_dir = args.out

    # ---------------- map ----------------
    raw = os.path.join(out_dir, "gruft_karte_roh.png")
    anchors_path = os.path.join(out_dir, "gruft_karte_anker.json")
    if os.path.exists(raw) and os.path.exists(anchors_path):
        with open(anchors_path, encoding="utf-8") as handle:
            anchors = json.load(handle)
        base = Image.open(raw).convert("RGB")
        panel_width = 760
        image = Image.new("RGB", (base.width + panel_width, base.height), (22, 22, 26))
        image.paste(base, (0, 0))
        draw = ImageDraw.Draw(image)
        f_room = font(26, True)
        f_label = font(20)
        f_small = font(17)

        def dot(key, color, radius=7):
            if key not in anchors:
                return None
            x, y = anchors[key]
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline=(0, 0, 0), width=2)
            return x, y

        def callout(key, text, offset, color, number=None):
            point = dot(key, color)
            if point is None:
                return
            tx, ty = point[0] + offset[0], point[1] + offset[1]
            draw.line((point[0], point[1], tx, ty), fill=color, width=2)
            outlined(draw, (tx, ty), text, f_label, color, anchor="lm" if offset[0] >= 0 else "rm")

        room_names = {
            "room.vorraum": "Vorraum (Start)", "room.hallen": "Hallen der Eichenritter", "room.seitengang": "Seitengang",
            "room.nebenkammer": "Nebenkammer", "room.spiegelsaal": "Spiegelsaal", "room.siegelkammer": "Siegelkammer (Boss-Arena)",
            "room.fluchtweg": "Fluchtweg",
        }
        for room in layout["rooms"]:
            key = "room:" + room["id"]
            if key in anchors:
                x, y = anchors[key]
                outlined(draw, (x, y - 40 if room["id"] == "room.siegelkammer" else y), room_names.get(room["id"], room["name"]), f_room,
                         (255, 236, 190), anchor="mm")

        warm = (255, 196, 120)
        cyan = (90, 240, 230)
        red = (255, 110, 90)
        white = (240, 240, 240)
        green = (140, 230, 120)
        callout("spawn", "Spawn / Eingangs-Anker", (60, 40), green)
        callout("obj:obj.eichental.gruft_ausgang_eingang", "Ausgang nach Eichental", (70, 10), green)
        callout("obj:obj.eichental.gruft_grabplatte_eiche", "Rätsel 1: Grabplatten (Eiche → Krone → Schild)", (-60, -40), warm)
        callout("obj:obj.eichental.gruft_tor_inschrift", "Inschrift (Hinweis)", (70, -20), warm)
        callout("obj:obj.eichental.gruft_pfeilschlitz_west", "Pfeilfalle (10 % LP)", (-40, 45), red)
        callout("door:door.eichental.gruft_tor", "Steintor", (-80, 20), white)
        callout("enemy:gruft_hallen_6", "Elite mit Turmschild", (90, 30), red)
        callout("enemy:gruft_hallen_1", "6 Skelett-Krieger", (-110, 30), red)
        callout("obj:obj.eichental.gruft_kaefig", "Käfig: Grabräuber Fenn", (-40, 50), warm)
        callout("obj:obj.eichental.gruft_truhe_nebenkammer", "Truhe (versteckt)", (-30, -50), warm)
        callout("door:door.eichental.gruft_nebenkammer", "verborgene Tür", (-30, -80), white)
        callout("obj:obj.eichental.gruft_druckplatte_seitengang", "Druckplatte + Falle", (60, 0), red)
        callout("obj:obj.eichental.gruft_hebel_seitengang", "Hebel → Gitter", (70, -30), warm)
        callout("obj:prop.gruft_kletterstelle", "Kletterstelle", (90, 20), white)
        callout("obj:obj.eichental.gruft_aether_spalt", "Rätsel 2: Spiegel (1 → Ost, 2 → Nord, 3 → West)", (-60, 60), cyan)
        callout("obj:obj.eichental.gruft_siegel", "Siegel + Siegeltür", (-60, -30), cyan)
        callout("cp:checkpoint.gruft.vorkammer", "Checkpoint + Autosave", (-70, 20), green)
        callout("door:door.eichental.gruft_arena_tor", "Arena-Tor (schließt im Kampf)", (-60, -30), white)
        callout("boss", "Boss: Der Wachende Ritter", (60, -40), red)
        callout("obj:obj.eichental.gruft_spiegel_4", "Spiegel 4 (Strahl ab Phase 2)", (60, -50), cyan)
        callout("obj:obj.eichental.gruft_siegelstein", "Siegelstein (Altar)", (-60, 40), warm)
        callout("obj:obj.eichental.gruft_truhe_siegelkammer", "Truhe (Eisen)", (-30, 55), warm)
        callout("door:door.eichental.gruft_fluchtweg_tor", "Gitter (nach dem Sieg offen)", (60, 60), white)
        callout("obj:obj.eichental.gruft_ausgang_fluchtweg", "Ausgang Fluchtweg", (40, -40), green)

        # Encounter area as a dashed rectangle.
        if "area:min" in anchors:
            (x0, y0), (x1, y1) = anchors["area:min"], anchors["area:max"]
            left, right, top, bottom = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
            step = 14
            for x in range(int(left), int(right), step * 2):
                draw.line((x, top, min(x + step, right), top), fill=red, width=2)
                draw.line((x, bottom, min(x + step, right), bottom), fill=red, width=2)
            for y in range(int(top), int(bottom), step * 2):
                draw.line((left, y, left, min(y + step, bottom)), fill=red, width=2)
                draw.line((right, y, right, min(y + step, bottom)), fill=red, width=2)

        # Scale bar and north arrow.
        if "scale:0" in anchors:
            (sx0, sy0), (sx1, _) = anchors["scale:0"], anchors["scale:10"]
            draw.rectangle((sx0, sy0 - 6, sx1, sy0 + 6), fill=white, outline=(0, 0, 0))
            outlined(draw, ((sx0 + sx1) / 2, sy0 - 22), "10 m", f_label, white, anchor="mm")
        nx, ny = base.width - 70, 80
        draw.polygon([(nx, ny - 40), (nx - 16, ny + 10), (nx + 16, ny + 10)], fill=white, outline=(0, 0, 0))
        outlined(draw, (nx, ny + 30), "N", f_room, white, anchor="mm")

        # Legend panel.
        px = base.width + 30
        y = 40
        draw.text((px, y), "Die vergessene Gruft", font=font(34, True), fill=(255, 236, 190))
        y += 50
        draw.text((px, y), "Draufsicht ohne Decken – Maßstab 1 Kästchen = 1 m", font=f_small, fill=(200, 200, 200))
        y += 40
        legend = [
            ((255, 236, 190), "Räume (Namen)"),
            (warm, "Rätsel, Hinweise, Truhen, Questobjekte"),
            (cyan, "Aether: Spalt, Spiegel, Lösungsweg des Strahls"),
            (red, "Gegner, Fallen, Boss-Kampfbereich (gestrichelt)"),
            (white, "Türen und Tore"),
            (green, "Spawn, Ausgänge, Checkpoint"),
        ]
        for color, text in legend:
            draw.rectangle((px, y + 4, px + 22, y + 26), fill=color, outline=(0, 0, 0))
            draw.text((px + 34, y + 2), text, font=f_label, fill=(230, 230, 230))
            y += 36
        y += 20
        facts = [
            "Weg (GDD 02, 11.7):",
            "1. Vorraum: Inschrift lesen, Grabplatten",
            "   Eiche → Krone → Schild drücken.",
            "   Falsche Reihenfolge: Pfeilfalle (10 % LP).",
            "2. Tor öffnet sich, Treppe hinab (−3 m):",
            "   6 Skelett-Krieger, 1 Elite mit Turmschild.",
            "   Optional: Käfig öffnen → verborgene Tür",
            "   → Nebenkammer mit versteckter Truhe.",
            "   Schleichweg: Kletterstelle → Seitengang",
            "   (Druckplatte = Pfeilfalle, Hebel = Gitter).",
            "3. Spiegelsaal: Spiegel 1 → Ost, 2 → Nord,",
            "   3 → West. Rußspuren zeigen den Weg.",
            "4. Siegeltür öffnet, Vorkammer = Checkpoint.",
            "5. Siegelkammer (26 × 26 m, −6 m): Der",
            "   Wachende Ritter. Phase 2 ab 50 %: 2 Helfer,",
            "   Spiegel 4 lenkt den Strahl → 5 s betäubt.",
            "6. Klingenfragment aufheben, Siegelstein",
            "   nehmen oder liegen lassen, Fluchtweg.",
        ]
        for line in facts:
            draw.text((px, y), line, font=f_small if not line.endswith(":") else font(19, True), fill=(220, 220, 220))
            y += 26
        add_bar(image).save(os.path.join(out_dir, "gruft_karte.png"))
        print("[gruft_preview] fertig:", os.path.join(out_dir, "gruft_karte.png"))

    # ---------------- perspective views ----------------
    captions = {
        "gruft_halle": "Hallen der Eichenritter (−3 m): Pfeiler, Sarkophage, Fackeln, Skelett-Krieger",
        "gruft_bossarena": "Siegelkammer: Der Wachende Ritter holt zum Schildstoß aus – Aether-Strahl (Phase 2) über Spiegel 4",
    }
    for name, caption in captions.items():
        raw = os.path.join(out_dir, name + "_roh.png")
        if not os.path.exists(raw):
            continue
        image = Image.open(raw).convert("RGB")
        draw = ImageDraw.Draw(image)
        outlined(draw, (24, 24), caption, font(24, True), (255, 236, 190))
        add_bar(image).save(os.path.join(out_dir, name + ".png"))
        print("[gruft_preview] fertig:", os.path.join(out_dir, name + ".png"))


if __name__ == "__main__":
    if "--post" in sys.argv:
        run_post([a for a in sys.argv[1:]])
    else:
        arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        run_blender(arguments)
