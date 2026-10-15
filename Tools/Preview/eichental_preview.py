"""Blender preview of the Eichental blockout ("Dorf Eichental", mini slice) of Chroniken von Aetherfall.

Builds the village, the terrain and everything else from the SAME data file as the Unity generator
(Assets/_Project/Data/Regions/Eichental/eichental_layout.json) and renders stills and a flight with Cycles (CPU). The
heights, ground layers, vegetation, enemy and crystal positions come from eichental_layout.py, the Python twin of the C#
layout code (the EditMode tests compare both). Shapes follow the generator (Scripts/Editor/World/Eichental*.cs): walls and
props from boxes and cylinders, generated gable roofs, trees from trunk and crown. This is a REBUILD for previews, not a Unity
rendering: no URP shaders, no Unity lighting, no game logic.

Coordinates: the layout uses Unity numbers (x east, y up, z north). Blender uses x east, y north, z up, so a layout point
(x, z) at height h becomes Vector((x, z, h)); a Unity yaw (clockwise seen from above) becomes rotation_euler.z = -yaw.

Usage (Blender 4.x, from the repo root):
    blender -b -P Tools/Preview/eichental_preview.py -- --job alle_bilder --out OUTPUT_DIR [--samples 96] [--test]
    blender -b -P Tools/Preview/eichental_preview.py -- --job nah --out OUTPUT_DIR [--samples 96]
    blender -b -P Tools/Preview/eichental_preview.py -- --job rundflug --out OUTPUT_DIR --samples 2 --fps 12 --fast
Jobs: uebersicht, dorf, karte (stills), alle_bilder (all three), nah (four close-ups: rocks at the crypt entrance and the wolf
den, stone bridge), rundflug (PNG frames for the flight video).
Then: python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir OUTPUT_DIR [--video --render-fps 12]
The flight renders 180 frames in about 8 minutes on 4 CPU cores; ffmpeg interpolates them to 30 fps.
"""
import argparse
import hashlib
import json
import math
import os
import pickle
import sys
import time

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import eichental_layout as L  # noqa: E402

LAYOUT_PATH = os.path.join(REPO, "Assets", "_Project", "Data", "Regions", "Eichental", "eichental_layout.json")
CACHE_VERSION = 3

# Test materials of the Unity test ground (TestGroundMaterials / TestGroundItemAssets), reused by the Eichental generator for
# player, wolves and chests.
UNITY_COLORS = {
    "player": (0.85, 0.9, 0.95), "nose": (0.95, 0.8, 0.1), "sword": (0.78, 0.8, 0.85), "shield": (0.55, 0.35, 0.18),
    "wolf": (0.46, 0.43, 0.4), "aether_wolf": (0.27, 0.33, 0.4), "crystal": (0.2, 0.95, 0.85),
    "chest_wooden": (0.55, 0.36, 0.2), "chest_iron": (0.55, 0.58, 0.62), "chest_hidden": (0.32, 0.22, 0.45),
}

# Roof material per building kind (EichentalBuildingBuilder.RoofColorName).
ROOF_COLOR = {"house": "thatch", "barn": "thatch", "smithy": "shingle", "tavern": "shingle", "mill": "shingle",
              "chapel": "shingle", "guardpost": "shingle", "ruin": "shingle",
              "watchtower": "shingle"}

ROOF_OVERHANG = 0.45
FAST = {"on": False, "ambient": (0.3, 0.32, 0.36)}  # video: cheaper shading, sky light faked as emission
ROOF_THICKNESS = 0.22


# ----------------------------------------------------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------------------------------------------------

def bv(x, z, h=0.0):
    return Vector((x, z, h))


def lin(rgb):
    return L.srgb_to_linear(rgb)


class Builder:
    """Creates materials, meshes and objects; keeps everything in collections."""

    def __init__(self, layout, heights):
        self.layout = layout
        self.palette = {k: L.hex_rgb(v) for k, v in layout["palette"].items()}
        self.h = heights
        self.materials = {}
        self.meshes = {}
        self.scene = bpy.context.scene
        self.collections = {}

    # --- collections and objects ---
    def collection(self, name):
        if name not in self.collections:
            col = bpy.data.collections.new(name)
            self.scene.collection.children.link(col)
            self.collections[name] = col
        return self.collections[name]

    def link(self, ob, col):
        self.collection(col).objects.link(ob)
        return ob

    def obj(self, name, mesh, col, location=(0, 0, 0), rotation_z=0.0, scale=(1, 1, 1), parent=None):
        ob = bpy.data.objects.new(name, mesh)
        ob.location = location
        ob.rotation_euler = (0.0, 0.0, rotation_z)
        ob.scale = scale
        if parent is not None:
            ob.parent = parent
        return self.link(ob, col)

    def empty(self, name, col, x, z, h, yaw):
        ob = bpy.data.objects.new(name, None)
        ob.location = bv(x, z, h)
        ob.rotation_euler = (0.0, 0.0, -math.radians(yaw))
        return self.link(ob, col)

    # --- materials ---
    def mat(self, key, rgb=None, roughness=0.85, metallic=0.0, emission=None, strength=0.0, sample_emission=False):
        name = key if rgb is None else key + "_%02x%02x%02x" % tuple(int(c * 255) for c in rgb)
        if name in self.materials:
            return self.materials[name]
        color = rgb if rgb is not None else self.palette[key]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*lin(color), 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = (*lin(emission), 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
            if hasattr(m, "cycles") and not sample_emission:
                m.cycles.emission_sampling = "NONE"
        elif FAST["on"]:
            # Video: constant sky light as emission instead of sampling the sky (no noise at 2-3 samples).
            amb = FAST["ambient"]
            bsdf.inputs["Emission Color"].default_value = tuple(lin(color)[i] * amb[i] for i in range(3)) + (1.0,)
            bsdf.inputs["Emission Strength"].default_value = 1.0
            m.cycles.emission_sampling = "NONE"
        m.diffuse_color = (*lin(color), 1.0)
        self.materials[name] = m
        return m

    def glow(self, key, strength, sample=False):
        name = "glow_" + key + "_" + str(strength)
        if name in self.materials:
            return self.materials[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        em = nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*lin(self.palette[key]), 1.0)
        em.inputs["Strength"].default_value = strength
        m.node_tree.links.new(em.outputs["Emission"], out.inputs["Surface"])
        if hasattr(m, "cycles"):
            m.cycles.emission_sampling = "FRONT" if sample else "NONE"
        self.materials[name] = m
        return m

    # --- meshes ---
    def box_mesh(self, key="box"):
        """Unit cube with its base at z = 0 (size 1, x/y from -0.5 to 0.5)."""
        if key in self.meshes:
            return self.meshes[key]
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
        me = bpy.data.meshes.new(key)
        bm.to_mesh(me)
        bm.free()
        self.meshes[key] = me
        return me

    def cylinder_mesh(self, segments=12, key=None):
        key = key or "cyl%d" % segments
        if key in self.meshes:
            return self.meshes[key]
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=0.5, radius2=0.5, depth=1.0)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
        me = bpy.data.meshes.new(key)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = len(p.vertices) == 4
        self.meshes[key] = me
        return me

    def box(self, name, col, size, center, material, parent=None, rot=None):
        """Box of size (sx, sy, sz) with its base centre at local `center` (x, y, z) of the parent."""
        ob = self.obj(name, self.box_mesh(), col, location=center, scale=size, parent=parent)
        if rot is not None:
            ob.rotation_euler = rot
        self.assign(ob, material)
        return ob

    def cyl(self, name, col, radius, height, center, material, parent=None, rot=None, segments=12):
        ob = self.obj(name, self.cylinder_mesh(segments), col, location=center, scale=(radius * 2, radius * 2, height), parent=parent)
        if rot is not None:
            ob.rotation_euler = rot
        self.assign(ob, material)
        return ob

    @staticmethod
    def assign(ob, material):
        """Per-object material (the mesh is shared by many objects)."""
        if len(ob.material_slots) == 0:
            ob.data.materials.append(None)
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = material


def ground_y(builder, x, z):
    return builder.h.height(x, z)


def chest_floor(builder, lay, x, z):
    """Floor under a chest: the deck of a watchtower if it stands on one (the crow's nest), otherwise the terrain."""
    for bd in lay.get("buildings", []):
        if bd["kind"] == "watchtower" and L.rect_excess(x, z, bd["position"], bd["size"][0], bd["size"][2], bd["yaw"]) < 0:
            base = min(ground_y(builder, cx, cz) for cx, cz in L.building_corners(bd))
            return base + bd["size"][1] + TOWER_DECK
    return ground_y(builder, x, z)


def unity_mesh(name, verts, faces, smooth=False):
    """Mesh from Unity-axis data of eichental_layout.py (x right, y up, z forward) -> Blender (x, z, y), normals outwards."""
    me = bpy.data.meshes.new(name)
    # Swapping y and z mirrors the mesh, so the corner order is reversed to keep the faces pointing outwards.
    me.from_pydata([(v[0], v[2], v[1]) for v in verts], [], [tuple(reversed(f)) for f in faces])
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = smooth
    return me


# ----------------------------------------------------------------------------------------------------------------------
# Cached heavy data (heights, ground colour image, vegetation)
# ----------------------------------------------------------------------------------------------------------------------

def compute_cache(layout, out_dir):
    raw = open(LAYOUT_PATH, "rb").read()
    key = hashlib.sha1(raw + str(CACHE_VERSION).encode()).hexdigest()[:16]
    path = os.path.join(out_dir, "eichental_cache_%s.pickle" % key)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    t0 = time.time()
    hf = L.HeightField(layout)
    size = layout["terrain"]["size"]
    n = layout["terrain"]["heightmapResolution"]
    step = size / (n - 1)
    half = size / 2.0
    heights = [[hf.height(-half + i * step, -half + j * step) for i in range(n)] for j in range(n)]
    print("[eichental] heights %.1f s" % (time.time() - t0))
    gm = L.GroundMap(layout)
    res = layout["terrain"]["alphamapResolution"]
    cell = size / res
    weights = []
    for j in range(res):
        z = -half + (j + 0.5) * cell
        row = []
        gj = min(n - 2, int((z + half) / step))
        for i in range(res):
            x = -half + (i + 0.5) * cell
            gi = min(n - 2, int((x + half) / step))
            dx = (heights[gj][gi + 1] - heights[gj][gi] + heights[gj + 1][gi + 1] - heights[gj + 1][gi]) / (2 * step)
            dz = (heights[gj + 1][gi] - heights[gj][gi] + heights[gj + 1][gi + 1] - heights[gj][gi + 1]) / (2 * step)
            slope = math.degrees(math.atan(math.hypot(dx, dz)))
            row.append(gm.weights(x, z, slope))
        weights.append(row)
    print("[eichental] ground %.1f s" % (time.time() - t0))
    plants = L.scatter_vegetation(layout)
    data = {"heights": heights, "weights": weights, "plants": plants}
    with open(path, "wb") as f:
        pickle.dump(data, f)
    print("[eichental] cache %.1f s -> %s" % (time.time() - t0, path))
    return data


class GridHeights:
    """Bilinear lookup in the cached height grid (same values as eichental_layout.HeightField)."""

    def __init__(self, layout, grid):
        self.grid = grid
        self.n = len(grid)
        self.size = layout["terrain"]["size"]
        self.step = self.size / (self.n - 1)
        self.half = self.size / 2.0
        self.exact = L.HeightField(layout)

    def height(self, x, z):
        fx = (x + self.half) / self.step
        fz = (z + self.half) / self.step
        i = max(0, min(self.n - 2, int(fx)))
        j = max(0, min(self.n - 2, int(fz)))
        tx = min(1.0, max(0.0, fx - i))
        tz = min(1.0, max(0.0, fz - j))
        g = self.grid
        a = g[j][i] + (g[j][i + 1] - g[j][i]) * tx
        b = g[j + 1][i] + (g[j + 1][i + 1] - g[j + 1][i]) * tx
        return a + (b - a) * tz


# ----------------------------------------------------------------------------------------------------------------------
# Terrain and water
# ----------------------------------------------------------------------------------------------------------------------

def hash_noise(i, j, seed):
    v = (i * 374761393 + j * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 0xFFFF) / 65535.0


def value_noise(x, z, scale, seed):
    fx, fz = x / scale, z / scale
    i, j = int(math.floor(fx)), int(math.floor(fz))
    tx, tz = L.smooth01(fx - i), L.smooth01(fz - j)
    a = hash_noise(i, j, seed) + (hash_noise(i + 1, j, seed) - hash_noise(i, j, seed)) * tx
    b = hash_noise(i, j + 1, seed) + (hash_noise(i + 1, j + 1, seed) - hash_noise(i, j + 1, seed)) * tx
    return a + (b - a) * tz


def build_terrain(b, cache):
    layout = b.layout
    size = layout["terrain"]["size"]
    half = size / 2.0
    heights = cache["heights"]
    n = len(heights)
    step = size / (n - 1)
    verts = [(-half + i * step, -half + j * step, heights[j][i]) for j in range(n) for i in range(n)]
    faces = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(n - 1) for i in range(n - 1)]
    me = bpy.data.meshes.new("Terrain")
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UV")
    vertex_index = [0] * len(me.loops)
    me.loops.foreach_get("vertex_index", vertex_index)
    coords = []
    for v in vertex_index:
        co = verts[v]
        coords.append((co[0] + half) / size)
        coords.append((co[1] + half) / size)
    uv.data.foreach_set("uv", coords)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    ob = b.obj("Terrain", me, "Terrain")

    # Ground colour image from the layer weights (grass, dirt, rock, ash) with gentle variation.
    weights = cache["weights"]
    res = len(weights)
    pal = b.palette
    grass, grass_dry, dirt, rock, ash = (lin(pal[k]) for k in ("grass", "grassDry", "dirt", "rock", "ash"))
    image = bpy.data.images.new("GroundColour", width=res, height=res, alpha=False, float_buffer=True)
    pixels = [0.0] * (res * res * 4)
    cell = size / res
    for j in range(res):
        z = -half + (j + 0.5) * cell
        for i in range(res):
            x = -half + (i + 0.5) * cell
            g, d, r, a = weights[j][i]
            dry = value_noise(x, z, 23.0, 1) * 0.65 + value_noise(x, z, 7.0, 2) * 0.35
            dry = L.smooth01((dry - 0.35) / 0.5) * 0.6
            vary = 0.95 + 0.1 * value_noise(x, z, 9.0, 3)
            k = (j * res + i) * 4
            for c in range(3):
                gc = grass[c] + (grass_dry[c] - grass[c]) * dry
                pixels[k + c] = (g * gc + d * dirt[c] * (0.92 + 0.16 * value_noise(x, z, 5.0, 4)) + r * rock[c] + a * ash[c]) * vary
            pixels[k + 3] = 1.0
    image.pixels.foreach_set(pixels)
    image.pack()

    m = bpy.data.materials.new("TerrainGround")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    uvmap = nodes.new("ShaderNodeUVMap")
    uvmap.uv_map = "UV"
    links.new(uvmap.outputs["UV"], tex.inputs["Vector"])
    if FAST["on"]:
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        tint = nodes.new("ShaderNodeMix")
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs["Factor"].default_value = 1.0
        tint.inputs["B"].default_value = (*FAST["ambient"], 1.0)
        links.new(tex.outputs["Color"], tint.inputs["A"])
        links.new(tint.outputs["Result"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
        m.cycles.emission_sampling = "NONE"
        me.materials.append(m)
        return ob
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.6
    noise.inputs["Detail"].default_value = 3.0
    coords = nodes.new("ShaderNodeTexCoord")
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.3
    ramp.inputs["From Max"].default_value = 0.7
    ramp.inputs["To Min"].default_value = 0.82
    ramp.inputs["To Max"].default_value = 1.12
    links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(tex.outputs["Color"], mix.inputs["A"])
    gray = nodes.new("ShaderNodeCombineColor")
    links.new(ramp.outputs["Result"], gray.inputs["Red"])
    links.new(ramp.outputs["Result"], gray.inputs["Green"])
    links.new(ramp.outputs["Result"], gray.inputs["Blue"])
    links.new(gray.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    me.materials.append(m)
    return ob


def build_water(b):
    hf = b.h.exact
    mat = b.mat("water", roughness=0.08)
    for index, river in enumerate(hf.rivers):
        r = river["def"]
        pts = river["points"]
        half = r["width"] * 0.5 + r["bank"] * 0.8
        verts, faces = [], []
        samples = []
        for k in range(len(pts) - 1):
            ax, az = pts[k]
            bx, bz = pts[k + 1]
            length = math.hypot(bx - ax, bz - az)
            steps = max(1, int(math.ceil(length / 2.0)))
            for s in range(steps + (1 if k == len(pts) - 2 else 0)):
                f = s / steps
                samples.append((ax + (bx - ax) * f, az + (bz - az) * f, hf.water_level(index, k, f), (bx - ax) / length, (bz - az) / length))
        for (x, z, level, dx, dz) in samples:
            nx, nz = -dz, dx
            verts.append((x + nx * half, z + nz * half, level))
            verts.append((x - nx * half, z - nz * half, level))
        for i in range(len(samples) - 1):
            a = i * 2
            faces.append((a, a + 2, a + 3, a + 1))
        me = bpy.data.meshes.new("Water " + r["id"])
        me.from_pydata(verts, [], faces)
        me.materials.append(mat)
        b.obj("Water " + r["name"], me, "Water")


# ----------------------------------------------------------------------------------------------------------------------
# Roofs (Python port of Aetherfall.World.RoofGeometry)
# ----------------------------------------------------------------------------------------------------------------------

def slab(bm, low_x, low_h, high_x, high_h, thickness, y0, y1):
    """Slab between the low edge (x = low_x, top at low_h) and the high edge; y = ridge direction (Blender local y)."""
    corners = [(low_x, y0, low_h), (low_x, y1, low_h), (high_x, y1, high_h), (high_x, y0, high_h)]
    top = [bm.verts.new(c) for c in corners]
    bottom = [bm.verts.new((c[0], c[1], c[2] - thickness)) for c in corners]
    faces = [top, bottom[::-1], [top[0], bottom[0], bottom[1], top[1]], [top[1], bottom[1], bottom[2], top[2]],
             [top[2], bottom[2], bottom[3], top[3]], [top[3], bottom[3], bottom[0], top[0]]]
    for f in faces:
        bm.faces.new(f)


def roof_mesh(b, kind, width, depth, pitch, left_cov=1.0, right_cov=1.0, key=None):
    key = key or "roof_%s_%.2f_%.2f_%.1f_%.2f_%.2f" % (kind, width, depth, pitch, left_cov, right_cov)
    if key in b.meshes:
        return b.meshes[key]
    bm = bmesh.new()
    o = ROOF_OVERHANG
    t = ROOF_THICKNESS
    y0, y1 = -depth / 2 - o, depth / 2 + o
    half = width / 2
    gable_tris = []
    if kind == "gable":
        rise = half * math.tan(math.radians(pitch))
        drop = o * rise / half
        left_end = y0 + left_cov * (y1 - y0)
        right_start = y1 - right_cov * (y1 - y0)
        if left_end > y0 + 1e-6:
            slab(bm, -half - o, -drop, 0.0, rise, t, y0, left_end)
        if y1 > right_start + 1e-6:
            slab(bm, half + o, -drop, 0.0, rise, t, right_start, y1)
        for side in (-1, 1):
            y = side * depth / 2
            gable_tris.append([(-half, y, 0.0), (half, y, 0.0), (0.0, y, rise - t)])
    else:
        rise = width * math.tan(math.radians(pitch))
        slope = rise / width
        end = y0 + left_cov * (y1 - y0)
        slab(bm, half + o, -o * slope, -half - o, rise + o * slope, t, y0, end)
        for side in (-1, 1):
            y = side * depth / 2
            gable_tris.append([(-half, y, 0.0), (half, y, 0.0), (-half, y, rise - t)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.material_index = 0
    for tri in gable_tris:
        f = bm.faces.new([bm.verts.new(c) for c in tri])
        f.material_index = 1
    me = bpy.data.meshes.new(key)
    bm.to_mesh(me)
    bm.free()
    b.meshes[key] = me
    return me


def roof_rise(kind, width, pitch):
    if kind == "gable":
        return width / 2 * math.tan(math.radians(pitch))
    if kind == "lean_to":
        return width * math.tan(math.radians(pitch))
    return 0.0


# ----------------------------------------------------------------------------------------------------------------------
# Buildings
# ----------------------------------------------------------------------------------------------------------------------

def jagged(seed, i):
    return L.Pcg32(seed + 17 * i).next_float()


# Climbing route of the watchtower (WatchtowerBuilder in Unity): ladder, rest point, pale rock, vines.
TOWER_PLINTH_TOP = 0.2
TOWER_LADDER_TOP = 5.2
TOWER_REST_TOP = 6.6
TOWER_ROCK_TOP = 11.0
TOWER_ROUTE_WIDTH = 2.2
TOWER_DECK = 0.1


def build_watchtower(b, root, w, d, h):
    """Wachturm Grauwacht: stone shaft, deck with broken battlements and the crow's nest, climbing route on the front."""
    col = "Buildings"
    stone = b.mat("towerStone", (0.5, 0.48, 0.45))
    dark = b.mat("towerStoneDark", (0.33, 0.31, 0.3))
    wood = b.mat("wood")
    dark_wood = b.mat("woodDark")
    pale = b.mat("climbRock", (0.86, 0.84, 0.78))
    vine = b.mat("vine", (0.22, 0.36, 0.14))
    leaf = b.mat("vineLeaf", (0.36, 0.56, 0.2))
    face = d * 0.5
    b.box("Sockel", col, (w + 0.6, d + 0.6, 0.8), (0, 0, TOWER_PLINTH_TOP - 0.8), dark, parent=root)
    b.box("Schaft", col, (w, d, h), (0, 0, 0), stone, parent=root)
    b.box("Gesims", col, (w + 0.16, d + 0.16, 0.25), (0, 0, 5.8), dark, parent=root)
    b.box("Gesims oben", col, (w + 0.2, d + 0.2, 0.3), (0, 0, h - 0.5), dark, parent=root)
    b.box("Tür", col, (1.4, 0.12, 2.4), (0, -face - 0.03, TOWER_PLINTH_TOP), dark_wood, parent=root)
    b.box("Sturz", col, (1.8, 0.16, 0.3), (0, -face - 0.05, TOWER_PLINTH_TOP + 2.4), dark, parent=root)
    for i in range(3):
        zz = 3.5 + i * 4.0
        b.box("Scharte", col, (0.06, 0.25, 1.1), (-w * 0.5 - 0.02, 0, zz), dark, parent=root)
        b.box("Scharte", col, (0.06, 0.25, 1.1), (w * 0.5 + 0.02, 0, zz), dark, parent=root)
    b.box("Plattform", col, (w - 0.1, d - 0.1, TOWER_DECK), (0, 0, h), wood, parent=root)
    top = h + TOWER_DECK
    for i in range(5):
        xx = -w * 0.5 + 0.5 + i * (w - 1.0) / 4.0
        b.box("Zinne", col, (0.8, 0.5, 0.6 if i == 2 else 1.1), (xx, -face + 0.25, top), stone, parent=root)
    for i in range(4):
        yy = -face + 0.6 + i * (d - 1.2) / 3.0
        b.box("Zinne", col, (0.5, 0.8, 0.5 if i == 3 else 1.0), (-w * 0.5 + 0.25, yy, top), stone, parent=root)
        b.box("Zinne", col, (0.5, 0.8, 0.4 if i == 1 else 1.0), (w * 0.5 - 0.25, yy, top), stone, parent=root)
    b.box("Zinne", col, (0.8, 0.8, 0.7), (-w * 0.5 + 0.4, face - 0.4, top), stone, parent=root)
    b.box("Zinne", col, (0.8, 0.8, 0.5), (w * 0.5 - 0.4, face - 0.4, top), stone, parent=root)
    nest_back = -face + 0.9
    nest_front = -face + 3.2
    for xx in (-1.4, 1.4):
        b.box("Pfosten", col, (0.18, 0.18, 2.5), (xx, nest_back, top), dark_wood, parent=root)
        b.box("Pfosten", col, (0.18, 0.18, 2.5 if xx < 0 else 1.6), (xx, nest_front, top), dark_wood, parent=root)
    b.box("Krähennest-Dach", col, (2.6, 2.8, 0.12), (-0.3, (nest_back + nest_front) * 0.5, top + 2.49), wood, parent=root,
          rot=(math.radians(-6), math.radians(-9), 0))
    b.box("Brett", col, (1.6, 0.3, 0.1), (1.0, nest_front + 0.4, top), wood, parent=root, rot=(0, 0, math.radians(-25)))
    ladder = TOWER_LADDER_TOP - TOWER_PLINTH_TOP
    for xx in (-0.38, 0.38):
        b.box("Leiter", col, (0.08, 0.08, ladder), (xx, face + 0.06, TOWER_PLINTH_TOP), dark_wood, parent=root)
    yy = TOWER_PLINTH_TOP + 0.3
    while yy < TOWER_LADDER_TOP - 0.1:
        b.box("Sprosse", col, (0.84, 0.06, 0.06), (0, face + 0.06, yy), wood, parent=root)
        yy += 0.35
    b.box("Rastpunkt", col, (TOWER_ROUTE_WIDTH + 0.2, 0.16, 0.25), (0, face + 0.08, TOWER_LADDER_TOP - 0.25), pale, parent=root)
    b.box("Heller Fels", col, (TOWER_ROUTE_WIDTH, 0.06, TOWER_ROCK_TOP - TOWER_LADDER_TOP), (0, face + 0.02, TOWER_LADDER_TOP), pale,
          parent=root)
    seed = 48
    yy = TOWER_REST_TOP + 0.3
    while yy < TOWER_ROCK_TOP - 0.2:
        seed = (seed * 6364136223846793005 + 1442695040888963407) & 0xFFFFFFFFFFFFFFFF
        xx = ((seed >> 40) % 1000) / 1000.0 * (TOWER_ROUTE_WIDTH - 0.5) - (TOWER_ROUTE_WIDTH - 0.5) * 0.5
        b.box("Griff", col, (0.3, 0.08, 0.14), (xx, face + 0.07, yy), pale, parent=root)
        yy += 0.55
    for i in range(7):
        xx = -TOWER_ROUTE_WIDTH * 0.5 + 0.15 + i * (TOWER_ROUTE_WIDTH - 0.3) / 6.0
        start = TOWER_ROCK_TOP - (i % 3) * 0.4
        b.box("Ranke", col, (0.07, 0.06, h + 0.25 - start), (xx, face + 0.05, start), vine, parent=root)
        yy = start + 0.4
        while yy < h:
            b.box("Blatt", col, (0.3, 0.07, 0.24), (xx + (0.08 if i % 2 == 0 else -0.08), face + 0.08, yy), leaf, parent=root)
            yy += 0.9


def build_building(b, bd, index):
    col = "Buildings"
    x, z = bd["position"]
    w, wall_h, d = bd["size"]
    kind, state = bd["kind"], bd["state"]
    base = min(ground_y(b, cx, cz) for cx, cz in L.building_corners(bd))
    root = b.empty(bd["id"], col, x, z, base, bd["yaw"])
    if kind == "watchtower":
        build_watchtower(b, root, w, d, wall_h)
        return
    stone = b.mat("stone")
    plaster = b.mat("plaster") if state == "intact" else b.mat("plasterBurned")
    timber = b.mat("woodDark") if state == "intact" else b.mat("burnedWood")
    dark = b.mat("window", (0.08, 0.07, 0.07), roughness=0.4)
    if kind in ("barn", "mill") and state == "intact":
        plaster = b.mat("wood")
    if kind == "chapel" and state != "collapsed":
        plaster = b.mat("stone") if state == "intact" else b.mat("stoneBurned", (0.42, 0.4, 0.37))
    # Plinth.
    b.box("Sockel", col, (w + 0.3, d + 0.3, 0.9), (0, 0, -0.6), stone, parent=root)
    seed = 1000 + index * 31
    if state == "collapsed":
        # Wall stumps of uneven height, charred beams and rubble, no roof.
        for side in range(4):
            length = w if side % 2 == 0 else d
            for part in range(3):
                seg = length / 3
                hh = wall_h * (0.15 + 0.75 * jagged(seed, side * 3 + part))
                offset = -length / 2 + seg * (part + 0.5)
                if side == 0:
                    center, size = (offset, -d / 2 + 0.2, 0), (seg, 0.4, hh)
                elif side == 2:
                    center, size = (offset, d / 2 - 0.2, 0), (seg, 0.4, hh)
                elif side == 1:
                    center, size = (w / 2 - 0.2, offset, 0), (0.4, seg, hh)
                else:
                    center, size = (-w / 2 + 0.2, offset, 0), (0.4, seg, hh)
                b.box("Mauerrest", col, size, center, plaster, parent=root)
        for i in range(5):
            rx = (jagged(seed, 20 + i) - 0.5) * w * 0.7
            ry = (jagged(seed, 30 + i) - 0.5) * d * 0.7
            s = 0.6 + jagged(seed, 40 + i) * 1.0
            b.box("Schutt", col, (s * 1.4, s, s * 0.6), (rx, ry, 0), b.mat("rubble", (0.22, 0.2, 0.19)), parent=root,
                  rot=(0, 0, jagged(seed, 50 + i) * 3))
        for i in range(3):
            beam = b.box("Balken", col, (0.25, d * 0.8, 0.25), ((i - 1) * w * 0.25, 0, 0.6), timber, parent=root,
                         rot=(math.radians(18 + 20 * jagged(seed, 60 + i)), 0, math.radians(30 * (jagged(seed, 70 + i) - 0.5))))
            beam.location.z = 0.8 + i * 0.3
    else:
        b.box("Wände", col, (w, d, wall_h), (0, 0, 0), plaster, parent=root)
        if state == "burned":
            # Soot: the upper part of the walls is blackened (EichentalBuildingBuilder: same band).
            b.box("Ruß", col, (w + 0.04, d + 0.04, wall_h * 0.38), (0, 0, wall_h * 0.62), b.mat("soot", (0.12, 0.1, 0.09)), parent=root)
        # Timber frame: corner posts, sill and eaves beams.
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.box("Pfosten", col, (0.28, 0.28, wall_h), (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), 0), timber, parent=root)
        for sy in (-1, 1):
            b.box("Riegel", col, (w + 0.06, 0.2, 0.22), (0, sy * (d / 2 + 0.02), wall_h * 0.5), timber, parent=root)
            b.box("Rähm", col, (w + 0.06, 0.2, 0.22), (0, sy * (d / 2 + 0.02), wall_h - 0.22), timber, parent=root)
        for sx in (-1, 1):
            b.box("Riegel", col, (0.2, d + 0.06, 0.22), (sx * (w / 2 + 0.02), 0, wall_h * 0.5), timber, parent=root)
        # Door at the front (+y local) and windows.
        door_h = min(2.4, wall_h * 0.6)
        b.box("Tür", col, (1.2 if kind != "barn" else 3.0, 0.12, door_h if kind != "barn" else wall_h * 0.75), (0, d / 2 + 0.03, 0),
              b.mat("door", (0.25, 0.16, 0.1)) if state == "intact" else dark, parent=root)
        floors = 2 if wall_h >= 5.5 and kind not in ("chapel", "barn", "mill") else 1
        for fl in range(floors):
            wy = wall_h * (0.55 if floors == 1 else (0.3 + 0.42 * fl))
            for sx in (-1, 1):
                b.box("Fenster", col, (0.12, 0.9, 0.8), (sx * (w / 2 + 0.03), d * 0.18, wy), dark, parent=root)
                b.box("Fenster", col, (0.12, 0.9, 0.8), (sx * (w / 2 + 0.03), -d * 0.22, wy), dark, parent=root)
        roof = bd.get("roof", "gable")
        if roof != "none":
            left, right = (1.0, 1.0) if state == "intact" else (0.25 + 0.3 * jagged(seed, 7), 0.25 * jagged(seed, 8))
            me = roof_mesh(b, roof, w, d, bd.get("roofPitch", 45), left, right)
            ro = b.obj("Dach", me, col, location=(0, 0, wall_h), parent=root)
            roof_mat = b.mat(ROOF_COLOR.get(kind, "shingle")) if state == "intact" else b.mat("burnedRoof", (0.11, 0.09, 0.08))
            while len(me.materials) < 2:
                me.materials.append(None)
            ro.material_slots[0].link = "OBJECT"
            ro.material_slots[0].material = roof_mat
            ro.material_slots[1].link = "OBJECT"
            ro.material_slots[1].material = plaster if state == "intact" else b.mat("soot", (0.12, 0.1, 0.09))
            if state == "burned" and roof == "gable":
                # Bare rafters where the roof burned away.
                rise = roof_rise("gable", w, bd.get("roofPitch", 45))
                length = math.hypot(w / 2 + ROOF_OVERHANG, rise)
                angle = math.atan2(rise, w / 2)
                count = int(d / 1.3)
                for i in range(count + 1):
                    yy = -d / 2 + d * i / max(1, count)
                    for side in (-1, 1):
                        r = b.box("Sparren", col, (length, 0.18, 0.18), (side * (w / 4), yy, wall_h + rise / 2 - 0.05), timber, parent=root,
                                  rot=(0, side * angle, 0))
                        r.location.z = wall_h + rise / 2 - 0.2
    if bd.get("glow"):
        ember = b.glow("ember", 6.0)
        if state == "burned":
            for sy in (-1, 1):
                b.box("Glutkante", col, (w * 0.7, 0.3, 0.12), ((jagged(seed, 3) - 0.5) * w * 0.2, sy * (d / 2 + 0.03), wall_h - 0.1),
                      b.glow("ember", 9.0), parent=root)
        for i in range(3):
            ex = (jagged(seed, 80 + i) - 0.5) * w * 0.6
            ey = (jagged(seed, 90 + i) - 0.5) * d * 0.6
            b.box("Glut", col, (1.2 + jagged(seed, 95 + i), 0.9, 0.18), (ex, ey, 0.05), ember, parent=root, rot=(0, 0, jagged(seed, 99 + i) * 3))
        smoke(b, col, root, seed)
        light = bpy.data.lights.new("Glut " + bd["id"], "POINT")
        light.energy = 450.0
        light.color = lin(b.palette["ember"])
        light.shadow_soft_size = 1.5
        lo = bpy.data.objects.new("Glutlicht", light)
        lo.parent = root
        lo.location = (0, 0, 1.2)
        b.link(lo, col)
    # Kind specific parts.
    rise = roof_rise(bd.get("roof", "gable"), w, bd.get("roofPitch", 45)) if bd.get("roof", "gable") != "none" else 0.0
    if kind == "chapel":
        tower_h = wall_h + rise + (3.5 if state != "collapsed" else -1.0)
        b.box("Glockenturm", col, (2.8, 2.8, tower_h), (0, d / 2 - 1.4, 0), b.mat("stone") if state == "intact" else plaster, parent=root)
        if state == "intact":
            spire = b.obj("Turmspitze", cone_mesh(b), col, location=(0, d / 2 - 1.4, tower_h), scale=(2.2, 2.2, 3.2), parent=root)
            Builder.assign(spire, b.mat("shingle"))
        else:
            for i in range(3):
                b.box("Turmbalken", col, (0.2, 0.2, 2.4), ((i - 1) * 0.8, d / 2 - 1.4, tower_h), b.mat("burnedWood"), parent=root,
                      rot=(math.radians(20 * (i - 1)), 0, 0))
    elif kind == "smithy":
        b.box("Esse", col, (1.4, 1.4, wall_h + rise + 1.2), (-w / 2 + 1.0, -d / 2 + 1.0, 0), stone, parent=root)
        b.box("Amboss", col, (0.5, 1.0, 0.8), (w / 2 + 1.5, d / 2 + 1.0, 0), b.mat("iron", roughness=0.4, metallic=0.6), parent=root)
    elif kind == "mill":
        wheel_r = min(3.2, wall_h * 0.55)
        wheel = b.cyl("Mühlrad", col, wheel_r, 1.1, (w / 2 + 0.75, 0, wheel_r * 0.85), b.mat("wood"), parent=root,
                      rot=(0, math.radians(90), 0), segments=24)
        wheel.location.x = w / 2 + 0.2
        for i in range(8):
            a = math.pi * i / 8
            b.box("Speiche", col, (0.25, wheel_r * 2.05, 0.25), (w / 2 + 0.75, 0, wheel_r * 0.85 - wheel_r), b.mat("woodDark"), parent=root,
                  rot=(a, 0, 0)).location.z = wheel_r * 0.85
    elif kind == "tavern":
        b.box("Schildarm", col, (0.15, 1.4, 0.15), (w / 2 - 0.6, d / 2 + 0.7, wall_h * 0.7), timber, parent=root)
        b.box("Schild", col, (0.1, 0.9, 0.7), (w / 2 - 0.6, d / 2 + 1.2, wall_h * 0.7 - 0.75), b.mat("sign", (0.55, 0.38, 0.2)), parent=root)
    elif kind == "guardpost":
        b.cyl("Fahnenmast", col, 0.08, 7.5, (w / 2 + 1.0, d / 2 + 1.0, 0), b.mat("woodDark"), parent=root)
        b.box("Banner", col, (0.05, 1.2, 1.8), (w / 2 + 1.0, d / 2 + 1.7, 5.4), b.mat("banner", (0.72, 0.74, 0.78)), parent=root)


def smoke_material(b):
    """Soft grey smoke as a volume (stills only; the video skips it for speed)."""
    if "smoke" in b.materials:
        return b.materials["smoke"]
    m = bpy.data.materials.new("smoke")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    vol = nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*lin((0.42, 0.4, 0.38)), 1.0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.35
    noise.inputs["Detail"].default_value = 2.0
    coords = nodes.new("ShaderNodeTexCoord")
    m.node_tree.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.4
    ramp.inputs["From Max"].default_value = 0.7
    ramp.inputs["To Min"].default_value = 0.0
    ramp.inputs["To Max"].default_value = 0.09
    m.node_tree.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    m.node_tree.links.new(ramp.outputs["Result"], vol.inputs["Density"])
    m.node_tree.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    b.materials["smoke"] = m
    return m


def smoke(b, col, root, seed):
    """Smoke plume of smouldering ruins: puffs that rise, widen and drift with the wind (east)."""
    if FAST["on"]:
        return
    mat = smoke_material(b)
    for i in range(6):
        t = i / 5.0
        size = 1.6 + 3.2 * t
        drift = 2.0 + 9.0 * t * t
        ob = b.obj("Rauch", smooth_ball(b), col, location=(drift * 0.8, drift * 0.3, 5.0 + i * 3.4), scale=(size, size, size * 0.8), parent=root)
        ob.rotation_euler = (0.0, 0.0, -root.rotation_euler.z)
        Builder.assign(ob, mat)


def smooth_ball(b):
    if "ball" in b.meshes:
        return b.meshes["ball"]
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    me = bpy.data.meshes.new("ball")
    bm.to_mesh(me)
    bm.free()
    b.meshes["ball"] = me
    return me


def cone_mesh(b):
    if "cone" in b.meshes:
        return b.meshes["cone"]
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=4, radius1=0.7071, radius2=0.0, depth=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(45), 3, "Z"))
    me = bpy.data.meshes.new("cone")
    bm.to_mesh(me)
    bm.free()
    b.meshes["cone"] = me
    return me


# ----------------------------------------------------------------------------------------------------------------------
# Vegetation and rocks
# ----------------------------------------------------------------------------------------------------------------------

def blob(bm, center, radii, subdiv, seed, roughness):
    """Lumpy ellipsoid (icosphere with deterministic bumps)."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rng = L.Pcg32(seed)
    for v in res["verts"]:
        n = v.co.normalized()
        bump = 1.0 + (rng.next_float() - 0.5) * roughness
        v.co = Vector((n.x * radii[0] * bump + center[0], n.y * radii[1] * bump + center[1], n.z * radii[2] * bump + center[2]))
    return res["verts"]


def plant_mesh(b, kind, variant):
    key = "plant_%s_%d" % (kind, variant)
    if key in b.meshes:
        return b.meshes[key]
    bm = bmesh.new()
    me = bpy.data.meshes.new(key)
    materials = []
    seed = 500 + variant * 13 + len(kind)

    def trunk(radius, height, mat_index, segments=8):
        r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius * 0.7, depth=height)
        bmesh.ops.translate(bm, verts=r["verts"], vec=(0, 0, height / 2 - 0.3))

    def crown(center, radii, subdiv, mat_index, rough=0.35, s=seed):
        verts = blob(bm, center, radii, subdiv, s, rough)
        vs = set(verts)
        for f in bm.faces:
            if all(v in vs for v in f.verts):
                f.material_index = mat_index

    if kind == "oak":
        trunk(0.38, 4.2, 0)
        crown((0, 0, 6.2), (3.6, 3.4, 3.0), 2, 1)
        crown((1.6, 0.8, 5.0), (2.2, 2.0, 1.8), 1, 1, s=seed + 1)
        crown((-1.5, -0.9, 5.3), (2.0, 2.2, 1.7), 1, 1, s=seed + 2)
        materials = [b.mat("barkOak"), b.mat("leafOak", roughness=0.9)]
    elif kind == "beech":
        trunk(0.32, 5.0, 0)
        crown((0, 0, 7.4), (3.0, 3.0, 4.2), 2, 1)
        materials = [b.mat("bark_beech", (0.48, 0.46, 0.42)), b.mat("leafBeech", roughness=0.9)]
    elif kind == "birch":
        trunk(0.17, 7.5, 0, segments=6)
        crown((0, 0, 8.0), (1.8, 1.8, 3.8), 1, 1, rough=0.5)
        crown((0.4, 0.3, 6.2), (1.4, 1.3, 1.6), 1, 1, rough=0.5, s=seed + 3)
        materials = [b.mat("barkBirch"), b.mat("leafBirch", roughness=0.9)]
    elif kind == "linden":
        trunk(0.6, 5.0, 0)
        crown((0, 0, 8.6), (5.4, 5.2, 4.6), 2, 1)
        crown((2.6, 1.0, 7.0), (3.0, 2.8, 2.4), 1, 1, s=seed + 4)
        crown((-2.4, -1.4, 7.2), (3.0, 2.6, 2.4), 1, 1, s=seed + 5)
        materials = [b.mat("barkOak"), b.mat("leafLinden", roughness=0.9)]
    elif kind == "dead":
        trunk(0.3, 6.0, 0, segments=6)
        rng = L.Pcg32(seed)
        for i in range(4):
            r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=5, radius1=0.12, radius2=0.04, depth=2.6)
            ang = rng.next_float() * math.tau
            mat_rot = Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(math.radians(40 + 20 * rng.next_float()), 3, "X")
            bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=mat_rot)
            bmesh.ops.translate(bm, verts=r["verts"], vec=(math.sin(ang) * -0.6, math.cos(ang) * 0.6, 3.2 + i * 0.7))
        materials = [b.mat("burnedWood")]
    elif kind == "bush":
        crown((0, 0, 0.7), (1.5, 1.4, 1.05), 2, 0, rough=0.45)
        materials = [b.mat("bush", roughness=0.9)]
    elif kind == "rock":
        # Same vertices as RockGeometry.Boulder in Unity (reaches below the pivot, half buried on slopes).
        verts, tris = L.rock_boulder(seed)
        bm.free()
        bpy.data.meshes.remove(me)
        me = unity_mesh(key, verts, tris)
        me.materials.append(b.mat("rock", roughness=0.9))
        b.meshes[key] = me
        return me
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = kind not in ("rock",)
    for m in materials:
        me.materials.append(m)
    b.meshes[key] = me
    return me


def build_vegetation(b, cache):
    count = 0
    for i, p in enumerate(cache["plants"]):
        kind = p["kind"]
        variant = i % 2
        me = plant_mesh(b, kind, variant)
        y = ground_y(b, p["x"], p["z"]) - 0.15
        s = p["scale"]
        b.obj("%s %d" % (kind, i), me, "Vegetation", location=bv(p["x"], p["z"], y), rotation_z=-math.radians(p["yaw"]), scale=(s, s, s))
        count += 1
    print("[eichental] plants:", count)


def rock_mesh(b, variant):
    """Landmark rock: the same vertices as RockGeometry.Landmark in Unity (flat underside at the pivot, cut sides)."""
    key = "rock_big_%d" % variant
    if key in b.meshes:
        return b.meshes[key]
    verts, tris = L.rock_landmark(variant)
    me = unity_mesh(key, verts, tris)
    me.materials.append(b.mat("rock", roughness=0.9))
    b.meshes[key] = me
    return me


def build_rocks(b):
    for rk in b.layout.get("rocks", []):
        x, z = rk["position"]
        sx, sy, sz = rk["size"]
        y = L.rock_base_height(ground_y(b, x, z), sy, rk.get("lift", 0.0))
        b.obj(rk["id"], rock_mesh(b, rk.get("variant", 0)), "Rocks", location=bv(x, z, y), rotation_z=-math.radians(rk.get("yaw", 0)),
              scale=(sx, sz, sy))


# ----------------------------------------------------------------------------------------------------------------------
# Paths are painted; bridges, fences, fields, props
# ----------------------------------------------------------------------------------------------------------------------

def build_bridges(b):
    for br in b.layout.get("bridges", []):
        x, z = br["position"]
        y = max(ground_y(b, x + dx, z + dz) for dx, dz in [L.rotate_local(0, s * br["length"] / 2, br["yaw"]) for s in (-1, 1)])
        root = b.empty(br["id"], "Bridges", x, z, y, br["yaw"])
        if br["kind"] == "stone":
            st = b.mat("stone")
            # Deck top at the pivot (y = 0) like the Unity generator; the arch ring lies under the deck (BridgeGeometry.StoneArch).
            b.box("Fahrbahn", "Bridges", (br["width"], br["length"], L.BRIDGE_DECK), (0, 0, -L.BRIDGE_DECK), st, parent=root)
            for sx in (-1, 1):
                b.box("Brüstung", "Bridges", (0.4, br["length"], 0.7), (sx * (br["width"] / 2 + 0.2), 0, 0.0), st, parent=root)
            quads = L.stone_arch(br["width"], br["length"])
            verts = [p for q in quads for p in q]
            arch = b.obj("Bogen", unity_mesh("arch_" + br["id"], verts, [(4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3) for i in range(len(quads))]),
                         "Bridges", parent=root)
            b.assign(arch, st)
        else:
            wd = b.mat("wood")
            b.box("Planken", "Bridges", (br["width"], br["length"], 0.25), (0, 0, -0.25), wd, parent=root)
            for sx in (-1, 1):
                b.box("Geländer", "Bridges", (0.12, br["length"], 0.12), (sx * br["width"] / 2, 0, 0.94), wd, parent=root)
                for sy in (-1, 0, 1):
                    b.box("Pfosten", "Bridges", (0.15, 0.15, 1.1), (sx * br["width"] / 2, sy * br["length"] * 0.45, 0), wd, parent=root)


def build_fences(b):
    wd = b.mat("wood")
    for fence in b.layout.get("fences", []):
        pts = list(fence["points"]) + ([fence["points"][0]] if fence.get("closed") else [])
        bm = bmesh.new()
        hgt = fence.get("height", 1.0)
        for k in range(len(pts) - 1):
            ax, az = pts[k]
            bx, bz = pts[k + 1]
            length = math.hypot(bx - ax, bz - az)
            n = max(1, int(math.ceil(length / 2.5)))
            for s in range(n + 1):
                f = s / n
                px, pz = ax + (bx - ax) * f, az + (bz - az) * f
                py = ground_y(b, px, pz)
                r = bmesh.ops.create_cube(bm, size=1.0)
                bmesh.ops.scale(bm, vec=(0.14, 0.14, hgt + 0.3), verts=r["verts"])
                bmesh.ops.translate(bm, vec=(px, pz, py + (hgt + 0.3) / 2 - 0.3), verts=r["verts"])
            for s in range(n):
                f0, f1 = s / n, (s + 1) / n
                p0 = (ax + (bx - ax) * f0, az + (bz - az) * f0)
                p1 = (ax + (bx - ax) * f1, az + (bz - az) * f1)
                h0, h1 = ground_y(b, *p0), ground_y(b, *p1)
                for rail in (0.45, 0.9):
                    seg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                    r = bmesh.ops.create_cube(bm, size=1.0)
                    bmesh.ops.scale(bm, vec=(seg, 0.08, 0.1), verts=r["verts"])
                    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
                    tilt = math.atan2(h1 - h0, seg)
                    rot = Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(-tilt, 3, "Y")
                    bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=rot)
                    bmesh.ops.translate(bm, vec=((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (h0 + h1) / 2 + rail * hgt), verts=r["verts"])
        me = bpy.data.meshes.new(fence["id"])
        bm.to_mesh(me)
        bm.free()
        me.materials.append(wd)
        b.obj(fence["id"], me, "Fences")


def build_fields(b):
    for field in b.layout.get("fields", []):
        state = field["state"]
        if state == "ripe":
            mat, height, width = b.mat("wheat", roughness=0.9), 0.95, 0.75
        elif state == "burned":
            mat, height, width = b.mat("wheatBurned", roughness=0.95), 0.22, 0.6
        else:
            mat, height, width = b.mat("stubble", roughness=0.95), 0.16, 0.7
        cx, cz = field["center"]
        fw, fd = field["size"]
        spacing = field.get("rowSpacing", 1.4)
        rows = int(fw / spacing)
        bm = bmesh.new()
        for i in range(rows):
            lx = -fw / 2 + spacing * (i + 0.5)
            segs = max(1, int(fd / 4.0))
            for s in range(segs):
                lz = -fd / 2 + fd * (s + 0.5) / segs
                ox, oz = L.rotate_local(lx, lz, field["yaw"])
                px, pz = cx + ox, cz + oz
                py = ground_y(b, px, pz)
                r = bmesh.ops.create_cube(bm, size=1.0)
                bmesh.ops.scale(bm, vec=(width, fd / segs * 1.02, height), verts=r["verts"])
                bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(-math.radians(field["yaw"]), 3, "Z"))
                bmesh.ops.translate(bm, vec=(px, pz, py + height / 2 - 0.05), verts=r["verts"])
        me = bpy.data.meshes.new(field["id"])
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        b.obj(field["id"], me, "Fields")


def build_prop(b, p):
    col = "Props"
    x, z = p["position"]
    root = b.empty(p["id"], col, x, z, ground_y(b, x, z), p.get("yaw", 0.0))
    k = p["kind"]
    wd, dark, st = b.mat("wood"), b.mat("woodDark"), b.mat("stone")
    if k == "well":
        b.cyl("Brunnenrand", col, 1.1, 0.9, (0, 0, 0), st, parent=root, segments=16)
        b.cyl("Wasser", col, 0.85, 0.92, (0, 0, 0), b.mat("water", roughness=0.08), parent=root, segments=16)
        for sx in (-1, 1):
            b.box("Stütze", col, (0.15, 0.15, 2.4), (sx * 0.95, 0, 0), dark, parent=root)
        b.box("Dächlein", col, (2.4, 1.4, 0.12), (0, 0, 2.4), b.mat("shingle"), parent=root)
    elif k == "campfire":
        b.cyl("Steine", col, 0.8, 0.25, (0, 0, 0), st, parent=root, segments=10)
        b.cyl("Feuer", col, 0.45, 0.5, (0, 0, 0.2), b.glow("ember", 12.0), parent=root, segments=8)
        light = bpy.data.lights.new("Lagerfeuer", "POINT")
        light.energy = 600.0
        light.color = lin(b.palette["ember"])
        lo = bpy.data.objects.new("Feuerlicht", light)
        lo.parent = root
        lo.location = (0, 0, 1.0)
        b.link(lo, col)
        for i in range(4):
            b.box("Sitzstamm", col, (1.6, 0.4, 0.4), (math.sin(i * 1.57) * 2.0, math.cos(i * 1.57) * 2.0, 0), wd, parent=root,
                  rot=(0, 0, i * 1.57 + 1.57))
    elif k == "cart":
        b.box("Wagenkasten", col, (1.6, 2.6, 0.6), (0, 0, 0.6), wd, parent=root)
        for sx in (-1, 1):
            b.cyl("Rad", col, 0.6, 0.12, (sx * 0.9, -0.3, 0.6), dark, parent=root, rot=(0, math.radians(90), 0), segments=12).location.x = sx * 0.9 - 0.06
        b.box("Deichsel", col, (0.12, 2.0, 0.12), (0, 2.2, 0.55), wd, parent=root)
    elif k == "signpost":
        b.box("Pfahl", col, (0.15, 0.15, 2.4), (0, 0, 0), dark, parent=root)
        b.box("Schild", col, (1.4, 0.06, 0.3), (0.5, 0, 1.9), wd, parent=root)
        b.box("Schild", col, (1.2, 0.06, 0.3), (-0.4, 0, 1.45), wd, parent=root, rot=(0, 0, 0.3))
    elif k == "wayside_cross":
        b.box("Sockel", col, (0.8, 0.8, 0.5), (0, 0, 0), st, parent=root)
        b.box("Kreuz", col, (0.2, 0.2, 2.2), (0, 0, 0.5), dark, parent=root)
        b.box("Querbalken", col, (1.0, 0.18, 0.18), (0, 0, 2.0), dark, parent=root)
        b.box("Tafel", col, (0.6, 0.06, 0.45), (0, 0.15, 0.9), b.mat("plaster"), parent=root)
    elif k == "barricade":
        for i in range(3):
            b.cyl("Stamm", col, 0.35, 12.0, (0, (i - 1) * 0.9, 0.35 + (0.6 if i == 1 else 0)), b.mat("barkOak"), parent=root,
                  rot=(0, math.radians(90), math.radians(4 * (i - 1)))).location.x = -6.0
        b.box("Pfahl", col, (0.12, 0.12, 1.4), (6.4, 1.6, 0), dark, parent=root)
    elif k == "notice_board":
        for sx in (-1, 1):
            b.box("Pfosten", col, (0.14, 0.14, 2.2), (sx * 0.85, 0, 0), dark, parent=root)
        b.box("Tafel", col, (1.8, 0.08, 1.1), (0, 0, 1.0), wd, parent=root)
        b.box("Dach", col, (2.1, 0.4, 0.12), (0, 0, 2.2), b.mat("shingle"), parent=root)
        paper = b.mat("paper", (0.93, 0.9, 0.8))
        b.box("Aushang", col, (0.45, 0.02, 0.6), (-0.4, 0.05, 1.3), paper, parent=root)
        b.box("Aushang", col, (0.4, 0.02, 0.5), (0.35, 0.05, 1.2), paper, parent=root)
        glint = b.obj("Glitzern", ico_mesh(b), col, location=(0.0, 0.1, 2.6), scale=(0.15, 0.15, 0.15), parent=root)
        Builder.assign(glint, b.glow("questMarker", 4.0))
    elif k == "tent":
        tent = b.obj("Zelt", prism_mesh(b), col, location=(0, 0, 0), scale=(3.2, 4.0, 2.2), parent=root)
        Builder.assign(tent, b.mat("cloth"))
    elif k == "hay_bale":
        b.cyl("Heu", col, 0.7, 1.2, (0, 0, 0.7), b.mat("thatch"), parent=root, rot=(0, math.radians(90), 0)).location = (-0.6, 0, 0.7)
    elif k == "sheep":
        b.box("Körper", col, (0.7, 1.2, 0.7), (0, 0, 0.4), b.mat("sheep"), parent=root)
        b.box("Kopf", col, (0.3, 0.4, 0.35), (0, 0.75, 0.8), b.mat("sheepHead", (0.2, 0.18, 0.17)), parent=root)
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.box("Bein", col, (0.12, 0.12, 0.45), (sx * 0.22, sy * 0.4, 0), b.mat("sheepHead", (0.2, 0.18, 0.17)), parent=root)
    elif k == "crate_stack":
        b.box("Kiste", col, (1.0, 1.0, 0.9), (0, 0, 0), wd, parent=root)
        b.box("Kiste", col, (0.9, 0.9, 0.8), (1.1, 0.1, 0), wd, parent=root, rot=(0, 0, 0.3))
        b.box("Kiste", col, (0.8, 0.8, 0.7), (0.3, 0.1, 0.9), wd, parent=root, rot=(0, 0, 0.6))
        b.box("Sack", col, (0.7, 0.5, 0.5), (-0.9, 0.3, 0), b.mat("cloth"), parent=root)
    elif k == "barrel":
        for i in range(3):
            b.cyl("Fass", col, 0.4, 1.0, ((i - 1) * 0.85, 0, 0), wd, parent=root, segments=12)
    elif k == "oil_barrel":
        b.cyl("Ölfass", col, 0.4, 1.0, (0, 0, 0), b.mat("barrelWood", (0.45, 0.3, 0.16)), parent=root, segments=12)
    elif k == "powder_keg":
        b.cyl("Pulverfass", col, 0.35, 0.7, (0, 0, 0), b.mat("powderKeg", (0.22, 0.18, 0.14)), parent=root, segments=12)
    elif k == "crypt_entrance":
        st2 = b.mat("crypt_stone", (0.55, 0.53, 0.5))
        for sx in (-1, 1):
            b.box("Säule", col, (1.0, 1.0, 4.6), (sx * 2.3, 0, -0.5), st2, parent=root)
        b.box("Sturz", col, (5.8, 1.3, 1.1), (0, 0, 4.0), st2, parent=root)
        b.box("Dunkel", col, (3.6, 0.2, 3.9), (0, -0.55, -0.5), b.mat("void", (0.01, 0.01, 0.012), roughness=1.0), parent=root)
        for i in range(2):
            b.box("Stufe", col, (3.6, 0.6, 0.3 - i * 0.12), (0, 0.85 + i * 0.6, -0.3), st2, parent=root)
        b.box("Relief", col, (1.2, 0.1, 0.6), (0, 0.66, 4.25), b.mat("relief", (0.42, 0.4, 0.38)), parent=root)
    elif k == "cave_mouth":
        b.box("Höhle", col, (4.0, 0.3, 3.0), (0, -0.2, -0.3), b.mat("void", (0.01, 0.01, 0.012), roughness=1.0), parent=root)
    elif k == "cairn":
        for i in range(4):
            s = 0.9 - i * 0.18
            b.box("Stein", col, (s, s, 0.35), (0, 0, i * 0.33), st, parent=root, rot=(0, 0, i * 0.7))


def ico_mesh(b):
    if "ico" in b.meshes:
        return b.meshes["ico"]
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    me = bpy.data.meshes.new("ico")
    bm.to_mesh(me)
    bm.free()
    b.meshes["ico"] = me
    return me


def prism_mesh(b):
    if "prism" in b.meshes:
        return b.meshes["prism"]
    verts = [(-0.5, -0.5, 0), (0.5, -0.5, 0), (0, -0.5, 1), (-0.5, 0.5, 0), (0.5, 0.5, 0), (0, 0.5, 1)]
    faces = [(0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (1, 2, 5, 4), (0, 1, 4, 3)]
    me = bpy.data.meshes.new("prism")
    me.from_pydata(verts, [], faces)
    b.meshes["prism"] = me
    return me


# ----------------------------------------------------------------------------------------------------------------------
# Rift, gameplay objects, characters
# ----------------------------------------------------------------------------------------------------------------------

def build_rift(b):
    rift = b.layout.get("rift")
    if not rift:
        return
    cx, cz = rift["center"]
    floor = ground_y(b, cx, cz)
    col = "Rift"
    # The tear: a jagged vertical sliver of light, core almost white with a turquoise rim (GDD 05 3.4).
    rng = L.Pcg32(rift["crystalSeed"] + 99)
    height, width = rift["tearHeight"], rift["tearWidth"]
    left, right = [], []
    steps = 12
    for i in range(steps + 1):
        t = i / steps
        profile = math.sin(math.pi * t) ** 0.8
        jag = (rng.next_float() - 0.5) * 0.9
        left.append((-(width / 2) * profile + jag * profile, 0.0, 1.0 + t * height))
        right.append(((width / 2) * profile + jag * profile * 0.6, 0.0, 1.0 + t * height))
    verts = left + right
    faces = [(i, i + 1, steps + 2 + i, steps + 1 + i) for i in range(steps)]
    me = bpy.data.meshes.new("Riss")
    me.from_pydata(verts, [], faces)
    tear = b.obj("Riss", me, col, location=bv(cx, cz, floor), rotation_z=-math.radians(rift["tearYaw"]))
    Builder.assign(tear, b.glow("aetherCore", 9.0))
    halo_verts = [(v[0] * 1.9, 0.02, v[2]) for v in verts]
    me2 = bpy.data.meshes.new("Rissrand")
    me2.from_pydata(halo_verts, [], faces)
    halo = b.obj("Rissrand", me2, col, location=bv(cx, cz, floor), rotation_z=-math.radians(rift["tearYaw"]))
    Builder.assign(halo, b.glow("aether", 4.0))
    for i, (x, z, h, tx, tz, yaw) in enumerate(L.rift_crystals(rift)):
        ob = b.obj("Kristall %d" % i, crystal_mesh(b), col, location=bv(x, z, ground_y(b, x, z) - 0.2), scale=(0.35 * h, 0.35 * h, h))
        ob.rotation_euler = (math.radians(tx), math.radians(tz), -math.radians(yaw))
        Builder.assign(ob, b.glow("aether", 3.0))
    # Glowing fracture lines on the ground (GDD 05 3.4: Bruchlinien wie gesprungenes Glas).
    crack_rng = L.Pcg32(rift["crystalSeed"] + 7)
    for i in range(9):
        a = i / 9.0 * math.tau + crack_rng.next_float() * 0.4
        length = rift["radius"] * (0.9 + 0.9 * crack_rng.next_float())
        start = rift["radius"] * 0.55
        mx, mz = cx + math.sin(a) * (start + length / 2), cz + math.cos(a) * (start + length / 2)
        ob = b.obj("Bruchlinie", b.box_mesh(), col, location=bv(mx, mz, ground_y(b, mx, mz) - 0.02), scale=(0.25, length, 0.08))
        ob.rotation_euler = (0.0, 0.0, -a + (crack_rng.next_float() - 0.5) * 0.5)
        Builder.assign(ob, b.glow("aether", 5.0))
    light = bpy.data.lights.new("Aether", "POINT")
    light.energy = 25000.0
    light.color = lin(b.palette["aether"])
    light.shadow_soft_size = 2.0
    lo = bpy.data.objects.new("Aetherlicht", light)
    lo.location = bv(cx, cz, floor + 6.0)
    b.link(lo, col)


def crystal_mesh(b):
    if "crystal" in b.meshes:
        return b.meshes["crystal"]
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=5, radius1=0.5, radius2=0.0, depth=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    me = bpy.data.meshes.new("crystal")
    bm.to_mesh(me)
    bm.free()
    b.meshes["crystal"] = me
    return me


def capsule_mesh(b):
    if "capsule" in b.meshes:
        return b.meshes["capsule"]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.5)
    for v in bm.verts:
        v.co.z = v.co.z + (0.5 if v.co.z > 0 else -0.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 1.0))
    me = bpy.data.meshes.new("capsule")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    b.meshes["capsule"] = me
    return me


def build_wolf(b, col, x, z, yaw, aether):
    root = b.empty("Wolf", col, x, z, ground_y(b, x, z), yaw)
    fur = b.mat("aether_wolf", UNITY_COLORS["aether_wolf"]) if aether else b.mat("wolf_fur", UNITY_COLORS["wolf"])
    b.box("Rumpf", col, (0.5, 1.25, 0.55), (0, 0.0, 0.33), fur, parent=root)
    b.box("Kopf", col, (0.38, 0.42, 0.36), (0, 0.75, 0.6), fur, parent=root)
    b.box("Schnauze", col, (0.2, 0.25, 0.18), (0, 1.05, 0.62), b.mat("nose", UNITY_COLORS["nose"]), parent=root)
    b.box("Schwanz", col, (0.1, 0.45, 0.1), (0, -0.75, 0.62), fur, parent=root)
    for i in range(4):
        b.box("Bein", col, (0.12, 0.12, 0.5), ((-0.18 if i % 2 == 0 else 0.18), (0.45 if i < 2 else -0.45), 0), fur, parent=root)
    if aether:
        core = b.box("Kristallkern", col, (0.28, 0.28, 0.28), (0, 0.0, 0.85), b.glow("aether", 5.0), parent=root)
        core.rotation_euler = (math.radians(45), 0, math.radians(45))


def build_gameplay(b, with_markers=True):
    lay = b.layout
    col = "Gameplay"
    for sp in lay.get("spawners", []):
        if sp["activation"] != "always":
            continue
        aether = sp["variant"] == "aether_verderbt" or sp.get("standIn", {}).get("variant") == "aether_verderbt"
        for (x, z, yaw) in L.spawner_positions(sp):
            build_wolf(b, col, x, z, yaw, aether)
    for chest in lay.get("chests", []):
        x, z = chest["position"]
        root = b.empty(chest["id"], col, x, z, chest_floor(b, lay, x, z), chest.get("yaw", 0))
        m = b.mat("chest_" + chest["tier"], UNITY_COLORS["chest_" + chest["tier"]], roughness=0.5)
        b.box("Korpus", col, (1.0, 0.6, 0.6), (0, 0, 0), m, parent=root)
        b.box("Deckel", col, (1.04, 0.64, 0.14), (0, 0, 0.6), m, parent=root)
        glint = b.obj("Glitzern", ico_mesh(b), col, location=(0, 0, 1.2), scale=(0.09, 0.09, 0.09), parent=root)
        Builder.assign(glint, b.glow("questMarker", 6.0))
    if with_markers:
        npc = b.mat("npcMarker", roughness=0.6)
        for marker in lay.get("npcMarkers", []):
            x, z = marker["position"]
            root = b.empty(marker["npcId"], col, x, z, ground_y(b, x, z), marker.get("yaw", 0))
            ob = b.obj("NPC", capsule_mesh(b), col, scale=(0.6, 0.6, 0.85), parent=root)
            Builder.assign(ob, npc)
            b.box("Nase", col, (0.16, 0.25, 0.12), (0, 0.32, 1.35), b.mat("nose", UNITY_COLORS["nose"]), parent=root)
    for q in lay.get("questObjects", []):
        x, z = q["position"]
        root = b.empty(q["id"], col, x, z, ground_y(b, x, z), q.get("yaw", 0))
        kind = q["kind"]
        if kind == "beam":
            b.box("Balken", col, (0.35, 4.0, 0.35), (0, 0, 0.3), b.mat("burnedWood"), parent=root, rot=(math.radians(12), 0, 0))
        elif kind == "door":
            b.box("Tür", col, (1.2, 0.15, 2.2), (0, 0, 0), b.mat("door", (0.25, 0.16, 0.1)), parent=root)
        elif kind == "straw_target":
            b.cyl("Strohziel", col, 0.6, 0.35, (0, 0, 1.2), b.mat("thatch"), parent=root, rot=(math.radians(90), 0, 0), segments=14)
            b.box("Gestell", col, (0.1, 0.1, 1.2), (0, -0.1, 0), b.mat("woodDark"), parent=root)
        elif kind == "corpse":
            b.box("Leiche", col, (0.5, 1.7, 0.3), (0, 0, 0), b.mat("cloth_dark", (0.3, 0.26, 0.22)), parent=root)
            b.box("Postsack", col, (0.5, 0.4, 0.35), (0.6, 0.4, 0), b.mat("cloth"), parent=root)
        elif kind == "aether_shard":
            ob = b.obj("Splitter", crystal_mesh(b), col, location=(0, 0, 0.3), scale=(0.6, 0.6, 1.6), parent=root)
            Builder.assign(ob, b.glow("aether", 6.0))
        elif kind == "pup":
            b.box("Welpe", col, (0.3, 0.55, 0.3), (0, 0, 0.1), b.mat("wolf_fur", UNITY_COLORS["wolf"]), parent=root)
        elif kind == "clue":
            ob = b.obj("Hinweis", ico_mesh(b), col, location=(0, 0, 0.25), scale=(0.18, 0.18, 0.18), parent=root)
            Builder.assign(ob, b.glow("questMarker", 5.0) if "aether" not in q["id"] else b.glow("aether", 5.0))
            b.box("Spur", col, (0.8, 0.8, 0.03), (0, 0, 0.01), b.mat("trace", (0.3, 0.22, 0.18)), parent=root)
    # Trail nodes: small glowing marks on the ground like the generator's "Spurzeichen".
    for trail in lay.get("trails", []):
        for i, (x, z) in enumerate(trail["nodes"]):
            b.cyl("Spurzeichen %s %d" % (trail["id"], i), col, 0.35, 0.04, bv(x, z, ground_y(b, x, z) + 0.01), b.glow("questMarker", 3.0),
                  segments=12)
    start = lay["playerStart"]
    build_player(b, start["position"][0], start["position"][1], start["yaw"])


def build_player(b, x, z, yaw):
    col = "Player"
    root = b.empty("Player", col, x, z, ground_y(b, x, z), yaw)
    ob = b.obj("Körper", capsule_mesh(b), col, scale=(0.7, 0.7, 0.9), parent=root)
    Builder.assign(ob, b.mat("player", UNITY_COLORS["player"], roughness=0.5))
    b.box("Nase", col, (0.18, 0.3, 0.12), (0, 0.45, 1.39), b.mat("nose", UNITY_COLORS["nose"]), parent=root)
    b.box("Schwert", col, (0.06, 1.0, 0.12), (0.42, 0.7, 1.09), b.mat("sword", UNITY_COLORS["sword"], roughness=0.3, metallic=0.8), parent=root)
    b.box("Schild", col, (0.55, 0.08, 0.7), (-0.45, 0.22, 0.75), b.mat("shield", UNITY_COLORS["shield"]), parent=root)


# ----------------------------------------------------------------------------------------------------------------------
# World, light, render
# ----------------------------------------------------------------------------------------------------------------------

def setup_world(b, fog=True):
    scene = b.scene
    lighting = b.layout["lighting"]
    world = bpy.data.worlds.new("Himmel")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    coords = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    rng = nodes.new("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value = -0.05
    rng.inputs["From Max"].default_value = 0.65
    ramp = nodes.new("ShaderNodeValToRGB")
    horizon = lin(L.hex_rgb(lighting["skyHorizon"]))
    top = lin(L.hex_rgb(lighting["skyTop"]))
    ground = lin(L.hex_rgb(lighting["ambientGround"]))
    el = ramp.color_ramp.elements
    el[0].position = 0.0
    el[0].color = (*ground, 1)
    el[1].position = 0.07
    el[1].color = (*horizon, 1)
    mid = tuple(horizon[i] * 0.35 + top[i] * 0.65 for i in range(3))
    e = el.new(0.4)
    e.color = (*mid, 1)
    e = el.new(1.0)
    e.color = (*top, 1)
    links.new(coords.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["Z"], rng.inputs["Value"])
    links.new(rng.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    if FAST["on"]:
        world.cycles_visibility.diffuse = False
        world.cycles_visibility.glossy = False
        world.cycles_visibility.transmission = False
        world.cycles_visibility.scatter = False
    world.mist_settings.start = 40.0
    world.mist_settings.depth = 650.0
    world.mist_settings.falloff = "QUADRATIC"

    sun_data = bpy.data.lights.new("Sonne", "SUN")
    sun_data.energy = 4.2 * lighting["sunIntensity"]
    sun_data.color = lin(L.hex_rgb(lighting["sunColor"]))
    sun_data.angle = math.radians(0.3 if FAST["on"] else 1.2)
    sun = bpy.data.objects.new("Sonne", sun_data)
    az = math.radians(lighting["sunAzimuth"])
    el_ = math.radians(lighting["sunElevation"])
    to_sun = Vector((math.sin(az) * math.cos(el_), math.cos(az) * math.cos(el_), math.sin(el_)))
    sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)


def setup_compositor_v5(b, fog):
    """Blender 5: the compositor is a node group (scene.compositing_node_group) with a group output; Math and Mix are the
    shared nodes (ShaderNodeMath, ShaderNodeMix). Same fog as below."""
    scene = b.scene
    if not fog:
        scene.compositing_node_group = None
        return
    tree = bpy.data.node_groups.new("Eichental Nebel", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scene.compositing_node_group = tree
    rl = tree.nodes.new("CompositorNodeRLayers")
    out = tree.nodes.new("NodeGroupOutput")
    bpy.context.view_layer.use_pass_mist = True
    lighting = b.layout["lighting"]
    fog_rgb = lin(L.hex_rgb(lighting["fogColor"]))
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    # RGBA sockets of the Mix node: inputs 0 = factor, 6 = A, 7 = B; output 2 = colour result.
    mix.inputs[7].default_value = (*fog_rgb, 1)
    geometry = tree.nodes.new("ShaderNodeMath")
    geometry.operation = "LESS_THAN"
    geometry.inputs[1].default_value = 0.9999
    tree.links.new(rl.outputs["Mist"], geometry.inputs[0])
    keep = tree.nodes.new("ShaderNodeMath")
    keep.operation = "MULTIPLY_ADD"
    keep.inputs[1].default_value = 0.75
    keep.inputs[2].default_value = 0.25
    tree.links.new(geometry.outputs[0], keep.inputs[0])
    scale = tree.nodes.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    tree.links.new(rl.outputs["Mist"], scale.inputs[0])
    tree.links.new(keep.outputs[0], scale.inputs[1])
    scale2 = tree.nodes.new("ShaderNodeMath")
    scale2.operation = "MULTIPLY"
    scale2.inputs[1].default_value = 0.6
    tree.links.new(scale.outputs[0], scale2.inputs[0])
    tree.links.new(scale2.outputs[0], mix.inputs[0])
    tree.links.new(rl.outputs["Image"], mix.inputs[6])
    tree.links.new(mix.outputs[2], out.inputs[0])


def setup_compositor(b, fog):
    scene = b.scene
    if bpy.app.version >= (5, 0, 0):
        setup_compositor_v5(b, fog)
        return
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()
    rl = tree.nodes.new("CompositorNodeRLayers")
    comp = tree.nodes.new("CompositorNodeComposite")
    if fog:
        bpy.context.view_layer.use_pass_mist = True
        lighting = b.layout["lighting"]
        mix = tree.nodes.new("CompositorNodeMixRGB")
        mix.blend_type = "MIX"
        fog_rgb = lin(L.hex_rgb(lighting["fogColor"]))
        mix.inputs[2].default_value = (*fog_rgb, 1)
        # Fog factor = mist * 0.6, but only a third of that on the sky (mist = 1), so the sky keeps its colour.
        geometry = tree.nodes.new("CompositorNodeMath")
        geometry.operation = "LESS_THAN"
        geometry.inputs[1].default_value = 0.9999
        tree.links.new(rl.outputs["Mist"], geometry.inputs[0])
        keep = tree.nodes.new("CompositorNodeMath")
        keep.operation = "MULTIPLY_ADD"
        keep.inputs[1].default_value = 0.75
        keep.inputs[2].default_value = 0.25
        tree.links.new(geometry.outputs[0], keep.inputs[0])
        scale = tree.nodes.new("CompositorNodeMath")
        scale.operation = "MULTIPLY"
        tree.links.new(rl.outputs["Mist"], scale.inputs[0])
        tree.links.new(keep.outputs[0], scale.inputs[1])
        scale2 = tree.nodes.new("CompositorNodeMath")
        scale2.operation = "MULTIPLY"
        scale2.inputs[1].default_value = 0.6
        tree.links.new(scale.outputs[0], scale2.inputs[0])
        tree.links.new(scale2.outputs[0], mix.inputs[0])
        tree.links.new(rl.outputs["Image"], mix.inputs[1])
        tree.links.new(mix.outputs[0], comp.inputs["Image"])
    else:
        tree.links.new(rl.outputs["Image"], comp.inputs["Image"])


def setup_render(scene, res, samples, video=False):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03 if not video else 0.06
    scene.cycles.max_bounces = 3 if not video else 0
    scene.cycles.diffuse_bounces = 2 if not video else 0
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 2
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.cycles.filter_width = 1.7
    scene.cycles.light_sampling_threshold = 0.05
    scene.render.use_persistent_data = True
    scene.render.threads_mode = "AUTO"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Punchy"
    except TypeError:
        scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0


def camera(b, name, position, target, lens=32.0, ortho=None):
    data = bpy.data.cameras.new(name)
    data.clip_start = 0.3
    data.clip_end = 2000.0
    if ortho:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    else:
        data.lens = lens
        data.sensor_width = 36.0
    cam = bpy.data.objects.new(name, data)
    b.scene.collection.objects.link(cam)
    aim(cam, position, target)
    b.scene.camera = cam
    return cam


def aim(cam, position, target):
    cam.location = position
    direction = Vector(target) - Vector(position)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_all(layout, cache, markers=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    heights = GridHeights(layout, cache["heights"])
    b = Builder(layout, heights)
    t0 = time.time()
    build_terrain(b, cache)
    build_water(b)
    for i, bd in enumerate(layout.get("buildings", [])):
        build_building(b, bd, i)
    build_bridges(b)
    build_fences(b)
    build_fields(b)
    for p in layout.get("props", []):
        build_prop(b, p)
    build_rocks(b)
    build_vegetation(b, cache)
    build_rift(b)
    build_gameplay(b, markers)
    print("[eichental] scene built in %.1f s" % (time.time() - t0))
    return b


def render_still(b, path):
    b.scene.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print("[eichental] rendered %s in %.1f s" % (path, time.time() - t0))


# ----------------------------------------------------------------------------------------------------------------------
# Jobs
# ----------------------------------------------------------------------------------------------------------------------

def h_at(b, x, z):
    return b.h.height(x, z)


def job_uebersicht(b, args):
    setup_world(b)
    setup_compositor(b, fog=True)
    setup_render(b.scene, (1920, 1080) if not args.test else (960, 540), args.samples)
    cam = camera(b, "Übersicht", bv(-95.0, -232.0, 92.0), bv(10.0, 30.0, 4.0), lens=24.0)
    write_tags(b, cam, os.path.join(args.out, "eichental_uebersicht_daten.json"), OVERVIEW_TAGS)
    render_still(b, os.path.join(args.out, "eichental_uebersicht_roh.png"))


# Name tags of the overview: location id (or rift) and the short German name.
OVERVIEW_TAGS = [
    ("loc.eichental.lindenhain", "Lindenhain"),
    ("loc.eichental.dorfplatz", "Dorf Eichental"),
    ("rift", "Der Riss"),
    ("loc.eichental.vergessene_gruft", "Gruft am Rabenfels"),
    ("loc.eichental.wolfsbau_nordhang", "Wolfsbau (Nordhang)"),
    ("loc.eichental.hof_hollmann", "Hollmann-Hof"),
    ("loc.eichental.muehle_muehlbach", "Mühle"),
]


def write_tags(b, cam, path, tags):
    b.scene.render.resolution_x = b.scene.render.resolution_x
    places = {loc["id"]: loc["center"] for loc in b.layout["locations"]}
    places["rift"] = b.layout["rift"]["center"]
    out = []
    bpy.context.view_layer.update()
    for key, text in tags:
        x, z = places[key]
        lift = 16.0 if key == "rift" else 8.0
        co = world_to_camera_view(b.scene, cam, bv(x, z, b.h.height(x, z) + lift))
        out.append({"text": text, "u": co.x, "v": co.y, "depth": co.z})
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"tags": out}, f, ensure_ascii=False, indent=1)


def job_dorf(b, args):
    setup_world(b)
    setup_compositor(b, fog=True)
    setup_render(b.scene, (1920, 1080) if not args.test else (960, 540), args.samples)
    # Elevated view from the south-west over the burned village towards the rift (sun from behind the left shoulder).
    px, pz = -8.0, -88.0
    camera(b, "Dorf", bv(px, pz, h_at(b, px, pz) + 24.0), bv(66.0, 6.0, h_at(b, 66, 6) + 2.0), lens=30.0)
    render_still(b, os.path.join(args.out, "eichental_dorf_roh.png"))


# Close-ups of places the overview and the map do not show well: the rocks around the crypt entrance and the wolf den (do they
# sit on the ground?) and the stone bridge from the side and from above (is the roadway free?). Each entry: file name, camera
# (x, z, height above ground) and target (x, z, height above ground).
CLOSEUPS = [
    ("eichental_nah_gruft", (2.0, 126.0, 5.0), (3.0, 162.0, 8.0)),
    ("eichental_nah_wolfsbau", (-104.0, 168.0, 4.0), (-82.0, 193.0, 5.0)),
    ("eichental_nah_steinbruecke", (-163.0, 49.0, 1.2), (-152.0, 56.0, -0.8)),
    ("eichental_nah_steinbruecke_oben", (-160.0, 44.0, 7.0), (-152.0, 56.0, 0.0)),
]


def job_nah(b, args):
    setup_world(b, fog=False)
    setup_compositor(b, fog=False)
    setup_render(b.scene, (1280, 720) if not args.test else (640, 360), max(16, args.samples // 2))
    for name, (cx, cz, ch), (tx, tz, th) in CLOSEUPS:
        camera(b, name, bv(cx, cz, h_at(b, cx, cz) + ch), bv(tx, tz, h_at(b, tx, tz) + th), lens=28.0)
        render_still(b, os.path.join(args.out, name + "_roh.png"))


def job_karte(b, args):
    setup_world(b, fog=False)
    setup_compositor(b, fog=False)
    size = 1600 if not args.test else 800
    setup_render(b.scene, (size, size), max(16, args.samples // 2))
    extent = b.layout["terrain"]["size"]
    camera(b, "Karte", bv(0.0, 0.0, 400.0), bv(0.0, 0.0, 0.0), ortho=extent)
    render_still(b, os.path.join(args.out, "eichental_karte_roh.png"))
    write_map_data(b, args.out, size, extent)


def write_map_data(b, out, size, extent):
    lay = b.layout

    def px(x, z):
        return [(x + extent / 2) / extent * size, (extent / 2 - z) / extent * size]

    data = {"size": size, "extent": extent, "pixels_per_meter": size / extent, "locations": [], "markers": [], "labels": []}
    for loc in lay["locations"]:
        entry = {"id": loc["id"], "name": loc["name"], "kind": loc["kind"], "shape": loc["shape"], "center": px(*loc["center"])}
        if loc["shape"] == "circle":
            entry["radius"] = loc["radius"] * size / extent
        else:
            corners = []
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                ox, oz = L.rotate_local(sx * loc["size"][0] / 2, sz * loc["size"][1] / 2, loc.get("yaw", 0.0))
                corners.append(px(loc["center"][0] + ox, loc["center"][1] + oz))
            entry["corners"] = corners
        data["locations"].append(entry)
    for sp in lay["spawners"]:
        for (x, z, _) in L.spawner_positions(sp):
            data["markers"].append({"type": "spawn_" + sp["activation"], "p": px(x, z), "name": sp["name"]})
    for c in lay["chests"]:
        data["markers"].append({"type": "chest", "p": px(*c["position"]), "name": c["name"]})
    for n in lay["npcMarkers"]:
        data["markers"].append({"type": "npc_" + n["phase"], "p": px(*n["position"]), "name": n["name"]})
    for q in lay["questObjects"]:
        data["markers"].append({"type": "quest", "p": px(*q["position"]), "name": q["name"]})
    data["markers"].append({"type": "start", "p": px(*lay["playerStart"]["position"]), "name": "Spieler-Start"})
    data["trails"] = [{"id": t["id"], "name": t["name"], "points": [px(x, z) for x, z in t["nodes"]], "radius": t.get("radius", 4.0) * size / extent}
                      for t in lay.get("trails", [])]
    data["rift"] = px(*lay["rift"]["center"])
    bounds = lay["terrain"]["playableBounds"]
    data["bounds"] = [px(bounds["min"][0], bounds["max"][1]), px(bounds["max"][0], bounds["min"][1])]
    for river in lay["rivers"]:
        pts = river["points"]
        mid = pts[len(pts) // 2]
        data["labels"].append({"text": river["name"], "p": px(*mid), "kind": "water"})
    with open(os.path.join(out, "eichental_karte_daten.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def flight_path():
    """Camera keys (time s, position x/z/height above ground, target x/z/height) for a 15 s flight."""
    return [
        (0.0, (-150.0, -230.0, 70.0), (20.0, -20.0, 0.0)),
        (3.0, (-40.0, -150.0, 45.0), (50.0, -20.0, 2.0)),
        (6.0, (70.0, -95.0, 22.0), (90.0, 10.0, 3.0)),
        (8.5, (150.0, -10.0, 26.0), (110.0, 50.0, 6.0)),
        (10.5, (75.0, 95.0, 26.0), (0.0, 155.0, 6.0)),
        (12.5, (-20.0, 110.0, 40.0), (-82.0, 186.0, 6.0)),
        (15.0, (-60.0, 250.0, 85.0), (-150.0, 0.0, 2.0)),
    ]


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
                        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3) for i in range(len(p1)))


def sample_path(keys, time_s):
    times = [k[0] for k in keys]
    i = 0
    while i < len(keys) - 2 and time_s > times[i + 1]:
        i += 1
    t = (time_s - times[i]) / (times[i + 1] - times[i])
    t = t * t * (3 - 2 * t) * 0.35 + t * 0.65
    k0, k1, k2, k3 = keys[max(0, i - 1)], keys[i], keys[i + 1], keys[min(len(keys) - 1, i + 2)]
    pos = catmull(k0[1], k1[1], k2[1], k3[1], t)
    tgt = catmull(k0[2], k1[2], k2[2], k3[2], t)
    return pos, tgt


def job_rundflug(b, args):
    setup_world(b)
    setup_compositor(b, fog=True)
    res = (1280, 720) if not args.test else (640, 360)
    setup_render(b.scene, res, args.samples, video=True)
    fps = args.fps
    seconds = 15.0
    frames = int(seconds * fps)
    cam = camera(b, "Rundflug", bv(0, 0, 50), bv(0, 0, 0), lens=24.0)
    keys = flight_path()
    frame_dir = os.path.join(args.out, "eichental_rundflug_frames")
    os.makedirs(frame_dir, exist_ok=True)
    first = args.first_frame
    last = min(frames - 1, args.last_frame if args.last_frame >= 0 else frames - 1)
    t_start = time.time()
    for f in range(first, last + 1):
        path = os.path.join(frame_dir, "%04d.png" % f)
        if os.path.exists(path) and not args.overwrite:
            continue
        (x, z, hy), (tx, tz, ty) = sample_path(keys, f / fps * (keys[-1][0] / seconds))
        ground = max(b.h.height(x, z), 6.0)
        aim(cam, bv(x, z, ground + hy), bv(tx, tz, b.h.height(tx, tz) + ty))
        b.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        done = f - first + 1
        elapsed = time.time() - t_start
        print("[eichental] frame %d/%d  %.1f s/frame" % (f, last, elapsed / done))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True, choices=["uebersicht", "dorf", "karte", "alle_bilder", "nah", "rundflug"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=96)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--first-frame", type=int, default=0)
    parser.add_argument("--last-frame", type=int, default=-1)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--fast", action="store_true", help="cheaper terrain shading (video)")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    layout = L.load(LAYOUT_PATH)
    cache = compute_cache(layout, args.out)
    jobs = ["uebersicht", "dorf", "karte"] if args.job == "alle_bilder" else [args.job]
    FAST["on"] = args.fast
    for job in jobs:
        b = build_all(layout, cache, markers=True)
        globals()["job_" + job](b, args)


if __name__ == "__main__":
    main()
