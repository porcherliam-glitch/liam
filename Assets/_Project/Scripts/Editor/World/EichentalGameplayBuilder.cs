using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Items;
using Aetherfall.Player;
using Aetherfall.World;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Gameplay part of the Eichental from the layout: location zones (<see cref="AreaTrigger"/> with the location ids of GDD 02
    /// 11), enemy groups (root with <see cref="SpawnGroupMarker"/>, child "Gruppe" with the wolves and the <see cref="EnemySpawner"/>;
    /// quest groups keep the child switched off until <see cref="SpawnEncounter"/>), chests
    /// (<see cref="Aetherfall.Inventory.LootChest"/> via <see cref="TestGroundItemBuilder"/>), NPC placeholders (capsules with
    /// <see cref="NpcMarker"/>; the NPC step replaces them), quest objects (<see cref="QuestObjectMarker"/>), trail nodes
    /// (<see cref="TrailNodeTrigger"/>) and the spawn point at the player start. Nothing here is marked static: quest objects
    /// move later, and the GPU Resident Drawer draws the rest (architecture 1.2).
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
                EnemyTypeDefinition definition = MiniSliceProfile.EnemyAtLevel(aether ? combat.AetherWolf : combat.Wolf, MiniSliceWorld.EnemyLevel(spawner.Id),
                    _report);
                Material fur = aether ? _testMaterials.AetherWolf : _testMaterials.Wolf;

                float cx = (float)spawner.Center.X;
                float cz = (float)spawner.Center.Z;
                var root = new GameObject("Gegner " + spawner.Name + " (" + spawner.Id + ")");
                root.transform.SetParent(parent, false);
                root.transform.position = new Vector3(cx, H(cx, cz), cz);

                // The root (marker) stays active and registers with the ISpawnGroupRegistry; quest groups switch the child on.
                var groupObject = new GameObject("Gruppe");
                groupObject.transform.SetParent(root.transform, false);

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
                    EnemyController enemy = TestGroundCombatBuilder.BuildWolf(groupObject.transform, name, _enemyNumber.ToString(), definition, fur, _testMaterials,
                        local + new Vector3(0f, 0.05f, 0f), (float)p.Yaw, !patrols, patrols ? patrol : null, enemyLayer, hurtboxLayer, environmentLayer,
                        _report);
                    // Hills hide the player as well as walls do.
                    TestGroundFields.SetInt(enemy, "sightBlockers", sightBlockers, _report);
                    if (spawner.BossId.Length > 0 && i == 0)
                    {
                        // Named enemy (Glutfang, prologue Rissbrut): quest objectives "Töte bestimmten Gegner" count this id.
                        TestGroundFields.SetString(enemy, "uniqueId", spawner.BossId, _report);
                    }

                    enemies[i] = enemy;
                }

                EnemySpawner group = groupObject.AddComponent<EnemySpawner>();
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
                TestGroundFields.SetReference(marker, "group", groupObject, _report);

                if (spawner.Activation == SpawnActivation.Quest)
                {
                    // The quest action Gegner+(spawn-id) (SpawnEncounter, GDD 02 11) switches the child on; the registry saves it.
                    groupObject.SetActive(false);
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

            _report.Info("Gegner: " + active + " immer aktiv (Grauwölfe am Nordhang, Aether-Wolf im Wald nordöstlich des Risses), " + questGroups +
                         " Quest-Gruppen (Kind „Gruppe“ aus, bis die Quest-Aktion „Gegner spawnen“ sie einschaltet; Risslinge vertreten durch " +
                         "Aether-Wölfe).");
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

        /// <summary>
        /// NPC placeholders: capsules with nose and name sign, grouped by story phase. Each marker that belongs to a quest state
        /// sits in its own <see cref="ConditionalObjectGroup"/> (<see cref="MiniSliceWorld.NpcVisibility"/>), and NPCs with an
        /// NPC asset (<see cref="MiniSliceAssets"/>) can be talked to (<see cref="Aetherfall.NPC.NpcInteractable"/>).
        /// </summary>
        /// <param name="parent">Parent.</param>
        /// <param name="player">Player object (the NPCs look at it).</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        public void BuildNpcMarkers(Transform parent, GameObject player, int interactableLayer)
        {
            var groups = new Dictionary<NpcMarkerPhase, Transform>();
            Material body = _materials.Get("npcMarker", 0.3f);
            int talking = 0;
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
                string phaseName = PhaseName(npc.Phase) + (npc.Stage.Length > 0 ? " " + npc.Stage : string.Empty);
                Conditions.Condition visibleWhile = MiniSliceWorld.NpcVisibility(npc.NpcId, npc.Phase, npc.Stage);
                Transform holder = group;
                if (visibleWhile != null)
                {
                    var visibility = new GameObject("Sichtbar: " + npc.Name + " (" + phaseName + ")");
                    visibility.transform.SetParent(group, false);
                    ConditionalObjectGroup conditional = visibility.AddComponent<ConditionalObjectGroup>();
                    TestGroundFields.SetString(conditional, "phaseId", phaseName, _report);
                    var serialized = new UnityEditor.SerializedObject(conditional);
                    serialized.FindProperty("visibleWhile").managedReferenceValue = visibleWhile;
                    serialized.ApplyModifiedPropertiesWithoutUndo();
                    holder = visibility.transform;
                }

                var root = new GameObject(npc.Name + " (" + npc.NpcId + ", " + phaseName + ")");
                root.transform.SetParent(holder, false);
                if (MiniSliceAssets.TryMakeTalkable(root, npc.NpcId, player, interactableLayer, _report))
                {
                    talking++;
                }
                root.transform.SetPositionAndRotation(new Vector3((float)x, H(x, z), (float)z), Quaternion.Euler(0f, (float)npc.Yaw, 0f));

                GameObject capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                capsule.name = "Platzhalter";
                capsule.transform.SetParent(root.transform, false);
                capsule.transform.localPosition = new Vector3(0f, NpcHeight * 0.5f, 0f);
                capsule.transform.localScale = new Vector3(0.6f, NpcHeight * 0.5f, 0.6f);
                capsule.GetComponent<MeshRenderer>().sharedMaterial = body;
                float signHeight = NpcHeight + 0.55f;
                if (npc.InsideBuilding)
                {
                    // Inside a building on purpose (e.g. trapped in the burning bakery): no collider in the walls, sign above the roof.
                    Object.DestroyImmediate(capsule.GetComponent<Collider>());
                    signHeight = Mathf.Max(signHeight, RoofTopAbove(x, z) + 1f);
                }

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
                TestGroundFields.SetString(marker, "stage", npc.Stage, _report);
                string stage = npc.Stage.Length > 0 ? ", Stufe " + npc.Stage : string.Empty;
                string phase = npc.Phase == NpcMarkerPhase.Prolog ? "\n(Prolog" + stage + ")" :
                    npc.Phase == NpcMarkerPhase.AfterProlog ? "\n(nach dem Prolog" + stage + ")" : stage.Length > 0 ? "\n(" + stage.Substring(2) + ")" : string.Empty;
                EichentalLabel.Create(root.transform, npc.Name + phase, new Vector3(0f, signHeight, 0f), 180f, _labelFont, 0.03f);
            }

            _report.Info("NPC-Platzhalter: " + _layout.NpcMarkers.Count + " Kapseln mit NpcMarker (NPC-ID aus GDD 02, Ort, Phase, Stufe), " + talking +
                         " davon ansprechbar, sichtbar je nach Stand von „Asche über Eichental“. Der NPC-Baustein " +
                         "ersetzt sie durch echte Figuren mit Dialogen.");
        }

        private float RoofTopAbove(double x, double z)
        {
            float top = 0f;
            foreach (LayoutBuilding b in _layout.Buildings)
            {
                if (LayoutGeometry.RectExcess(x, z, b.Position, b.Width, b.Depth, b.Yaw) < 0.0)
                {
                    bool roof = b.Roof != RoofKind.None && b.State != BuildingState.Collapsed;
                    float rise = roof ? (float)RoofGeometry.Rise(b.Roof, b.Width, b.RoofPitch) : 0f;
                    float baseHeight = EichentalBuildingBuilder.BaseHeight(b, _heights);
                    top = Mathf.Max(top, baseHeight + (float)b.WallHeight + rise - H(x, z));
                }
            }

            return top;
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
        /// <param name="interactableLayer">Interactable layer or −1 (interaction triggers).</param>
        /// <param name="triggerVolumeLayer">TriggerVolume layer or −1 (timed area at the bakery door).</param>
        /// <param name="playerLayer">Player layer or −1.</param>
        public void BuildQuestObjects(Transform parent, int environmentLayer, int interactableLayer, int triggerVolumeLayer, int playerLayer)
        {
            int interactive = 0;
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
                MiniSliceWorld.ObjectSetup setup = MiniSliceWorld.ForObject(q.Id);
                if (setup != null)
                {
                    ConfigureInteraction(marker, setup, interactableLayer);
                    interactive++;
                }

                if (q.Id == MiniSliceWorld.SplinterId)
                {
                    // Second way to deal with the splinter (break it out instead of smashing it): same object id, other verb.
                    var breakOut = new GameObject("Herausbrechen");
                    breakOut.transform.SetParent(root.transform, false);
                    breakOut.transform.localPosition = new Vector3(0f, 0f, 0.6f);
                    QuestObjectMarker second = breakOut.AddComponent<QuestObjectMarker>();
                    TestGroundFields.SetString(second, "objectId", q.Id, _report);
                    TestGroundFields.SetString(second, "questId", q.QuestId, _report);
                    TestGroundFields.SetString(second, "locationId", q.LocationId, _report);
                    ConfigureInteraction(second, MiniSliceWorld.SplinterBreakOut(), interactableLayer);
                }

                if (q.Id == MiniSliceWorld.WennaDoorId)
                {
                    // "Hol Wenna aus dem Haus" (GDD 02 11.1 s25) is reached by stepping up to the door within the time limit.
                    AddAreaTrigger(root.transform, q.Id, 2.5f, triggerVolumeLayer, playerLayer);
                }
            }

            _report.Info("Quest-Objekte: " + _layout.QuestObjects.Count + " mit QuestObjectMarker, davon " + interactive + " benutzbar in ihrer " +
                         "Quest-Stufe (Balken, Runen, Weide, Strohziele, Postreiter, Splitter, Welpe); die Tür der Bäckerei ist ein Zeit-Ziel.");
        }

        private void ConfigureInteraction(QuestObjectMarker marker, MiniSliceWorld.ObjectSetup setup, int interactableLayer)
        {
            TestGroundFields.SetInt(marker, "action", (int)setup.Action, _report);
            TestGroundFields.SetString(marker, "prompt", setup.Prompt, _report);
            TestGroundFields.SetBool(marker, "singleUse", true, _report);
            TestGroundFields.SetBool(marker, "hideWhenUsed", setup.HideWhenUsed, _report);
            var serialized = new UnityEditor.SerializedObject(marker);
            UnityEditor.SerializedProperty condition = serialized.FindProperty("interactableWhile");
            if (condition != null)
            {
                condition.managedReferenceValue = setup.InteractableWhile;
                serialized.ApplyModifiedPropertiesWithoutUndo();
            }

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(marker.transform, false);
            trigger.transform.localPosition = new Vector3(0f, 0.8f, 0f);
            trigger.layer = interactableLayer >= 0 ? interactableLayer : 0;
            SphereCollider sphere = trigger.AddComponent<SphereCollider>();
            sphere.isTrigger = true;
            sphere.radius = 0.9f;
        }

        private void AddAreaTrigger(Transform parent, string areaId, float radius, int triggerVolumeLayer, int playerLayer)
        {
            var zone = new GameObject("Zeit-Ziel " + areaId);
            zone.transform.SetParent(parent, false);
            zone.transform.localPosition = new Vector3(0f, 1f, 0f);
            zone.layer = triggerVolumeLayer >= 0 ? triggerVolumeLayer : 0;
            CapsuleCollider capsule = zone.AddComponent<CapsuleCollider>();
            capsule.isTrigger = true;
            capsule.radius = radius;
            capsule.height = 4f + 2f * radius;
            Rigidbody body = zone.AddComponent<Rigidbody>();
            body.isKinematic = true;
            body.useGravity = false;
            AreaTrigger area = zone.AddComponent<AreaTrigger>();
            TestGroundFields.SetString(area, "areaId", areaId, _report);
            TestGroundFields.SetInt(area, "playerLayers", playerLayer >= 0 ? 1 << playerLayer : 1 << TestGroundPaths.PlayerLayerIndex, _report);
        }

        /// <summary>
        /// Trails of "Folge der Spur" objectives: one trigger per node (<see cref="TrailNodeTrigger"/>, layer TriggerVolume, kinematic
        /// body like the location zones) and a small glowing mark on the ground, so the player sees where the trail goes.
        /// </summary>
        /// <param name="parent">Parent.</param>
        /// <param name="triggerVolumeLayer">TriggerVolume layer or −1.</param>
        /// <param name="playerLayer">Player layer or −1.</param>
        public void BuildTrails(Transform parent, int triggerVolumeLayer, int playerLayer)
        {
            Material sign = _materials.Glow("questMarker", 1.5f);
            int playerMask = playerLayer >= 0 ? 1 << playerLayer : 1 << TestGroundPaths.PlayerLayerIndex;
            var names = new List<string>();
            foreach (LayoutTrail trail in _layout.Trails)
            {
                var root = new GameObject("Spur " + trail.Name + " (" + trail.Id + ")");
                root.transform.SetParent(parent, false);
                float radius = (float)trail.Radius;
                for (int i = 0; i < trail.Nodes.Count; i++)
                {
                    LayoutPoint p = trail.Nodes[i];
                    float ground = H(p.X, p.Z);
                    var node = new GameObject("Knoten " + i);
                    node.transform.SetParent(root.transform, false);
                    node.transform.position = new Vector3((float)p.X, ground + 1f, (float)p.Z);
                    node.layer = triggerVolumeLayer >= 0 ? triggerVolumeLayer : 0;
                    CapsuleCollider capsule = node.AddComponent<CapsuleCollider>();
                    capsule.isTrigger = true;
                    capsule.direction = 1;
                    capsule.radius = radius;
                    capsule.height = 8f + 2f * radius;
                    Rigidbody body = node.AddComponent<Rigidbody>();
                    body.isKinematic = true;
                    body.useGravity = false;
                    TrailNodeTrigger trigger = node.AddComponent<TrailNodeTrigger>();
                    TestGroundFields.SetString(trigger, "trailId", trail.Id, _report);
                    TestGroundFields.SetInt(trigger, "index", i, _report);
                    TestGroundFields.SetInt(trigger, "playerLayers", playerMask, _report);

                    GameObject mark = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    mark.name = "Spurzeichen";
                    mark.transform.SetParent(node.transform, false);
                    mark.transform.localPosition = new Vector3(0f, -0.97f, 0f);
                    mark.transform.localScale = new Vector3(0.7f, 0.02f, 0.7f);
                    Object.DestroyImmediate(mark.GetComponent<Collider>());
                    MeshRenderer renderer = mark.GetComponent<MeshRenderer>();
                    renderer.sharedMaterial = sign;
                    renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }

                names.Add(trail.Id + " (" + trail.Nodes.Count + " Knoten)");
            }

            _report.Info("Spuren (TrailNodeTrigger, Layer " + (triggerVolumeLayer >= 0 ? triggerVolumeLayer.ToString() : "Default") + "): " +
                         string.Join(", ", names) + ". Das Quest-Ziel „Folge der Spur“ braucht dieselbe Knotenzahl.");
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

            // Never static: quest objects move later (beam lifted, pup picked up).
        }
    }
}
