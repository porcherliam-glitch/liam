using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Quests;
using Aetherfall.World;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the objects of the crypt from the layout (GDD 02 11.7): grave slabs, inscription and reliefs (readable), trap slits,
    /// levers, pressure plates, mirrors, Aether cracks, the seal, cage and grave robber, chests, lore objects, columns,
    /// sarcophagi, soot marks, altar, seal stone and blade fragment (state interactables with item actions), exits (portals);
    /// then the doors, the two puzzles, the traps, the lights, the location zones and the checkpoint.
    /// </summary>
    public static class GruftObjectBuilder
    {
        private static readonly Color TextColor = new Color(0.93f, 0.88f, 0.75f);

        /// <summary>Builds everything listed above.</summary>
        /// <param name="ctx">Build context (player and spawn point must exist for the checkpoint).</param>
        public static void Build(GruftContext ctx)
        {
            Transform objects = GruftParts.Empty(ctx.Root, "Objekte", Vector3.zero);
            var counts = new Dictionary<string, int>();
            foreach (DungeonObject o in ctx.Layout.Objects)
            {
                GameObject built = BuildObject(ctx, objects, o);
                if (built != null)
                {
                    ctx.Register(o.Id, built);
                    counts[o.Kind] = counts.TryGetValue(o.Kind, out int n) ? n + 1 : 1;
                }
            }

            LinkCage(ctx);
            BuildDoors(ctx);
            BuildPuzzles(ctx);
            BuildTraps(ctx);
            BuildLights(ctx);
            BuildAreas(ctx);
            BuildCheckpoints(ctx);
            var parts = new List<string>();
            foreach (KeyValuePair<string, int> pair in counts)
            {
                parts.Add(pair.Key + " " + pair.Value);
            }

            parts.Sort();
            ctx.Report.Info("Gruft-Objekte: " + string.Join(", ", parts) + ".");
        }

        private static GameObject BuildObject(GruftContext ctx, Transform parent, DungeonObject o)
        {
            var root = new GameObject(string.IsNullOrEmpty(o.Name) ? o.Id : o.Name);
            root.transform.SetParent(parent, false);
            root.transform.SetPositionAndRotation(ctx.Position(o.X, o.Z, o.Y, o.Height), Quaternion.Euler(0f, o.Yaw, 0f));
            root.layer = ctx.EnvironmentLayer;
            GruftMaterials m = ctx.Materials;
            int env = ctx.EnvironmentLayer;
            switch (o.Kind)
            {
                case DungeonObject.GraveSlab:
                    BuildGraveSlab(ctx, root, o);
                    break;
                case DungeonObject.Lever:
                    BuildLever(ctx, root, o);
                    break;
                case DungeonObject.PressurePlate:
                    BuildPressurePlate(ctx, root, o);
                    break;
                case DungeonObject.Mirror:
                    BuildMirror(ctx, root, o);
                    break;
                case DungeonObject.Cage:
                    BuildCage(ctx, root, o);
                    break;
                case DungeonObject.Npc:
                    BuildNpc(ctx, root, o);
                    break;
                case DungeonObject.SealStone:
                    BuildSealStone(ctx, root, o);
                    break;
                case DungeonObject.Reward:
                    BuildReward(ctx, root, o);
                    break;
                case DungeonObject.Chest:
                    BuildChest(ctx, root, o);
                    break;
                case DungeonObject.Portal:
                    BuildPortal(ctx, root, o);
                    break;
                case DungeonObject.Inscription:
                case DungeonObject.WallRelief:
                case DungeonObject.LoreTablet:
                case DungeonObject.LoreNote:
                    BuildReadable(ctx, root, o);
                    break;
                case DungeonObject.TrapSlit:
                    GruftParts.Part(root.transform, "Schlitz", PrimitiveType.Cube, Vector3.zero, new Vector3(0.5f, 0.12f, 0.12f), m.Soot, env, false);
                    GameObject arrow = GruftParts.Part(root.transform, "Pfeil", PrimitiveType.Cylinder, new Vector3(0f, 0f, 0.1f),
                        new Vector3(0.03f, 0.35f, 0.03f), m.Wood, env, false);
                    arrow.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    break;
                case DungeonObject.AetherCrack:
                    if (o.Height <= 0.01f)
                    {
                        // A crack in the floor (the hall): flat glowing seam.
                        GruftParts.Part(root.transform, "Riss", PrimitiveType.Cube, new Vector3(0f, 0.02f, 0f), new Vector3(0.25f, 0.04f, 3.0f), m.AetherGlow,
                            env, false);
                    }
                    else
                    {
                        GruftParts.Part(root.transform, "Spalt", PrimitiveType.Cube, new Vector3(0f, 0f, -0.02f), new Vector3(0.18f, 1.4f, 0.08f),
                            m.AetherGlow, env, false);
                    }

                    break;
                case DungeonObject.Seal:
                    GameObject disc = GruftParts.Part(root.transform, "Siegel", PrimitiveType.Cylinder, Vector3.zero, new Vector3(1.0f, 0.04f, 1.0f), m.Trim,
                        env, false);
                    disc.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    GameObject glow = GruftParts.Part(root.transform, "Siegel Leuchten", PrimitiveType.Cylinder, new Vector3(0f, 0f, 0.03f),
                        new Vector3(1.1f, 0.03f, 1.1f), m.AetherGlow, env, false);
                    glow.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    glow.SetActive(false);
                    break;
                case DungeonObject.Column:
                    GruftParts.Part(root.transform, "Säule", PrimitiveType.Cylinder, new Vector3(0f, SizeY(o, 4f) * 0.5f, 0f),
                        new Vector3(SizeX(o, 0.8f), SizeY(o, 4f) * 0.5f, SizeZ(o, 0.8f)), m.Trim, env, true);
                    break;
                case DungeonObject.Pillar:
                    GruftParts.Part(root.transform, "Pfeiler", PrimitiveType.Cube, new Vector3(0f, SizeY(o, 8f) * 0.5f, 0f),
                        new Vector3(SizeX(o, 1.2f), SizeY(o, 8f), SizeZ(o, 1.2f)), m.Wall, env, true);
                    break;
                case DungeonObject.Sarcophagus:
                    GruftParts.Part(root.transform, "Sarg", PrimitiveType.Cube, new Vector3(0f, 0.45f, 0f), new Vector3(SizeX(o, 1.1f), 0.9f, SizeZ(o, 2.3f)),
                        m.Wall, env, true);
                    GruftParts.Part(root.transform, "Deckel", PrimitiveType.Cube, new Vector3(0f, 0.97f, 0f),
                        new Vector3(SizeX(o, 1.1f) + 0.12f, 0.14f, SizeZ(o, 2.3f) + 0.12f), m.Trim, env, false);
                    break;
                case DungeonObject.Rubble:
                    BuildRubble(root, o, m, env);
                    break;
                case DungeonObject.Soot:
                    GruftParts.Part(root.transform, "Russ", PrimitiveType.Cube, new Vector3(0f, 0.01f, 0f), new Vector3(SizeX(o, 0.5f), 0.02f, SizeZ(o, 1.8f)),
                        m.Soot, env, false);
                    AddHint(ctx, root, new Vector3(0f, 0.03f, 0f), new Vector3(SizeX(o, 0.5f) + 0.1f, 0.02f, SizeZ(o, 1.8f) + 0.1f));
                    break;
                case DungeonObject.Altar:
                    GruftParts.Part(root.transform, "Altar", PrimitiveType.Cube, new Vector3(0f, 0.5f, 0f), new Vector3(SizeX(o, 2.0f), 1.0f, SizeZ(o, 1.2f)),
                        m.Trim, env, true);
                    break;
                case DungeonObject.ClimbMarker:
                    GruftParts.Part(root.transform, "Kiste (Kletterhilfe)", PrimitiveType.Cube, new Vector3(0f, 0.28f, 0f), new Vector3(1.0f, 0.56f, 1.0f),
                        m.Wood, env, true);
                    break;
                default:
                    ctx.Report.Warning("Objektart „" + o.Kind + "“ (" + o.Id + ") ist dem Gruft-Generator unbekannt – nur ein leerer Platzhalter.");
                    break;
            }

            return root;
        }

        private static void BuildGraveSlab(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            GruftParts.Part(root.transform, "Sockel", PrimitiveType.Cube, new Vector3(0f, 0.17f, 0f), new Vector3(1.3f, 0.34f, 2.3f), m.Wall,
                ctx.EnvironmentLayer, true);
            Transform plate = GruftParts.Empty(root.transform, "Platte", new Vector3(0f, 0.38f, 0f));
            GruftParts.Part(plate, "Platte Stein", PrimitiveType.Cube, Vector3.zero, new Vector3(1.15f, 0.08f, 2.1f), m.Relief, ctx.EnvironmentLayer, false);
            BuildReliefMotif(plate, o.Relief, m, ctx.EnvironmentLayer);
            GruftParts.Text(root.transform, "Name", ReliefName(o.Relief), new Vector3(0f, 0.9f, -1.3f), 0.025f, TextColor, ctx.Font);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 0.5f, 0f), new Vector3(1.6f, 1.0f, 2.6f), ctx.InteractLayerOrDefault, false);
            PuzzleSwitch slab = root.AddComponent<PuzzleSwitch>();
            TestGroundFields.SetString(slab, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(slab, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Drücken: Grabplatte (" + ReliefName(o.Relief) + ")" : o.Prompt,
                ctx.Report);
            TestGroundFields.SetInt(slab, "mode", (int)SwitchMode.Momentary, ctx.Report);
            TestGroundFields.SetReference(slab, "movingPart", plate, ctx.Report);
            TestGroundFields.SetVector3(slab, "pressedOffset", new Vector3(0f, -0.1f, 0f), ctx.Report);
        }

        private static void BuildReliefMotif(Transform plate, string relief, GruftMaterials m, int layer)
        {
            switch (relief)
            {
                case "eiche":
                    GruftParts.Part(plate, "Eiche Stamm", PrimitiveType.Cube, new Vector3(0f, 0.06f, -0.35f), new Vector3(0.12f, 0.05f, 0.6f), m.Trim, layer,
                        false);
                    GruftParts.Part(plate, "Eiche Krone", PrimitiveType.Sphere, new Vector3(0f, 0.06f, 0.2f), new Vector3(0.6f, 0.06f, 0.6f), m.Trim, layer,
                        false);
                    GruftParts.Part(plate, "Eiche Schild", PrimitiveType.Cube, new Vector3(0.22f, 0.07f, -0.35f), new Vector3(0.2f, 0.05f, 0.26f), m.Iron,
                        layer, false);
                    break;
                case "krone":
                    GruftParts.Part(plate, "Krone Reif", PrimitiveType.Cube, new Vector3(0f, 0.06f, -0.05f), new Vector3(0.6f, 0.05f, 0.14f), m.Gold, layer,
                        false);
                    for (int i = 0; i < 3; i++)
                    {
                        Transform spike = GruftParts.Part(plate, "Krone Zacke " + (i + 1), PrimitiveType.Cube, new Vector3(-0.2f + i * 0.2f, 0.06f, 0.15f),
                            new Vector3(0.1f, 0.05f, 0.26f), m.Gold, layer, false).transform;
                        // The bowed crown: the spikes lean to one side.
                        spike.localRotation = Quaternion.Euler(0f, 25f, 0f);
                    }

                    break;
                default:
                    GruftParts.Part(plate, "Schild", PrimitiveType.Cube, new Vector3(0f, 0.06f, 0f), new Vector3(0.5f, 0.05f, 0.7f), m.Iron, layer, false);
                    GruftParts.Part(plate, "Schild Buckel", PrimitiveType.Sphere, new Vector3(0f, 0.09f, 0f), new Vector3(0.18f, 0.06f, 0.18f), m.Trim,
                        layer, false);
                    break;
            }
        }

        private static string ReliefName(string relief)
        {
            switch (relief)
            {
                case "eiche":
                    return "Eiche mit Schild";
                case "krone":
                    return "Gebeugte Krone";
                case "schild":
                    return "Schild";
                default:
                    return string.IsNullOrEmpty(relief) ? "Grabplatte" : relief;
            }
        }

        private static void BuildLever(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            GruftParts.Part(root.transform, "Sockel", PrimitiveType.Cube, new Vector3(0f, 0.4f, 0f), new Vector3(0.4f, 0.8f, 0.3f), m.Iron,
                ctx.EnvironmentLayer, true);
            Transform pivot = GruftParts.Empty(root.transform, "Hebel", new Vector3(0f, 0.8f, 0.1f));
            pivot.localRotation = Quaternion.Euler(-35f, 0f, 0f);
            GruftParts.Part(pivot, "Stange", PrimitiveType.Cylinder, new Vector3(0f, 0.35f, 0f), new Vector3(0.06f, 0.35f, 0.06f), m.Iron,
                ctx.EnvironmentLayer, false);
            GruftParts.Part(pivot, "Griff", PrimitiveType.Sphere, new Vector3(0f, 0.72f, 0f), new Vector3(0.14f, 0.14f, 0.14f), m.Wood,
                ctx.EnvironmentLayer, false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 0.8f, 0.2f), new Vector3(0.9f, 1.6f, 0.9f), ctx.InteractLayerOrDefault, false);
            PuzzleSwitch lever = root.AddComponent<PuzzleSwitch>();
            TestGroundFields.SetString(lever, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(lever, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Ziehen: Hebel" : o.Prompt, ctx.Report);
            TestGroundFields.SetInt(lever, "mode", (int)SwitchMode.Toggle, ctx.Report);
            TestGroundFields.SetReference(lever, "movingPart", pivot, ctx.Report);
            TestGroundFields.SetFloat(lever, "onAngle", 70f, ctx.Report);
        }

        private static void BuildPressurePlate(GruftContext ctx, GameObject root, DungeonObject o)
        {
            Transform plate = GruftParts.Part(root.transform, "Platte", PrimitiveType.Cube, new Vector3(0f, 0.03f, 0f), new Vector3(1.2f, 0.06f, 1.2f),
                ctx.Materials.Relief, ctx.EnvironmentLayer, false).transform;
            GruftParts.TriggerOn(root, new Vector3(0f, 0.4f, 0f), new Vector3(1.1f, 0.8f, 1.1f), ctx.TriggerLayerOrDefault);
            PressurePlate logic = root.AddComponent<PressurePlate>();
            TestGroundFields.SetString(logic, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetReference(logic, "plate", plate, ctx.Report);
            int pressing = (ctx.PlayerLayer >= 0 ? 1 << ctx.PlayerLayer : 0) | (ctx.EnemyLayer >= 0 ? 1 << ctx.EnemyLayer : 0);
            TestGroundFields.SetInt(logic, "pressingLayers", pressing, ctx.Report);
        }

        private static void BuildMirror(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            root.transform.rotation = Quaternion.identity;
            GridDirection start = MirrorStart(ctx.Layout, o.Id);
            GruftParts.Part(root.transform, "Ständer", PrimitiveType.Cylinder, new Vector3(0f, 0.5f, 0f), new Vector3(0.5f, 0.5f, 0.5f), m.Iron,
                ctx.EnvironmentLayer, true);
            Transform pivot = GruftParts.Empty(root.transform, "Drehteil", new Vector3(0f, 1.2f, 0f));
            pivot.localRotation = Quaternion.Euler(0f, GridDirections.Yaw(start), 0f);
            GruftParts.Part(pivot, "Rahmen", PrimitiveType.Cube, new Vector3(0f, 0f, -0.04f), new Vector3(1.0f, 1.1f, 0.08f), m.Gold, ctx.EnvironmentLayer,
                false);
            GruftParts.Part(pivot, "Glas", PrimitiveType.Cube, new Vector3(0f, 0f, 0.01f), new Vector3(0.85f, 0.95f, 0.02f), m.Mirror, ctx.EnvironmentLayer,
                false);
            GruftParts.Part(pivot, "Richtung", PrimitiveType.Cube, new Vector3(0f, -0.62f, 0.35f), new Vector3(0.08f, 0.04f, 0.5f), m.AetherGlow,
                ctx.EnvironmentLayer, false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 1.0f, 0f), new Vector3(1.4f, 2.0f, 1.4f), ctx.InteractLayerOrDefault, false);
            RotatableMirror mirror = root.AddComponent<RotatableMirror>();
            TestGroundFields.SetString(mirror, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(mirror, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Drehen: Spiegel" : o.Prompt, ctx.Report);
            TestGroundFields.SetInt(mirror, "startDirection", (int)start, ctx.Report);
            TestGroundFields.SetReference(mirror, "pivot", pivot, ctx.Report);
        }

        private static GridDirection MirrorStart(DungeonLayout layout, string mirrorId)
        {
            foreach (DungeonPuzzle puzzle in layout.Puzzles)
            {
                foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
                {
                    if (mirror.Id == mirrorId)
                    {
                        return mirror.Start;
                    }
                }
            }

            return layout.BossArena != null && layout.BossArena.Mirror == mirrorId ? layout.BossArena.MirrorStart : GridDirection.North;
        }

        private static void BuildCage(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            Transform bars = GruftParts.Empty(root.transform, "Gitter", Vector3.zero);
            const int count = 12;
            for (int i = 0; i < count; i++)
            {
                float angle = i * Mathf.PI * 2f / count;
                GruftParts.Part(bars, "Stab " + (i + 1), PrimitiveType.Cylinder, new Vector3(Mathf.Cos(angle) * 0.85f, 1.1f, Mathf.Sin(angle) * 0.85f),
                    new Vector3(0.06f, 1.1f, 0.06f), m.Iron, ctx.EnvironmentLayer, true);
            }

            GruftParts.Part(bars, "Deckel", PrimitiveType.Cylinder, new Vector3(0f, 2.22f, 0f), new Vector3(1.9f, 0.04f, 1.9f), m.Iron, ctx.EnvironmentLayer,
                false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 1.1f, 0f), new Vector3(2.4f, 2.2f, 2.4f), ctx.InteractLayerOrDefault, false);
            StateInteractable cage = root.AddComponent<StateInteractable>();
            TestGroundFields.SetString(cage, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(cage, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Befreie den Grabräuber" : o.Prompt, ctx.Report);
            TestGroundFields.SetString(cage, "verb", InteractionVerbs.Use, ctx.Report);
            TestGroundFields.SetReferences(cage, "visibleBefore", new Object[] { bars.gameObject }, ctx.Report);
            TestGroundFields.SetFloat(cage, "hideAfterSeconds", 15f, ctx.Report);
        }

        private static void BuildNpc(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            GruftParts.Part(root.transform, "Körper", PrimitiveType.Capsule, new Vector3(0f, 0.85f, 0f), new Vector3(0.6f, 0.85f, 0.6f), m.Npc,
                ctx.EnvironmentLayer, false);
            GruftParts.Part(root.transform, "Kopf", PrimitiveType.Sphere, new Vector3(0f, 1.8f, 0f), new Vector3(0.36f, 0.36f, 0.36f), m.Bone,
                ctx.EnvironmentLayer, false);
            GameObject words = GruftParts.Text(root.transform, "Worte", GruftParts.Wrap(o.Text, 36), new Vector3(0f, 2.7f, 0f), 0.022f, TextColor,
                ctx.Font);
            if (words != null)
            {
                words.SetActive(false);
            }
        }

        private static void LinkCage(GruftContext ctx)
        {
            foreach (DungeonObject cage in ctx.Layout.ObjectsOfKind(DungeonObject.Cage))
            {
                StateInteractable logic = ctx.Get<StateInteractable>(cage.Id);
                if (logic == null)
                {
                    continue;
                }

                foreach (DungeonObject npc in ctx.Layout.ObjectsOfKind(DungeonObject.Npc))
                {
                    if (Mathf.Abs(npc.X - cage.X) < 1.5f && Mathf.Abs(npc.Z - cage.Z) < 1.5f)
                    {
                        GameObject root = ctx.Get(npc.Id);
                        Transform words = root != null ? root.transform.Find("Worte") : null;
                        if (words != null)
                        {
                            TestGroundFields.SetReferences(logic, "visibleAfter", new Object[] { words.gameObject }, ctx.Report);
                        }
                    }
                }
            }
        }

        private static void BuildSealStone(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            GameObject stone = GruftParts.Part(root.transform, "Siegelstein", PrimitiveType.Cylinder, new Vector3(0f, 0.12f, 0f),
                new Vector3(0.45f, 0.12f, 0.45f), m.Gold, ctx.EnvironmentLayer, false);
            GruftParts.Part(stone.transform, "Eichenzeichen", PrimitiveType.Cube, new Vector3(0f, 1.05f, 0f), new Vector3(0.5f, 0.1f, 0.12f), m.AetherGlow,
                ctx.EnvironmentLayer, false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 0.2f, 0f), new Vector3(1.4f, 1.0f, 1.4f), ctx.InteractLayerOrDefault, false);
            StateInteractable logic = root.AddComponent<StateInteractable>();
            TestGroundFields.SetString(logic, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(logic, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Nimm den Siegelstein" : o.Prompt, ctx.Report);
            TestGroundFields.SetString(logic, "verb", InteractionVerbs.PickUp, ctx.Report);
            TestGroundFields.SetReferences(logic, "visibleBefore", new Object[] { stone }, ctx.Report);
            if (ctx.Layout.BossArena != null)
            {
                GruftParts.AddRequirement(logic, ctx.Layout.BossArena.BossId, WorldObjectStates.Done, ctx.Report);
            }

            GruftParts.AddRequirement(logic, GruftPaths.SealStoneGateId, WorldObjectStates.Done, ctx.Report);
            AddGiveItem(ctx, root, o.Id, o.ItemId);

            // Quest stage s60 "Waehle": the stone can be taken unless the player chose to leave it (s70_belassen). Without the quest
            // data (Mini-Slice step 8) the condition holds, so the stone can be tested after the boss.
            Component gate = GruftInstallers.AddGameplayComponent(GruftParts.Empty(root.transform, "Bedingung Siegelstein", Vector3.zero).gameObject,
                GruftInstallers.ConditionGateType, ctx.Report);
            if (gate != null)
            {
                TestGroundFields.SetString(gate, "gateId", GruftPaths.SealStoneGateId, ctx.Report);
                GruftInstallers.SetManagedReference(gate, "condition", new Not(new QuestStageReached(ctx.Layout.QuestId, "s70_belassen")), ctx.Report);
            }
        }

        private static void BuildReward(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            Transform fragment = GruftParts.Empty(root.transform, "Klingenfragment", new Vector3(0f, 0.9f, 0f));
            GruftParts.Part(fragment, "Klinge", PrimitiveType.Cube, Vector3.zero, new Vector3(0.08f, 0.02f, 0.7f), m.Mirror, ctx.EnvironmentLayer, false)
                .transform.localRotation = Quaternion.Euler(0f, 0f, 20f);
            GruftParts.Part(fragment, "Schimmer", PrimitiveType.Sphere, Vector3.zero, new Vector3(0.4f, 0.4f, 0.4f), m.AetherGlow, ctx.EnvironmentLayer,
                false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 0.8f, 0f), new Vector3(1.4f, 1.6f, 1.4f), ctx.InteractLayerOrDefault, false);
            StateInteractable logic = root.AddComponent<StateInteractable>();
            TestGroundFields.SetString(logic, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(logic, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Aufheben: Klingenfragment" : o.Prompt, ctx.Report);
            TestGroundFields.SetString(logic, "verb", InteractionVerbs.PickUp, ctx.Report);
            TestGroundFields.SetReferences(logic, "visibleBefore", new Object[] { fragment.gameObject }, ctx.Report);
            TestGroundFields.SetBool(logic, "hiddenUntilAvailable", true, ctx.Report);
            TestGroundFields.SetInt(logic, "priority", 12, ctx.Report);
            if (ctx.Layout.BossArena != null)
            {
                GruftParts.AddRequirement(logic, ctx.Layout.BossArena.BossId, WorldObjectStates.Done, ctx.Report);
            }

            AddGiveItem(ctx, root, o.Id, o.ItemId);
        }

        private static void AddGiveItem(GruftContext ctx, GameObject root, string objectId, string itemId)
        {
            if (string.IsNullOrEmpty(itemId))
            {
                return;
            }

            Component actions = GruftInstallers.AddGameplayComponent(GruftParts.Empty(root.transform, "Aktionen", Vector3.zero).gameObject,
                GruftInstallers.StateActionsType, ctx.Report);
            if (actions == null)
            {
                return;
            }

            TestGroundFields.SetString(actions, "watchedId", objectId, ctx.Report);
            GruftInstallers.AddManagedReference(actions, "actions", new GiveItem(itemId, 1), ctx.Report);
        }

        private static void BuildChest(GruftContext ctx, GameObject root, DungeonObject o)
        {
            const float width = 1.0f;
            const float height = 0.6f;
            const float depth = 0.6f;
            Material material = o.Tier == "hidden" ? ctx.Materials.Gold : o.Tier == "iron" ? ctx.Materials.Iron : ctx.Materials.Wood;
            GruftParts.Part(root.transform, "Korpus", PrimitiveType.Cube, new Vector3(0f, height * 0.5f, 0f), new Vector3(width, height, depth), material,
                ctx.EnvironmentLayer, true);
            Transform hinge = GruftParts.Empty(root.transform, "Deckel", new Vector3(0f, height, -depth * 0.5f));
            GruftParts.Part(hinge, "Deckel Platte", PrimitiveType.Cube, new Vector3(0f, 0.07f, depth * 0.5f), new Vector3(width + 0.04f, 0.14f, depth + 0.04f),
                material, ctx.EnvironmentLayer, false);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, height * 0.5f, 0f), new Vector3(width + 0.2f, height + 0.3f, depth + 0.2f),
                ctx.InteractLayerOrDefault, false);
            LootChest chest = root.AddComponent<LootChest>();
            ChestTier tier = o.Tier == "hidden" ? ChestTier.Hidden : o.Tier == "iron" ? ChestTier.Iron : ChestTier.Wooden;
            TestGroundFields.SetString(chest, "chestId", o.Id, ctx.Report);
            TestGroundFields.SetString(chest, "lootTableId", o.LootTable, ctx.Report);
            TestGroundFields.SetInt(chest, "tier", (int)tier, ctx.Report);
            TestGroundFields.SetInt(chest, "areaLevel", ctx.Layout.AreaLevel, ctx.Report);
            TestGroundFields.SetString(chest, "displayName", string.IsNullOrEmpty(o.Name) ? "Truhe" : o.Name, ctx.Report);
            TestGroundFields.SetReference(chest, "lid", hinge, ctx.Report);
        }

        private static void BuildPortal(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            GruftParts.Part(root.transform, "Pfosten links", PrimitiveType.Cube, new Vector3(-1.6f, 1.6f, 0f), new Vector3(0.4f, 3.2f, 0.4f), m.Trim,
                ctx.EnvironmentLayer, true);
            GruftParts.Part(root.transform, "Pfosten rechts", PrimitiveType.Cube, new Vector3(1.6f, 1.6f, 0f), new Vector3(0.4f, 3.2f, 0.4f), m.Trim,
                ctx.EnvironmentLayer, true);
            GruftParts.Part(root.transform, "Sturz", PrimitiveType.Cube, new Vector3(0f, 3.3f, 0f), new Vector3(3.6f, 0.4f, 0.4f), m.Trim,
                ctx.EnvironmentLayer, false);
            GruftParts.Part(root.transform, "Tageslicht", PrimitiveType.Cube, new Vector3(0f, 1.6f, -0.15f), new Vector3(2.8f, 3.1f, 0.05f), m.Daylight,
                ctx.EnvironmentLayer, false);
            GruftParts.Text(root.transform, "Schild", "Nach Eichental", new Vector3(0f, 3.8f, 0.3f), 0.035f, TextColor, ctx.Font);
            GruftParts.Trigger(root.transform, "Interaktion", new Vector3(0f, 1.4f, 0.3f), new Vector3(3.0f, 2.8f, 1.4f), ctx.InteractLayerOrDefault, false);
            DungeonPortal portal = root.AddComponent<DungeonPortal>();
            DungeonExit exit = ctx.Layout.FindExit(o.Id);
            TestGroundFields.SetString(portal, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(portal, "prompt", string.IsNullOrEmpty(o.Prompt) ? "Gruft verlassen" : o.Prompt, ctx.Report);
            if (exit != null)
            {
                TestGroundFields.SetString(portal, "targetSceneKey", exit.TargetSceneKey, ctx.Report);
                TestGroundFields.SetString(portal, "targetTitle", exit.TargetTitle, ctx.Report);
                TestGroundFields.SetString(portal, "targetAnchorId", exit.TargetAnchorId, ctx.Report);
            }
        }

        private static void BuildReadable(GruftContext ctx, GameObject root, DungeonObject o)
        {
            GruftMaterials m = ctx.Materials;
            Vector3 size;
            string defaultPrompt;
            switch (o.Kind)
            {
                case DungeonObject.Inscription:
                    size = new Vector3(SizeX(o, 2.4f), SizeY(o, 1.0f), 0.08f);
                    defaultPrompt = "Lesen: Inschrift";
                    break;
                case DungeonObject.WallRelief:
                    size = new Vector3(SizeX(o, 1.3f), SizeY(o, 1.3f), 0.1f);
                    defaultPrompt = "Untersuchen: Wandrelief";
                    break;
                case DungeonObject.LoreTablet:
                    size = new Vector3(SizeX(o, 1.0f), SizeY(o, 1.4f), 0.14f);
                    defaultPrompt = "Lesen: Steintafel";
                    break;
                default:
                    size = new Vector3(0.3f, 0.02f, 0.4f);
                    defaultPrompt = "Lesen: Notiz";
                    break;
            }

            bool note = o.Kind == DungeonObject.LoreNote;
            Vector3 center = note ? new Vector3(0f, 0.01f, 0f) : new Vector3(0f, 0f, size.z * 0.5f);
            GruftParts.Part(root.transform, "Tafel", PrimitiveType.Cube, center, size, note ? m.Bone : m.Relief, ctx.EnvironmentLayer, false);
            if (o.Kind == DungeonObject.WallRelief)
            {
                GruftParts.Part(root.transform, "Relief Ritter", PrimitiveType.Cube, new Vector3(0f, 0f, size.z + 0.03f), new Vector3(0.3f, 0.8f, 0.05f),
                    m.Trim, ctx.EnvironmentLayer, false);
            }

            GameObject text = GruftParts.Text(root.transform, "Text", GruftParts.Wrap(o.Text, 40), new Vector3(0f, note ? 1.4f : 0.9f, note ? 0f : 0.35f),
                0.02f, TextColor, ctx.Font);
            AddHint(ctx, root, center + new Vector3(0f, 0f, note ? 0f : 0.02f), size + new Vector3(0.12f, 0.12f, 0.01f));
            Vector3 triggerCenter = note ? new Vector3(0f, 0.5f, 0f) : new Vector3(0f, -0.2f, 0.7f);
            GruftParts.Trigger(root.transform, "Interaktion", triggerCenter, new Vector3(size.x + 0.6f, 1.8f, 1.4f), ctx.InteractLayerOrDefault, false);
            ReadableObject readable = root.AddComponent<ReadableObject>();
            TestGroundFields.SetString(readable, "objectId", o.Id, ctx.Report);
            TestGroundFields.SetString(readable, "clueId", o.ClueId, ctx.Report);
            TestGroundFields.SetString(readable, "prompt", string.IsNullOrEmpty(o.Prompt) ? defaultPrompt : o.Prompt, ctx.Report);
            TestGroundFields.SetString(readable, "text", o.Text, ctx.Report);
            if (text != null)
            {
                TestGroundFields.SetReference(readable, "textDisplay", text, ctx.Report);
            }
        }

        private static void AddHint(GruftContext ctx, GameObject root, Vector3 center, Vector3 size)
        {
            GameObject glow = GruftParts.Part(root.transform, "Hinweis Leuchten", PrimitiveType.Cube, center, size, ctx.Materials.AetherGlow,
                ctx.EnvironmentLayer, false);
            glow.SetActive(false);
            HintHighlight hint = root.AddComponent<HintHighlight>();
            TestGroundFields.SetReference(hint, "glow", glow, ctx.Report);
        }

        private static void BuildRubble(GameObject root, DungeonObject o, GruftMaterials m, int layer)
        {
            float sx = SizeX(o, 2f);
            float sz = SizeZ(o, 2f);
            Vector3[] offsets =
            {
                new Vector3(-0.3f, 0f, -0.2f), new Vector3(0.35f, 0f, 0.25f), new Vector3(0.05f, 0f, 0.4f), new Vector3(-0.4f, 0f, 0.35f)
            };
            float[] sizes = { 0.7f, 0.5f, 0.4f, 0.35f };
            for (int i = 0; i < offsets.Length; i++)
            {
                Transform stone = GruftParts.Part(root.transform, "Stein " + (i + 1), PrimitiveType.Cube,
                    new Vector3(offsets[i].x * sx, sizes[i] * 0.5f, offsets[i].z * sz), Vector3.one * sizes[i], m.Wall, layer, true).transform;
                stone.localRotation = Quaternion.Euler(i * 11f, i * 37f, i * 7f);
            }
        }

        private static void BuildDoors(GruftContext ctx)
        {
            Transform doors = GruftParts.Empty(ctx.Root, "Tueren", Vector3.zero);
            GruftMaterials m = ctx.Materials;
            foreach (DungeonDoor door in ctx.Layout.Doors)
            {
                var root = new GameObject(string.IsNullOrEmpty(door.Name) ? door.Id : door.Name);
                root.layer = ctx.EnvironmentLayer;
                root.transform.SetParent(doors, false);
                root.transform.SetPositionAndRotation(ctx.Position(door.X, door.Z, door.Y, 0f), Quaternion.Euler(0f, door.SpansX ? 0f : 90f, 0f));
                Transform moving = GruftParts.Empty(root.transform, "Tuerblatt", Vector3.zero);
                BoxCollider blocker = moving.gameObject.AddComponent<BoxCollider>();
                blocker.center = new Vector3(0f, door.Height * 0.5f, 0f);
                blocker.size = new Vector3(door.Width, door.Height, 0.5f);
                Vector3 openOffset;
                float speed;
                switch (door.Kind)
                {
                    case DungeonDoor.Portcullis:
                        BuildPortcullis(moving, door, m.Iron, ctx.EnvironmentLayer);
                        openOffset = new Vector3(0f, door.Height - 0.3f, 0f);
                        speed = 3f;
                        break;
                    case DungeonDoor.HiddenWall:
                        GruftParts.Part(moving, "Wandstueck", PrimitiveType.Cube, new Vector3(0f, door.Height * 0.5f, 0f),
                            new Vector3(door.Width, door.Height, 0.5f), m.Wall, ctx.EnvironmentLayer, false);
                        openOffset = new Vector3(0f, -door.Height - 0.2f, 0f);
                        speed = 1f;
                        break;
                    case DungeonDoor.SealDoor:
                        GruftParts.Part(moving, "Siegeltuer", PrimitiveType.Cube, new Vector3(0f, door.Height * 0.5f, 0f),
                            new Vector3(door.Width, door.Height, 0.45f), m.Relief, ctx.EnvironmentLayer, false);
                        openOffset = new Vector3(0f, -door.Height - 0.2f, 0f);
                        speed = 1.2f;
                        break;
                    default:
                        GruftParts.Part(moving, "Steintor", PrimitiveType.Cube, new Vector3(0f, door.Height * 0.5f, 0f),
                            new Vector3(door.Width, door.Height, 0.5f), m.Trim, ctx.EnvironmentLayer, false);
                        GruftParts.Part(moving, "Eichenzeichen", PrimitiveType.Cylinder, new Vector3(0f, door.Height * 0.6f, -0.27f),
                            new Vector3(0.9f, 0.02f, 0.9f), m.Relief, ctx.EnvironmentLayer, false).transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                        openOffset = new Vector3(0f, -door.Height - 0.2f, 0f);
                        speed = 1.5f;
                        break;
                }

                WorldDoor logic = root.AddComponent<WorldDoor>();
                TestGroundFields.SetString(logic, "doorId", door.Id, ctx.Report);
                TestGroundFields.SetInt(logic, "trigger", (int)TriggerKindOf(door.OpensOn), ctx.Report);
                TestGroundFields.SetString(logic, "triggerId", door.OpensOn.Id, ctx.Report);
                TestGroundFields.SetInt(logic, "requiredState", door.OpensOn.State, ctx.Report);
                TestGroundFields.SetBool(logic, "startsOpen", door.StartsOpen, ctx.Report);
                TestGroundFields.SetReference(logic, "movingPart", moving, ctx.Report);
                TestGroundFields.SetVector3(logic, "openOffset", openOffset, ctx.Report);
                TestGroundFields.SetFloat(logic, "speed", speed, ctx.Report);
                ctx.Register(door.Id, root);
            }

            ctx.Report.Info("Gruft-Türen: " + ctx.Layout.Doors.Count + " (Steintor, verborgene Tür, Gitter, Siegeltür, Arena-Tor, Fluchtweg).");
        }

        private static void BuildPortcullis(Transform moving, DungeonDoor door, Material iron, int layer)
        {
            int bars = Mathf.Max(3, Mathf.RoundToInt(door.Width / 0.3f));
            for (int i = 0; i <= bars; i++)
            {
                float x = -door.Width * 0.5f + door.Width * i / bars;
                GruftParts.Part(moving, "Stab " + (i + 1), PrimitiveType.Cube, new Vector3(x, door.Height * 0.5f, 0f), new Vector3(0.06f, door.Height, 0.06f),
                    iron, layer, false);
            }

            for (int k = 1; k <= 3; k++)
            {
                GruftParts.Part(moving, "Querstrebe " + k, PrimitiveType.Cube, new Vector3(0f, door.Height * k / 4f, 0f), new Vector3(door.Width, 0.06f, 0.08f),
                    iron, layer, false);
            }
        }

        private static DoorTriggerKind TriggerKindOf(DungeonTrigger trigger)
        {
            switch (trigger.Type)
            {
                case DungeonTrigger.Puzzle:
                    return DoorTriggerKind.PuzzleSolved;
                case DungeonTrigger.ObjectState:
                    return DoorTriggerKind.ObjectState;
                case DungeonTrigger.Lever:
                    return DoorTriggerKind.Lever;
                case DungeonTrigger.PressurePlate:
                    return DoorTriggerKind.PressurePlate;
                case DungeonTrigger.BossDefeated:
                    return DoorTriggerKind.BossDefeated;
                case DungeonTrigger.Arena:
                    return DoorTriggerKind.BossArena;
                default:
                    return DoorTriggerKind.Manual;
            }
        }

        private static void BuildPuzzles(GruftContext ctx)
        {
            Transform puzzles = GruftParts.Empty(ctx.Root, "Raetsel", Vector3.zero);
            foreach (DungeonPuzzle puzzle in ctx.Layout.Puzzles)
            {
                DungeonObject anchor = ctx.Layout.FindObject(PuzzleAnchor(puzzle));
                DungeonRoom room = anchor != null ? DungeonPuzzleFactory.RoomAt(ctx.Layout, anchor.X, anchor.Z) : null;
                var root = new GameObject(string.IsNullOrEmpty(puzzle.Name) ? puzzle.Id : puzzle.Name);
                root.transform.SetParent(puzzles, false);
                PlayerPresenceZone zone = null;
                if (room != null)
                {
                    root.transform.position = new Vector3(room.Bounds.CenterX, room.FloorY, room.Bounds.CenterZ);
                    GruftParts.TriggerOn(root, new Vector3(0f, room.Height * 0.5f, 0f), new Vector3(room.Bounds.Width, room.Height, room.Bounds.Depth),
                        ctx.TriggerLayerOrDefault);
                    zone = root.AddComponent<PlayerPresenceZone>();
                    TestGroundFields.SetInt(zone, "playerLayers", ctx.PlayerLayer >= 0 ? 1 << ctx.PlayerLayer : 1, ctx.Report);
                }

                var hints = new List<Object>();
                foreach (string hintId in puzzle.HintObjects)
                {
                    HintHighlight hint = ctx.Get<HintHighlight>(hintId);
                    if (hint != null)
                    {
                        hints.Add(hint);
                    }
                }

                if (puzzle.IsSequence)
                {
                    BuildSequencePuzzle(ctx, root, puzzle, zone, hints);
                }
                else if (puzzle.IsMirror)
                {
                    BuildMirrorPuzzle(ctx, root, puzzle, room, zone, hints);
                }

                ctx.Register(puzzle.Id, root);
            }
        }

        private static string PuzzleAnchor(DungeonPuzzle puzzle)
        {
            return puzzle.IsSequence && puzzle.Steps.Count > 0 ? puzzle.Steps[0] : puzzle.IsMirror ? puzzle.Source : string.Empty;
        }

        private static void BuildSequencePuzzle(GruftContext ctx, GameObject root, DungeonPuzzle puzzle, PlayerPresenceZone zone, List<Object> hints)
        {
            var steps = new List<Object>();
            foreach (string step in puzzle.Steps)
            {
                PuzzleSwitch slab = ctx.Get<PuzzleSwitch>(step);
                if (slab == null)
                {
                    ctx.Report.Warning("Rätsel " + puzzle.Id + ": Schritt " + step + " fehlt.");
                    continue;
                }

                steps.Add(slab);
            }

            SequencePuzzleController logic = root.AddComponent<SequencePuzzleController>();
            TestGroundFields.SetString(logic, "puzzleId", puzzle.Id, ctx.Report);
            TestGroundFields.SetReferences(logic, "steps", steps.ToArray(), ctx.Report);
            TestGroundFields.SetFloat(logic, "hintAfterSeconds", puzzle.HintAfterSeconds, ctx.Report);
            TestGroundFields.SetReferences(logic, "hints", hints.ToArray(), ctx.Report);
            TestGroundFields.SetReference(logic, "room", zone, ctx.Report);
            ctx.Report.Info("Rätsel Grabplatten: Reihenfolge " + string.Join(" → ", puzzle.Steps) + ", Hinweis nach " + puzzle.HintAfterSeconds + " s.");
        }

        private static void BuildMirrorPuzzle(GruftContext ctx, GameObject root, DungeonPuzzle puzzle, DungeonRoom room, PlayerPresenceZone zone,
            List<Object> hints)
        {
            GameObject source = ctx.Get(puzzle.Source);
            GameObject target = ctx.Get(puzzle.Target);
            var mirrors = new List<Object>();
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                RotatableMirror component = ctx.Get<RotatableMirror>(mirror.Id);
                if (component != null)
                {
                    mirrors.Add(component);
                }
            }

            AetherBeamView beam = CreateBeam(ctx, root.transform, "Aetherstrahl");
            MirrorPuzzleController logic = root.AddComponent<MirrorPuzzleController>();
            TestGroundFields.SetString(logic, "puzzleId", puzzle.Id, ctx.Report);
            TestGroundFields.SetReference(logic, "source", source != null ? source.transform : null, ctx.Report);
            TestGroundFields.SetInt(logic, "sourceDirection", (int)puzzle.SourceDirection, ctx.Report);
            TestGroundFields.SetReference(logic, "target", target != null ? target.transform : null, ctx.Report);
            TestGroundFields.SetReferences(logic, "mirrors", mirrors.ToArray(), ctx.Report);
            if (room != null)
            {
                GruftParts.SetVector4(logic, "roomBounds", new Vector4(room.Bounds.X, room.Bounds.Z, room.Bounds.MaxX, room.Bounds.MaxZ), ctx.Report);
            }

            TestGroundFields.SetReference(logic, "beam", beam, ctx.Report);
            Transform glow = target != null ? target.transform.Find("Siegel Leuchten") : null;
            TestGroundFields.SetReference(logic, "sealGlow", glow != null ? glow.gameObject : null, ctx.Report);
            TestGroundFields.SetFloat(logic, "hintAfterSeconds", puzzle.HintAfterSeconds, ctx.Report);
            TestGroundFields.SetReferences(logic, "hints", hints.ToArray(), ctx.Report);
            TestGroundFields.SetReference(logic, "room", zone, ctx.Report);
            ctx.Report.Info("Rätsel Spiegel: " + mirrors.Count + " Spiegel, Lösung Ost/Nord/West laut Layout, Rußspuren als Hinweis.");
        }

        /// <summary>Creates a beam object (LineRenderer + <see cref="AetherBeamView"/> + end light).</summary>
        /// <param name="ctx">Context.</param>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <returns>The beam view.</returns>
        public static AetherBeamView CreateBeam(GruftContext ctx, Transform parent, string name)
        {
            Transform beamObject = GruftParts.Empty(parent, name, Vector3.zero);
            beamObject.position = Vector3.zero;
            LineRenderer line = beamObject.gameObject.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.positionCount = 0;
            line.widthMultiplier = 0.12f;
            line.numCapVertices = 4;
            line.sharedMaterial = ctx.Materials.AetherBeam;
            line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Transform end = GruftParts.Empty(beamObject, "Strahlende", Vector3.zero);
            Light light = end.gameObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = GruftMaterials.Parse(ctx.Layout.Atmosphere.AetherColor, Color.cyan);
            light.range = 4f;
            light.intensity = 2f;
            light.shadows = LightShadows.None;
            AetherBeamView view = beamObject.gameObject.AddComponent<AetherBeamView>();
            TestGroundFields.SetReference(view, "endLight", light, ctx.Report);
            return view;
        }

        private static void BuildTraps(GruftContext ctx)
        {
            Transform traps = GruftParts.Empty(ctx.Root, "Fallen", Vector3.zero);
            foreach (DungeonTrap trap in ctx.Layout.Traps)
            {
                var arrows = new List<Object>();
                Vector3 position = Vector3.zero;
                foreach (string slitId in trap.Slits)
                {
                    GameObject slit = ctx.Get(slitId);
                    Transform arrow = slit != null ? slit.transform.Find("Pfeil") : null;
                    if (arrow != null)
                    {
                        arrows.Add(arrow);
                        position = slit.transform.position;
                    }
                }

                Transform root = GruftParts.Empty(traps, string.IsNullOrEmpty(trap.Name) ? trap.Id : trap.Name, Vector3.zero);
                root.position = position;
                Component logic = GruftInstallers.AddGameplayComponent(root.gameObject, GruftInstallers.ArrowTrapType, ctx.Report);
                if (logic == null)
                {
                    continue;
                }

                TestGroundFields.SetString(logic, "trapId", trap.Id, ctx.Report);
                if (trap.Trigger.Type == DungeonTrigger.PuzzleFailed)
                {
                    TestGroundFields.SetString(logic, "puzzleId", trap.Trigger.Id, ctx.Report);
                }
                else if (trap.Trigger.Type == DungeonTrigger.PressurePlate)
                {
                    TestGroundFields.SetString(logic, "pressurePlateId", trap.Trigger.Id, ctx.Report);
                }

                TestGroundFields.SetFloat(logic, "healthFraction", trap.DamageFraction, ctx.Report);
                TestGroundFields.SetReferences(logic, "arrows", arrows.ToArray(), ctx.Report);
            }

            ctx.Report.Info("Gruft-Fallen: " + ctx.Layout.Traps.Count + " Pfeilfallen (je " + "10 % LP).");
        }

        private static void BuildLights(GruftContext ctx)
        {
            Transform lights = GruftParts.Empty(ctx.Root, "Lichter", Vector3.zero);
            DungeonAtmosphere atmosphere = ctx.Layout.Atmosphere;
            int index = 0;
            foreach (DungeonLight entry in ctx.Layout.Lights)
            {
                index++;
                Vector3 position = ctx.Position(entry.X, entry.Z, entry.Y, entry.EffectiveHeight);
                Transform root = GruftParts.Empty(lights, Kind(entry.Kind) + " " + index, Vector3.zero);
                root.position = position;
                Color fallback = entry.Kind == DungeonLight.Aether
                    ? GruftMaterials.Parse(atmosphere.AetherColor, Color.cyan)
                    : entry.Kind == DungeonLight.Daylight
                        ? GruftMaterials.Parse(atmosphere.DaylightColor, Color.white)
                        : GruftMaterials.Parse(atmosphere.TorchColor, new Color(1f, 0.6f, 0.3f));
                Light light = root.gameObject.AddComponent<Light>();
                light.type = LightType.Point;
                light.color = GruftMaterials.Parse(entry.Color, fallback);
                light.range = entry.Range;
                light.intensity = entry.Intensity;
                light.shadows = entry.Kind == DungeonLight.Brazier ? LightShadows.Soft : LightShadows.None;
                if (entry.Kind == DungeonLight.Torch)
                {
                    GruftParts.Part(root, "Fackel Stiel", PrimitiveType.Cylinder, new Vector3(0f, -0.3f, 0f), new Vector3(0.06f, 0.25f, 0.06f), ctx.Materials.Wood,
                        ctx.EnvironmentLayer, false);
                    GruftParts.Part(root, "Flamme", PrimitiveType.Sphere, new Vector3(0f, 0.02f, 0f), new Vector3(0.16f, 0.24f, 0.16f), ctx.Materials.Flame,
                        ctx.EnvironmentLayer, false);
                }
                else if (entry.Kind == DungeonLight.Brazier)
                {
                    float floor = position.y - entry.EffectiveHeight;
                    GruftParts.Part(root, "Feuerschale Fuss", PrimitiveType.Cylinder, new Vector3(0f, floor - position.y + 0.45f, 0f),
                        new Vector3(0.18f, 0.45f, 0.18f), ctx.Materials.Iron, ctx.EnvironmentLayer, true);
                    GruftParts.Part(root, "Feuerschale", PrimitiveType.Cylinder, new Vector3(0f, -0.35f, 0f), new Vector3(0.8f, 0.08f, 0.8f), ctx.Materials.Iron,
                        ctx.EnvironmentLayer, false);
                    GruftParts.Part(root, "Glut", PrimitiveType.Sphere, new Vector3(0f, -0.2f, 0f), new Vector3(0.5f, 0.25f, 0.5f), ctx.Materials.Flame,
                        ctx.EnvironmentLayer, false);
                }
            }

            ctx.Report.Info("Gruft-Licht: " + ctx.Layout.Lights.Count + " Punktlichter (Fackeln, Feuerschalen, Aether, Tageslicht), dunkles Umgebungslicht und Nebel.");
        }

        private static string Kind(string kind)
        {
            switch (kind)
            {
                case DungeonLight.Torch:
                    return "Fackel";
                case DungeonLight.Brazier:
                    return "Feuerschale";
                case DungeonLight.Aether:
                    return "Aetherlicht";
                default:
                    return "Tageslicht";
            }
        }

        private static void BuildAreas(GruftContext ctx)
        {
            Transform zones = GruftParts.Empty(ctx.Root, "Orte", Vector3.zero);
            foreach (DungeonArea area in ctx.Layout.Areas)
            {
                DungeonRect rect = area.Bounds;
                float floor = ctx.FloorNear(rect.CenterX, rect.CenterZ);
                Transform root = GruftParts.Empty(zones, area.Id, Vector3.zero);
                root.position = new Vector3(rect.CenterX, floor, rect.CenterZ);
                GruftParts.TriggerOn(root.gameObject, new Vector3(0f, 2f, 0f), new Vector3(rect.Width, 4f, rect.Depth), ctx.TriggerLayerOrDefault);
                AreaTrigger trigger = root.gameObject.AddComponent<AreaTrigger>();
                TestGroundFields.SetString(trigger, "areaId", area.LocationId, ctx.Report);
                TestGroundFields.SetInt(trigger, "playerLayers", ctx.PlayerLayer >= 0 ? 1 << ctx.PlayerLayer : 1, ctx.Report);
            }

            ctx.Report.Info("Orts-Zonen (AreaEntered für „Gehe zu“): " + ctx.Layout.Areas.Count + ".");
        }

        private static void BuildCheckpoints(GruftContext ctx)
        {
            foreach (DungeonCheckpoint checkpoint in ctx.Layout.Checkpoints)
            {
                DungeonRect rect = checkpoint.Bounds;
                float floor = ctx.FloorNear(rect.CenterX, rect.CenterZ);
                var root = new GameObject(string.IsNullOrEmpty(checkpoint.Name) ? checkpoint.Id : checkpoint.Name);
                root.transform.SetParent(ctx.Root, false);
                root.transform.position = new Vector3(rect.CenterX, floor, rect.CenterZ);
                GruftParts.TriggerOn(root, new Vector3(0f, 2f, 0f), new Vector3(rect.Width, 4f, rect.Depth), ctx.TriggerLayerOrDefault);
                PlayerPresenceZone zone = root.AddComponent<PlayerPresenceZone>();
                TestGroundFields.SetInt(zone, "playerLayers", ctx.PlayerLayer >= 0 ? 1 << ctx.PlayerLayer : 1, ctx.Report);
                Transform respawn = GruftParts.Empty(root.transform, "Wiedereinstieg", Vector3.zero);
                respawn.SetPositionAndRotation(ctx.Position(checkpoint.RespawnX, checkpoint.RespawnZ, float.NaN, 0f),
                    Quaternion.Euler(0f, checkpoint.RespawnYaw, 0f));
                CheckpointZone logic = root.AddComponent<CheckpointZone>();
                TestGroundFields.SetString(logic, "checkpointId", checkpoint.Id, ctx.Report);
                TestGroundFields.SetReference(logic, "spawnPoint", ctx.SpawnPoint, ctx.Report);
                TestGroundFields.SetReference(logic, "respawnPoint", respawn, ctx.Report);
                TestGroundFields.SetBool(logic, "autosave", checkpoint.Autosave, ctx.Report);
                ctx.Report.Info("Checkpoint " + checkpoint.Id + ": Wiedereinstieg bei (" + checkpoint.RespawnX + " | " + checkpoint.RespawnZ +
                                "), Autosave " + (checkpoint.Autosave ? "an" : "aus") + ".");
            }
        }

        private static float SizeX(DungeonObject o, float fallback)
        {
            return o.HasSize ? o.SizeX : fallback;
        }

        private static float SizeY(DungeonObject o, float fallback)
        {
            return o.HasSize ? o.SizeY : fallback;
        }

        private static float SizeZ(DungeonObject o, float fallback)
        {
            return o.HasSize ? o.SizeZ : fallback;
        }
    }
}
