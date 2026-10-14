using Aetherfall.DevTools;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Items and loot part of the test ground: the loot root (<see cref="LootBeamPool"/>, <see cref="LootWorldSpawner"/>),
    /// three chests (wooden, iron, hidden; GDD 04 5.6) north-east of the spawn, the player components
    /// <see cref="PlayerInteractor"/>, <see cref="PlayerLootCollector"/> and <see cref="PlayerEquipment"/>, and the overlays
    /// <see cref="InventoryDebugOverlay"/> (Tab) and <see cref="InteractionPromptOverlay"/>. Called by
    /// <see cref="TestGroundSceneBuilder"/> after the combat part.
    /// </summary>
    /// <remarks>Chests at x = 5 / 8 / 11, z = 5, the front facing the spawn; guide: docs/Anleitungen/06_Test_Items_Loot.md.</remarks>
    public static class TestGroundItemBuilder
    {
        /// <summary>Stable id of the wooden chest.</summary>
        public const string WoodenChestId = "obj.test.truhe_holz";

        /// <summary>Stable id of the iron chest.</summary>
        public const string IronChestId = "obj.test.truhe_eisen";

        /// <summary>Stable id of the hidden chest.</summary>
        public const string HiddenChestId = "obj.test.truhe_versteckt";

        private const float ChestWidth = 1.0f;
        private const float ChestHeight = 0.6f;
        private const float ChestDepth = 0.6f;
        private const float LidHeight = 0.14f;

        /// <summary>Builds the loot root and the chests and equips the player with interaction, loot collection and equipment.</summary>
        /// <param name="player">Player root (with combat components).</param>
        /// <param name="items">Item assets (materials).</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="pickupLayer">Pickup layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="labelFont">Font of the signs (may be null).</param>
        /// <param name="report">Protocol.</param>
        public static void Build(GameObject player, TestGroundItemAssets items, int interactableLayer, int pickupLayer, int environmentLayer,
            Font labelFont, TestGroundReport report)
        {
            BuildLootRoot(items, pickupLayer, report);
            var chests = new GameObject("Truhen");
            chests.transform.position = new Vector3(8f, 0f, 5f);
            CreateLabel(chests.transform, "Truhen (E / A: öffnen)", new Vector3(0f, 2.2f, 0f), labelFont, 0.05f);
            BuildChest(chests.transform, "Holztruhe", WoodenChestId, TestGroundLootTableAssets.WoodenChestTableId, ChestTier.Wooden,
                new Vector3(-3f, 0f, 0f), items.WoodMaterial, interactableLayer, environmentLayer, labelFont, report);
            BuildChest(chests.transform, "Eisentruhe", IronChestId, TestGroundLootTableAssets.IronChestTableId, ChestTier.Iron,
                new Vector3(0f, 0f, 0f), items.IronMaterial, interactableLayer, environmentLayer, labelFont, report);
            BuildChest(chests.transform, "Versteckte Truhe", HiddenChestId, TestGroundLootTableAssets.HiddenChestTableId, ChestTier.Hidden,
                new Vector3(3f, 0f, 0f), items.HiddenMaterial, interactableLayer, environmentLayer, labelFont, report);
            report.Info("Truhen bei (5 | 5), (8 | 5) und (11 | 5): Holztruhe (Loot-Qualität 1), Eisentruhe (2), versteckte Truhe (3: Beute " +
                        "mindestens selten), Gebietslevel " + TestGroundPaths.AreaLevel + ". Jede lässt sich einmal öffnen; der Spielstand merkt es sich.");

            SetUpPlayer(player, interactableLayer, pickupLayer, report);
        }

        /// <summary>Inventory overlay (Tab) and interaction prompt; links the status overlay with the equipment.</summary>
        /// <param name="player">Player root (with <see cref="PlayerEquipment"/> and <see cref="PlayerInteractor"/>).</param>
        /// <param name="status">Status overlay of the scene (may be null).</param>
        /// <param name="report">Protocol.</param>
        public static void CreateOverlays(GameObject player, PlayerStatusDebugOverlay status, TestGroundReport report)
        {
            PlayerEquipment equipment = player.GetComponent<PlayerEquipment>();
            InventoryDebugOverlay inventory = new GameObject("InventoryOverlay").AddComponent<InventoryDebugOverlay>();
            TestGroundFields.SetReference(inventory, "player", player.transform, report);
            TestGroundFields.SetReference(inventory, "playerEquipment", equipment, report);

            InteractionPromptOverlay prompt = new GameObject("InteractionPrompt").AddComponent<InteractionPromptOverlay>();
            TestGroundFields.SetReference(prompt, "interactor", player.GetComponent<PlayerInteractor>(), report);

            if (status != null)
            {
                TestGroundFields.SetReference(status, "playerEquipment", equipment, report);
            }

            report.Info("Debug-Inventar „InventoryOverlay“ (Tab öffnet/schließt, Maus: Klick = an-/ablegen, Rechtsklick = fallen lassen) und " +
                        "Interaktions-Hinweis „InteractionPrompt“ (Bildmitte unten).");
        }

        internal static void BuildLootRoot(TestGroundItemAssets items, int pickupLayer, TestGroundReport report)
        {
            var root = new GameObject("Loot");
            LootBeamPool beams = root.AddComponent<LootBeamPool>();
            TestGroundFields.SetReference(beams, "beamMaterial", items.BeamMaterial, report);
            TestGroundFields.SetInt(beams, "maxBeams", LootBeamPool.DefaultMaxBeams, report);
            TestGroundFields.SetInt(beams, "minimumRarity", (int)ItemRarity.Rare, report);

            LootWorldSpawner spawner = root.AddComponent<LootWorldSpawner>();
            TestGroundFields.SetReference(spawner, "beams", beams, report);
            TestGroundFields.SetReference(spawner, "pickupMaterial", items.PickupMaterial, report);
            TestGroundFields.SetInt(spawner, "pickupLayer", pickupLayer >= 0 ? pickupLayer : 0, report);
            report.Info("Beute in der Welt: „Loot“ mit LootWorldSpawner (Würfel in Seltenheitsfarbe, Gold goldfarben) und Lichtsäulen " +
                        "(LootBeamPool, höchstens " + LootBeamPool.DefaultMaxBeams + ", ab „Selten“, GDD 04 7.2).");
        }

        private static void BuildChest(Transform parent, string name, string chestId, string tableId, ChestTier tier, Vector3 localPosition,
            Material material, int interactableLayer, int environmentLayer, Font labelFont, TestGroundReport report)
        {
            // Front (local +Z) towards the spawn in the south.
            BuildChest(parent, name, chestId, tableId, tier, localPosition, 180f, TestGroundPaths.AreaLevel, material, interactableLayer,
                environmentLayer, labelFont, report);
        }

        /// <summary>Builds one chest with its lid, interaction trigger, <see cref="LootChest"/> and name sign.</summary>
        /// <param name="parent">Parent transform.</param>
        /// <param name="name">Display name (German).</param>
        /// <param name="chestId">Stable object id.</param>
        /// <param name="tableId">Loot table id.</param>
        /// <param name="tier">Chest quality.</param>
        /// <param name="localPosition">Position relative to the parent.</param>
        /// <param name="localYaw">Rotation around y in degrees (the front faces local +Z).</param>
        /// <param name="areaLevel">Area level (item level of the loot, GDD 04 4.1).</param>
        /// <param name="material">Material of body and lid.</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="labelFont">Font of the sign (may be null).</param>
        /// <param name="report">Protocol.</param>
        internal static void BuildChest(Transform parent, string name, string chestId, string tableId, ChestTier tier, Vector3 localPosition,
            float localYaw, int areaLevel, Material material, int interactableLayer, int environmentLayer, Font labelFont, TestGroundReport report)
        {
            var chest = new GameObject(name);
            chest.transform.SetParent(parent, false);
            chest.transform.localPosition = localPosition;
            chest.transform.localRotation = Quaternion.Euler(0f, localYaw, 0f);

            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "Korpus";
            body.transform.SetParent(chest.transform, false);
            body.transform.localPosition = new Vector3(0f, ChestHeight * 0.5f, 0f);
            body.transform.localScale = new Vector3(ChestWidth, ChestHeight, ChestDepth);
            body.layer = environmentLayer;
            SetMaterial(body, material);

            // Lid hinge at the back top edge: the lid swings up and back when opened (LootChest, angle −105°).
            var hinge = new GameObject("Deckel");
            hinge.transform.SetParent(chest.transform, false);
            hinge.transform.localPosition = new Vector3(0f, ChestHeight, -ChestDepth * 0.5f);
            GameObject lid = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lid.name = "Deckel Platte";
            lid.transform.SetParent(hinge.transform, false);
            lid.transform.localPosition = new Vector3(0f, LidHeight * 0.5f, ChestDepth * 0.5f);
            lid.transform.localScale = new Vector3(ChestWidth + 0.04f, LidHeight, ChestDepth + 0.04f);
            Object.DestroyImmediate(lid.GetComponent<Collider>());
            SetMaterial(lid, material);

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(chest.transform, false);
            trigger.layer = interactableLayer >= 0 ? interactableLayer : 0;
            BoxCollider box = trigger.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = new Vector3(0f, ChestHeight * 0.5f, 0f);
            box.size = new Vector3(ChestWidth + 0.2f, ChestHeight + 0.3f, ChestDepth + 0.2f);

            LootChest logic = chest.AddComponent<LootChest>();
            TestGroundFields.SetString(logic, "chestId", chestId, report);
            TestGroundFields.SetString(logic, "lootTableId", tableId, report);
            TestGroundFields.SetInt(logic, "tier", (int)tier, report);
            TestGroundFields.SetInt(logic, "areaLevel", areaLevel, report);
            TestGroundFields.SetString(logic, "displayName", name, report);
            TestGroundFields.SetReference(logic, "lid", hinge.transform, report);

            CreateLabel(chest.transform, name, new Vector3(0f, 1.35f, 0f), labelFont, 0.03f);
        }

        internal static void SetUpPlayer(GameObject player, int interactableLayer, int pickupLayer, TestGroundReport report)
        {
            int interactMask = 0;
            if (interactableLayer >= 0)
            {
                interactMask |= 1 << interactableLayer;
            }

            if (pickupLayer >= 0)
            {
                interactMask |= 1 << pickupLayer;
            }

            PlayerInteractor interactor = player.AddComponent<PlayerInteractor>();
            TestGroundFields.SetInt(interactor, "interactionLayers", interactMask, report);
            TestGroundFields.SetString(interactor, "interactorId", "player", report);
            if (player.TryGetComponent(out PlayerInputReader reader))
            {
                TestGroundFields.SetReference(reader, "interactor", interactor, report);
            }

            PlayerLootCollector collector = player.AddComponent<PlayerLootCollector>();
            TestGroundFields.SetInt(collector, "pickupLayers", pickupLayer >= 0 ? 1 << pickupLayer : 0, report);

            AddPlayerEquipment(player, report);
            report.Info("Spieler-Items: PlayerInteractor (2 m vor der Figur, Layer Interactable und Pickup), PlayerLootCollector (automatisch " +
                        "aufheben: Gold und Materialien) und PlayerEquipment (Startausrüstung des Kriegers aus GDD 03 11.2: Waffenschaden und " +
                        "Rüstung kommen jetzt aus der angelegten Ausrüstung).");
        }

        /// <summary>
        /// Adds <see cref="PlayerEquipment"/> with the weapon models it shows and hides: the sword ("SwordHand/Schwert", the
        /// cube placeholder without model: the whole pivot), the shield ("ShieldHand/Holzschild" or "Shield") and the models of
        /// the other weapon types ("SwordHand/Zauberstab", "SwordHand/Streitkolben") and the bow (in the hand "ShieldHand/Jagdbogen",
        /// on the back "Jagdbogen_Ruecken"); the grip stays, so the hand holds whichever weapon is shown.
        /// </summary>
        /// <param name="player">Player root.</param>
        /// <param name="report">Protocol.</param>
        internal static void AddPlayerEquipment(GameObject player, TestGroundReport report)
        {
            PlayerEquipment equipment = player.AddComponent<PlayerEquipment>();
            TestGroundFields.SetReference(equipment, "stats", player.GetComponent<CharacterStatsComponent>(), report);
            TestGroundFields.SetReference(equipment, "combat", player.GetComponent<PlayerCombatController>(), report);
            TestGroundFields.SetReference(equipment, "motor", player.GetComponent<PlayerMotor>(), report);
            Transform swordHand = Child(player.transform, "SwordHand");
            Transform shieldHand = Child(player.transform, "ShieldHand");
            Transform sword = Child(swordHand, "Schwert") ?? swordHand;
            Transform shield = Child(shieldHand, "Holzschild") ?? Child(shieldHand, "Shield");
            TestGroundFields.SetReference(equipment, "weaponVisual", sword != null ? sword.gameObject : null, report);
            TestGroundFields.SetReference(equipment, "shieldVisual", shield != null ? shield.gameObject : null, report);
            var typeModels = new[]
            {
                (WeaponType.Staff, Child(swordHand, "Zauberstab")),
                (WeaponType.Mace, Child(swordHand, "Streitkolben"))
            };
            var serialized = new SerializedObject(equipment);
            SerializedProperty visuals = serialized.FindProperty("typeVisuals");
            visuals.arraySize = 0;
            foreach ((WeaponType type, Transform model) in typeModels)
            {
                if (model == null)
                {
                    continue;
                }

                int index = visuals.arraySize;
                visuals.arraySize = index + 1;
                visuals.GetArrayElementAtIndex(index).FindPropertyRelative("type").intValue = (int)type;
                visuals.GetArrayElementAtIndex(index).FindPropertyRelative("visual").objectReferenceValue = model.gameObject;
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            Transform bowInHand = Child(shieldHand, "Jagdbogen");
            Transform bowOnBack = CharacterModels.Find(player.transform, "Jagdbogen_Ruecken");
            TestGroundFields.SetReference(equipment, "bowVisual", bowInHand != null ? bowInHand.gameObject : null, report);
            TestGroundFields.SetReference(equipment, "bowBackVisual", bowOnBack != null ? bowOnBack.gameObject : null, report);
            if (sword == null || shield == null)
            {
                report.Warning("Schwert- oder Schild-Modell am Spieler fehlt – das Ein- und Ausblenden beim Ablegen funktioniert nicht.");
            }
        }

        private static Transform Child(Transform parent, string name)
        {
            if (parent == null)
            {
                return null;
            }

            for (int i = 0; i < parent.childCount; i++)
            {
                Transform child = parent.GetChild(i);
                if (child.name == name)
                {
                    return child;
                }
            }

            return null;
        }

        private static void SetMaterial(GameObject target, Material material)
        {
            if (material != null && target.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }

        private static void CreateLabel(Transform parent, string text, Vector3 localPosition, Font font, float characterSize)
        {
            if (font == null)
            {
                return;
            }

            var label = new GameObject("Label " + text);
            label.transform.SetParent(parent, false);
            label.transform.localPosition = localPosition;

            // Readable from the spawn point like the other signs: the text faces away from the origin (TextMesh reads along +Z).
            Vector3 position = label.transform.position;
            var flat = new Vector3(position.x, 0f, position.z);
            label.transform.rotation = flat.sqrMagnitude > 0.01f ? Quaternion.LookRotation(flat.normalized, Vector3.up) : Quaternion.identity;
            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = font;
            mesh.fontSize = 64;
            mesh.characterSize = characterSize;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = Color.white;
            if (label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = WorldTextMaterial.For(font);
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }
    }
}
