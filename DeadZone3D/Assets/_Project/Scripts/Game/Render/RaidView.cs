using System.Collections.Generic;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Shows the dynamic parts of a raid: player, zombies, loot on the floor, grenades, tracers, hazards and markers.</summary>
    public sealed class RaidView
    {
        private sealed class ZView { public CharacterView view; public Vector3 prev, cur; public float visible, losTimer; public bool los; }

        private readonly Raid _raid;
        private readonly WorldView _world;
        private readonly FxSystem _fx;
        private readonly Transform _root;
        public readonly CharacterView player;
        private Vector3 _playerPrev, _playerCur;
        private readonly Dictionary<Zombie, ZView> _zombies = new Dictionary<Zombie, ZView>();
        private readonly Dictionary<FloorLoot, Transform> _loot = new Dictionary<FloorLoot, Transform>();
        private readonly Dictionary<Grenade, Transform> _grenades = new Dictionary<Grenade, Transform>();
        private readonly List<Transform> _hazardDiscs = new List<Transform>();
        private readonly List<(ExtractionPoint p, Renderer ring, Renderer beam)> _extractions = new List<(ExtractionPoint, Renderer, Renderer)>();
        private readonly List<(Poi poi, GameObject beam)> _pois = new List<(Poi, GameObject)>();
        private readonly Transform _interactRing;
        private readonly HashSet<object> _alive = new HashSet<object>();
        private readonly Mesh _cube, _disc, _sphere;
        private readonly Material _ringActive, _ringLocked, _ringRun, _beamActive, _beamLocked, _beamRun, _poiMat, _interactMat, _fireDisc, _toxicDisc;

        public Vector3 PlayerPos => _playerCur;
        /// <summary>Interpolated player position as drawn this frame (camera and flashlight follow this).</summary>
        public Vector3 PlayerRenderPos { get; private set; }
        private const float BeamHeight = 10f;
        /// <summary>Zombies farther than this (sim pixels) are not drawn. First person sees much farther than the top-down camera.</summary>
        public double losRange = 760;
        /// <summary>False in first person: the camera sits inside the player's head.</summary>
        public bool showPlayerBody = true;
        /// <summary>
        /// First person: walls and roofs hide zombies by themselves, so no line-of-sight test (which would also hide
        /// zombies behind low cover the eye can look over, like cars and barricades).
        /// </summary>
        public bool geometryOcclusion;

        /// <summary>Weapon class the player holds (model selection for the body and the first-person view model).</summary>
        public static string HeldClass(Player p)
        {
            if (p.activeSlot <= 2) return Items.Def(p.WeaponInst)?.weapon?.@class;
            return p.activeSlot == 3 ? "grenade" : "med";
        }

        public RaidView(Raid raid, WorldView world, FxSystem fx, Transform parent)
        {
            _raid = raid; _world = world; _fx = fx;
            _root = new GameObject("RaidView").transform;
            _root.SetParent(parent, false);
            var mb = new MeshBuilder(); mb.BoxCenter(null, Vector3.zero, Vector3.one); _cube = mb.Build("rvCube");
            mb = new MeshBuilder(); mb.Cylinder(null, Vector3.zero, 0.5f, 1f, 24); _disc = mb.Build("rvDisc");
            mb = new MeshBuilder(); mb.Sphere(null, Vector3.zero, Vector3.one * 0.5f, 8, 6); _sphere = mb.Build("rvSphere");
            _ringActive = Mats.Emissive(new Color(0.2f, 1f, 0.45f), new Color(0.2f, 1f, 0.45f), 2.5f);
            _ringLocked = Mats.Emissive(new Color(1f, 0.55f, 0.15f), new Color(1f, 0.45f, 0.1f), 1.2f);
            _ringRun = Mats.Emissive(new Color(0.6f, 1f, 0.7f), new Color(0.5f, 1f, 0.6f), 5f);
            _beamActive = Mats.Emissive(new Color(0.2f, 1f, 0.45f), new Color(0.1f, 0.9f, 0.35f), 1.6f);
            _beamLocked = Mats.Emissive(new Color(1f, 0.5f, 0.1f), new Color(0.9f, 0.4f, 0.05f), 0.8f);
            _beamRun = Mats.Emissive(new Color(0.7f, 1f, 0.8f), new Color(0.6f, 1f, 0.7f), 3.5f);
            _poiMat = Mats.Emissive(new Color(1f, 0.85f, 0.2f), new Color(1f, 0.8f, 0.15f), 1.8f);
            _interactMat = Mats.Emissive(new Color(1f, 1f, 1f), new Color(0.9f, 0.95f, 1f), 1.5f);
            _fireDisc = Mats.Emissive(new Color(0.6f, 0.2f, 0.05f), new Color(1f, 0.35f, 0.05f), 1.2f);
            _toxicDisc = Mats.Emissive(new Color(0.2f, 0.45f, 0.1f), new Color(0.3f, 0.9f, 0.15f), 0.9f);

            player = new CharacterView(_root, "Player", new Color(0.78f, 0.62f, 0.5f), new Color(0.3f, 0.34f, 0.24f), new Color(0.22f, 0.24f, 0.2f), false, new Color(0.1f, 0.1f, 0.1f));
            _playerPrev = _playerCur = Coords.ToWorld(raid.player.x, raid.player.y);

            foreach (var p in raid.extraction.points)
            {
                var center = Coords.ToWorld(p.x, p.y);
                var ring = Obj("ExtractRing", _disc, _ringActive, center + Vector3.up * 0.02f, new Vector3((float)p.radius * Coords.S * 2, 0.03f, (float)p.radius * Coords.S * 2));
                var inner = Obj("ExtractInner", _disc, Mats.Lit(new Color(0.06f, 0.08f, 0.07f), 0.2f), center + Vector3.up * 0.025f, new Vector3((float)p.radius * Coords.S * 2 - 0.5f, 0.03f, (float)p.radius * Coords.S * 2 - 0.5f));
                inner.transform.SetParent(ring.transform, true);
                var beam = Obj("ExtractBeam", _disc, _beamActive, center, new Vector3(0.35f, BeamHeight, 0.35f));
                beam.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
                _extractions.Add((p, ring.GetComponent<Renderer>(), beam.GetComponent<Renderer>()));
            }
            foreach (var poi in raid.world.pois)
            {
                var beam = Obj("PoiBeam", _disc, _poiMat, Coords.ToWorld(poi.x, poi.y), new Vector3(0.25f, 10f, 0.25f));
                beam.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
                beam.SetActive(false);
                _pois.Add((poi, beam));
            }
            _interactRing = Obj("InteractRing", _disc, _interactMat, Vector3.zero, new Vector3(1.4f, 0.02f, 1.4f)).transform;
            _interactRing.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
        }

        private GameObject Obj(string name, Mesh mesh, Material mat, Vector3 pos, Vector3 scale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            return go;
        }

        public void Destroy()
        {
            Object.Destroy(_root.gameObject);
            Object.Destroy(_cube); Object.Destroy(_disc); Object.Destroy(_sphere);
        }

        /// <summary>Records positions before a simulation step (for smooth interpolation between steps).</summary>
        public void BeginStep()
        {
            _playerPrev = Coords.ToWorld(_raid.player.x, _raid.player.y);
            foreach (var kv in _zombies) kv.Value.prev = Coords.ToWorld(kv.Key.x, kv.Key.y);
        }

        private static Color ZombieSkin(ZombieDef t) => Mats.Shade(Mats.Hex(t.color, new Color(0.45f, 0.55f, 0.4f)), 1.15f);

        private static Color Eyes(string id)
        {
            switch (id)
            {
                case "runner": return new Color(1f, 0.85f, 0.1f);
                case "toxic": return new Color(0.4f, 1f, 0.2f);
                case "stalker": return new Color(0.85f, 0.95f, 1f);
                case "screamer": return new Color(1f, 0.3f, 0.9f);
                default: return new Color(1f, 0.15f, 0.08f);
            }
        }

        private ZView CreateZombie(Zombie z)
        {
            var skin = ZombieSkin(z.type);
            var cloth = Mats.Shade(Color.Lerp(skin, new Color(0.25f, 0.22f, 0.2f), 0.7f), 0.9f);
            var pants = Mats.Shade(Color.Lerp(skin, new Color(0.18f, 0.18f, 0.22f), 0.8f), 0.8f);
            if (z.id == "armored") cloth = new Color(0.22f, 0.24f, 0.27f);
            var v = new CharacterView(_root, "Zombie_" + z.id, skin, cloth, pants, true, Eyes(z.id));
            v.scale = (float)(z.type.size > 0 ? z.type.size : 1.0) * (z.id == "brute" ? 1.05f : 1f);
            v.heightScale = Mathf.Min(v.scale, 1.4f);
            var pos = Coords.ToWorld(z.x, z.y);
            return new ZView { view = v, prev = pos, cur = pos, visible = 0 };
        }

        /// <param name="alpha">0..1 between the previous and the current simulation step.</param>
        public void Update(float dt, float alpha, Interactable interact)
        {
            var p = _raid.player;
            _playerCur = Coords.ToWorld(p.x, p.y);
            var ppos = Vector3.Lerp(_playerPrev, _playerCur, alpha);
            PlayerRenderPos = ppos;
            player.SetVisible(showPlayerBody);
            player.SetWeapon(HeldClass(p));
            float moving = p.moving ? (p.sprinting ? 1.25f : 1f) : 0f;
            player.Pose(ppos, Coords.YawDeg(p.angle), moving, (float)p.legPhase, (float)p.meleeAnim, p.crouching, p.dead, 0f, dt);

            // zombies
            _alive.Clear();
            foreach (var z in _raid.zombies.zombies)
            {
                _alive.Add(z);
                if (!_zombies.TryGetValue(z, out var zv)) _zombies[z] = zv = CreateZombie(z);
                zv.cur = Coords.ToWorld(z.x, z.y);
                zv.losTimer -= dt;
                double d = M.Dist(z.x, z.y, p.x, p.y);
                if (zv.losTimer <= 0)
                {
                    zv.losTimer = 0.12f + Random.Range(0f, 0.06f);
                    zv.los = d < 60 || (d < losRange && (geometryOcclusion || DeadZone.Core.Physics.LineOfSight(_raid.world, p.x, p.y, z.x, z.y)));
                }
                bool show = zv.los && (z.type.lurk ? z.visibleAlpha > 0.5 || d < 90 : true);
                zv.visible = Mathf.MoveTowards(zv.visible, show ? 1f : 0f, dt * 5f);
                zv.view.SetVisible(zv.visible > 0.05f);
                if (zv.visible <= 0.05f) continue;
                var pos = Vector3.Lerp(zv.prev, zv.cur, alpha);
                float mv = (float)M.Hypot(z.moveX, z.moveY) > 0.1f && z.state != "idle" && z.state != "attack" ? 1f : 0f;
                zv.view.Pose(pos, Coords.YawDeg(z.angle), mv, (float)z.legPhase, (float)z.attackAnim, false, z.dead, z.dead ? 0f : (float)z.flash, dt);
            }
            List<Zombie> gone = null;
            foreach (var kv in _zombies) if (!_alive.Contains(kv.Key)) (gone ??= new List<Zombie>()).Add(kv.Key);
            if (gone != null) foreach (var z in gone) { _zombies[z].view.Destroy(); _zombies.Remove(z); }

            // floor loot
            _alive.Clear();
            float t = Time.time;
            foreach (var fl in _raid.world.floorLoot)
            {
                _alive.Add(fl);
                if (!_loot.TryGetValue(fl, out var tr))
                {
                    var col = UiColors.Category(Items.Def(fl.inst)?.cat);
                    tr = Obj("Loot", _cube, Mats.Emissive(col, col, 0.9f), Vector3.zero, new Vector3(0.38f, 0.22f, 0.3f)).transform;
                    tr.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
                    _loot[fl] = tr;
                }
                tr.localPosition = Coords.ToWorld(fl.x, fl.y, 0.2f + Mathf.Sin(t * 2.5f + fl.x.GetHashCode() % 7) * 0.06f);
                tr.localRotation = Quaternion.Euler(0, t * 60f + (float)(fl.y % 360), 0);
            }
            List<FloorLoot> lootGone = null;
            foreach (var kv in _loot) if (!_alive.Contains(kv.Key)) (lootGone ??= new List<FloorLoot>()).Add(kv.Key);
            if (lootGone != null) foreach (var k in lootGone) { Object.Destroy(_loot[k].gameObject); _loot.Remove(k); }

            // grenades
            _alive.Clear();
            foreach (var g in _raid.grenades)
            {
                _alive.Add(g);
                if (!_grenades.TryGetValue(g, out var tr))
                {
                    tr = Obj("Grenade", _sphere, Mats.Lit(g.kind == "molotov" ? new Color(0.5f, 0.35f, 0.15f) : new Color(0.25f, 0.3f, 0.2f), 0.4f), Vector3.zero, Vector3.one * 0.22f).transform;
                    _grenades[g] = tr;
                }
                tr.localPosition = Coords.ToWorld(g.x, g.y, 0.12f + (float)g.z * Coords.S);
                if (g.kind == "molotov" && Random.value < 0.4f) _fx.Emit(tr.position + Vector3.up * 0.15f, Vector3.up * 0.8f, _fx.fire, 0.08f, 0.3f, false);
            }
            List<Grenade> gGone = null;
            foreach (var kv in _grenades) if (!_alive.Contains(kv.Key)) (gGone ??= new List<Grenade>()).Add(kv.Key);
            if (gGone != null) foreach (var k in gGone) { Object.Destroy(_grenades[k].gameObject); _grenades.Remove(k); }

            // tracers
            _alive.Clear();
            foreach (var pr in _raid.weapons.projectiles)
            {
                _alive.Add(pr);
                double tx = pr.x - pr.dirX * Mathf.Min((float)pr.trail, 40f), ty = pr.y - pr.dirY * Mathf.Min((float)pr.trail, 40f);
                _fx.Tracer(pr, Coords.ToWorld(tx, ty, 1.25f), Coords.ToWorld(pr.x, pr.y, 1.25f));
            }
            _fx.PruneTracers(_alive);

            // hazards
            int hi = 0;
            foreach (var h in _raid.hazards)
            {
                if (hi >= _hazardDiscs.Count) _hazardDiscs.Add(Obj("Hazard", _disc, _toxicDisc, Vector3.zero, Vector3.one).transform);
                var d = _hazardDiscs[hi++];
                d.gameObject.SetActive(true);
                d.GetComponent<Renderer>().sharedMaterial = h.kind == "fire" ? _fireDisc : _toxicDisc;
                float r = (float)h.r * Coords.S * 2f * (1f - Mathf.Clamp01((float)(h.timer / h.duration)) * 0.3f);
                d.localPosition = Coords.ToWorld(h.x, h.y, 0.02f);
                d.localScale = new Vector3(r, 0.02f, r);
            }
            for (; hi < _hazardDiscs.Count; hi++) _hazardDiscs[hi].gameObject.SetActive(false);

            // extraction markers
            float pulse = 0.85f + Mathf.Sin(t * 4f) * 0.15f;
            foreach (var (pt, ring, beam) in _extractions)
            {
                bool done = pt.state == "done";
                ring.gameObject.SetActive(!done);
                beam.gameObject.SetActive(!done);
                if (done) continue;
                var mat = pt.state == "extracting" ? _ringRun : pt.active ? _ringActive : _ringLocked;
                if (ring.sharedMaterial != mat) ring.sharedMaterial = mat;
                var bm = pt.state == "extracting" ? _beamRun : pt.active ? _beamActive : _beamLocked;
                if (beam.sharedMaterial != bm) beam.sharedMaterial = bm;
                beam.transform.localScale = new Vector3(0.35f * pulse, BeamHeight, 0.35f * pulse);
            }
            foreach (var (poi, beam) in _pois)
            {
                bool relevant = !poi.used && (poi.type == "generator" ? !_raid.generatorOn && NeedsGenerator() : PoiRelevant(poi));
                if (beam.activeSelf != relevant) beam.SetActive(relevant);
            }

            // interact highlight
            if (interact != null && interact.kind != "extraction")
            {
                _interactRing.gameObject.SetActive(true);
                _interactRing.localPosition = Coords.ToWorld(interact.x, interact.y, 0.03f);
                float s = 1.2f + Mathf.Sin(t * 6f) * 0.12f;
                _interactRing.localScale = new Vector3(s, 0.02f, s);
            }
            else _interactRing.gameObject.SetActive(false);
        }

        private bool NeedsGenerator()
        {
            foreach (var e in _raid.extraction.points) if (e.kind == "power" && e.state != "done") return true;
            foreach (var st in _raid.missionStates) foreach (var o in st.All) if (!o.done && o.def.type == "generator") return true;
            return false;
        }

        private bool PoiRelevant(Poi poi)
        {
            foreach (var st in _raid.missionStates) foreach (var o in st.All) if (!o.done && o.def.type == "investigate" && o.def.target == poi.type) return true;
            return poi.type == "boss_arena" && _raid.zombies.boss != null && !_raid.zombies.boss.dead;
        }
    }
}
