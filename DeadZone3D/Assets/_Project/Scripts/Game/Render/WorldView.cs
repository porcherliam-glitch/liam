using System.Collections.Generic;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Builds the 3D level from the tile world: floor and wall chunks, roofs, doors, props, containers and lights.</summary>
    public sealed class WorldView
    {
        private const int Chunk = 16;
        private const float H = Coords.WallHeight;
        private const float Tl = Coords.Tile;

        public readonly GameObject root;
        public readonly World world;
        private readonly Dictionary<int, Material> _floorMats = new Dictionary<int, Material>();
        private Material _lineMat, _sidewalkMat, _gravelMat, _rubbleMat, _debrisMat, _toxicMat, _waterMat, _voidMat, _indoorMat, _fenceMat, _glassMat, _frameMat;
        private readonly Dictionary<string, Material> _wallMats = new Dictionary<string, Material>();
        private readonly List<(Building b, Renderer r)> _roofs = new List<(Building, Renderer)>();
        private readonly Dictionary<int, DoorView> _doors = new Dictionary<int, DoorView>();
        private readonly Dictionary<string, ContainerView> _containers = new Dictionary<string, ContainerView>();
        private readonly List<LightSlot> _lightDefs = new List<LightSlot>();
        private readonly List<Light> _lightPool = new List<Light>();
        private int _lastVersion = -1;
        private float _lightTimer;
        private GameObject _fixtures;
        private bool _firstPerson, _modeSet;
        public float darkness;
        public bool generatorOn;

        private sealed class LightSlot
        {
            public LightDef def; public Vector3 pos; public Color color; public float range; public Light light;
            /// <summary>Inside a building (flag or position): a ceiling lamp shining down.</summary>
            public bool indoor;
            /// <summary>0..1 fade-in after the slot got a light from the pool (no popping).</summary>
            public float fade;
        }
        private readonly List<LightSlot> _near = new List<LightSlot>();

        private sealed class DoorView
        {
            public int tx, ty;
            public Transform hinge;
            public Renderer leaf;
            public float angle, target;
            public bool locked;
        }

        public sealed class ContainerView { public Container c; public GameObject go; public Renderer[] renderers; public bool opened; }

        public WorldView(World world, Transform parent)
        {
            this.world = world;
            root = new GameObject("World_" + world.mapId);
            root.transform.SetParent(parent, false);
            BuildMaterials();
            BuildChunks();
            BuildRoofs();
            BuildDoors();
            BuildProps();
            BuildContainers();
            BuildLights();
            _lastVersion = world.version;
        }

        private readonly List<Mesh> _meshes = new List<Mesh>();

        private GameObject Track(GameObject go)
        {
            var mf = go.GetComponent<MeshFilter>();
            if (mf != null && mf.sharedMesh != null) _meshes.Add(mf.sharedMesh);
            return go;
        }

        public void Destroy()
        {
            Object.Destroy(root);
            foreach (var m in _meshes) if (m != null) Object.Destroy(m);
            _meshes.Clear();
        }

        // ------------------------------------------------------------------ materials
        private void BuildMaterials()
        {
            var pal = world.map?.palette ?? new MapPalette();
            Color ground = Mats.Shade(Mats.Hex(pal.ground, new Color(0.3f, 0.3f, 0.28f)), 1.35f);
            Color road = Mats.Shade(Mats.Hex(pal.road, new Color(0.18f, 0.18f, 0.2f)), 1.3f);
            Color grass = Mats.Shade(Mats.Hex(pal.grass, new Color(0.18f, 0.28f, 0.16f)), 1.35f);
            Color floor = Mats.Shade(Mats.Hex(pal.floor, new Color(0.3f, 0.28f, 0.26f)), 1.4f);
            _floorMats[T.GROUND] = Mats.Lit(ground, 0.05f);
            _floorMats[T.ROAD] = Mats.Lit(road, 0.25f);
            _floorMats[T.GRASS] = Mats.Lit(grass, 0.02f);
            _sidewalkMat = Mats.Lit(Color.Lerp(road, new Color(0.62f, 0.62f, 0.6f), 0.45f), 0.1f);
            _gravelMat = Mats.Lit(Color.Lerp(ground, new Color(0.45f, 0.42f, 0.37f), 0.55f), 0.03f);
            _rubbleMat = Mats.Lit(Mats.Shade(Color.Lerp(ground, new Color(0.35f, 0.28f, 0.22f), 0.5f), 0.85f), 0.02f);
            _debrisMat = Mats.Lit(new Color(0.42f, 0.4f, 0.37f), 0.05f);
            _indoorMat = Mats.Lit(floor, 0.3f);
            _lineMat = Mats.Lit(Mats.Hex(pal.roadLine, new Color(0.8f, 0.75f, 0.4f)), 0.2f);
            _toxicMat = Mats.Emissive(new Color(0.25f, 0.9f, 0.2f), new Color(0.3f, 1f, 0.15f), 1.6f);
            _waterMat = Mats.Lit(Mats.Shade(Mats.Hex(pal.water, new Color(0.08f, 0.16f, 0.22f)), 1.2f), 0.75f);
            _voidMat = Mats.Lit(new Color(0.02f, 0.02f, 0.025f), 0f);
            _fenceMat = Mats.Lit(new Color(0.45f, 0.47f, 0.5f), 0.5f, 0.6f);
            _glassMat = Mats.Lit(new Color(0.12f, 0.17f, 0.22f), 0.95f);
            _frameMat = Mats.Lit(new Color(0.25f, 0.22f, 0.2f), 0.2f);
        }

        private Material WallMat(string hex)
        {
            hex = hex ?? world.map?.palette?.wallA ?? "#6b6259";
            if (!_wallMats.TryGetValue(hex, out var m)) _wallMats[hex] = m = Mats.Lit(Mats.Shade(Mats.Hex(hex, new Color(0.42f, 0.38f, 0.35f)), 1.3f), 0.08f);
            return m;
        }

        private Material WallMatAt(int tx, int ty)
        {
            int bi = world.BuildingIndexAtTile(tx, ty);
            return WallMat(bi >= 0 ? world.buildings[bi].wallColor : null);
        }

        private int BaseUnder(int tx, int ty)
        {
            if (world.BuildingIndexAtTile(tx, ty) >= 0) return T.FLOOR;
            int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
            for (int k = 0; k < 4; k++)
            {
                int t = world.Tile(tx + dx[k], ty + dy[k]);
                if (t == T.ROAD || t == T.SIDEWALK || t == T.GRASS || t == T.GRAVEL || t == T.GROUND || t == T.RUBBLE) return t;
                if (t == T.ROAD_LINE) return T.ROAD;
            }
            return T.GROUND;
        }

        private Material FloorMat(int t, int tx, int ty)
        {
            switch (t)
            {
                case T.ROAD: case T.ROAD_LINE: return _floorMats[T.ROAD];
                case T.GRASS: return _floorMats[T.GRASS];
                case T.SIDEWALK: return _sidewalkMat;
                case T.GRAVEL: return _gravelMat;
                case T.RUBBLE: return _rubbleMat;
                case T.FLOOR: return _indoorMat;
                case T.TOXIC: return _toxicMat;
                case T.WATER: return _waterMat;
                case T.VOID: return _floorMats[T.GROUND];
                case T.GROUND: return _floorMats[T.GROUND];
            }
            return FloorMat(BaseUnder(tx, ty), tx, ty);
        }

        private static bool IsWallLike(int t) => t == T.WALL || t == T.WINDOW || T.IsDoor(t);

        // ------------------------------------------------------------------ chunks
        private void BuildChunks()
        {
            int cw = (world.w + Chunk - 1) / Chunk, ch = (world.h + Chunk - 1) / Chunk;
            for (int cy = 0; cy < ch; cy++)
                for (int cx = 0; cx < cw; cx++)
                {
                    var floor = new MeshBuilder();
                    var walls = new MeshBuilder();
                    var glass = new MeshBuilder();
                    for (int ty = cy * Chunk; ty < Mathf.Min(world.h, (cy + 1) * Chunk); ty++)
                        for (int tx = cx * Chunk; tx < Mathf.Min(world.w, (cx + 1) * Chunk); tx++)
                            BuildTile(tx, ty, floor, walls, glass);
                    if (!floor.Empty)
                    {
                        var go = Track(floor.ToObject("Floor_" + cx + "_" + cy, root.transform, false));
                        go.GetComponent<MeshRenderer>().receiveShadows = true;
                    }
                    if (!walls.Empty) Track(walls.ToObject("Walls_" + cx + "_" + cy, root.transform, true));
                    if (!glass.Empty) _glass.Add(Track(glass.ToObject("Glass_" + cx + "_" + cy, root.transform, true)));
                }
            // ground far beyond the map edge, so the first-person horizon fades into fog instead of ending in nothing
            var skirt = new MeshBuilder();
            float mw = world.w * Tl, mh = world.h * Tl;
            skirt.Floor(_floorMats[T.GROUND], -200f, -mh - 200f, mw + 200f, 200f, -0.08f); // below the water surface (-0.05)
            var sk = Track(skirt.ToObject("GroundSkirt", root.transform, false));
            sk.GetComponent<MeshRenderer>().receiveShadows = true;
        }

        private readonly List<GameObject> _glass = new List<GameObject>();

        private void BuildTile(int tx, int ty, MeshBuilder floor, MeshBuilder walls, MeshBuilder glass)
        {
            int t = world.Tile(tx, ty);
            float x0 = tx * Tl, x1 = x0 + Tl, z1 = -ty * Tl, z0 = z1 - Tl;
            var fm = FloorMat(t, tx, ty);
            float fy = t == T.TOXIC ? 0.004f : t == T.WATER ? -0.05f : 0f;
            floor.Floor(fm, x0, z0, x1, z1, fy);
            int v = world.tileVariant[ty * world.w + tx];
            if (t == T.ROAD_LINE)
            {
                bool vertical = world.Tile(tx, ty - 1) == T.ROAD_LINE || world.Tile(tx, ty + 1) == T.ROAD_LINE || !(world.Tile(tx - 1, ty) == T.ROAD_LINE || world.Tile(tx + 1, ty) == T.ROAD_LINE);
                float cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
                if (vertical) floor.Floor(_lineMat, cxm - 0.09f, z0, cxm + 0.09f, z1, 0.01f);
                else floor.Floor(_lineMat, x0, czm - 0.09f, x1, czm + 0.09f, 0.01f);
            }
            else if (t == T.RUBBLE)
            {
                for (int k = 0; k < 2 + v % 2; k++)
                {
                    float ox = x0 + 0.3f + ((v * 37 + k * 53 + tx * 7) % 14) / 10f, oz = z0 + 0.3f + ((v * 11 + k * 29 + ty * 13) % 14) / 10f;
                    float s = 0.18f + ((k + v) % 3) * 0.08f;
                    walls.BoxCenter(_debrisMat, new Vector3(ox, s * 0.5f, oz), new Vector3(s * 1.4f, s, s));
                }
            }
            else if (t == T.WATER)
            {
                // low basin rim
                if (world.Tile(tx, ty - 1) != T.WATER) walls.Box(_sidewalkMat, new Vector3(x0, -0.06f, z1 - 0.12f), new Vector3(x1, 0.25f, z1));
                if (world.Tile(tx, ty + 1) != T.WATER) walls.Box(_sidewalkMat, new Vector3(x0, -0.06f, z0), new Vector3(x1, 0.25f, z0 + 0.12f));
                if (world.Tile(tx - 1, ty) != T.WATER) walls.Box(_sidewalkMat, new Vector3(x0, -0.06f, z0), new Vector3(x0 + 0.12f, 0.25f, z1));
                if (world.Tile(tx + 1, ty) != T.WATER) walls.Box(_sidewalkMat, new Vector3(x1 - 0.12f, -0.06f, z0), new Vector3(x1, 0.25f, z1));
            }
            if (t == T.WALL)
            {
                // hide a side face only against another full wall; doors and windows are open, so their jambs need faces
                int faces = 4;
                if (world.Tile(tx + 1, ty) != T.WALL) faces |= 1;
                if (world.Tile(tx - 1, ty) != T.WALL) faces |= 2;
                if (world.Tile(tx, ty - 1) != T.WALL) faces |= 16;
                if (world.Tile(tx, ty + 1) != T.WALL) faces |= 32;
                walls.Box(WallMatAt(tx, ty), new Vector3(x0, 0, z0), new Vector3(x1, H, z1), faces);
            }
            else if (t == T.WINDOW)
            {
                var wm = WallMatAt(tx, ty);
                walls.Box(wm, new Vector3(x0, 0, z0), new Vector3(x1, 0.95f, z1));
                walls.Box(wm, new Vector3(x0, 2.05f, z0), new Vector3(x1, H, z1), 0b111111);
                bool horiz = IsWallLike(world.Tile(tx - 1, ty)) || IsWallLike(world.Tile(tx + 1, ty));
                float cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
                // the panes are hidden in first person: bullets and sight pass windows in the simulation (broken glass)
                if (horiz) glass.Box(_glassMat, new Vector3(x0, 0.95f, czm - 0.03f), new Vector3(x1, 2.05f, czm + 0.03f));
                else glass.Box(_glassMat, new Vector3(cxm - 0.03f, 0.95f, z0), new Vector3(cxm + 0.03f, 2.05f, z1));
            }
            else if (T.IsDoor(t))
            {
                walls.Box(WallMatAt(tx, ty), new Vector3(x0, 2.25f, z0), new Vector3(x1, H, z1), 0b111111);
            }
            else if (t == T.FENCE)
            {
                float cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
                walls.BoxCenter(_fenceMat, new Vector3(cxm, 0.95f, czm), new Vector3(0.12f, 1.9f, 0.12f));
                bool e = world.Tile(tx + 1, ty) == T.FENCE, w = world.Tile(tx - 1, ty) == T.FENCE;
                bool n = world.Tile(tx, ty - 1) == T.FENCE, s = world.Tile(tx, ty + 1) == T.FENCE;
                if (!e && !w && !n && !s) { e = true; w = true; }
                foreach (float h in new[] { 0.35f, 1.05f, 1.78f })
                {
                    if (e) walls.Box(_fenceMat, new Vector3(cxm, h - 0.03f, czm - 0.03f), new Vector3(x1, h + 0.03f, czm + 0.03f));
                    if (w) walls.Box(_fenceMat, new Vector3(x0, h - 0.03f, czm - 0.03f), new Vector3(cxm, h + 0.03f, czm + 0.03f));
                    if (n) walls.Box(_fenceMat, new Vector3(cxm - 0.03f, h - 0.03f, czm), new Vector3(cxm + 0.03f, h + 0.03f, z1));
                    if (s) walls.Box(_fenceMat, new Vector3(cxm - 0.03f, h - 0.03f, z0), new Vector3(cxm + 0.03f, h + 0.03f, czm));
                }
                for (int k = 1; k < 4; k++)
                {
                    float f = k / 4f;
                    if (e || w) walls.Box(_fenceMat, new Vector3(x0 + f * Tl - 0.02f, 0.05f, czm - 0.02f), new Vector3(x0 + f * Tl + 0.02f, 1.82f, czm + 0.02f), 0b110011);
                    if (n || s) walls.Box(_fenceMat, new Vector3(cxm - 0.02f, 0.05f, z0 + f * Tl - 0.02f), new Vector3(cxm + 0.02f, 1.82f, z0 + f * Tl + 0.02f), 0b110011);
                }
            }
        }

        // ------------------------------------------------------------------ roofs
        private void BuildRoofs()
        {
            foreach (var b in world.buildings)
            {
                var mb = new MeshBuilder();
                var roofMat = Mats.Lit(Mats.Shade(Mats.Hex(b.roofColor, new Color(0.3f, 0.25f, 0.22f)), 1.25f), 0.15f);
                var trim = Mats.Lit(Mats.Shade(Mats.Hex(b.roofColor, new Color(0.3f, 0.25f, 0.22f)), 0.8f), 0.1f);
                float x0 = b.tx * Tl, x1 = (b.tx + b.w) * Tl, z1 = -b.ty * Tl, z0 = -(b.ty + b.h) * Tl;
                mb.Box(roofMat, new Vector3(x0 - 0.1f, H, z0 - 0.1f), new Vector3(x1 + 0.1f, H + 0.25f, z1 + 0.1f));
                // parapet and a few roof details so buildings read well from above
                mb.Box(trim, new Vector3(x0 - 0.1f, H + 0.25f, z0 - 0.1f), new Vector3(x1 + 0.1f, H + 0.55f, z0 + 0.15f));
                mb.Box(trim, new Vector3(x0 - 0.1f, H + 0.25f, z1 - 0.15f), new Vector3(x1 + 0.1f, H + 0.55f, z1 + 0.1f));
                mb.Box(trim, new Vector3(x0 - 0.1f, H + 0.25f, z0 - 0.1f), new Vector3(x0 + 0.15f, H + 0.55f, z1 + 0.1f));
                mb.Box(trim, new Vector3(x1 - 0.15f, H + 0.25f, z0 - 0.1f), new Vector3(x1 + 0.1f, H + 0.55f, z1 + 0.1f));
                if (b.w * b.h > 40)
                {
                    var unit = Mats.Lit(new Color(0.55f, 0.56f, 0.58f), 0.4f, 0.3f);
                    float ux = x0 + (x1 - x0) * 0.3f, uz = z0 + (z1 - z0) * 0.6f;
                    mb.BoxCenter(unit, new Vector3(ux, H + 0.6f, uz), new Vector3(1.4f, 0.7f, 1.0f));
                }
                // ceiling seen from inside (first person); the roof box has no bottom face
                float ch = H - 0.002f;
                mb.Quad(CeilingMat(b), new Vector3(x0 - 0.1f, ch, z1 + 0.1f), new Vector3(x0 - 0.1f, ch, z0 - 0.1f), new Vector3(x1 + 0.1f, ch, z0 - 0.1f), new Vector3(x1 + 0.1f, ch, z1 + 0.1f), Vector3.down);
                var go = Track(mb.ToObject("Roof_" + b.id, root.transform, true));
                _roofs.Add((b, go.GetComponent<Renderer>()));
            }
        }

        private Material _ceilingMat;
        private Material CeilingMat(Building b)
        {
            if (_ceilingMat == null) _ceilingMat = Mats.Lit(new Color(0.5f, 0.48f, 0.45f), 0.05f);
            return _ceilingMat;
        }

        /// <summary>First person: every roof (and its ceiling) is drawn and indoor lamp fixtures appear under the ceilings.</summary>
        public void SetFirstPerson(bool on)
        {
            if (_modeSet && _firstPerson == on) return;
            _modeSet = true;
            _firstPerson = on;
            if (_fixtures != null) _fixtures.SetActive(on);
            foreach (var g in _glass) g.SetActive(!on);
            if (on) foreach (var (_, r) in _roofs) r.shadowCastingMode = ShadowCastingMode.On;
        }

        /// <summary>Hides roofs of the building the player is in (they keep casting shadows, so inside stays dim) and roofs right in front of the camera.</summary>
        public void UpdateRoofs(double px, double py)
        {
            if (_firstPerson) return;
            var inside = world.BuildingAt(px, py);
            foreach (var (b, r) in _roofs)
            {
                bool hide = b == inside;
                if (!hide)
                {
                    double bx0 = b.tx * World.TILE, bx1 = (b.tx + b.w) * World.TILE, by0 = b.ty * World.TILE;
                    hide = px > bx0 - 16 && px < bx1 + 16 && py < by0 && py > by0 - 70;
                }
                r.shadowCastingMode = hide ? ShadowCastingMode.ShadowsOnly : ShadowCastingMode.On;
            }
        }

        // ------------------------------------------------------------------ doors
        private void BuildDoors()
        {
            var wood = Mats.Lit(new Color(0.42f, 0.3f, 0.2f), 0.2f);
            var metal = Mats.Lit(new Color(0.55f, 0.15f, 0.12f), 0.4f, 0.5f);
            for (int ty = 0; ty < world.h; ty++)
                for (int tx = 0; tx < world.w; tx++)
                {
                    int t = world.Tile(tx, ty);
                    if (!T.IsDoor(t)) continue;
                    bool alongX = IsWallLike(world.Tile(tx - 1, ty)) || IsWallLike(world.Tile(tx + 1, ty));
                    var hinge = new GameObject("Door_" + tx + "_" + ty).transform;
                    hinge.SetParent(root.transform, false);
                    var c = Coords.TileCenter(tx, ty);
                    hinge.localPosition = alongX ? new Vector3(c.x - Tl / 2 + 0.05f, 0, c.z) : new Vector3(c.x, 0, c.z + Tl / 2 - 0.05f);
                    hinge.localRotation = Quaternion.Euler(0, alongX ? 0 : 90, 0);
                    var mb = new MeshBuilder();
                    var mat = t == T.DOOR_LOCKED ? metal : wood;
                    mb.Box(mat, new Vector3(0, 0, -0.06f), new Vector3(Tl - 0.1f, 2.2f, 0.06f));
                    mb.BoxCenter(Mats.Lit(new Color(0.75f, 0.7f, 0.5f), 0.6f, 0.8f), new Vector3(Tl - 0.35f, 1.05f, 0), new Vector3(0.1f, 0.06f, 0.18f));
                    var leaf = Track(mb.ToObject("Leaf", hinge, true));
                    var dv = new DoorView { tx = tx, ty = ty, hinge = hinge, leaf = leaf.GetComponent<Renderer>(), locked = t == T.DOOR_LOCKED };
                    dv.angle = dv.target = t == T.DOOR_OPEN ? 90 : 0;
                    hinge.GetChild(0).localRotation = Quaternion.Euler(0, -dv.angle, 0);
                    _doors[ty * world.w + tx] = dv;
                }
        }

        public void Update(float dt)
        {
            if (world.version != _lastVersion)
            {
                _lastVersion = world.version;
                foreach (var d in _doors.Values)
                {
                    int t = world.Tile(d.tx, d.ty);
                    d.target = t == T.DOOR_OPEN ? 90 : 0;
                    if (d.locked && t != T.DOOR_LOCKED)
                    {
                        d.locked = false;
                        d.leaf.sharedMaterials = new[] { Mats.Lit(new Color(0.42f, 0.3f, 0.2f), 0.2f), d.leaf.sharedMaterials[d.leaf.sharedMaterials.Length - 1] };
                    }
                }
            }
            foreach (var d in _doors.Values)
            {
                if (Mathf.Abs(d.angle - d.target) < 0.1f) continue;
                d.angle = Mathf.MoveTowards(d.angle, d.target, dt * 420);
                d.hinge.GetChild(0).localRotation = Quaternion.Euler(0, -d.angle, 0);
            }
            UpdateLights(dt);
        }

        // ------------------------------------------------------------------ props and containers
        private void BuildProps()
        {
            var parent = new GameObject("Props").transform;
            parent.SetParent(root.transform, false);
            foreach (var p in world.props) PropFactory.Build(p, world, parent);
        }

        private void BuildContainers()
        {
            var parent = new GameObject("Containers").transform;
            parent.SetParent(root.transform, false);
            foreach (var c in world.containers)
            {
                var go = PropFactory.BuildContainer(c, world, parent);
                _containers[c.uid] = new ContainerView { c = c, go = go, renderers = go.GetComponentsInChildren<Renderer>() };
            }
        }

        public ContainerView ContainerViewFor(Container c) => c != null && _containers.TryGetValue(c.uid, out var v) ? v : null;
        public IEnumerable<ContainerView> ContainerViews => _containers.Values;

        // ------------------------------------------------------------------ lights
        private void BuildLights()
        {
            foreach (var l in world.lights)
            {
                bool indoor = l.indoor || (!l.toxic && l.extraction == null && world.BuildingAt(l.x, l.y) != null);
                bool lamp = !indoor && !l.toxic && l.extraction == null;
                _lightDefs.Add(new LightSlot
                {
                    def = l,
                    indoor = indoor,
                    // ceiling lamps hang just under the ceiling and shine down; toxic glow comes from the ground
                    pos = Coords.ToWorld(l.x, l.y, indoor ? H - 0.12f : l.toxic ? 0.5f : lamp ? 4.2f : 2.5f),
                    color = Mats.Hex(l.color, Color.white),
                    range = Mathf.Max(5f, (float)l.radius * Coords.S * 1.5f),
                });
            }
            // lamp fixtures under the ceilings (only visible in first person; from above they would float in the air)
            var fix = new MeshBuilder();
            var fixMat = Mats.Emissive(new Color(1f, 0.92f, 0.75f), new Color(1f, 0.85f, 0.6f), 2.2f);
            foreach (var s in _lightDefs)
                if (s.indoor) fix.BoxCenter(fixMat, new Vector3(s.pos.x, H - 0.035f, s.pos.z), new Vector3(0.55f, 0.06f, 0.55f), 0b111011);
            if (!fix.Empty)
            {
                _fixtures = Track(fix.ToObject("LampFixtures", root.transform, false));
                _fixtures.SetActive(_firstPerson);
            }
            var parent = new GameObject("Lights").transform;
            parent.SetParent(root.transform, false);
            for (int i = 0; i < 28; i++)
            {
                var go = new GameObject("PointLight" + i);
                go.transform.SetParent(parent, false);
                var light = go.AddComponent<Light>();
                light.type = LightType.Point;
                light.shadows = LightShadows.None;
                light.enabled = false;
                _lightPool.Add(light);
            }
        }

        public Vector3 focus;

        private void UpdateLights(float dt)
        {
            _lightTimer -= dt;
            if (_lightTimer <= 0)
            {
                _lightTimer = 0.3f;
                var near = _near;
                near.Clear();
                foreach (var s in _lightDefs)
                {
                    bool lamp = !s.indoor && !s.def.toxic && s.def.extraction == null;
                    if (lamp && darkness < 0.3f) continue;
                    float d = (s.pos - focus).sqrMagnitude;
                    if (d < 75f * 75f) near.Add(s);
                }
                near.Sort((a, b) => (a.pos - focus).sqrMagnitude.CompareTo((b.pos - focus).sqrMagnitude));
                if (near.Count > _lightPool.Count) near.RemoveRange(_lightPool.Count, near.Count - _lightPool.Count);
                foreach (var s in _lightDefs) if (s.light != null && !near.Contains(s)) { s.light = null; s.fade = 0f; }
                // slots that keep their light keep their pool entry, so nothing flickers on a refresh
                var free = new List<Light>(_lightPool);
                foreach (var s in near) if (s.light != null) free.Remove(s.light);
                int fi = 0;
                foreach (var s in near)
                {
                    if (s.light != null) continue;
                    var light = free[fi++];
                    s.light = light;
                    s.fade = 0f;
                    light.transform.position = s.pos;
                    light.color = s.color;
                    light.range = s.range;
                    if (s.indoor)
                    {
                        light.type = LightType.Spot;
                        light.spotAngle = 150f;
                        light.innerSpotAngle = 100f;
                        light.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                    }
                    else light.type = LightType.Point;
                }
                for (; fi < free.Count; fi++) free[fi].enabled = false;
            }
            float time = Time.time;
            foreach (var s in _lightDefs)
            {
                if (s.light == null) continue;
                s.light.enabled = true;
                s.fade = Mathf.Min(1f, s.fade + dt * 2.5f);
                // URP lights fall off with 1/d², so these are higher than they look
                float baseI = s.indoor ? 6f : s.def.toxic ? 2.5f : s.def.extraction != null ? 8f : 10f;
                if (s.indoor) baseI *= Mathf.Lerp(0.6f, 1.2f, darkness);
                baseI *= s.fade;
                if (s.def.flicker && !(generatorOn && s.indoor))
                {
                    float n = Mathf.PerlinNoise(s.pos.x * 0.37f, time * 7f);
                    baseI *= n < 0.25f ? 0.15f : 0.75f + n * 0.4f;
                }
                s.light.intensity = baseI;
            }
        }
    }
}
