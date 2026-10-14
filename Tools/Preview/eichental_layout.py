"""Pure-Python evaluation of the Eichental layout (Assets/_Project/Data/Regions/Eichental/eichental_layout.json).

This is the Python twin of the C# classes in Assets/_Project/Scripts/World/Layout/ (LayoutHeightField, LayoutGroundMap,
VegetationScatter, LayoutPlacement, BlobGeometry, RockGeometry, BridgeGeometry, Pcg32Random). Both read the same JSON and use the same formulas, so the Blender preview
shows what the Unity generator builds. No third-party modules: Blender's bundled Python has no numpy.

Coordinates: x = east, z = north (metres), origin = centre of the layout. Yaw in degrees, clockwise seen from above,
0 = north (Unity convention). Local building axes: +z = front (door, gable end), +x = right side.
"""
import json
import math

TWO_PI = 2.0 * math.pi


# ----------------------------------------------------------------------------------------------------------------------
# Basics
# ----------------------------------------------------------------------------------------------------------------------

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def smooth01(t):
    """Hermite smoothstep on [0, 1] (clamped)."""
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def hex_rgb(code):
    """'#RRGGBB' -> sRGB floats 0..1."""
    code = code.lstrip("#")
    return tuple(int(code[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def rotate_local(lx, lz, yaw_deg):
    """Local (x right, z front) -> world offset for a yaw in degrees (clockwise from north, Unity)."""
    a = math.radians(yaw_deg)
    c, s = math.cos(a), math.sin(a)
    return lx * c + lz * s, -lx * s + lz * c


def to_local(dx, dz, yaw_deg):
    """World offset -> local (inverse of rotate_local)."""
    a = math.radians(yaw_deg)
    c, s = math.cos(a), math.sin(a)
    return dx * c - dz * s, dx * s + dz * c


def segment_distance(px, pz, ax, az, bx, bz):
    """Distance from P to segment AB and the fraction along AB (0..1) of the closest point."""
    dx, dz = bx - ax, bz - az
    length2 = dx * dx + dz * dz
    if length2 <= 1e-12:
        return math.hypot(px - ax, pz - az), 0.0
    f = ((px - ax) * dx + (pz - az) * dz) / length2
    if f < 0.0:
        f = 0.0
    elif f > 1.0:
        f = 1.0
    cx, cz = ax + dx * f, az + dz * f
    return math.hypot(px - cx, pz - cz), f


def polyline_nearest(px, pz, points):
    """(distance, segment index, fraction) of the closest point on an open polyline; the first segment wins ties."""
    best = (float("inf"), 0, 0.0)
    for i in range(len(points) - 1):
        d, f = segment_distance(px, pz, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
        if d < best[0]:
            best = (d, i, f)
    return best


def point_in_polygon(px, pz, polygon):
    """Even-odd rule; points exactly on an edge may go either way."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, zi = polygon[i]
        xj, zj = polygon[j]
        if (zi > pz) != (zj > pz):
            x_cross = xi + (pz - zi) * (xj - xi) / (zj - zi)
            if px < x_cross:
                inside = not inside
        j = i
    return inside


def rect_excess(px, pz, center, sx, sz, yaw):
    """How far P lies outside a rotated rectangle (negative inside): max(|lx| - sx/2, |lz| - sz/2)."""
    lx, lz = to_local(px - center[0], pz - center[1], yaw)
    return max(abs(lx) - sx * 0.5, abs(lz) - sz * 0.5)


def building_corners(building, margin=0.0):
    w, _, d = building["size"]
    hw, hd = w * 0.5 + margin, d * 0.5 + margin
    cx, cz = building["position"]
    out = []
    for lx, lz in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)):
        ox, oz = rotate_local(lx, lz, building["yaw"])
        out.append((cx + ox, cz + oz))
    return out


# ----------------------------------------------------------------------------------------------------------------------
# PCG32 (same as Aetherfall.Utilities.Pcg32Random)
# ----------------------------------------------------------------------------------------------------------------------

class Pcg32:
    MULT = 6364136223846793005
    MASK = (1 << 64) - 1

    def __init__(self, seed, stream=0xda3e39cb94b95bdb):
        self.state = 0
        self.inc = ((stream << 1) | 1) & self.MASK
        self.next_uint()
        self.state = (self.state + seed) & self.MASK
        self.next_uint()

    def next_uint(self):
        old = self.state
        self.state = (old * self.MULT + self.inc) & self.MASK
        xorshifted = (((old >> 18) ^ old) >> 27) & 0xFFFFFFFF
        rot = old >> 59
        return ((xorshifted >> rot) | (xorshifted << ((-rot) & 31))) & 0xFFFFFFFF

    def next_float(self):
        return (self.next_uint() >> 8) * (1.0 / 16777216.0)


# ----------------------------------------------------------------------------------------------------------------------
# Height field (LayoutHeightField.cs)
# ----------------------------------------------------------------------------------------------------------------------

class HeightField:
    def __init__(self, layout):
        t = layout["terrain"]
        self.base = float(t["baseHeight"])
        self.size = float(t["size"])
        self.bounds_min = t["playableBounds"]["min"]
        self.bounds_max = t["playableBounds"]["max"]
        self.border = t.get("border")
        self.noise = t.get("noise", [])
        self.slopes, self.hills, self.flattens = [], [], []
        for f in t.get("features", []):
            kind = f["kind"]
            if kind == "slope":
                dx, dz = f["direction"]
                n = math.hypot(dx, dz)
                self.slopes.append((f, dx / n, dz / n))
            elif kind == "hill":
                self.hills.append(f)
            elif kind == "flatten":
                self.flattens.append(f)
        self.rift = layout.get("rift")
        # Flatten targets: explicit height or the height before any flattening at the centre.
        self.flatten_targets = []
        for f in self.flattens:
            if f.get("height") is not None:
                self.flatten_targets.append(float(f["height"]))
            else:
                self.flatten_targets.append(self.raw(f["center"][0], f["center"][1]))
        # Rivers: per-vertex pre-carve height, monotonic water level and bed.
        self.rivers = []
        for river in layout.get("rivers", []):
            pts = river["points"]
            raw = [self.before_rivers(p[0], p[1]) for p in pts]
            depth, water_depth = float(river["depth"]), float(river["waterDepth"])
            levels = []
            for i, r in enumerate(raw):
                level = r - depth + water_depth
                if i > 0 and levels[-1] < level:
                    level = levels[-1]
                levels.append(level)
            beds = [lv - water_depth for lv in levels]
            self.rivers.append({"def": river, "points": pts, "raw": raw, "levels": levels, "beds": beds})

    def raw(self, x, z):
        """Base + slopes + hills + noise + border (no flattening, crater or rivers)."""
        h = self.base
        for f, dx, dz in self.slopes:
            ox, oz = f["origin"]
            t = (x - ox) * dx + (z - oz) * dz
            along = smooth01((t - f["start"]) / (f["end"] - f["start"]))
            lateral = 1.0
            if "halfWidth" in f:
                s = abs((x - ox) * dz - (z - oz) * dx)
                fall = f.get("falloff", 0.0)
                if fall > 0.0:
                    lateral = 1.0 - smooth01((s - f["halfWidth"]) / fall)
                else:
                    lateral = 1.0 if s <= f["halfWidth"] else 0.0
            h += f["height"] * along * lateral
        for f in self.hills:
            d = math.hypot(x - f["center"][0], z - f["center"][1])
            if d < f["radius"]:
                h += f["height"] * (1.0 - smooth01(d / f["radius"]))
        for n in self.noise:
            a = math.radians(n["angle"])
            u = x * math.cos(a) + z * math.sin(a)
            v = -x * math.sin(a) + z * math.cos(a)
            lam = n["wavelength"]
            h += n["amplitude"] * math.sin(TWO_PI * u / lam + n["phase"]) * math.cos(TWO_PI * v / (1.37 * lam) + 1.3 * n["phase"])
        if self.border:
            inset = self.border.get("inset", 0.0)
            min_x, min_z = self.bounds_min[0] + inset, self.bounds_min[1] + inset
            max_x, max_z = self.bounds_max[0] - inset, self.bounds_max[1] - inset
            ex = max(min_x - x, 0.0, x - max_x)
            ez = max(min_z - z, 0.0, z - max_z)
            d_out = math.hypot(ex, ez)
            if d_out > 0.0:
                h += self.border["height"] * smooth01(d_out / self.border["width"])
        return h

    def before_rivers(self, x, z):
        h = self.raw(x, z)
        for f, target in zip(self.flattens, self.flatten_targets):
            d = math.hypot(x - f["center"][0], z - f["center"][1])
            outer, inner = f["outerRadius"], f["innerRadius"]
            if d >= outer:
                continue
            w = 1.0 - smooth01((d - inner) / (outer - inner))
            h += (target - h) * w
        if self.rift:
            r = self.rift
            d = math.hypot(x - r["center"][0], z - r["center"][1])
            if d < r["radius"]:
                h -= r["depth"] * (1.0 - smooth01(d / r["radius"]))
            ring = abs(d - r["radius"])
            if ring < r["rimWidth"]:
                h += r["rim"] * (1.0 - smooth01(ring / r["rimWidth"]))
        return h

    def height(self, x, z):
        h = self.before_rivers(x, z)
        for river in self.rivers:
            h = self.carve(river, x, z, h)
        return h

    def carve(self, river, x, z, h):
        r = river["def"]
        half = r["width"] * 0.5
        d, k, f = polyline_nearest(x, z, river["points"])
        bed = lerp(river["beds"][k], river["beds"][k + 1], f)
        centre_raw = lerp(river["raw"][k], river["raw"][k + 1], f)
        excess = max(0.0, centre_raw - (bed + r["depth"]))
        reach = half + r["bank"] + 1.2 * excess
        if d >= reach:
            return h
        s = 1.0 - smooth01((d - half) / (reach - half))
        return h + (min(h, bed) - h) * s

    def water_level(self, river_index, k, f):
        river = self.rivers[river_index]
        return lerp(river["levels"][k], river["levels"][k + 1], f)

    def slope_degrees(self, x, z, step=1.0):
        dx = (self.height(x + step, z) - self.height(x - step, z)) / (2.0 * step)
        dz = (self.height(x, z + step) - self.height(x, z - step)) / (2.0 * step)
        return math.degrees(math.atan(math.hypot(dx, dz)))


# ----------------------------------------------------------------------------------------------------------------------
# Ground weights (LayoutGroundMap.cs): grass, dirt, rock, ash
# ----------------------------------------------------------------------------------------------------------------------

class GroundMap:
    def __init__(self, layout):
        self.layout = layout
        self.zones = layout.get("groundZones", [])
        self.paths = layout.get("paths", [])
        self.fields = layout.get("fields", [])
        self.buildings = layout.get("buildings", [])
        self.rivers = layout.get("rivers", [])

    @staticmethod
    def zone_value(zone, x, z):
        d = math.hypot(x - zone["center"][0], z - zone["center"][1])
        fall = max(zone.get("falloff", 0.0), 1e-6)
        return zone.get("strength", 1.0) * (1.0 - smooth01((d - zone["radius"]) / fall))

    def weights(self, x, z, slope_deg):
        ash = dirt = rock = 0.0
        for zone in self.zones:
            v = self.zone_value(zone, x, z)
            if v <= 0.0:
                continue
            kind = zone["ground"]
            if kind == "ash":
                ash = max(ash, v)
            elif kind == "dirt":
                dirt = max(dirt, v)
            elif kind == "rock":
                rock = max(rock, v)
        for path in self.paths:
            half = path["width"] * 0.5
            d, _, _ = polyline_nearest(x, z, path["points"])
            if d < half + 1.0:
                dirt = max(dirt, 1.0 - smooth01((d - (half - 0.5)) / 1.5))
        for field in self.fields:
            e = rect_excess(x, z, field["center"], field["size"][0], field["size"][1], field["yaw"])
            if e < 1.0:
                dirt = max(dirt, 1.0 - smooth01((e + 0.5) / 1.5))
        for b in self.buildings:
            e = rect_excess(x, z, b["position"], b["size"][0], b["size"][2], b["yaw"])
            if e < 2.5:
                dirt = max(dirt, 1.0 - smooth01((e - 1.0) / 1.5))
        for river in self.rivers:
            half = river["width"] * 0.5
            d, _, _ = polyline_nearest(x, z, river["points"])
            reach = half + river["bank"] + 1.0
            if d < reach:
                dirt = max(dirt, 0.8 * (1.0 - smooth01((d - half) / (reach - half))))
        rock = max(rock, smooth01((slope_deg - 30.0) / 12.0))
        grass = (1.0 - ash) * (1.0 - dirt) * (1.0 - rock)
        ash_w = ash * (1.0 - dirt) * (1.0 - rock)
        dirt_w = dirt * (1.0 - rock)
        return grass, dirt_w, rock, ash_w


# ----------------------------------------------------------------------------------------------------------------------
# Vegetation scatter (VegetationScatter.cs)
# ----------------------------------------------------------------------------------------------------------------------

def scatter_vegetation(layout):
    """Returns a list of dicts {group, kind, x, z, scale, yaw} in the same order as the C# scatter."""
    veg = layout.get("vegetation", {})
    clearance = veg.get("clearance", {})
    c_paths = clearance.get("paths", 0.0)
    c_rivers = clearance.get("rivers", 0.0)
    c_buildings = clearance.get("buildings", 0.0)
    c_fields = clearance.get("fields", 0.0)
    c_rift = clearance.get("rift", 0.0)
    c_fences = clearance.get("fences", 0.0)
    half_size = layout["terrain"]["size"] * 0.5 - 1.0
    clearings = veg.get("clearings", [])
    rift = layout.get("rift")
    landmark_trees = veg.get("trees", [])
    rocks = layout.get("rocks", [])
    props = layout.get("props", [])
    chests = layout.get("chests", [])
    bridges = layout.get("bridges", [])

    def excluded(x, z):
        if abs(x) > half_size or abs(z) > half_size:
            return True
        for c in clearings:
            if math.hypot(x - c["center"][0], z - c["center"][1]) < c["radius"]:
                return True
        for p in layout.get("paths", []):
            if polyline_nearest(x, z, p["points"])[0] < p["width"] * 0.5 + c_paths:
                return True
        for r in layout.get("rivers", []):
            if polyline_nearest(x, z, r["points"])[0] < r["width"] * 0.5 + r["bank"] + c_rivers:
                return True
        for b in layout.get("buildings", []):
            if rect_excess(x, z, b["position"], b["size"][0], b["size"][2], b["yaw"]) < c_buildings:
                return True
        for f in layout.get("fields", []):
            if rect_excess(x, z, f["center"], f["size"][0], f["size"][1], f["yaw"]) < c_fields:
                return True
        if rift and math.hypot(x - rift["center"][0], z - rift["center"][1]) < rift["radius"] + rift["rimWidth"] + c_rift:
            return True
        for fence in layout.get("fences", []):
            pts = fence["points"]
            line = pts + [pts[0]] if fence.get("closed") else pts
            if polyline_nearest(x, z, line)[0] < c_fences:
                return True
            if fence.get("closed") and point_in_polygon(x, z, pts):
                return True
        for t in landmark_trees:
            if math.hypot(x - t["position"][0], z - t["position"][1]) < 4.0:
                return True
        for rk in rocks:
            if math.hypot(x - rk["position"][0], z - rk["position"][1]) < max(rk["size"][0], rk["size"][2]) * 0.5 + 2.0:
                return True
        for p in props:
            if math.hypot(x - p["position"][0], z - p["position"][1]) < 3.0:
                return True
        for c in chests:
            if math.hypot(x - c["position"][0], z - c["position"][1]) < 2.5:
                return True
        for b in bridges:
            if math.hypot(x - b["position"][0], z - b["position"][1]) < b["length"] * 0.5 + 2.0:
                return True
        return False

    out = []
    for group in veg.get("groups", []):
        rng = Pcg32(group["seed"])
        poly = group["polygon"]
        min_x = min(p[0] for p in poly)
        max_x = max(p[0] for p in poly)
        min_z = min(p[1] for p in poly)
        max_z = max(p[1] for p in poly)
        cell = group["spacing"]
        nx = int(math.ceil((max_x - min_x) / cell))
        nz = int(math.ceil((max_z - min_z) / cell))
        species = group["species"]
        total = sum(s["weight"] for s in species)
        s_min, s_max = group["scale"]
        jitter = group.get("jitter", 0.0)
        for iz in range(nz):
            for ix in range(nx):
                r = [rng.next_float() for _ in range(6)]
                if r[0] > group["density"]:
                    continue
                x = min_x + (ix + 0.5) * cell + (r[1] - 0.5) * jitter * cell
                z = min_z + (iz + 0.5) * cell + (r[2] - 0.5) * jitter * cell
                if not point_in_polygon(x, z, poly) or excluded(x, z):
                    continue
                target = r[3] * total
                acc = 0.0
                kind = species[-1]["kind"]
                for s in species:
                    acc += s["weight"]
                    if target < acc:
                        kind = s["kind"]
                        break
                out.append({"group": group["id"], "kind": kind, "x": x, "z": z,
                            "scale": s_min + (s_max - s_min) * r[4], "yaw": r[5] * 360.0})
    for t in landmark_trees:
        out.append({"group": t["id"], "kind": t["kind"], "x": t["position"][0], "z": t["position"][1],
                    "scale": t.get("scale", 1.0), "yaw": t.get("yaw", 0.0)})
    return out


# ----------------------------------------------------------------------------------------------------------------------
# Placement helpers (LayoutPlacement.cs)
# ----------------------------------------------------------------------------------------------------------------------

def spawner_positions(spawner):
    """Enemy positions of a spawner: on a ring of 0.6 x radius, first one at 0.5 rad; yaw looks outwards."""
    n = spawner["count"]
    cx, cz = spawner["center"]
    ring = 0.0 if n <= 1 else spawner["radius"] * 0.6
    out = []
    for i in range(n):
        a = TWO_PI * i / n + 0.5
        out.append((cx + ring * math.sin(a), cz + ring * math.cos(a), math.degrees(a)))
    return out


def rift_crystals(rift):
    """Crystal shards in the crater: (x, z, height, tilt_x, tilt_z, yaw)."""
    rng = Pcg32(rift["crystalSeed"])
    out = []
    for _ in range(rift["crystals"]):
        a = rng.next_float() * TWO_PI
        d = rift["radius"] * (0.25 + 0.75 * rng.next_float())
        h = 0.8 + 2.2 * rng.next_float()
        tilt_x = (rng.next_float() - 0.5) * 50.0
        tilt_z = (rng.next_float() - 0.5) * 50.0
        yaw = rng.next_float() * 360.0
        out.append((rift["center"][0] + d * math.sin(a), rift["center"][1] + d * math.cos(a), h, tilt_x, tilt_z, yaw))
    return out


# ----------------------------------------------------------------------------------------------------------------------
# Meshes in Unity axes (BlobGeometry.cs, RockGeometry.cs, BridgeGeometry.cs): x right, y up, z forward
# ----------------------------------------------------------------------------------------------------------------------

def _normalized(p):
    length = math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2])
    return (p[0] / length, p[1] / length, p[2] / length)


def icosphere(subdivisions):
    """Unit icosphere with the same vertex order as BlobGeometry.Icosphere: (points, flat list of triangle indices)."""
    t = (1.0 + math.sqrt(5.0)) * 0.5
    points = [_normalized(p) for p in [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                                       (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]]
    faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
             3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
    for _ in range(max(0, min(3, subdivisions))):
        cache = {}

        def midpoint(a, b):
            key = (a, b) if a < b else (b, a)
            if key not in cache:
                pa, pb = points[a], points[b]
                points.append(_normalized(((pa[0] + pb[0]) * 0.5, (pa[1] + pb[1]) * 0.5, (pa[2] + pb[2]) * 0.5)))
                cache[key] = len(points) - 1
            return cache[key]

        nxt = []
        for i in range(0, len(faces), 3):
            a, b, c = faces[i], faces[i + 1], faces[i + 2]
            ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            nxt += [a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca]
        faces = nxt
    return points, faces


def blob(center, radii, subdivisions, seed, roughness, min_y=-math.inf, max_abs_x=math.inf):
    """Lumpy ellipsoid like BlobGeometry.Build: (vertices, triangles) in Unity axes, triangles with Unity winding."""
    points, faces = icosphere(subdivisions)
    rng = Pcg32(seed)
    verts = []
    for n in points:
        bump = 1.0 + (rng.next_float() - 0.5) * roughness
        x = center[0] + n[0] * radii[0] * bump
        y = center[1] + n[1] * radii[1] * bump
        z = center[2] + n[2] * radii[2] * bump
        x = max(-max_abs_x, min(max_abs_x, x))
        y = max(min_y, y)
        verts.append((x, y, z))
    tris = []
    for i in range(0, len(faces), 3):
        a, b, c = faces[i], faces[i + 1], faces[i + 2]
        pa, pb, pc = points[a], points[b], points[c]
        out = (pa[0] + pb[0] + pc[0], pa[1] + pb[1] + pc[1], pa[2] + pb[2] + pc[2])
        u = (pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2])
        v = (pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2])
        cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        if cross[0] * out[0] + cross[1] * out[1] + cross[2] * out[2] < 0.0:
            b, c = c, b
        tris.append((a, b, c))
    return verts, tris


ROCK_RENDER_SUBDIVISIONS = 2
ROCK_COLLIDER_SUBDIVISIONS = 1
ROCK_SIDE_CLAMP = 0.45
ROCK_SINK = 0.15


def rock_landmark(variant, subdivisions=ROCK_RENDER_SUBDIVISIONS):
    """Landmark rock (RockGeometry.Landmark): flat underside at y = 0 (the pivot), sides cut at x = +-0.45."""
    return blob((0.0, 0.5, 0.0), (0.5, 0.5, 0.5), subdivisions, 900 + variant * 7, 0.35, 0.0, ROCK_SIDE_CLAMP)


def rock_base_height(ground, size_y, lift):
    """Pivot height of a landmark rock (RockGeometry.LandmarkBaseHeight)."""
    return ground - ROCK_SINK * size_y + lift


def rock_boulder(seed):
    """Scattered boulder (RockGeometry.Boulder): reaches below its pivot, no clamping."""
    return blob((0.0, 0.35, 0.0), (1.2, 0.8, 1.0), 1, seed, 0.5)


BRIDGE_DECK = 0.6
ARCH_RADIUS_SHARE = 0.6
ARCH_RING = 0.5
ARCH_SEGMENTS = 12


def stone_arch(width, length):
    """Arch ring under the deck of a stone bridge (BridgeGeometry.StoneArch): list of quads (4 corners each, Unity axes).

    Top of the ring = underside of the deck (y = -0.6), the opening below stays free for the water."""
    outer = ARCH_RADIUS_SHARE * length
    inner = outer - ARCH_RING
    cy = -BRIDGE_DECK - outer
    half = math.asin(min(1.0, length * 0.5 / outer))
    hx = width * 0.5

    def ring(r, a, x):
        return (x, cy + r * math.cos(a), r * math.sin(a))

    quads = []
    for i in range(ARCH_SEGMENTS):
        a0 = -half + 2.0 * half * i / ARCH_SEGMENTS
        a1 = -half + 2.0 * half * (i + 1) / ARCH_SEGMENTS
        quads.append([ring(outer, a0, -hx), ring(outer, a0, hx), ring(outer, a1, hx), ring(outer, a1, -hx)])
        quads.append([ring(inner, a0, -hx), ring(inner, a1, -hx), ring(inner, a1, hx), ring(inner, a0, hx)])
        quads.append([ring(outer, a0, -hx), ring(inner, a0, -hx), ring(inner, a1, -hx), ring(outer, a1, -hx)])
        quads.append([ring(outer, a0, hx), ring(outer, a1, hx), ring(inner, a1, hx), ring(inner, a0, hx)])
    for end in (-1, 1):
        a = end * half
        quads.append([ring(outer, a, -hx), ring(outer, a, hx), ring(inner, a, hx), ring(inner, a, -hx)])
    return quads
