using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Items;
using Aetherfall.Player;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Gameplay part of the Eichental from the layout: location zones (<see cref="AreaTrigger"/> with the location ids of GDD 02
    /// 11), enemy groups (wolves and Aether wolves with <see cref="EnemySpawner"/> and <see cref="SpawnGroupMarker"/>; groups
    /// that a quest starts stay inactive), chests (<see cref="Aetherfall.Inventory.LootChest"/> via
    /// <see cref="TestGroundItemBuilder"/>), NPC placeholders (capsules with <see cref="NpcMarker"/>; the NPC step replaces them),
    /// quest objects (<see cref="QuestObjectMarker"/>) and the spawn point at the player start.
    /// </summary>
    public sealed class EichentalGameplayBuilder
    {
        private const float NpcHeight = 1.7f;

        private readonly RegionLayout _layout;
        private readonly LayoutHeightField _heights;
        private readonly EichentalMaterials _materials;
        private readonly TestGroundMaterials _testMaterials;
        private readonly Font _labelFont;
        private readonly TestGroundReport _report;
        private int _enemyNumber;

        /// <summary>Creates the builder.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="materials">Eichental materials.</param>
        /// <param name="testMaterials">Shared materials of player and enemies (test ground).</param>
        /// <param name="labelFont">Font of the signs (may be null).</param>
        /// <param name="report">Protocol.</param>
        public EichentalGameplayBuilder(RegionLayout layout, LayoutHeightField heights, EichentalMaterials materials, TestGroundMaterials testMaterials,
            Font labelFont, TestGroundReport report)
        {
            _layout = layout;
            _heights = heights;
            _materials = materials;
            _testMaterials = testMaterials;
            _labelFont = labelFont;
            _report = report;
        }

        private float H(double x, double z)
        {
            return (float)_heights.Height(x, z);
        }

        /// <summary>Location zones: one trigger per location, tall enough for the terrain inside it.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="triggerVolumeLayer">TriggerVolume layer or −1.</param>
        /// <param name="playerLayer">Player layer or −1.</param>
        public void BuildAreaTriggers(Transform parent, int triggerVolumeLayer, int playerLayer)
        {
            var names = new List<string>();
            foreach (LayoutLocation location in _layout.Locations)
            {
                bool circle = location.Shape == LocationShape.Circle;
                double halfX = circle ? location.Radius : location.Width * 0.5;
                double halfZ = circle ? location.Radius : location.Depth * 0.5;
                SampleRange(location, halfX, halfZ, out float low, out float high);
                float bottom = low - 3f;
                float top = high + 8f;

                var zone = new GameObject("Ort " + location.Name + " (" + location.Id + ")");
                zone.transform.SetParent(parent, false);
                zone.transform.SetPositionAndRotation(new Vector3((float)location.Center.X, (bottom + top) * 0.5f, (float)location.Center.Z),
                    Quaternion.Euler(0f, (float)location.Yaw, 0f));
                zone.layer = triggerVolumeLayer >= 0 ? triggerVolumeLayer : 0;
                if (circle)
                {
                    CapsuleCollider capsule = zone.AddComponent<CapsuleCollider>();
                    capsule.isTrigger = true;
                    capsule.direction = 1;
                    capsule.radius = (float)location.Radius;
                    // The straight part of the capsule covers the terrain from the lowest to the highest point plus a margin.
                    capsule.height = top - bottom + 2f * (float)location.Radius;
                }
                else
                {
                    BoxCollider box = zone.AddComponent<BoxCollider>();
                    box.isTrigger = true;
                    box.size = new Vector3((float)location.Width, top - bottom, (float)location.Depth);
                }

                // A kinematic body makes sure the CharacterController of the player raises the trigger messages.
                Rigidbody body = zone.AddComponent<Rigidbody>();
                body.isKinematic = true;
                body.useGravity = false;

                AreaTrigger area = zone.AddComponent<AreaTrigger>();
                TestGroundFields.SetString(area, "areaId", location.Id, _report);
                TestGroundFields.SetInt(area, "playerLayers", playerLayer >= 0 ? 1 << playerLayer : 1 << TestGroundPaths.PlayerLayerIndex, _report);
                names.Add(location.Id);
            }

            _report.Info("Orts-Zonen (AreaTrigger, Layer " + (triggerVolumeLayer >= 0 ? triggerVolumeLayer.ToString() : "Default") + "): " +
                         string.Join(", ", names) + ".");
        }

        private void SampleRange(LayoutLocation location, double halfX, double halfZ, out float low, out float high)
        {
            low = float.MaxValue;
            high = float.MinValue;
            const int steps = 12;
            for (int i = 0; i <= steps; i++)
            {
                for (int j = 0; j <= steps; j++)
                {
                    double lx = -halfX + 2.0 * halfX * i / steps;
                    double lz = -halfZ + 2.0 * halfZ * j / steps;
                    if (location.Shape == LocationShape.Circle && lx * lx + lz * lz > halfX * halfX * 1.0001)
                    {
                        continue;
                    }

                    LayoutPoint offset = LayoutGeometry.RotateLocal(lx, lz, location.Yaw);
                    float h = H(location.Center.X + offset.X, location.Center.Z + offset.Z);
                    low = Mathf.Min(low, h);
                    high = Mathf.Max(high, h);
                }
            }
        }

        /// <summary>Enemy groups from the spawners of the layout.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="combat">Combat assets (enemy types).</param>
        /// <param name="enemyLayer">Enemy layer or −1.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="sightBlockers">Layers that block the view of the enemies (Environment and Terrain).</param>
        /// <returns>The spawner of the first group that is always active (for the combat overlay), or null.</returns>
        public EnemySpawner BuildSpawners(Transform parent, TestGroundCombatAssets combat, int enemyLayer, int hurtboxLayer, int environmentLayer,
            int sightBlockers)
        {
            EnemySpawner first = null;
            int active = 0;
            int questGroups = 0;
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                bool standIn = spawner.StandInTypeId.Length > 0;
                string variant = standIn ? spawner.StandInVariant : spawner.Variant;
                bool aether = variant == "aether_verderbt";
                EnemyTypeDefinition definition = aether ? combat.AetherWolf : combat.Wolf;
                Material fur = aether ? _testMaterials.AetherWolf : _testMaterials.Wolf;

                float cx = (float)spawner.Center.X;
                float cz = (float)spawner.Center.Z;
                var root = new GameObject("Gegner " + spawner.Name + " (" + spawner.Id + ")");
                root.transform.SetParent(parent, false);
                root.transform.position = new Vector3(cx, H(cx, cz), cz);

                Transform[] patrol = null;
                if (spawner.Patrol.Count > 0)
                {
                    patrol = new Transform[spawner.Patrol.Count];
                    for (int k = 0; k < spawner.Patrol.Count; k++)
                    {
                        LayoutPoint p = spawner.Patrol[k];
                        var point = new GameObject("Patrouille " + (k + 1));
                        point.transform.SetParent(root.transform, false);
                        point.transform.position = new Vector3((float)p.X, H(p.X, p.Z), (float)p.Z);
                        patrol[k] = point.transform;
                    }
                }

                List<PlacedPoint> positions = LayoutPlacement.SpawnerPositions(spawner);
                var enemies = new Object[positions.Count];
                for (int i = 0; i < positions.Count; i++)
                {
                    PlacedPoint p = positions[i];
                    _enemyNumber++;
                    bool patrols = patrol != null && i == 0;
                    string name = (spawner.BossId.Length > 0 ? spawner.Name : (aether ? "Aether-Wolf" : "Grauwolf") + " " + (i + 1)) +
                                  (standIn ? " (Platzhalter)" : string.Empty);
                    Vector3 local = new Vector3((float)p.X, H(p.X, p.Z), (float)p.Z) - root.transform.position;
                    EnemyController enemy = TestGroundCombatBuilder.BuildWolf(root.transform, name, _enemyNumber.ToString(), definition, fur, _testMaterials,
                        local + new Vector3(0f, 0.05f, 0f), (float)p.Yaw, !patrols, patrols ? patrol : null, enemyLayer, hurtboxLayer, environmentLayer,
                        _report);
                    // Hills hide the player as well as walls do.
                    TestGroundFields.SetInt(enemy, "sightBlockers", sightBlockers, _report);
                    enemies[i] = enemy;
                }

                EnemySpawner group = root.AddComponent<EnemySpawner>();
                TestGroundFields.SetReferences(group, "enemies", enemies, _report);
                TestGroundFields.SetFloat(group, "respawnSeconds", (float)spawner.RespawnSeconds, _report);

                SpawnGroupMarker marker = root.AddComponent<SpawnGroupMarker>();
                TestGroundFields.SetString(marker, "spawnId", spawner.Id, _report);
                TestGroundFields.SetString(marker, "enemyTypeId", spawner.EnemyTypeId, _report);
                TestGroundFields.SetString(marker, "variantId", spawner.Variant, _report);
                TestGroundFields.SetString(marker, "bossId", spawner.BossId, _report);
                TestGroundFields.SetInt(marker, "activation", (int)spawner.Activation, _report);
                TestGroundFields.SetString(marker, "questId", spawner.QuestId, _report);
                TestGroundFields.SetBool(marker, "usesStandIn", standIn, _report);

                if (spawner.Activation == SpawnActivation.Quest)
                {
                    // The quest (GDD 02 11: "Gegner+(spawn...)") switches the group on; until the quests exist as data it stays off.
                    root.SetActive(false);
                    questGroups++;
                }
                else
                {
                    active += positions.Count;
                    if (first == null)
                    {
                        first = group;
                    }
                }
            }

            _report.Info("Gegner: " + active + " immer aktiv (Grauwölfe am Nordhang, Aether-Wolf am Riss), " + questGroups + " Quest-Gruppen " +
                         "(inaktiv, bis die Quests als Daten kommen; Risslinge vertreten durch Aether-Wölfe).");
            return first;
        }

        /// <summary>Chests of the layout (loot tables of the test ground: wooden, iron, hidden).</summary>
        /// <param name="parent">Parent at the origin.</param>
        /// <param name="items">Item assets (chest materials).</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        public void BuildChests(Transform parent, TestGroundItemAssets items, int interactableLayer, int environmentLayer)
        {
            foreach (LayoutChest chest in _layout.Chests)
            {
                string table;
                ChestTier tier;
                Material material;
                switch (chest.Tier)
                {
                    case LayoutChestTier.Iron:
                        table = TestGroundLootTableAssets.IronChestTableId;
                        tier = ChestTier.Iron;
                        material = items.IronMaterial;
                        break;
                    case LayoutChestTier.Hidden:
                        table = TestGroundLootTableAssets.HiddenChestTableId;
                        tier = ChestTier.Hidden;
                        material = items.HiddenMaterial;
                        break;
                    default:
                        table = TestGroundLootTableAssets.WoodenChestTableId;
                        tier = ChestTier.Wooden;
                        material = items.WoodMaterial;
                        break;
                }

                double x = chest.Position.X;
                double z = chest.Position.Z;
                TestGroundItemBuilder.BuildChest(parent, chest.Name, chest.Id, table, tier, new Vector3((float)x, H(x, z), (float)z), (float)chest.Yaw,
                    chest.AreaLevel, material, interactableLayer, environmentLayer, _labelFont, _report);
            }

            _report.Info("Truhen: " + _layout.Chests.Count + " (Schmiede, Kapelle, Mühle, Wolfsbau, versteckt auf dem Rabenfels), Gebietslevel aus dem Layout.");
        }

        /// <summary>NPC placeholders: capsules with nose and name sign, grouped by story phase.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildNpcMarkers(Transform parent)
        {
            var groups = new Dictionary<NpcMarkerPhase, Transform>();
            Material body = _materials.Get("npcMarker", 0.3f);
            foreach (LayoutNpcMarker npc in _layout.NpcMarkers)
            {
                if (!groups.TryGetValue(npc.Phase, out Transform group))
                {
                    var groupObject = new GameObject(PhaseName(npc.Phase));
                    groupObject.transform.SetParent(parent, false);
                    group = groupObject.transform;
                    groups[npc.Phase] = group;
                }

                double x = npc.Position.X;
                double z = npc.Position.Z;
                var root = new GameObject(npc.Name + " (" + npc.NpcId + ", " + PhaseName(npc.Phase) + ")");
                root.transform.SetParent(group, false);
                root.transform.SetPositionAndRotation(new Vector3((float)x, H(x, z), (float)z), Quaternion.Euler(0f, (float)npc.Yaw, 0f));

                GameObject capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                capsule.name = "Platzhalter";
                capsule.transform.SetParent(root.transform, false);
                capsule.transform.localPosition = new Vector3(0f, NpcHeight * 0.5f, 0f);
                capsule.transform.localScale = new Vector3(0.6f, NpcHeight * 0.5f, 0.6f);
                capsule.GetComponent<MeshRenderer>().sharedMaterial = body;

                GameObject nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
                nose.name = "Blickrichtung";
                nose.transform.SetParent(root.transform, false);
                nose.transform.localPosition = new Vector3(0f, 1.35f, 0.32f);
                nose.transform.localScale = new Vector3(0.16f, 0.12f, 0.25f);
                Object.DestroyImmediate(nose.GetComponent<Collider>());
                nose.GetComponent<MeshRenderer>().sharedMaterial = _testMaterials.Nose;

                NpcMarker marker = root.AddComponent<NpcMarker>();
                TestGroundFields.SetString(marker, "npcId", npc.NpcId, _report);
                TestGroundFields.SetString(marker, "displayName", npc.Name, _report);
                TestGroundFields.SetString(marker, "locationId", npc.LocationId, _report);
                TestGroundFields.SetInt(marker, "phase", (int)npc.Phase, _report);
                string phase = npc.Phase == NpcMarkerPhase.Prolog ? "\n(Prolog)" : npc.Phase == NpcMarkerPhase.AfterProlog ? "\n(nach dem Prolog)" : string.Empty;
                EichentalLabel.Create(root.transform, npc.Name + phase, new Vector3(0f, NpcHeight + 0.55f, 0f), 180f, _labelFont, 0.03f);
            }

            _report.Info("NPC-Platzhalter: " + _layout.NpcMarkers.Count + " Kapseln mit NpcMarker (NPC-ID aus GDD 02, Ort, Phase). Der NPC-Baustein " +
                         "ersetzt sie durch echte Figuren mit Dialogen.");
        }

        private static string PhaseName(NpcMarkerPhase phase)
        {
            switch (phase)
            {
                case NpcMarkerPhase.Prolog:
                    return "Prolog";
                case NpcMarkerPhase.AfterProlog:
                    return "Nach dem Prolog";
                default:
                    return "Immer";
            }
        }

        /// <summary>Quest objects (beam, door, clues, straw targets, corpse, Aether shard, pup) with <see cref="QuestObjectMarker"/>.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="environmentLayer">Environment layer (colliders of beam, door and targets).</param>
        public void BuildQuestObjects(Transform parent, int environmentLayer)
        {
            foreach (LayoutQuestObject q in _layout.QuestObjects)
            {
                double x = q.Position.X;
                double z = q.Position.Z;
                var root = new GameObject(q.Name + " (" + q.Id + ")");
                root.transform.SetParent(parent, false);
                root.transform.SetPositionAndRotation(new Vector3((float)x, H(x, z), (float)z), Quaternion.Euler(0f, (float)q.Yaw, 0f));
                root.layer = environmentLayer;
                switch (q.Kind)
                {
                    case QuestObjectKind.Beam:
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.5f, 0f), new Vector3(0.35f, 0.35f, 4f), Quaternion.Euler(-12f, 0f, 0f),
                            _materials.Get("burnedWood", 0.1f), true);
                        break;
                    case QuestObjectKind.Door:
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 1.1f, 0f), new Vector3(1.2f, 2.2f, 0.15f), Quaternion.identity,
                            _materials.Fixed("door", new Color(0.25f, 0.16f, 0.1f), 0.25f), true);
                        break;
                    case QuestObjectKind.StrawTarget:
                        Part(root, PrimitiveType.Cylinder, new Vector3(0f, 1.2f, -0.17f), new Vector3(1.2f, 0.17f, 1.2f), Quaternion.Euler(90f, 0f, 0f),
                            _materials.Get("thatch", 0.1f), true);
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.6f, -0.1f), new Vector3(0.1f, 1.2f, 0.1f), Quaternion.identity,
                            _materials.Get("woodDark", 0.25f), false);
                        break;
                    case QuestObjectKind.Corpse:
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.15f, 0f), new Vector3(0.5f, 0.3f, 1.7f), Quaternion.identity,
                            _materials.Fixed("clothDark", new Color(0.3f, 0.26f, 0.22f)), false);
                        Part(root, PrimitiveType.Cube, new Vector3(0.6f, 0.175f, 0.4f), new Vector3(0.5f, 0.35f, 0.4f), Quaternion.identity,
                            _materials.Get("cloth", 0.1f), false);
                        break;
                    case QuestObjectKind.AetherShard:
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.7f, 0f), new Vector3(0.35f, 1.6f, 0.35f), Quaternion.Euler(8f, 45f, 6f),
                            _materials.Glow("aether", 3f), false);
                        break;
                    case QuestObjectKind.Pup:
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.25f, 0f), new Vector3(0.3f, 0.3f, 0.55f), Quaternion.identity, _testMaterials.Wolf, false);
                        break;
                    default:
                        Material glow = q.Id.Contains("aether") ? _materials.Glow("aether", 3f) : _materials.Glow("questMarker", 3f);
                        Part(root, PrimitiveType.Sphere, new Vector3(0f, 0.3f, 0f), new Vector3(0.3f, 0.3f, 0.3f), Quaternion.identity, glow, false);
                        Part(root, PrimitiveType.Cube, new Vector3(0f, 0.015f, 0f), new Vector3(0.8f, 0.03f, 0.8f), Quaternion.identity,
                            _materials.Fixed("trace", new Color(0.3f, 0.22f, 0.18f)), false);
                        break;
                }

                QuestObjectMarker marker = root.AddComponent<QuestObjectMarker>();
                TestGroundFields.SetString(marker, "objectId", q.Id, _report);
                TestGroundFields.SetString(marker, "groupId", q.Group, _report);
                TestGroundFields.SetString(marker, "questId", q.QuestId, _report);
                TestGroundFields.SetString(marker, "locationId", q.LocationId, _report);
            }

            _report.Info("Quest-Objekte: " + _layout.QuestObjects.Count + " mit QuestObjectMarker (Balken über Tobold, Tür der Bäckerei, Spuren, " +
                         "Strohziele, Postreiter, Aether-Splitter, Welpe). Ihre Interaktionen kommen mit den Quest-Daten.");
        }

        /// <summary>Spawn point at the player start of the layout.</summary>
        /// <param name="player">Player (gets the same pose, so the scene view and a skipped spawn show the right place).</param>
        /// <param name="worldSpaceId">World space id of the scene.</param>
        /// <returns>The spawn point.</returns>
        public PlayerSpawnPoint BuildSpawnPoint(GameObject player, string worldSpaceId)
        {
            LayoutPlayerStart start = _layout.PlayerStart;
            double x = start.Position.X;
            double z = start.Position.Z;
            var position = new Vector3((float)x, H(x, z) + 0.05f, (float)z);
            Quaternion rotation = Quaternion.Euler(0f, (float)start.Yaw, 0f);
            var spawn = new GameObject("PlayerSpawnPoint");
            spawn.transform.SetPositionAndRotation(position, rotation);
            PlayerSpawnPoint spawnPoint = spawn.AddComponent<PlayerSpawnPoint>();
            TestGroundFields.SetReference(spawnPoint, "player", player.GetComponent<PlayerMotor>(), _report);
            TestGroundFields.SetString(spawnPoint, "worldSpaceId", worldSpaceId, _report);
            player.transform.SetPositionAndRotation(position, rotation);
            _report.Info("Startpunkt bei " + start.Position + ", Blick " + start.Yaw + "° (" + start.Note + ")");
            return spawnPoint;
        }

        private static void Part(GameObject root, PrimitiveType shape, Vector3 localPosition, Vector3 localScale, Quaternion localRotation, Material material,
            bool keepCollider)
        {
            GameObject part = GameObject.CreatePrimitive(shape);
            part.name = shape.ToString();
            part.transform.SetParent(root.transform, false);
            part.transform.localPosition = localPosition;
            part.transform.localRotation = localRotation;
            part.transform.localScale = localScale;
            part.layer = root.layer;
            if (!keepCollider && part.TryGetComponent(out Collider collider))
            {
                Object.DestroyImmediate(collider);
            }

            if (part.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }

            GameObjectUtility.SetStaticEditorFlags(part, StaticEditorFlags.BatchingStatic);
        }
    }
}
