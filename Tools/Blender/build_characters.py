"""Builds the low-poly character models of Aetherfall in Blender and exports one FBX per model.

Own work, made only from code (no third-party meshes or textures): license register entry "eigene Modelle".

Each model is a hierarchy of rigid parts. The origin of every part sits on its joint (hip, knee, shoulder, elbow ...), so
Unity can move the parts like a puppet (HumanoidPuppet / QuadrupedPuppet): walking, arms that follow sword and shield, falling
over. No armature, no skinning, no baked animation - the motion lives in the Unity code.

Conventions (checked by the Unity importer, ModelImportSettings.cs):
- Blender: Z up, parts are written looking along -Y (front view) and turned by 180° when built (TURN), so the FBX
  export puts the face at Unity +Z. Axes are baked into the vertices (no rotations on the parts). 1 unit = 1 m. Feet on z = 0.
- Part names are the joint names Unity looks for ("Pelvis", "Torso", "Head", "UpperArm.R", "Forearm.R", "Thigh.L", ...).
  ".R" is the model's right side (+X in Unity).
- Materials carry only a base colour (Unity's URP importer turns them into Lit materials). Names: "<Model>_<Part>".

Output: figures to Assets/_Project/Art/Models/Characters/, the building kit to Assets/_Project/Art/Models/Buildings/.

Usage (from the repository folder):
    blender -b --factory-startup -P Tools/Blender/build_characters.py -- [--only krieger,schwert,holzschild] [--out DIR]
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DEFAULT_OUT = os.path.join(ROOT, "Assets", "_Project", "Art", "Models")

# Parts are modelled looking along -Y (Blender front view) and turned by 180° when they are built: the FBX export maps
# Blender +Y to Unity +Z, so in Unity the model looks along +Z and its right side lies at +X.
TURN = Matrix.Rotation(math.pi, 4, 'Z')


# ---- Scene and materials ------------------------------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_colour, roughness=0.85, metallic=0.0):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    r, g, b = (int(hex_colour[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    linear = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = linear
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    m.diffuse_color = linear
    return m


# ---- Mesh building ------------------------------------------------------------------------------------------------------

class PartBuilder:
    """Collects primitive pieces (each with its own material) into one mesh around the joint origin."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def _material_index(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def _tag(self, verts, mat):
        index = self._material_index(mat)
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        for f in faces:
            f.material_index = index

    def box(self, size, centre, mat, top_scale=(1.0, 1.0), rotate=None):
        """Box (sx, sy, sz) around centre; top_scale tapers the upper face (x, y)."""
        sx, sy, sz = size
        before = set(self.bm.verts)
        bmesh.ops.create_cube(self.bm, size=1.0)
        new = [v for v in self.bm.verts if v not in before]
        for v in new:
            x, y, z = v.co
            if z > 0:
                x *= top_scale[0]
                y *= top_scale[1]
            v.co = Vector((x * sx, y * sy, z * sz))
            if rotate is not None:
                v.co = rotate @ v.co
            v.co += Vector(centre)
        self._tag(new, mat)
        return self

    def cylinder(self, radius, depth, centre, mat, segments=8, radius_top=None, axis='Z'):
        before = set(self.bm.verts)
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                              radius2=radius if radius_top is None else radius_top, depth=depth)
        new = [v for v in self.bm.verts if v not in before]
        turn = Matrix.Identity(3)
        if axis == 'Y':
            turn = Matrix.Rotation(math.radians(90), 3, 'X')
        elif axis == 'X':
            turn = Matrix.Rotation(math.radians(90), 3, 'Y')
        for v in new:
            v.co = turn @ v.co + Vector(centre)
        self._tag(new, mat)
        return self

    def sphere(self, radius, centre, mat, scale=(1.0, 1.0, 1.0), segments=8, rings=6, keep_upper=False):
        before = set(self.bm.verts)
        bmesh.ops.create_uvsphere(self.bm, u_segments=segments, v_segments=rings, radius=radius)
        new = [v for v in self.bm.verts if v not in before]
        if keep_upper:
            # Cap: the lower half is pressed flat onto the equator, so the shape stays closed.
            for v in new:
                if v.co.z < 0:
                    v.co.z = 0.0
            bmesh.ops.remove_doubles(self.bm, verts=new, dist=1e-5)
            new = [v for v in new if v.is_valid]
        for v in new:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(centre)
        self._tag(new, mat)
        return self

    def build(self, parent, joint):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.transform(self.bm, matrix=TURN, verts=self.bm.verts)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.materials:
            mesh.materials.append(mat)
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        obj.location = TURN @ Vector(joint)
        return obj


def empty(name, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = TURN @ Vector(location)
    return obj


def flatten():
    """Every part becomes a top-level object at its joint (the FBX axis baking breaks nested parts); Unity rebuilds the joint
    chain by name (CharacterModels.Instantiate). Empties are dropped."""
    bpy.context.view_layer.update()
    for obj in list(bpy.context.scene.objects):
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'EMPTY':
            bpy.data.objects.remove(obj, do_unlink=True)


def export_fbx(path):
    flatten()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=False,
        object_types={'EMPTY', 'MESH'},
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_UNITS',
        axis_forward='-Z',
        axis_up='Y',
        bake_space_transform=True,
        mesh_smooth_type='FACE',
        use_mesh_modifiers=True,
        add_leaf_bones=False,
        bake_anim=False,
        use_custom_props=False,
        path_mode='STRIP')
    print("FBX geschrieben:", os.path.relpath(path, ROOT))


# ---- Humanoid ------------------------------------------------------------------------------------------------------------

class HumanLook:
    """Colours and proportions of a humanoid (all hex sRGB)."""

    def __init__(self, prefix, skin, hair, top, sleeve, trousers, boots, gloves, belt, height=1.8, bulk=1.0):
        self.prefix = prefix
        self.skin = skin
        self.hair = hair
        self.top = top
        self.sleeve = sleeve
        self.trousers = trousers
        self.boots = boots
        self.gloves = gloves
        self.belt = belt
        self.height = height
        self.bulk = bulk


def build_humanoid(look, extras=None):
    """Rigid humanoid, feet on the ground, looking along -Y. Returns the root object and the parts by joint name."""
    s = look.height / 1.8
    w = look.bulk
    m = lambda part, colour, rough=0.85, metal=0.0: material(look.prefix + "_" + part, colour, rough, metal)
    skin = m("Haut", look.skin, 0.7)
    eye = m("Augen", "1E1A18", 0.4)
    hair = m("Haare", look.hair)
    top = m("Wams", look.top)
    sleeve = m("Aermel", look.sleeve)
    trousers = m("Hose", look.trousers)
    boots = m("Stiefel", look.boots, 0.6)
    gloves = m("Handschuhe", look.gloves, 0.6)
    belt = m("Guertel", look.belt, 0.5)

    root = empty(look.prefix)
    parts = {}

    pelvis = PartBuilder("Pelvis")
    pelvis.box((0.34 * w, 0.21 * w, 0.16 * s), (0, 0, 0), trousers)
    pelvis.box((0.37 * w, 0.24 * w, 0.06 * s), (0, 0, 0.06 * s), belt)
    pelvis.box((0.06, 0.03, 0.05), (0.05 * w, -0.125 * w, 0.06 * s), m("Schnalle", "B89A4A", 0.4, 0.6))
    # Skirt of the padded jacket (gambeson) below the belt.
    pelvis.box((0.4 * w, 0.26 * w, 0.2 * s), (0, 0, -0.08 * s), top, top_scale=(0.92, 0.92))
    parts["Pelvis"] = pelvis.build(root, (0, 0, 0.95 * s))

    torso = PartBuilder("Torso")
    torso.box((0.36 * w, 0.22 * w, 0.48 * s), (0, 0, 0.24 * s), top, top_scale=(1.18, 1.1))
    torso.box((0.2 * w, 0.2 * w, 0.06 * s), (0, 0.01, 0.49 * s), top)
    for i in range(4):
        # Quilting seams of the gambeson.
        torso.box((0.38 * w + i * 0.02, 0.012, 0.012), (0, -0.115 * w - i * 0.002, (0.08 + i * 0.11) * s), m("Naht", "8A7A5C"))
    parts["Torso"] = torso.build(parts["Pelvis"], (0, 0, 0.06 * s))

    head = PartBuilder("Head")
    head.cylinder(0.055, 0.08 * s, (0, 0, 0.03 * s), skin, segments=8)
    head.sphere(0.115, (0, 0, 0.17 * s), skin, scale=(0.95, 1.0, 1.12), segments=10, rings=7)
    head.box((0.04, 0.05, 0.06), (0, -0.115, 0.165 * s), skin, top_scale=(0.6, 0.6))
    for side in (-1, 1):
        head.box((0.03, 0.012, 0.022), (side * 0.042, -0.106, 0.2 * s), eye)
        head.box((0.03, 0.03, 0.05), (side * 0.112, 0.0, 0.17 * s), skin)
    head.sphere(0.124, (0, 0.022, 0.205 * s), hair, scale=(1.0, 1.02, 0.85), segments=10, rings=6, keep_upper=True)
    head.box((0.22, 0.06, 0.1), (0, 0.095, 0.15 * s), hair)
    parts["Head"] = head.build(parts["Torso"], (0, 0, 0.5 * s))

    for side, tag in ((-1, "R"), (1, "L")):
        upper = PartBuilder("UpperArm." + tag)
        upper.box((0.13, 0.14, 0.12), (0, 0, -0.02), top)
        upper.box((0.11, 0.12, 0.3 * s), (0, 0, -0.16 * s), sleeve, top_scale=(1.05, 1.05))
        parts["UpperArm." + tag] = upper.build(parts["Torso"], (side * 0.25 * w, 0, 0.42 * s))

        fore = PartBuilder("Forearm." + tag)
        fore.box((0.1, 0.11, 0.24 * s), (0, 0, -0.12 * s), sleeve, top_scale=(1.05, 1.05))
        fore.box((0.105, 0.115, 0.06), (0, 0, -0.21 * s), gloves)
        fore.box((0.09, 0.1, 0.1), (0, -0.01, -0.29 * s), gloves)
        parts["Forearm." + tag] = fore.build(parts["UpperArm." + tag], (0, 0, -0.31 * s))

        thigh = PartBuilder("Thigh." + tag)
        thigh.box((0.15 * w, 0.17 * w, 0.42 * s), (0, 0, -0.21 * s), trousers, top_scale=(1.08, 1.08))
        parts["Thigh." + tag] = thigh.build(parts["Pelvis"], (side * 0.1 * w, 0, -0.08 * s))

        shin = PartBuilder("Shin." + tag)
        shin.box((0.13 * w, 0.15 * w, 0.17 * s), (0, 0, -0.09 * s), trousers)
        shin.box((0.145 * w, 0.165 * w, 0.24 * s), (0, 0, -0.27 * s), boots, top_scale=(1.06, 1.06))
        shin.box((0.15 * w, 0.17 * w, 0.03 * s), (0, 0, -0.16 * s), boots)
        shin.box((0.135 * w, 0.26, 0.08 * s), (0, -0.05, -0.41 * s), boots)
        parts["Shin." + tag] = shin.build(parts["Thigh." + tag], (0, 0, -0.42 * s))

    if extras is not None:
        extras(parts, m, s, w)
    return root, parts


# ---- Models -------------------------------------------------------------------------------------------------------------

def krieger():
    """Player character, warrior with the starting kit (GDD 03: gambeson, leather boots; sword and wooden shield separate)."""
    look = HumanLook("Krieger", skin="D9A07E", hair="5A3A22", top="B8A27A", sleeve="A8946C", trousers="4A4036", boots="5C3A22",
                     gloves="6B4A2E", belt="3E2A1A")
    build_humanoid(look)


def schwert():
    """Simple sword (Schwert, item level 1): grip at the origin, blade along the look direction (-Y)."""
    steel = material("Schwert_Klinge", "B8BEC4", 0.35, 0.8)
    guard = material("Schwert_Parierstange", "6E6A64", 0.4, 0.7)
    grip = material("Schwert_Griff", "4A2E1C", 0.7)
    root = empty("Schwert")
    sword = PartBuilder("Klinge")
    sword.cylinder(0.022, 0.15, (0, 0.0, 0), grip, segments=6, axis='Y')
    sword.sphere(0.032, (0, 0.09, 0), guard, segments=6, rings=4)
    sword.box((0.24, 0.04, 0.035), (0, -0.09, 0), guard)
    sword.box((0.016, 0.78, 0.06), (0, -0.5, 0), steel, top_scale=(1.0, 1.0))
    # Tip: a short tapered piece.
    sword.box((0.016, 0.06, 0.06), (0, -0.92, 0), steel, rotate=Matrix.Rotation(math.radians(0), 3, 'X'))
    sword.build(root, (0, 0, 0))


def holzschild():
    """Round wooden shield (Holzschild): grip at the origin, the face looks along -Y."""
    wood = material("Holzschild_Holz", "8A5A32", 0.9)
    plank = material("Holzschild_Bretter", "7A4E2A", 0.9)
    iron = material("Holzschild_Eisen", "5E5E62", 0.45, 0.8)
    root = empty("Holzschild")
    shield = PartBuilder("Schild")
    shield.cylinder(0.31, 0.035, (0, -0.1, 0), wood, segments=16, axis='Y')
    for x in (-0.15, 0.0, 0.15):
        shield.box((0.012, 0.004, 0.56), (x, -0.119, 0), plank)
    shield.cylinder(0.325, 0.02, (0, -0.1, 0), iron, segments=16, radius_top=0.325, axis='Y')
    shield.sphere(0.07, (0, -0.12, 0), iron, scale=(1.0, 0.6, 1.0), segments=8, rings=4)
    shield.box((0.04, 0.06, 0.16), (0, -0.05, 0), material("Holzschild_Griff", "3E2A1A"))
    shield.build(root, (0, 0, 0))


def u(x, y, z):
    """Position in Unity axes (x right, y up, z forward) as build coordinates (before TURN: forward is -Y, right is -X)."""
    return (-x, -z, y)


def us(x, y, z):
    """Size in Unity axes as build size."""
    return (x, z, y)


def build_wolf(prefix, fur, belly, dark, eye, eye_rough=0.4, crystals=None):
    """Wolf (Grauwolf / Aether-Wolf) in Unity axes: about 1.35 m long, shoulder 0.72 m, looking along +Z.

    Joints: Torso (0, 0.62, 0), Head at the neck, Tail at the rump, legs FrontUpper/FrontLower and HindUpper/HindLower (.L/.R).
    """
    m = lambda part, colour, rough=0.9, metal=0.0: material(prefix + "_" + part, colour, rough, metal)
    fur_m = m("Fell", fur)
    belly_m = m("Bauch", belly)
    dark_m = m("Dunkel", dark)
    eye_m = m("Augen" if crystals is None else "Augen_Leuchten", eye, eye_rough)
    nose_m = m("Nase", "1A1614", 0.4)
    root = empty(prefix)

    torso = PartBuilder("Torso")
    torso.box(us(0.36, 0.36, 0.5), u(0, 0.06, 0.3), fur_m, top_scale=(0.88, 1.0))
    torso.box(us(0.3, 0.3, 0.6), u(0, 0.05, -0.24), fur_m, top_scale=(0.9, 1.0))
    torso.box(us(0.22, 0.08, 0.72), u(0, -0.1, 0.02), belly_m)
    torso.box(us(0.38, 0.22, 0.14), u(0, 0.13, 0.5), dark_m, top_scale=(0.8, 0.9))
    if crystals is not None:
        for i, (x, z, h) in enumerate(((0.0, 0.25, 0.22), (0.06, 0.02, 0.16), (-0.05, -0.2, 0.18))):
            torso.box(us(0.08, h, 0.08), u(x, 0.27 + h * 0.5, z), crystals, top_scale=(0.2, 0.2),
                      rotate=Matrix.Rotation(math.radians(12 * (i - 1)), 3, 'Y'))
    parts = {"Torso": torso.build(root, u(0, 0.62, 0))}

    head = PartBuilder("Head")
    head.box(us(0.26, 0.24, 0.28), u(0, 0.04, 0.1), fur_m, top_scale=(0.9, 0.9))
    head.box(us(0.12, 0.1, 0.27), u(0, -0.03, 0.36), fur_m, top_scale=(0.85, 0.8))
    head.box(us(0.06, 0.05, 0.05), u(0, -0.01, 0.5), nose_m)
    head.box(us(0.1, 0.04, 0.22), u(0, -0.08, 0.34), belly_m)
    for side in (-1, 1):
        head.box(us(0.07, 0.12, 0.05), u(side * 0.08, 0.2, 0.04), fur_m, top_scale=(0.2, 0.4))
        head.box(us(0.04, 0.03, 0.02), u(side * 0.075, 0.08, 0.24), eye_m)
    parts["Head"] = head.build(parts["Torso"], u(0, 0.22, 0.56))

    tail = PartBuilder("Tail")
    tail.box(us(0.1, 0.1, 0.48), u(0, -0.1, -0.2), fur_m, top_scale=(0.6, 0.6),
             rotate=Matrix.Rotation(math.radians(-25), 3, 'X'))
    parts["Tail"] = tail.build(parts["Torso"], u(0, 0.12, -0.56))

    for side, tag in ((1, "R"), (-1, "L")):
        upper = PartBuilder("FrontUpper." + tag)
        upper.box(us(0.11, 0.34, 0.13), u(0, -0.15, 0), fur_m, top_scale=(1.2, 1.3))
        parts["FrontUpper." + tag] = upper.build(parts["Torso"], u(side * 0.13, -0.04, 0.4))
        lower = PartBuilder("FrontLower." + tag)
        lower.box(us(0.08, 0.26, 0.09), u(0, -0.13, 0), fur_m)
        lower.box(us(0.1, 0.05, 0.14), u(0, -0.27, 0.03), dark_m)
        parts["FrontLower." + tag] = lower.build(parts["FrontUpper." + tag], u(0, -0.3, 0))

        hind = PartBuilder("HindUpper." + tag)
        hind.box(us(0.13, 0.32, 0.18), u(0, -0.13, 0.02), fur_m, top_scale=(1.15, 1.35))
        parts["HindUpper." + tag] = hind.build(parts["Torso"], u(side * 0.13, -0.02, -0.42))
        shin = PartBuilder("HindLower." + tag)
        shin.box(us(0.08, 0.28, 0.09), u(0, -0.13, -0.03), fur_m)
        shin.box(us(0.1, 0.05, 0.14), u(0, -0.28, 0.02), dark_m)
        parts["HindLower." + tag] = shin.build(parts["HindUpper." + tag], u(0, -0.3, 0.02))


def wolf():
    """Grey wolf (Grauwolf)."""
    build_wolf("Wolf", fur="7A7670", belly="B8B0A2", dark="4A4642", eye="C8962E")


def aetherwolf():
    """Aether-touched wolf: dark fur, glowing eyes and crystals on the back (Unity gives "_Leuchten" materials a glow)."""
    crystals = material("AetherWolf_Kristall_Leuchten", "5FE0E8", 0.2)
    build_wolf("AetherWolf", fur="3E4250", belly="6A6E7A", dark="23252E", eye="7FF4FF", eye_rough=0.2, crystals=crystals)


def dorfbewohner():
    """Base villager for all NPCs: one body plus optional pieces ("Acc_<Name>@<Joint>"), materials named by colour slot.

    Unity (VillagerFigures) keeps the pieces a person wears and colours the slots per NPC: Haut, Haare, Oberteil, Aermel,
    Unterteil, Schuhe, Guertel, Schuerze, Akzent (shawl, cap, hood, tabard, straw hat), Metall (armour), Augen, Schatten.
    """
    slot = lambda name, rough=0.85, metal=0.0: material("Dorf_" + name, "C8C8C8", rough, metal)
    skin, hair, top, sleeve = slot("Haut", 0.7), slot("Haare"), slot("Oberteil"), slot("Aermel")
    bottom, shoes, belt, apron = slot("Unterteil"), slot("Schuhe", 0.6), slot("Guertel", 0.5), slot("Schuerze")
    accent, metal = slot("Akzent"), slot("Metall", 0.4, 0.8)
    eyes = material("Dorf_Augen", "1E1A18", 0.4)
    shadow = material("Dorf_Schatten", "151517", 0.9)
    root = empty("Dorfbewohner")
    parts = {}

    pelvis = PartBuilder("Pelvis")
    pelvis.box((0.33, 0.2, 0.16), (0, 0, 0), bottom)
    pelvis.box((0.35, 0.22, 0.05), (0, 0, 0.065), belt)
    parts["Pelvis"] = pelvis.build(root, (0, 0, 0.95))

    torso = PartBuilder("Torso")
    torso.box((0.34, 0.21, 0.48), (0, 0, 0.24), top, top_scale=(1.15, 1.08))
    torso.box((0.18, 0.18, 0.05), (0, 0.01, 0.49), top)
    parts["Torso"] = torso.build(parts["Pelvis"], (0, 0, 0.06))

    head = PartBuilder("Head")
    head.cylinder(0.052, 0.08, (0, 0, 0.03), skin, segments=8)
    head.sphere(0.112, (0, 0, 0.17), skin, scale=(0.95, 1.0, 1.12), segments=10, rings=7)
    head.box((0.038, 0.05, 0.055), (0, -0.112, 0.165), skin, top_scale=(0.6, 0.6))
    for side in (-1, 1):
        head.box((0.03, 0.012, 0.022), (side * 0.04, -0.103, 0.2), eyes)
        head.box((0.028, 0.03, 0.05), (side * 0.108, 0.0, 0.17), skin)
    parts["Head"] = head.build(parts["Torso"], (0, 0, 0.5))

    for side, tag in ((-1, "R"), (1, "L")):
        upper = PartBuilder("UpperArm." + tag)
        upper.box((0.12, 0.13, 0.11), (0, 0, -0.02), top)
        upper.box((0.1, 0.11, 0.3), (0, 0, -0.16), sleeve, top_scale=(1.05, 1.05))
        parts["UpperArm." + tag] = upper.build(parts["Torso"], (side * 0.235, 0, 0.42))
        fore = PartBuilder("Forearm." + tag)
        fore.box((0.09, 0.1, 0.22), (0, 0, -0.11), sleeve)
        fore.box((0.08, 0.09, 0.1), (0, -0.005, -0.28), skin)
        parts["Forearm." + tag] = fore.build(parts["UpperArm." + tag], (0, 0, -0.31))
        thigh = PartBuilder("Thigh." + tag)
        thigh.box((0.14, 0.16, 0.42), (0, 0, -0.21), bottom, top_scale=(1.08, 1.08))
        parts["Thigh." + tag] = thigh.build(parts["Pelvis"], (side * 0.095, 0, -0.08))
        shin = PartBuilder("Shin." + tag)
        shin.box((0.12, 0.14, 0.3), (0, 0, -0.15), bottom)
        shin.box((0.13, 0.15, 0.1), (0, 0, -0.35), shoes)
        shin.box((0.125, 0.24, 0.07), (0, -0.045, -0.415), shoes)
        parts["Shin." + tag] = shin.build(parts["Thigh." + tag], (0, 0, -0.42))

    def acc(name, joint, *pieces):
        piece = PartBuilder("Acc_" + name + "@" + joint)
        for add in pieces:
            add(piece)
        piece.build(parts[joint], (0, 0, 0))

    acc("Haare", "Head",
        lambda p: p.sphere(0.122, (0, 0.02, 0.205), hair, scale=(1.0, 1.02, 0.85), segments=10, rings=6, keep_upper=True),
        lambda p: p.box((0.21, 0.06, 0.1), (0, 0.09, 0.15), hair))
    acc("Zopf", "Head", lambda p: p.box((0.07, 0.06, 0.3), (0, 0.12, 0.02), hair, top_scale=(1.3, 1.2)))
    acc("Bart", "Head", lambda p: p.box((0.17, 0.07, 0.1), (0, -0.095, 0.085), hair, top_scale=(1.1, 1.0)))
    acc("Haarkranz", "Head", lambda p: p.box((0.21, 0.05, 0.06), (0, 0.085, 0.14), hair))
    acc("Strohhut", "Head",
        lambda p: p.cylinder(0.23, 0.02, (0, 0, 0.27), accent, segments=12),
        lambda p: p.cylinder(0.13, 0.1, (0, 0, 0.31), accent, segments=10, radius_top=0.11))
    acc("Muetze", "Head", lambda p: p.sphere(0.128, (0, 0.01, 0.235), accent, scale=(1.0, 1.0, 0.6), segments=10, rings=5, keep_upper=True))
    acc("Kapuze", "Head",
        lambda p: p.sphere(0.16, (0, 0.03, 0.18), accent, scale=(1.0, 1.05, 1.1), segments=10, rings=7),
        lambda p: p.box((0.2, 0.04, 0.2), (0, -0.12, 0.17), shadow))
    acc("Schuerze", "Pelvis", lambda p: p.box((0.34, 0.02, 0.62), (0, -0.125, -0.12), apron, top_scale=(0.9, 1.0)))
    acc("Latz", "Torso", lambda p: p.box((0.26, 0.02, 0.26), (0, -0.115, 0.2), apron))
    acc("Tuch", "Torso", lambda p: p.box((0.44, 0.27, 0.12), (0, 0, 0.42), accent, top_scale=(0.75, 0.85)))
    acc("Rock", "Pelvis", lambda p: p.cylinder(0.25, 0.86, (0, 0, -0.37), bottom, segments=10, radius_top=0.19))
    acc("Robe", "Pelvis", lambda p: p.cylinder(0.28, 0.95, (0, 0, -0.42), bottom, segments=10, radius_top=0.2))
    acc("Mantel", "Torso", lambda p: p.cylinder(0.33, 1.42, (0, 0.02, -0.25), accent, segments=10, radius_top=0.24))
    acc("Wappenrock", "Torso",
        lambda p: p.box((0.3, 0.02, 0.5), (0, -0.118, 0.2), accent),
        lambda p: p.box((0.3, 0.02, 0.5), (0, 0.118, 0.2), accent))
    acc("Ruestung", "Torso",
        lambda p: p.box((0.37, 0.23, 0.42), (0, 0, 0.27), metal, top_scale=(1.12, 1.08)),
        lambda p: p.sphere(0.1, (-0.24, 0, 0.42), metal, scale=(1.1, 1.1, 0.75), segments=8, rings=5),
        lambda p: p.sphere(0.1, (0.24, 0, 0.42), metal, scale=(1.1, 1.1, 0.75), segments=8, rings=5))


def gruft_materials():
    """Material slots of the crypt models; Unity swaps them for the crypt materials (GruftMaterials) by name."""
    return {
        "bone": material("Gruft_Knochen", "D8CFB8", 0.8),
        "rust": material("Gruft_Ruestung", "6E5A48", 0.6, 0.5),
        "plate": material("Gruft_Ritter", "8A8E94", 0.35, 0.8),
        "cloth": material("Gruft_Stoff", "5A2A2A", 0.9),
        "iron": material("Gruft_Eisen", "4A4A4E", 0.45, 0.8),
        "glow": material("Gruft_Augen_Leuchten", "7FF4FF", 0.2),
        "dark": material("Gruft_Schatten", "101012", 0.9),
    }


def skelett():
    """Skeleton warrior of the crypt (GDD 01 11.1 "Untote"): bones, rusty breastplate, tattered loincloth, glowing eye sockets.
    Same joints as the humanoids (HumanoidPuppet)."""
    g = gruft_materials()
    bone, rust, cloth, iron, glow = g["bone"], g["rust"], g["cloth"], g["iron"], g["glow"]
    root = empty("Skelett")
    parts = {}

    pelvis = PartBuilder("Pelvis")
    pelvis.box((0.28, 0.13, 0.1), (0, 0, 0), bone, top_scale=(1.15, 1.0))
    pelvis.box((0.32, 0.17, 0.04), (0, 0, 0.06), iron)
    pelvis.box((0.2, 0.02, 0.3), (0, -0.09, -0.12), cloth, top_scale=(1.1, 1.0))
    pelvis.box((0.2, 0.02, 0.26), (0, 0.09, -0.1), cloth, top_scale=(1.1, 1.0))
    parts["Pelvis"] = pelvis.build(root, (0, 0, 0.95))

    torso = PartBuilder("Torso")
    torso.cylinder(0.028, 0.5, (0, 0.05, 0.24), bone, segments=6)
    for i in range(4):
        width = 0.3 - i * 0.025
        torso.box((width, 0.17, 0.03), (0, 0, 0.1 + i * 0.07), bone, top_scale=(1.0, 1.0))
    torso.box((0.36, 0.22, 0.2), (0, -0.005, 0.36), rust, top_scale=(1.12, 1.05))
    torso.box((0.42, 0.06, 0.04), (0, 0, 0.47), bone)
    parts["Torso"] = torso.build(parts["Pelvis"], (0, 0, 0.06))

    head = PartBuilder("Head")
    head.cylinder(0.028, 0.08, (0, 0, 0.03), bone, segments=6)
    head.sphere(0.11, (0, 0.005, 0.18), bone, scale=(0.9, 1.0, 1.05), segments=10, rings=7)
    head.box((0.12, 0.09, 0.06), (0, -0.045, 0.08), bone, top_scale=(1.1, 1.0))
    for side in (-1, 1):
        head.box((0.042, 0.02, 0.036), (side * 0.04, -0.098, 0.185), glow)
    head.box((0.03, 0.02, 0.03), (0, -0.105, 0.14), g["dark"])
    parts["Head"] = head.build(parts["Torso"], (0, 0, 0.5))

    for side, tag in ((-1, "R"), (1, "L")):
        upper = PartBuilder("UpperArm." + tag)
        upper.sphere(0.045, (0, 0, 0), bone, segments=6, rings=4)
        upper.cylinder(0.024, 0.3, (0, 0, -0.16), bone, segments=6)
        if tag == "R":
            upper.box((0.13, 0.15, 0.09), (0, 0, 0.0), rust, top_scale=(0.8, 0.9))
        parts["UpperArm." + tag] = upper.build(parts["Torso"], (side * 0.23, 0, 0.42))
        fore = PartBuilder("Forearm." + tag)
        fore.box((0.02, 0.02, 0.26), (0.016, 0, -0.13), bone)
        fore.box((0.02, 0.02, 0.26), (-0.016, 0, -0.13), bone)
        fore.box((0.06, 0.08, 0.09), (0, -0.005, -0.29), bone)
        parts["Forearm." + tag] = fore.build(parts["UpperArm." + tag], (0, 0, -0.31))
        thigh = PartBuilder("Thigh." + tag)
        thigh.cylinder(0.03, 0.42, (0, 0, -0.21), bone, segments=6)
        thigh.sphere(0.045, (0, 0, -0.42), bone, segments=6, rings=4)
        parts["Thigh." + tag] = thigh.build(parts["Pelvis"], (side * 0.1, 0, -0.06))
        shin = PartBuilder("Shin." + tag)
        shin.box((0.022, 0.022, 0.4), (0.015, 0, -0.2), bone)
        shin.box((0.022, 0.022, 0.4), (-0.015, 0, -0.2), bone)
        shin.box((0.08, 0.2, 0.04), (0, -0.05, -0.42), bone)
        parts["Shin." + tag] = shin.build(parts["Thigh." + tag], (0, 0, -0.42))


def ritter():
    """Der Wachende Ritter (boss of the crypt): skeleton knight in full plate, great helm with a glowing slit, tabard and cape.
    Built at 1.8 m; Unity scales it (1.22)."""
    g = gruft_materials()
    plate, cloth, iron, glow, dark = g["plate"], g["cloth"], g["iron"], g["glow"], g["dark"]
    root = empty("Ritter")
    parts = {}

    pelvis = PartBuilder("Pelvis")
    pelvis.box((0.36, 0.22, 0.14), (0, 0, 0), iron)
    pelvis.box((0.44, 0.28, 0.24), (0, 0, -0.08), plate, top_scale=(0.92, 0.92))
    pelvis.box((0.3, 0.02, 0.5), (0, -0.15, -0.2), cloth, top_scale=(1.05, 1.0))
    pelvis.box((0.3, 0.02, 0.5), (0, 0.15, -0.2), cloth, top_scale=(1.05, 1.0))
    parts["Pelvis"] = pelvis.build(root, (0, 0, 0.95))

    torso = PartBuilder("Torso")
    torso.box((0.4, 0.27, 0.48), (0, 0, 0.25), plate, top_scale=(1.15, 1.05))
    torso.box((0.3, 0.02, 0.4), (0, -0.142, 0.18), cloth)
    torso.box((0.06, 0.025, 0.3), (0, -0.155, 0.22), material("Gruft_Wappen", "C8B45A", 0.5, 0.3))
    torso.box((0.5, 0.03, 1.15), (0, 0.17, -0.12), cloth, top_scale=(0.85, 1.0))
    torso.box((0.22, 0.2, 0.06), (0, 0, 0.5), plate)
    parts["Torso"] = torso.build(parts["Pelvis"], (0, 0, 0.06))

    head = PartBuilder("Head")
    head.cylinder(0.05, 0.08, (0, 0, 0.03), iron, segments=8)
    head.cylinder(0.13, 0.3, (0, 0, 0.18), plate, segments=10, radius_top=0.12)
    head.box((0.17, 0.02, 0.03), (0, -0.128, 0.2), glow)
    head.box((0.02, 0.02, 0.12), (0, -0.13, 0.12), dark)
    head.box((0.03, 0.26, 0.04), (0, 0, 0.34), iron)
    parts["Head"] = head.build(parts["Torso"], (0, 0, 0.52))

    for side, tag in ((-1, "R"), (1, "L")):
        upper = PartBuilder("UpperArm." + tag)
        upper.sphere(0.12, (0, 0, 0.0), plate, scale=(1.1, 1.1, 0.8), segments=8, rings=5)
        upper.box((0.12, 0.13, 0.3), (0, 0, -0.16), plate, top_scale=(1.05, 1.05))
        parts["UpperArm." + tag] = upper.build(parts["Torso"], (side * 0.26, 0, 0.42))
        fore = PartBuilder("Forearm." + tag)
        fore.box((0.11, 0.12, 0.22), (0, 0, -0.11), plate, top_scale=(1.08, 1.08))
        fore.box((0.1, 0.11, 0.1), (0, -0.005, -0.28), iron)
        parts["Forearm." + tag] = fore.build(parts["UpperArm." + tag], (0, 0, -0.31))
        thigh = PartBuilder("Thigh." + tag)
        thigh.box((0.16, 0.18, 0.42), (0, 0, -0.21), plate, top_scale=(1.08, 1.08))
        parts["Thigh." + tag] = thigh.build(parts["Pelvis"], (side * 0.1, 0, -0.08))
        shin = PartBuilder("Shin." + tag)
        shin.sphere(0.07, (0, -0.02, 0), plate, segments=6, rings=4)
        shin.box((0.14, 0.16, 0.36), (0, 0, -0.19), plate, top_scale=(1.08, 1.08))
        shin.box((0.14, 0.26, 0.07), (0, -0.05, -0.415), iron)
        parts["Shin." + tag] = shin.build(parts["Thigh." + tag], (0, 0, -0.42))


def turmschild():
    """Tower shield of the elite skeletons and the knight: grip at the origin, face along -Y. Slot "Gruft_Schild" becomes wood
    or knight plate in Unity."""
    g = gruft_materials()
    face = material("Gruft_Schild", "6E4A2E", 0.85)
    root = empty("Turmschild")
    shield = PartBuilder("Schild")
    shield.box((0.74, 0.07, 1.32), (0, -0.05, 0), face)
    shield.box((0.78, 0.05, 0.05), (0, -0.05, 0.66), g["iron"])
    shield.box((0.78, 0.05, 0.05), (0, -0.05, -0.66), g["iron"])
    shield.box((0.05, 0.05, 1.36), (0.38, -0.05, 0), g["iron"])
    shield.box((0.05, 0.05, 1.36), (-0.38, -0.05, 0), g["iron"])
    shield.sphere(0.1, (0, -0.1, 0.1), g["iron"], scale=(1.0, 0.6, 1.0), segments=8, rings=4)
    shield.build(root, (0, 0, 0))


def hausteile():
    """Building kit of the village (one FBX, every piece its own object with the origin at its attachment point; the face
    looks along -Y = away from the wall). Unity places the pieces on the generated houses and bridges (EichentalHouseKit) and
    swaps the slots "Haus_<Platz>" for the village materials: Holz, Rahmen, Glas, Laden, Tuer, Eisen, Stein, Verkohlt, Russ."""
    slot = lambda name, rough=0.85, metal=0.0: material("Haus_" + name, "B0B0B0", rough, metal)
    wood, frame, glass, shutter = slot("Holz"), slot("Rahmen"), slot("Glas", 0.3), slot("Laden")
    door, iron, stone, charred, soot = slot("Tuer"), slot("Eisen", 0.45, 0.8), slot("Stein", 0.9), slot("Verkohlt"), slot("Russ", 0.95)
    root = empty("Hausteile")

    def piece(name, *adds):
        p = PartBuilder(name)
        for add in adds:
            add(p)
        p.build(root, (0, 0, 0))

    def window_frame(p, mat):
        p.box((0.98, 0.1, 0.08), (0, -0.03, 0.44), mat)
        p.box((0.98, 0.1, 0.08), (0, -0.03, -0.44), mat)
        p.box((0.08, 0.1, 0.8), (0.45, -0.03, 0), mat)
        p.box((0.08, 0.1, 0.8), (-0.45, -0.03, 0), mat)

    piece("Fenster",
          lambda p: window_frame(p, frame),
          lambda p: p.box((0.84, 0.01, 0.74), (0, -0.006, 0), glass),
          lambda p: p.box((0.05, 0.06, 0.74), (0, -0.01, 0), frame),
          lambda p: p.box((0.84, 0.06, 0.05), (0, -0.01, 0.05), frame),
          lambda p: p.box((1.08, 0.16, 0.05), (0, -0.07, -0.5), wood),
          lambda p: p.box((0.42, 0.03, 0.8), (0.7, -0.06, 0), shutter),
          lambda p: p.box((0.42, 0.03, 0.8), (-0.7, -0.06, 0), shutter),
          lambda p: p.box((0.44, 0.035, 0.05), (0.7, -0.07, 0.22), frame),
          lambda p: p.box((0.44, 0.035, 0.05), (0.7, -0.07, -0.22), frame),
          lambda p: p.box((0.44, 0.035, 0.05), (-0.7, -0.07, 0.22), frame),
          lambda p: p.box((0.44, 0.035, 0.05), (-0.7, -0.07, -0.22), frame))
    piece("Fenster_Verbrannt",
          lambda p: window_frame(p, charred),
          lambda p: p.box((0.84, 0.01, 0.74), (0, -0.006, 0), soot),
          lambda p: p.box((1.1, 0.02, 0.5), (0, -0.005, 0.6), soot, top_scale=(0.6, 1.0)),
          lambda p: p.box((0.4, 0.03, 0.7), (0.62, -0.12, -0.12), charred, rotate=Matrix.Rotation(math.radians(28), 3, 'Y')))

    piece("Tuer",
          lambda p: p.box((0.12, 0.14, 2.3), (0.6, -0.04, 1.15), frame),
          lambda p: p.box((0.12, 0.14, 2.3), (-0.6, -0.04, 1.15), frame),
          lambda p: p.box((1.32, 0.16, 0.14), (0, -0.04, 2.27), frame),
          lambda p: p.box((1.08, 0.06, 2.18), (0, -0.01, 1.09), door),
          lambda p: [p.box((0.025, 0.065, 2.12), (x, -0.012, 1.09), frame) for x in (-0.27, 0.0, 0.27)],
          lambda p: p.box((0.8, 0.07, 0.06), (-0.1, -0.03, 1.75), iron),
          lambda p: p.box((0.8, 0.07, 0.06), (-0.1, -0.03, 0.45), iron),
          lambda p: p.sphere(0.05, (0.4, -0.07, 1.05), iron, segments=6, rings=4),
          lambda p: p.box((1.4, 0.45, 0.12), (0, -0.22, 0.03), stone))
    piece("Tuer_Verbrannt",
          lambda p: p.box((0.12, 0.14, 2.3), (0.6, -0.04, 1.15), charred),
          lambda p: p.box((0.12, 0.14, 2.3), (-0.6, -0.04, 1.15), charred),
          lambda p: p.box((1.32, 0.16, 0.14), (0, -0.04, 2.27), charred),
          lambda p: p.box((1.08, 0.01, 2.18), (0, -0.006, 1.09), soot),
          lambda p: p.box((0.5, 0.06, 1.3), (-0.26, -0.02, 0.65), charred, top_scale=(0.6, 1.0)),
          lambda p: p.box((1.4, 0.45, 0.12), (0, -0.22, 0.03), stone))

    piece("Schornstein",
          lambda p: p.box((0.7, 0.7, 2.0), (0, 0, 1.0), stone),
          lambda p: p.box((0.86, 0.86, 0.12), (0, 0, 2.02), stone),
          lambda p: p.box((0.46, 0.46, 0.06), (0, 0, 2.1), soot),
          lambda p: [p.box((0.16, 0.08, 0.1), (x, -0.36, z), stone) for x, z in ((0.15, 0.6), (-0.2, 1.1), (0.1, 1.5))])
    piece("Fass",
          lambda p: p.cylinder(0.3, 0.86, (0, 0, 0.43), wood, segments=10),
          lambda p: p.cylinder(0.315, 0.05, (0, 0, 0.18), iron, segments=10),
          lambda p: p.cylinder(0.315, 0.05, (0, 0, 0.68), iron, segments=10),
          lambda p: p.cylinder(0.26, 0.02, (0, 0, 0.865), frame, segments=10))
    piece("Kiste",
          lambda p: p.box((0.7, 0.7, 0.66), (0, 0, 0.33), wood),
          lambda p: [p.box((0.74, 0.06, 0.06), (0, y, z), frame) for y in (-0.34, 0.34) for z in (0.03, 0.63)],
          lambda p: [p.box((0.06, 0.74, 0.06), (x, 0, z), frame) for x in (-0.34, 0.34) for z in (0.03, 0.63)])
    piece("Holzstapel",
          lambda p: [p.cylinder(0.1, 1.4, (-0.22 + 0.21 * i + 0.1 * (r % 2), 0, 0.1 + 0.18 * r), wood, segments=7, axis='X')
                     for r in range(3) for i in range(3 - r)])

    piece("Bruecke_Brett", lambda p: p.box((1.0, 0.25, 0.06), (0, 0, -0.03), wood))
    piece("Bruecke_Pfosten",
          lambda p: p.box((0.16, 0.16, 1.15), (0, 0, 0.575), frame),
          lambda p: p.box((0.2, 0.2, 0.06), (0, 0, 1.17), frame, top_scale=(0.6, 0.6)))
    piece("Bruecke_Gelaender",
          lambda p: p.box((0.1, 1.0, 0.1), (0, 0, 1.0), wood),
          lambda p: p.box((0.07, 1.0, 0.07), (0, 0, 0.55), wood))
    piece("Bruecke_Bruestung",
          lambda p: p.box((0.4, 1.0, 0.6), (0, 0, 0.3), stone),
          lambda p: p.box((0.5, 1.0, 0.12), (0, 0, 0.66), stone, top_scale=(0.9, 1.0)),
          lambda p: p.box((0.41, 0.02, 0.6), (0, 0.49, 0.3), soot))


MODELS = {
    "krieger": ("Characters/Krieger.fbx", krieger),
    "dorfbewohner": ("Characters/Dorfbewohner.fbx", dorfbewohner),
    "skelett": ("Characters/Skelett.fbx", skelett),
    "ritter": ("Characters/Ritter.fbx", ritter),
    "turmschild": ("Characters/Turmschild.fbx", turmschild),
    "wolf": ("Characters/Wolf.fbx", wolf),
    "aetherwolf": ("Characters/AetherWolf.fbx", aetherwolf),
    "schwert": ("Characters/Schwert.fbx", schwert),
    "holzschild": ("Characters/Holzschild.fbx", holzschild),
    "hausteile": ("Buildings/Hausteile.fbx", hausteile),
}


def render_preview(path, height):
    """Self-check image (Workbench, material colours): front-left view of the model. Not for the client."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 700
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Vorschau")
    world.color = (0.55, 0.6, 0.65)
    scene.world = world
    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(1.2, height * 1.25)
    cam = bpy.data.objects.new("Kamera", cam_data)
    scene.collection.objects.link(cam)
    target = Vector((0, 0, height * 0.5))
    cam.location = target + Vector((2.2, 4.0, 0.9))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("Vorschau:", path)


PREVIEW_HEIGHT = {"schwert": 1.0, "holzschild": 1.0, "wolf": 1.1, "aetherwolf": 1.1, "turmschild": 1.5, "hausteile": 2.5}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--preview", default="", help="folder for self-check images (no export)")
    args = parser.parse_args(argv)
    names = [n.strip() for n in args.only.split(",") if n.strip()] or list(MODELS)
    for name in names:
        file_name, build = MODELS[name]
        reset_scene()
        build()
        if args.preview:
            render_preview(os.path.join(args.preview, name + ".png"), PREVIEW_HEIGHT.get(name, 1.9))
        else:
            export_fbx(os.path.join(args.out, file_name))


if __name__ == "__main__":
    main()
