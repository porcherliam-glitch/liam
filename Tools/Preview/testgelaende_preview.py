"""Blender preview of the Unity test ground ("Testgelände") of Chroniken von Aetherfall.

Rebuilds the scene that the editor menu "Aetherfall > Testgelände erstellen" generates, with the same primitives, positions,
rotations, sizes and colours, and renders stills or frame sequences with Cycles (CPU). This is a REBUILD for previews, not a
Unity rendering: no URP shaders, no Unity lighting, no game logic.

Source of every value: Assets/_Project/Scripts/Editor/World/TestGround*.cs (geometry, scene, combat, items, materials),
PlayerMovementSettings / PlayerMovementModel (movement), TestGroundSceneBuilder (camera rig), PlayerWeaponPose (rest pose),
RarityRules / LootBeamPool / LootWorldSpawner (loot colours, beams, scatter), TrainingDummy (label text at runtime).

Coordinates: everything is built in Unity numbers (x right/east, y up, z forward/north; left-handed) and converted at the
very end with M_blender = P * M_unity * P, where P swaps y and z. P is a reflection, so it turns the left-handed Unity frame
into the right-handed Blender frame (x east, y north, z up) and flips the sense of rotations automatically; the meshes of the
primitives are defined with the Unity "up" axis on Blender's local z.

Usage (Blender 4.x, from the repo root):
    blender -b -P Tools/Preview/testgelaende_preview.py -- --job uebersicht --out OUTPUT_DIR [--samples 48] [--test]
Jobs: uebersicht, arena, truhen, spielersicht, karte (stills, 1600x900), rundflug, sprungtest (PNG frame sequences,
1280x720, 30 fps), alle_bilder (all stills). --test renders small and fast for checking the layout.
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------------------------------------------------
# Values copied from the Unity code
# --------------------------------------------------------------------------------------------------------------------

# TestGroundMaterials / TestGroundItemAssets: base colours (sRGB, Unity Color) of the URP/Lit materials, smoothness 0.2.
COLORS = {
    "Ground": (0.45, 0.47, 0.45),
    "Lines": (0.25, 0.27, 0.27),
    "Ramp": (0.92, 0.55, 0.18),
    "Stairs": (0.25, 0.5, 0.85),
    "Platform": (0.35, 0.7, 0.35),
    "Wall": (0.7, 0.3, 0.28),
    "Tunnel": (0.5, 0.35, 0.7),
    "Player": (0.85, 0.9, 0.95),
    "Nose": (0.95, 0.8, 0.1),
    "Sword": (0.78, 0.8, 0.85),
    "Shield": (0.55, 0.35, 0.18),
    "Wolf": (0.46, 0.43, 0.4),
    "AetherWolf": (0.27, 0.33, 0.4),
    "Crystal": (0.2, 0.95, 0.85),
    "Dummy": (0.82, 0.7, 0.42),
    "Arena": (0.4, 0.33, 0.27),
    "ChestWood": (0.55, 0.36, 0.2),
    "ChestIron": (0.55, 0.58, 0.62),
    "ChestHidden": (0.32, 0.22, 0.45),
}
SMOOTHNESS = 0.2

# RarityRules.Color / BeamHeight (GDD 04 3.1, 5.8). Order = ItemRarity enum.
RARITIES = [
    # (id, German name, hex colour, beam height in m)
    ("common", "Gewöhnlich", "A6A6A6", 0.0),
    ("uncommon", "Ungewöhnlich", "4CC35A", 0.5),
    ("rare", "Selten", "3D8BFF", 1.5),
    ("epic", "Episch", "A855F7", 3.0),
    ("legendary", "Legendär", "FF8C1A", 6.0),
    ("mythic", "Mythisch", "E53935", 8.0),
    ("set", "Set", "F2D23C", 4.0),
]
BEAM_MINIMUM_RARITY = 2      # LootBeamPool.minimumRarity = Rare (set by TestGroundItemBuilder)
BEAM_WIDTH = 0.08            # LootBeamPool.beamWidth
SCATTER_RADIUS = 1.1         # LootWorldSpawner.scatterRadius
DEBUG_DROP_DISTANCE = 1.6    # InventoryDebugOverlay.DropPosition: 1.6 m in front of the player

# PlayerMovementSettings defaults (GDD 03 3.1) and PlayerMovementTuning.StandardGravity.
MOVE = {
    "walk_speed": 2.0,
    "run_speed": 5.0,
    "acceleration_time": 0.15,
    "deceleration_time": 0.12,
    "turn_rate": 720.0,
    "jump_height": 1.2,
    "gravity": 9.81,
    "rising_gravity_scale": 1.0,
    "falling_gravity_scale": 1.6,
    "max_fall_speed": 40.0,
    "air_control": 0.4,
    "step_offset": 0.3,
}
CHARACTER_HEIGHT = 1.8
CHARACTER_RADIUS = 0.35

# TestGroundSceneBuilder: exploration camera (GDD 03 2.1).
CAMERA_DISTANCE = 4.0
PIVOT_HEIGHT = 1.6
FIELD_OF_VIEW = 55.0          # vertical
SHOULDER_SCREEN_OFFSET = -0.04  # CM3 ScreenPosition.x (-0.5..0.5 of the screen width)
CAMERA_PITCH = 15.0           # orbital VerticalAxis.Center / Value
CAMERA_DAMPING = 0.1          # tracker PositionDamping and composer Damping (seconds)

# TestGroundSceneBuilder.SetUpLight
SUN_EULER = (50.0, -30.0, 0.0)
SUN_INTENSITY = 1.2
SUN_COLOR = (1.0, 0.957, 0.839)  # Unity default colour of the directional light in a new scene (FFF4D6)

# TestGroundCombatBuilder
DUMMY_POSITION = (-12.0, 0.0, -16.0)
ARENA_CENTER = (-28.0, 0.0, -42.0)

# PlayerWeaponPose: rest pose of the sword hand and the shield hand (applied in LateUpdate while playing).
SWORD_REST_EULER = (60.0, 10.0, 0.0)
SHIELD_REST_EULER = (0.0, -20.0, 0.0)

# TextMesh: world size of one em = fontSize * characterSize * 0.1 (Unity TextMesh scale).
LABEL_FONT_SIZE = 64

OUT_STILL = (1600, 900)
OUT_VIDEO = (1280, 720)
FPS = 30

# --------------------------------------------------------------------------------------------------------------------
# Unity math (numbers in Unity space) and conversion to Blender
# --------------------------------------------------------------------------------------------------------------------

P4 = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
P3 = P4.to_3x3()


def u_euler(x, y, z):
    """Quaternion.Euler(x, y, z) as 4x4 matrix: Unity applies z, then x, then y (R = Ry * Rx * Rz)."""
    return (Matrix.Rotation(math.radians(y), 4, "Y") @ Matrix.Rotation(math.radians(x), 4, "X")
            @ Matrix.Rotation(math.radians(z), 4, "Z"))


def u_look_rotation(forward, up=(0.0, 1.0, 0.0)):
    """Quaternion.LookRotation(forward, up) as 4x4 matrix (columns right, up, forward; right = up x forward)."""
    f = Vector(forward).normalized()
    r = Vector(up).cross(f).normalized()
    u = f.cross(r)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = r[i], u[i], f[i]
    return m


def u_trs(position=(0, 0, 0), rotation=None, scale=(1, 1, 1)):
    t = Matrix.Translation(Vector(position))
    r = rotation if rotation is not None else Matrix.Identity(4)
    s = Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0)))
    return t @ r @ s


def to_blender_matrix(m_unity):
    return P4 @ m_unity @ P4


def bvec(x, y, z):
    """Unity position -> Blender position."""
    return Vector((x, z, y))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(text):
    return tuple(int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# --------------------------------------------------------------------------------------------------------------------
# Scene construction
# --------------------------------------------------------------------------------------------------------------------


class Builder:
    """Creates Blender objects from Unity-space transforms."""

    def __init__(self):
        self.materials = {}
        self.base_meshes = {}
        self.meshes = {}
        self.collection = bpy.context.scene.collection
        self.labels = []
        self.font = None
        for path in ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
            if os.path.exists(path):
                self.font = bpy.data.fonts.load(path)
                break

    # --- materials ---
    def lit(self, key, rgb=None):
        name = "Lit " + key
        if name in self.materials:
            return self.materials[name]
        rgb = rgb or COLORS[key]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*[srgb_to_linear(c) for c in rgb], 1.0)
        bsdf.inputs["Roughness"].default_value = 1.0 - SMOOTHNESS
        mat.diffuse_color = (*[srgb_to_linear(c) for c in rgb], 1.0)
        self.materials[name] = mat
        return mat

    def unlit(self, key, rgb, strength=1.0):
        name = "Unlit " + key
        if name in self.materials:
            return self.materials[name]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (*[srgb_to_linear(c) for c in rgb], 1.0)
        emission.inputs["Strength"].default_value = strength
        mat.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
        self.materials[name] = mat
        return mat

    # --- meshes (Unity primitives; Unity's local y axis is Blender's local z axis) ---
    def base_mesh(self, kind):
        if kind in self.base_meshes:
            return self.base_meshes[kind]
        bm = bmesh.new()
        smooth = True
        if kind == "cube":
            bmesh.ops.create_cube(bm, size=1.0)
            smooth = False
        elif kind == "cylinder":   # Unity cylinder: height 2, diameter 1
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=40, radius1=0.5, radius2=0.5, depth=2.0)
        elif kind == "sphere":     # Unity sphere: diameter 1
            bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=0.5)
        elif kind == "capsule":    # Unity capsule: height 2, radius 0.5
            self._capsule(bm, radius=0.5, half=0.5, segments=40, rings=10)
        me = bpy.data.meshes.new("Unity " + kind)
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = smooth
        if smooth and hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(40)
        self.base_meshes[kind] = me
        return me

    @staticmethod
    def _capsule(bm, radius, half, segments, rings):
        top = bm.verts.new((0, 0, half + radius))
        ring_list = []
        for i in range(1, rings + 1):
            phi = (math.pi / 2) * i / rings
            z = half + radius * math.cos(phi)
            r = radius * math.sin(phi)
            ring_list.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z))
                              for k in range(segments)])
        for i in range(0, rings):
            phi = math.pi / 2 + (math.pi / 2) * i / rings
            z = -half + radius * math.cos(phi)
            r = radius * math.sin(phi)
            ring_list.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z))
                              for k in range(segments)])
        bottom = bm.verts.new((0, 0, -half - radius))
        for k in range(segments):
            bm.faces.new((top, ring_list[0][k], ring_list[0][(k + 1) % segments]))
            bm.faces.new((bottom, ring_list[-1][(k + 1) % segments], ring_list[-1][k]))
        for a, b in zip(ring_list[:-1], ring_list[1:]):
            for k in range(segments):
                bm.faces.new((a[k], b[k], b[(k + 1) % segments], a[(k + 1) % segments]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    def mesh(self, kind, material):
        key = (kind, material.name)
        if key not in self.meshes:
            me = self.base_mesh(kind).copy()
            me.name = kind + " " + material.name
            me.materials.append(material)
            self.meshes[key] = me
        return self.meshes[key]

    def prim(self, kind, name, world_unity, material, cast_shadow=True):
        ob = bpy.data.objects.new(name, self.mesh(kind, material))
        ob.matrix_world = to_blender_matrix(world_unity)
        ob.visible_shadow = cast_shadow
        self.collection.objects.link(ob)
        return ob

    def label(self, text, world_unity, character_size):
        """TextMesh (anchor MiddleCenter, white, unlit). Text runs along local +x, up is local +y, readable from local -z."""
        if self.font is None:
            return None
        curve = bpy.data.curves.new("Label " + text, "FONT")
        curve.body = text
        curve.font = self.font
        curve.size = LABEL_FONT_SIZE * character_size * 0.1
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        ob = bpy.data.objects.new("Label " + text.split("\n")[0], curve)
        x = P3 @ world_unity.col[0].xyz.normalized()
        y = P3 @ world_unity.col[1].xyz.normalized()
        z = -(P3 @ world_unity.col[2].xyz.normalized())
        m = Matrix.Identity(4)
        for i in range(3):
            m[i][0], m[i][1], m[i][2] = x[i], y[i], z[i]
        m.translation = P3 @ world_unity.translation
        ob.matrix_world = m
        ob.data.materials.append(self.unlit("Label", (1.0, 1.0, 1.0)))
        ob.visible_shadow = False
        self.collection.objects.link(ob)
        self.labels.append(ob)
        return ob


def world_label_rotation(position):
    """TestGroundGeometry.Label: the text faces away from the origin (readable from the spawn point)."""
    flat = Vector((position[0], 0.0, position[2]))
    return u_look_rotation(flat.normalized()) if flat.length_squared > 0.01 else Matrix.Identity(4)


def build_geometry(b):
    """TestGroundGeometry.BuildAll."""

    def box(name, center, size, material, rotation=None):
        return b.prim("cube", name, u_trs(center, rotation, size), b.lit(material))

    def visual(name, center, size, material):
        return b.prim("cube", name, u_trs(center, None, size), b.lit(material), cast_shadow=False)

    def label(text, position, size=0.06):
        return b.label(text, u_trs(position, world_label_rotation(position)), size)

    # Ground and lines every 5 m
    box("Ground", (0, -0.5, 0), (120, 1, 120), "Ground")
    for i in range(-6, 7):
        offset = i * 5.0
        visual("LineX %g" % offset, (0, 0.005, offset), (60, 0.01, 0.06), "Lines")
        visual("LineZ %g" % offset, (offset, 0.005, 0), (0.06, 0.01, 60), "Lines")

    # Ramps 15/30/45/60 degrees, height 3 m, width 4 m, starting at z = 10
    for i, angle in enumerate((15.0, 30.0, 45.0, 60.0)):
        x = -21.0 + i * 6.0
        height, width, start_z = 3.0, 4.0, 10.0
        run = height / math.tan(math.radians(angle))
        thickness, buried = 0.5, 0.5
        top_length = height / math.sin(math.radians(angle))
        rotation = u_euler(-angle, 0, 0)
        along = (rotation @ Vector((0, 0, 1, 0))).xyz
        up = (rotation @ Vector((0, 1, 0, 0))).xyz
        top_center = Vector((x, 0, start_z)) + along * ((top_length - buried) * 0.5)
        center = top_center - up * (thickness * 0.5)
        box("Ramp %g" % angle, center, (width, thickness, top_length + buried), "Ramp", rotation)
        box("Ramp %g Top" % angle, (x, height * 0.5, start_z + run + 1.5), (width, height, 3.0), "Platform")
        text = "Rampe %g° (rutscht)" % angle if angle >= 50 else "Rampe %g°" % angle
        label(text, (x, 1.2, start_z - 1.0))

    # Stairs
    def stairs(start, steps, step_height, step_depth, text):
        width = 3.0
        for i in range(steps):
            top = (i + 1) * step_height
            box("Step %d" % (i + 1), (start[0], top * 0.5, start[2] + (i + 0.5) * step_depth), (width, top, step_depth), "Stairs")
        total = steps * step_height
        box("Stairs Top", (start[0], total * 0.5, start[2] + steps * step_depth + 1.5), (width, total, 3.0), "Platform")
        label(text, (start[0], 1.2, start[2] - 1.0))

    stairs((7.0, 0.0, 10.0), 12, 0.2, 0.35, "Treppe (Stufen 0,2 m)")
    stairs((12.0, 0.0, 10.0), 5, 0.45, 0.6, "Hohe Stufen 0,45 m (springen)")

    # Jump platforms east
    for i, h in enumerate((0.4, 0.8, 1.0, 1.2, 1.5)):
        center = (20.0 + i * 4.0, h * 0.5, 6.0)
        box("Platform %g m" % h, center, (2.4, h, 2.4), "Platform")
        # h.ToString("0.0") with a German system culture gives a decimal comma
        label(("%.1f m" % h).replace(".", ","), (center[0], h + 0.9, center[2] - 1.6))
    label("Sprunghöhe 1,2 m: 1,5 m ist zu hoch", (28.0, 2.6, 3.5))

    # Gaps west
    gx, block_length, height = -32.0, 4.0, 1.0
    box("Step Up", (gx, 0.25, -12.0), (3, 0.5, 2), "Stairs")
    z = -11.0
    gaps = (1.5, 2.5, 3.5, 4.5, 6.0)
    for i in range(len(gaps) + 1):
        box("Block %d" % i, (gx, height * 0.5, z + block_length * 0.5), (3, height, block_length), "Platform")
        z += block_length
        if i < len(gaps):
            label(("Lücke %.1f m" % gaps[i]).replace(".", ","), (gx, height + 1.0, z + gaps[i] * 0.5))
            z += gaps[i]

    # Wall and pillars south
    box("Wall", (0, 2, -14), (12, 4, 0.5), "Wall")
    box("Wall Corner", (6.25, 2, -10.75), (0.5, 4, 7), "Wall")
    label("Wand (Kamera weicht aus)", (0.0, 4.6, -13.6))
    for name, pos in (("Pillar A", (-6, 2, -5)), ("Pillar B", (-3, 2, -7)), ("Pillar C", (-8, 2, -9))):
        box(name, pos, (1, 4, 1), "Wall")

    # Tunnel south-east
    tx, start_z, length, inner_w, inner_h, thick = 20.0, -10.0, 14.0, 3.0, 2.6, 0.5
    center_z = start_z - length * 0.5
    wall_x = inner_w * 0.5 + thick * 0.5
    box("Tunnel Wall Left", (tx - wall_x, inner_h * 0.5, center_z), (thick, inner_h, length), "Tunnel")
    box("Tunnel Wall Right", (tx + wall_x, inner_h * 0.5, center_z), (thick, inner_h, length), "Tunnel")
    box("Tunnel Roof", (tx, inner_h + thick * 0.5, center_z), (inner_w + thick * 2, thick, length), "Tunnel")
    label("Tunnel (Kamera-Kollision)", (tx, inner_h + 1.2, start_z + 0.3))


def build_player(b, position=(0, 0, 0), yaw=0.0):
    """TestGroundSceneBuilder.CreatePlayer + TestGroundCombatBuilder.SetUpPlayer (sword and shield in the rest pose)."""
    root = u_trs(position, u_euler(0, yaw, 0))
    objects = []
    objects.append(b.prim("capsule", "Player Body", root @ u_trs((0, CHARACTER_HEIGHT * 0.5, 0), None,
                                                                 (CHARACTER_RADIUS * 2, CHARACTER_HEIGHT * 0.5, CHARACTER_RADIUS * 2)),
                          b.lit("Player")))
    objects.append(b.prim("cube", "Player Nose", root @ u_trs((0, 1.45, CHARACTER_RADIUS + 0.1), None, (0.18, 0.12, 0.3)), b.lit("Nose")))
    sword_hand = root @ u_trs((0.42, 1.15, 0.15), u_euler(*SWORD_REST_EULER))
    objects.append(b.prim("cube", "Sword Blade", sword_hand @ u_trs((0, 0, 0.6), None, (0.06, 0.12, 1.0)), b.lit("Sword")))
    objects.append(b.prim("cube", "Sword Guard", sword_hand @ u_trs((0, 0, 0.07), None, (0.28, 0.05, 0.06)), b.lit("Sword")))
    shield_hand = root @ u_trs((-0.45, 1.1, 0.12), u_euler(*SHIELD_REST_EULER))
    objects.append(b.prim("cube", "Shield", shield_hand @ u_trs((0, 0, 0.1), None, (0.55, 0.7, 0.08)), b.lit("Shield")))
    return objects


def build_arena(b):
    """TestGroundCombatBuilder.BuildArena: floor, label, rocks, dummy, two grey wolves and the Aether wolf."""
    arena = u_trs(ARENA_CENTER)
    b.prim("cylinder", "Arena Floor", arena @ u_trs((0, 0.012, 0), None, (26, 0.01, 26)), b.lit("Arena"))
    b.label("Kampfarena: 2 Wölfe + 1 Aether-Wolf", arena @ u_trs((0, 2.5, 13), u_euler(0, 180, 0)), 0.06)
    for pos, size in (((4, 0, 3), (2.2, 1.6, 1.8)), ((-6, 0, -2), (1.6, 2.2, 1.6))):
        b.prim("cube", "Fels", arena @ u_trs((pos[0], size[1] * 0.5, pos[2]), u_euler(0, 25, 0), size), b.lit("Wall"))

    # Training dummy (own root object at DUMMY_POSITION). Label text as TrainingDummy writes it at runtime.
    dummy = u_trs(DUMMY_POSITION)
    b.prim("cylinder", "Dummy Post", dummy @ u_trs((0, 0.9, 0), None, (0.45, 0.9, 0.45)), b.lit("Dummy"))
    b.prim("sphere", "Dummy Head", dummy @ u_trs((0, 1.95, 0), None, (0.38, 0.38, 0.38)), b.lit("Dummy"))
    b.prim("cube", "Dummy Arms", dummy @ u_trs((0, 1.45, 0), None, (1.3, 0.12, 0.12)), b.lit("Dummy"))
    b.label("Trainingspuppe\nLetzter Treffer: –\nSchaden (5 s): 0\nHaltung: 0 / 35", dummy @ u_trs((0, 2.9, 0), u_euler(0, 180, 0)), 0.04)

    def wolf(name, fur, local_position, yaw, crystal):
        root = arena @ u_trs(local_position, u_euler(0, yaw, 0))
        body = root @ u_trs((0, 0.35, -0.3))
        mat = b.lit(fur)
        b.prim("cube", name + " Torso", body @ u_trs((0, 0.25, 0.3), None, (0.5, 0.55, 1.25)), mat)
        b.prim("cube", name + " Head", body @ u_trs((0, 0.5, 1.05), None, (0.38, 0.36, 0.42)), mat)
        b.prim("cube", name + " Snout", body @ u_trs((0, 0.42, 1.35), None, (0.2, 0.18, 0.25)), b.lit("Nose"))
        b.prim("cube", name + " Tail", body @ u_trs((0, 0.35, -0.45), None, (0.1, 0.1, 0.45)), mat)
        for i in range(4):
            x = -0.18 if i % 2 == 0 else 0.18
            z = 0.75 if i < 2 else -0.15
            b.prim("cube", name + " Leg %d" % (i + 1), body @ u_trs((x, -0.12, z), None, (0.12, 0.5, 0.12)), mat)
        if crystal:
            core = body @ u_trs((0, 0.65, 0.25), u_euler(45, 0, 45))
            b.prim("cube", name + " Crystal", core @ u_trs((0, 0, 0), None, (0.28, 0.28, 0.28)), b.lit("Crystal"))

    wolf("Grauwolf 1", "Wolf", (-2, 0, 2), 160.0, False)
    wolf("Grauwolf 2", "Wolf", (6, 0, -3), 0.0, False)
    wolf("Aether-Wolf", "AetherWolf", (-2, 0, -6), 200.0, True)


def build_chests(b, opened=()):
    """TestGroundItemBuilder.Build: three chests at x = 5 / 8 / 11, z = 5, front towards the spawn."""
    group_position = Vector((8.0, 0.0, 5.0))
    group = u_trs(group_position)

    def chest_label(text, local_position, size):
        world = group_position + Vector(local_position)
        b.label(text, u_trs(world, world_label_rotation(world)), size)

    chest_label("Truhen (E / A: öffnen)", (0, 2.2, 0), 0.05)
    width, height, depth, lid_height = 1.0, 0.6, 0.6, 0.14
    for name, key, local_x in (("Holztruhe", "ChestWood", -3.0), ("Eisentruhe", "ChestIron", 0.0),
                               ("Versteckte Truhe", "ChestHidden", 3.0)):
        chest = group @ u_trs((local_x, 0, 0), u_euler(0, 180, 0))
        mat = b.lit(key)
        b.prim("cube", name + " Korpus", chest @ u_trs((0, height * 0.5, 0), None, (width, height, depth)), mat)
        hinge_rotation = u_euler(-105, 0, 0) if name in opened else None   # LootChest.openAngle = -105
        hinge = chest @ u_trs((0, height, -depth * 0.5), hinge_rotation)
        b.prim("cube", name + " Deckel", hinge @ u_trs((0, lid_height * 0.5, depth * 0.5), None,
                                                        (width + 0.04, lid_height, depth + 0.04)), mat)
        chest_label(name, (local_x, 1.35, 0), 0.03)


def build_debug_loot(b, player_position, player_yaw, seed=7):
    """Debug button "Test-Beute" (InventoryDebugOverlay): one item of each rarity Common..Legendary, 1.6 m in front of the
    player, scattered on a golden-angle spiral (LootWorldSpawner), pickups 0.3 m in the rarity colour, beams from Rare on."""
    forward = (u_euler(0, player_yaw, 0) @ Vector((0, 0, 1, 0))).xyz
    origin = Vector(player_position) + Vector((forward.x, 0, forward.z)).normalized() * DEBUG_DROP_DISTANCE
    count = 5
    state = seed
    for i in range(count):
        rid, _, hexcode, beam_height = RARITIES[i]
        angle = i * 2.39996323
        radius = SCATTER_RADIUS * math.sqrt((i + 0.5) / count)
        position = origin + Vector((math.cos(angle) * radius, 0, math.sin(angle) * radius))
        state = (state * 1103515245 + 12345) % (2 ** 31)
        yaw = (state / 2 ** 31) * 360.0
        size = 0.3
        rgb = hex_color(hexcode)
        b.prim("cube", "Pickup " + rid, u_trs(position + Vector((0, size * 0.5 + 0.02, 0)), u_euler(0, yaw, 0), (size, size, size)),
               b.lit("Pickup " + rid, rgb))
        if beam_height > 0 and i >= BEAM_MINIMUM_RARITY:
            b.prim("cylinder", "LootBeam " + rid, u_trs(position + Vector((0, beam_height * 0.5, 0)), None,
                                                        (BEAM_WIDTH, beam_height * 0.5, BEAM_WIDTH)),
                   b.unlit("Beam " + rid, rgb), cast_shadow=False)


def setup_world_and_light(scene):
    """Sun like the generator's directional light and a bright sky like Unity's default procedural skybox."""
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = -1.0
    map_range.inputs["From Max"].default_value = 1.0
    ramp = nodes.new("ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    ground = [srgb_to_linear(c) for c in (0.37, 0.35, 0.34)]
    horizon = [srgb_to_linear(c) for c in (0.84, 0.88, 0.93)]
    middle = [srgb_to_linear(c) for c in (0.62, 0.75, 0.9)]
    zenith = [srgb_to_linear(c) for c in (0.36, 0.55, 0.84)]
    elements[0].position = 0.0
    elements[0].color = (*ground, 1)
    elements[1].position = 0.497
    elements[1].color = (*ground, 1)
    for position, color in ((0.503, horizon), (0.58, middle), (1.0, zenith)):
        element = elements.new(position)
        element.color = (*color, 1)
    background.inputs["Strength"].default_value = 1.0
    links.new(coords.outputs["Generated"], separate.inputs["Vector"])
    links.new(separate.outputs["Z"], map_range.inputs["Value"])
    links.new(map_range.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], out.inputs["Surface"])

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = SUN_INTENSITY * math.pi * 0.85
    sun_data.color = SUN_COLOR
    sun_data.angle = math.radians(1.5)
    sun = bpy.data.objects.new("Sun", sun_data)
    direction_unity = (u_euler(*SUN_EULER) @ Vector((0, 0, 1, 0))).xyz   # a Unity light shines along its +z
    direction = P3 @ direction_unity
    sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()     # a Blender sun shines along its -z
    scene.collection.objects.link(sun)


def setup_render(scene, resolution, samples, test):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = max(4, samples // 6) if test else samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 2
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.render.threads_mode = "AUTO"
    scene.render.use_persistent_data = True
    scene.render.resolution_x = resolution[0] // (2 if test else 1)
    scene.render.resolution_y = resolution[1] // (2 if test else 1)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.render.fps = FPS


def make_camera(scene, name="Camera"):
    data = bpy.data.cameras.new(name)
    data.clip_start = 0.1
    data.clip_end = 1000.0
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def look_at(cam, position_unity, target_unity, yaw_offset_degrees=0.0):
    position = bvec(*position_unity)
    target = bvec(*target_unity)
    direction = target - position
    quat = direction.to_track_quat("-Z", "Y")
    if yaw_offset_degrees:
        # Positive offset = turn right (clockwise seen from above); Blender's z rotation is counter-clockwise.
        quat = Matrix.Rotation(math.radians(-yaw_offset_degrees), 4, "Z").to_quaternion() @ quat
    cam.location = position
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = quat


def third_person(cam, scene, pivot_unity, camera_yaw, pitch=CAMERA_PITCH):
    """CM_Explore: orbital follow (sphere, radius 4 m around the pivot 1.6 m above the feet, pitch 15 degrees), rotation
    composer with the player 0.04 screen widths left of the centre (over-the-shoulder), vertical FOV 55 degrees."""
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(FIELD_OF_VIEW)
    orbit = u_euler(pitch, camera_yaw, 0) @ Vector((0, 0, -CAMERA_DISTANCE, 0))
    position = Vector(pivot_unity) + orbit.xyz
    aspect = scene.render.resolution_x / scene.render.resolution_y
    tan_half_h = math.tan(math.radians(FIELD_OF_VIEW) * 0.5) * aspect
    offset = math.degrees(math.atan(-2.0 * SHOULDER_SCREEN_OFFSET * tan_half_h))
    look_at(cam, position, pivot_unity, offset)
    return position


def build_scene(player_position=(0, 0, 0), player_yaw=0.0, loot_at_player=True, opened=(), with_player=True,
                labels=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    b = Builder()
    build_geometry(b)
    build_arena(b)
    build_chests(b, opened)
    player = build_player(b, player_position, player_yaw) if with_player else []
    if loot_at_player:
        build_debug_loot(b, player_position, player_yaw)
    setup_world_and_light(scene)
    if not labels:
        for ob in b.labels:
            ob.hide_render = True
    return scene, b, player


# --------------------------------------------------------------------------------------------------------------------
# Movement simulation for the jump test (PlayerMovementModel, simplified to the parts used here)
# --------------------------------------------------------------------------------------------------------------------

PLATFORMS = [((20.0 + i * 4.0, 6.0), h) for i, h in enumerate((0.4, 0.8, 1.0, 1.2, 1.5))]
PLATFORM_HALF = 1.2


def ground_height(x, z, support=0.15):
    h = 0.0
    for (cx, cz), top in PLATFORMS:
        if abs(x - cx) <= PLATFORM_HALF + support and abs(z - cz) <= PLATFORM_HALF + support:
            h = max(h, top)
    return h


def blocked(x, z, y):
    """True if the capsule (radius 0.35) overlaps a platform whose top is more than the step offset above the feet."""
    for (cx, cz), top in PLATFORMS:
        if top <= y + MOVE["step_offset"]:
            continue
        dx = max(abs(x - cx) - PLATFORM_HALF, 0.0)
        dz = max(abs(z - cz) - PLATFORM_HALF, 0.0)
        if dx * dx + dz * dz < CHARACTER_RADIUS ** 2:
            return True
    return False


def simulate_jump_test(duration=8.0, fps=FPS, substeps=8):
    """Runs from the spawn to the jump platforms and jumps onto the first (0.4 m) and the second (0.8 m) platform.

    Input script (what a player would do): stand 0.7 s, run (stick fully forward, 5 m/s) around the chests to z = 6, jump
    1.35 m before the first platform, pull the stick back in the air to land on it (air control 0.4: braking without
    reversal), run on and jump from its far edge onto the second platform, brake again, stand.
    Physics as in PlayerMovementModel: ground acceleration run speed / 0.15 s, deceleration / 0.12 s, jump velocity
    sqrt(2 g h), rising gravity 1.0 g, falling gravity 1.6 g, air acceleration = ground acceleration * air control,
    no reversal against the take-off direction, turning 720 degrees per second.
    """
    g = MOVE["gravity"]
    run = MOVE["run_speed"]
    acc = run / MOVE["acceleration_time"]
    dec = run / MOVE["deceleration_time"]
    v0 = math.sqrt(2.0 * g * MOVE["rising_gravity_scale"] * MOVE["jump_height"])
    waypoints = [(13.0, 2.5), (15.8, 6.0), (60.0, 6.0)]
    jumps = [17.45, 21.05]              # x of the capsule centre at take-off
    brake_after = [0.25, 0.33]          # seconds in the air before the stick is pulled back

    s = {"x": 0.0, "z": 0.0, "y": 0.0, "vx": 0.0, "vz": 0.0, "vy": 0.0, "grounded": True, "yaw": 0.0,
         "ref": None, "air_time": 0.0, "jump_index": 0, "phase": "idle", "wp": 0}
    frames = []
    events = []
    dt = 1.0 / (fps * substeps)
    t = 0.0
    total = int(round(duration * fps))
    for frame in range(total):
        for _ in range(substeps):
            direction = None
            jump = False
            if s["phase"] == "idle" and t >= 0.7:
                s["phase"] = "run"
            if s["phase"] == "run":
                tx, tz = waypoints[s["wp"]]
                dx, dz = tx - s["x"], tz - s["z"]
                if math.hypot(dx, dz) < 0.8 and s["wp"] < len(waypoints) - 1:
                    s["wp"] += 1
                    tx, tz = waypoints[s["wp"]]
                    dx, dz = tx - s["x"], tz - s["z"]
                n = math.hypot(dx, dz)
                direction = (dx / n, dz / n)
                if s["jump_index"] < len(jumps) and s["grounded"] and s["x"] >= jumps[s["jump_index"]]:
                    jump = True
            elif s["phase"] == "air":
                if s["air_time"] < brake_after[s["jump_index"] - 1]:
                    direction = s["ref"]
                elif math.hypot(s["vx"], s["vz"]) > 0.05:
                    direction = (-s["ref"][0], -s["ref"][1])
            elif s["phase"] == "landed":
                if s["jump_index"] < len(jumps):
                    direction = (1.0, 0.0)
                    if s["grounded"] and s["x"] >= jumps[s["jump_index"]]:
                        jump = True
                else:
                    direction = None

            # ground movement / jump
            if jump and s["grounded"]:
                s["vy"] = v0
                s["grounded"] = False
                speed = math.hypot(s["vx"], s["vz"])
                s["ref"] = (s["vx"] / speed, s["vz"] / speed) if speed > 1e-3 else (1.0, 0.0)
                s["air_time"] = 0.0
                s["jump_index"] += 1
                s["phase"] = "air"
                events.append(("Absprung %d" % s["jump_index"], t, s["x"], s["y"], s["z"]))
            if s["grounded"] or jump:
                tvx, tvz = (direction[0] * run, direction[1] * run) if direction else (0.0, 0.0)
                rate = acc if tvx * tvx + tvz * tvz >= s["vx"] ** 2 + s["vz"] ** 2 else dec
                ddx, ddz = tvx - s["vx"], tvz - s["vz"]
                d = math.hypot(ddx, ddz)
                step = rate * dt
                if d <= step:
                    s["vx"], s["vz"] = tvx, tvz
                else:
                    s["vx"] += ddx / d * step
                    s["vz"] += ddz / d * step
            elif direction:
                along = s["vx"] * direction[0] + s["vz"] * direction[1]
                target = max(run, along)
                tvx, tvz = direction[0] * target, direction[1] * target
                if s["ref"]:
                    backwards = tvx * s["ref"][0] + tvz * s["ref"][1]
                    if backwards < 0:
                        tvx -= backwards * s["ref"][0]
                        tvz -= backwards * s["ref"][1]
                ddx, ddz = tvx - s["vx"], tvz - s["vz"]
                d = math.hypot(ddx, ddz)
                step = acc * MOVE["air_control"] * dt
                if d <= step:
                    s["vx"], s["vz"] = tvx, tvz
                else:
                    s["vx"] += ddx / d * step
                    s["vz"] += ddz / d * step

            # vertical
            if not s["grounded"]:
                gravity = g * (MOVE["rising_gravity_scale"] if s["vy"] > 0 else MOVE["falling_gravity_scale"])
                new_vy = max(s["vy"] - gravity * dt, -MOVE["max_fall_speed"])
                s["y"] += 0.5 * (s["vy"] + new_vy) * dt
                s["vy"] = new_vy
                s["air_time"] += dt

            # horizontal with simple collision against platform sides
            nx, nz = s["x"] + s["vx"] * dt, s["z"] + s["vz"] * dt
            if blocked(nx, nz, s["y"]):
                events.append(("BLOCKIERT", t, s["x"], s["y"], s["z"]))
                s["vx"] = s["vz"] = 0.0
            else:
                s["x"], s["z"] = nx, nz

            floor = ground_height(s["x"], s["z"])
            if s["grounded"]:
                if floor < s["y"] - MOVE["step_offset"]:
                    s["grounded"] = False
                    s["vy"] = 0.0
                else:
                    s["y"] = floor
            elif s["vy"] <= 0 and s["y"] <= floor:
                s["y"] = floor
                s["vy"] = 0.0
                s["grounded"] = True
                s["phase"] = "landed"
                events.append(("Landung auf %.1f m" % floor, t, s["x"], s["y"], s["z"]))

            # facing: turn towards the input direction at 720 degrees per second
            if direction and s["phase"] != "air":
                target_yaw = math.degrees(math.atan2(direction[0], direction[1]))
                diff = (target_yaw - s["yaw"] + 180.0) % 360.0 - 180.0
                max_turn = MOVE["turn_rate"] * dt
                s["yaw"] += max(-max_turn, min(max_turn, diff))
            t += dt
        frames.append({"t": t, "x": s["x"], "y": s["y"], "z": s["z"], "yaw": s["yaw"],
                       "speed": math.hypot(s["vx"], s["vz"]), "vy": s["vy"]})
    info = {"v0": v0, "apex_time": v0 / g, "events": events,
            "air_time_same_height": v0 / g + math.sqrt(2 * MOVE["jump_height"] / (g * MOVE["falling_gravity_scale"]))}
    return frames, info


# --------------------------------------------------------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------------------------------------------------------


CAMERA_OVERRIDE = None
OUTPUT_NAME = None


def place_camera(cam, position, target, fov):
    """Places a still camera; --kamera "px,py,pz,tx,ty,tz,fov" (Unity coordinates) overrides it for trying out views."""
    if CAMERA_OVERRIDE:
        position, target, fov = CAMERA_OVERRIDE[0:3], CAMERA_OVERRIDE[3:6], CAMERA_OVERRIDE[6]
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(fov)
    look_at(cam, position, target)


def render_still(scene, path):
    if OUTPUT_NAME:
        path = os.path.join(os.path.dirname(path), OUTPUT_NAME)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("GESCHRIEBEN", path)


def job_uebersicht(args):
    scene, b, _ = build_scene(loot_at_player=False)
    setup_render(scene, OUT_STILL, args.samples, args.test)
    cam = make_camera(scene)
    place_camera(cam, (40.0, 34.0, -60.0), (-5.0, -2.0, -6.0), 44.0)
    render_still(scene, os.path.join(args.out, "01_uebersicht_roh.png"))


def job_arena(args):
    # Staged: the player stands in the arena south-east of the wolves, facing the Aether wolf, and has pressed
    # "Test-Beute" (debug inventory) - the loot lies between him and the wolves.
    player_position = (-25.5, 0.0, -53.0)
    target = (-30.0, -48.0)
    yaw = math.degrees(math.atan2(target[0] - player_position[0], target[1] - player_position[2]))
    scene, b, _ = build_scene(player_position, yaw)
    setup_render(scene, OUT_STILL, args.samples, args.test)
    cam = make_camera(scene)
    place_camera(cam, (-10.0, 4.2, -58.5), (-27.3, 0.9, -48.3), 25.0)
    render_still(scene, os.path.join(args.out, "02_arena_roh.png"))


def job_truhen(args):
    # Staged: the player stands in front of the iron chest and has opened it (lid at -105 degrees, LootChest.openAngle).
    # Chest loot goes straight into the bag (LootService.TryOpenChest), so no pickups appear here.
    player_position = (9.3, 0.0, 3.8)
    yaw = math.degrees(math.atan2(8.0 - player_position[0], 5.0 - player_position[2]))
    scene, b, _ = build_scene(player_position, yaw, loot_at_player=False, opened=("Eisentruhe",))
    setup_render(scene, OUT_STILL, args.samples, args.test)
    cam = make_camera(scene)
    place_camera(cam, (7.0, 2.9, -2.6), (8.0, 0.9, 5.0), 42.0)
    render_still(scene, os.path.join(args.out, "02b_truhen_roh.png"))


def job_spielersicht(args):
    scene, b, _ = build_scene(loot_at_player=False)
    setup_render(scene, OUT_STILL, args.samples, args.test)
    cam = make_camera(scene)
    third_person(cam, scene, (0.0, PIVOT_HEIGHT, 0.0), 0.0)
    render_still(scene, os.path.join(args.out, "03_spielersicht_roh.png"))


MAP_ANCHORS = [
    ("Spawn", "Startpunkt, Blick nach Norden", (0.0, 0.0, 0.0)),
    ("Rampen", "15° · 30° · 45° · 60° (rutscht)", (-12.0, 0.0, 17.5)),
    ("Treppe", "Stufen 0,2 m", (7.0, 0.0, 13.5)),
    ("Hohe Stufen", "0,45 m (springen)", (12.0, 0.0, 12.5)),
    ("Sprungplattformen", "0,4 · 0,8 · 1,0 · 1,2 · 1,5 m", (28.0, 0.0, 6.0)),
    ("Lücken", "1,5 · 2,5 · 3,5 · 4,5 · 6,0 m", (-32.0, 0.0, 10.0)),
    ("Wand", "Kamera weicht aus", (0.0, 0.0, -14.0)),
    ("Säulen", "Kamera-Test", (-5.7, 0.0, -7.0)),
    ("Tunnel", "Kamera-Kollision", (20.0, 0.0, -17.0)),
    ("Truhen", "Holz · Eisen · versteckt", (8.0, 0.0, 5.0)),
    ("Trainingspuppe", "", DUMMY_POSITION),
    ("Kampfarena", "2 Grauwölfe + 1 Aether-Wolf", ARENA_CENTER),
]
MAP_POINTS = [
    ("Wolf", (ARENA_CENTER[0] - 2, 0, ARENA_CENTER[2] + 2)),
    ("Wolf", (ARENA_CENTER[0] + 6, 0, ARENA_CENTER[2] - 3)),
    ("Aether-Wolf", (ARENA_CENTER[0] - 2, 0, ARENA_CENTER[2] - 6)),
]


def job_karte(args):
    scene, b, _ = build_scene(loot_at_player=False, labels=False)
    setup_render(scene, OUT_STILL, args.samples, args.test)
    cam = make_camera(scene)
    cam.data.type = "ORTHO"
    pixels_per_meter = 9.4
    cam.data.ortho_scale = OUT_STILL[0] / pixels_per_meter
    # Map on the left 900 px (north up), legend on the right (added later by nachbearbeiten.py).
    center_x = -46.0 + (OUT_STILL[0] / 2 - 50) / pixels_per_meter
    center_z = -10.5
    cam.location = bvec(center_x, 120.0, center_z)
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = (0.0, 0.0, 0.0)   # looking straight down, north (+y in Blender) up
    cam.data.clip_end = 300.0
    path = os.path.join(args.out, "04_karte_roh.png")
    render_still(scene, path)
    anchors = []
    for name, detail, position in MAP_ANCHORS:
        v = world_to_camera_view(scene, cam, bvec(*position))
        anchors.append({"name": name, "detail": detail, "x": v.x * OUT_STILL[0], "y": (1.0 - v.y) * OUT_STILL[1]})
    points = []
    for name, position in MAP_POINTS:
        v = world_to_camera_view(scene, cam, bvec(*position))
        points.append({"name": name, "x": v.x * OUT_STILL[0], "y": (1.0 - v.y) * OUT_STILL[1]})
    with open(os.path.join(args.out, "04_karte_beschriftung.json"), "w", encoding="utf-8") as f:
        json.dump({"anchors": anchors, "points": points, "pixels_per_meter": pixels_per_meter,
                   "size": list(OUT_STILL)}, f, ensure_ascii=False, indent=1)


def catmull_rom(points, t):
    """Uniform Catmull-Rom through the points, t in [0, len(points) - 1]."""
    n = len(points)
    i = min(int(t), n - 2)
    u = t - i
    p0 = Vector(points[max(i - 1, 0)])
    p1 = Vector(points[i])
    p2 = Vector(points[i + 1])
    p3 = Vector(points[min(i + 2, n - 1)])
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


# Camera flight: (camera position, look-at target) in Unity coordinates, evenly spaced in time.
FLIGHT = [
    ((44.0, 30.0, -52.0), (2.0, 0.0, -8.0)),     # south-east, high: whole course
    ((50.0, 13.0, -6.0), (26.0, 0.8, 4.0)),      # east: tunnel and jump platforms
    ((34.0, 10.0, 24.0), (9.0, 1.0, 9.0)),       # north-east: platforms, chests, stairs
    ((4.0, 11.0, 38.0), (-10.0, 1.0, 12.0)),     # north: stairs and ramps
    ((-24.0, 10.0, 36.0), (-30.0, 1.0, 8.0)),    # north-west: ramps and gaps
    ((-50.0, 11.0, 6.0), (-24.0, 0.5, -16.0)),   # west: gaps, pillars, dummy
    ((-46.0, 10.0, -32.0), (-27.0, 0.5, -42.0)), # south-west: arena
    ((-18.0, 5.0, -33.0), (-28.0, 0.6, -44.0)),  # arena close
]


def job_rundflug(args):
    scene, b, _ = build_scene(loot_at_player=False)
    setup_render(scene, OUT_VIDEO, args.samples, args.test)
    cam = make_camera(scene)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(50)
    total = int(round(args.seconds * FPS))
    frames_dir = os.path.join(args.out, "05_rundflug_frames")
    os.makedirs(frames_dir, exist_ok=True)
    positions = [p for p, _ in FLIGHT]
    targets = [t for _, t in FLIGHT]
    first, last = args.frames if args.frames else (0, total - 1)
    for frame in range(first, min(last, total - 1) + 1):
        u = frame / (total - 1)
        eased = u * u * (3 - 2 * u) * 0.35 + u * 0.65   # gentle start and end
        k = eased * (len(FLIGHT) - 1)
        look_at(cam, catmull_rom(positions, k), catmull_rom(targets, k))
        render_still(scene, os.path.join(frames_dir, "%04d.png" % frame))


def job_sprungtest(args):
    frames, info = simulate_jump_test(duration=args.seconds)
    with open(os.path.join(args.out, "06_sprungtest_bahn.json"), "w", encoding="utf-8") as f:
        json.dump({"info": info, "frames": frames, "movement": MOVE}, f, ensure_ascii=False, indent=1)
    for event in info["events"]:
        print("EREIGNIS", event)
    scene, b, player = build_scene(loot_at_player=False)
    setup_render(scene, OUT_VIDEO, args.samples, args.test)
    cam = make_camera(scene)

    # Player objects: keep their local matrices relative to the player root at the origin, then move the root.
    rest = {ob.name: ob.matrix_world.copy() for ob in player}

    frames_dir = os.path.join(args.out, "06_sprungtest_frames")
    os.makedirs(frames_dir, exist_ok=True)

    # Camera: the orbit follows the pivot with Cinemachine-style damping (99 % in 0.1 s); the camera yaw is turned by the
    # (simulated) player with the mouse/right stick towards the running direction.
    k_follow = -math.log(0.01) / CAMERA_DAMPING
    dt = 1.0 / FPS
    pivot = Vector((0.0, PIVOT_HEIGHT, 0.0))
    cam_yaw = 0.0
    states = []
    for fr in frames:
        target_pivot = Vector((fr["x"], fr["y"] + PIVOT_HEIGHT, fr["z"]))
        pivot = pivot + (target_pivot - pivot) * (1.0 - math.exp(-k_follow * dt))
        if fr["speed"] > 0.5:
            diff = (fr["yaw"] - cam_yaw + 180.0) % 360.0 - 180.0
            cam_yaw += diff * (1.0 - math.exp(-2.2 * dt))
        states.append((pivot.copy(), cam_yaw))

    first, last = args.frames if args.frames else (0, len(frames) - 1)
    for index in range(first, min(last, len(frames) - 1) + 1):
        fr = frames[index]
        root = to_blender_matrix(u_trs((fr["x"], fr["y"], fr["z"]), u_euler(0, fr["yaw"], 0)))
        for ob in player:
            ob.matrix_world = root @ rest[ob.name]
        pivot_now, yaw_now = states[index]
        third_person(cam, scene, tuple(pivot_now), yaw_now)
        render_still(scene, os.path.join(frames_dir, "%04d.png" % index))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Blender-Nachbau des Unity-Testgeländes rendern.")
    parser.add_argument("--job", required=True,
                        choices=["uebersicht", "arena", "truhen", "spielersicht", "karte", "alle_bilder", "rundflug", "sprungtest"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--seconds", type=float, default=None)
    parser.add_argument("--frames", type=str, default=None, help="Bereich a-b (nur für Videos)")
    parser.add_argument("--test", action="store_true", help="klein und schnell rendern")
    parser.add_argument("--kamera", type=str, default=None, help="px,py,pz,tx,ty,tz,fov (Unity-Koordinaten) zum Ausprobieren")
    parser.add_argument("--name", type=str, default=None, help="anderer Dateiname (nur Einzelbilder)")
    args = parser.parse_args(argv)
    global CAMERA_OVERRIDE, OUTPUT_NAME
    OUTPUT_NAME = args.name
    if args.kamera:
        CAMERA_OVERRIDE = [float(v) for v in args.kamera.split(",")]
    os.makedirs(args.out, exist_ok=True)
    if args.frames:
        a, b = args.frames.split("-")
        args.frames = (int(a), int(b))
    if args.seconds is None:
        args.seconds = 15.0 if args.job == "rundflug" else 8.0
    jobs = {"uebersicht": job_uebersicht, "arena": job_arena, "truhen": job_truhen, "spielersicht": job_spielersicht,
            "karte": job_karte, "rundflug": job_rundflug, "sprungtest": job_sprungtest}
    if args.job == "alle_bilder":
        for name in ("uebersicht", "arena", "truhen", "spielersicht", "karte"):
            jobs[name](args)
    else:
        jobs[args.job](args)


if __name__ == "__main__":
    main()
