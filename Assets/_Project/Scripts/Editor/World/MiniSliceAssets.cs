using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Dialogue;
using Aetherfall.Economy;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Items;
using Aetherfall.NPC;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Writes the data of the mini slice quests as assets and enters them in the content catalog: the flags, the quest item
    /// "Aether-Splitter vom Nordhang", the NPCs and dialogues of <see cref="MiniSliceDialogueLibrary"/> and the three quests of
    /// <see cref="MiniSliceQuestLibrary"/>. Assets are overwritten in place on every run (GUIDs and references stay), so the code
    /// libraries are the source. Also turns NPC markers into talking NPCs (<see cref="TryMakeTalkable"/>).
    /// </summary>
    public static class MiniSliceAssets
    {
        /// <summary>Folder of the quest assets of the region.</summary>
        public const string QuestFolder = "Assets/_Project/Data/Quests/Eichental";

        /// <summary>Quest item of outcome 3 of "Die Wölfe vom Nordhang".</summary>
        public const string SplinterItemPath = GruftPaths.QuestItemFolder + "/Aethersplitter_Nordhang.asset";

        /// <summary>Path of the NPC asset of an NPC id (<c>npc.eichental.bauer_hollmann</c> → <c>Npc_bauer_hollmann.asset</c>).</summary>
        /// <param name="npcId">NPC id.</param>
        public static string NpcPath(string npcId)
        {
            return TestGroundNpcBuilder.NpcFolder + "/Npc_" + LastPart(npcId) + ".asset";
        }

        /// <summary>Writes all assets, enters them in the catalog and checks the quests.</summary>
        /// <param name="catalog">Content catalog of the project.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the quest check found no error.</returns>
        public static bool CreateAll(ContentCatalog catalog, TestGroundReport report)
        {
            if (catalog == null)
            {
                report.Warning("Mini-Slice-Quests: kein Inhaltskatalog – Quests, NPCs und Dialoge werden nicht angelegt.");
                return false;
            }

            if (!TestGroundAssets.EnsureFolder(QuestFolder, report) || !TestGroundAssets.EnsureFolder(TestGroundNpcBuilder.FlagFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundNpcBuilder.NpcFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundNpcBuilder.DialogueFolder, report) || !TestGroundAssets.EnsureFolder(GruftPaths.QuestItemFolder, report))
            {
                report.Warning("Mini-Slice-Quests: Ordner fehlen – Abbruch.");
                return false;
            }

            var definitions = new List<GameDefinition>();
            FlagSpec[] flags = MiniSliceQuestLibrary.CreateFlags();
            for (int i = 0; i < flags.Length; i++)
            {
                definitions.Add(DialogueAssetWriter.WriteFlag(flags[i], TestGroundNpcBuilder.FlagFolder + "/Flag_" + LastPart(flags[i].Id) + ".asset"));
            }

            definitions.Add(EnsureSplinterItem(report));
            EnsureNamedEnemy("Boss_Glutfang", "boss.eichental.glutfang", "Glutfang", "Leitwolf vom Nordhang", report);
            EnsureNamedEnemy("Boss_Rissbrut_Prolog", "boss.eichental.rissbrut_prolog", "Rissbrut", "Aus dem Riss von Eichental", report);
            NpcSpec[] npcs = MiniSliceDialogueLibrary.CreateNpcs();
            for (int i = 0; i < npcs.Length; i++)
            {
                definitions.Add(DialogueAssetWriter.WriteNpc(npcs[i], NpcPath(npcs[i].Id)));
            }

            foreach (GameDefinition merchant in CreateMerchants(report))
            {
                if (merchant != null)
                {
                    definitions.Add(merchant);
                }
            }

            DialogueSpec[] dialogues = MiniSliceDialogueLibrary.CreateDialogues();
            for (int i = 0; i < dialogues.Length; i++)
            {
                definitions.Add(DialogueAssetWriter.WriteDialogue(dialogues[i], TestGroundNpcBuilder.DialogueFolder + "/Dlg_" + LastPart(dialogues[i].Id) + ".asset"));
            }

            QuestSpec[] quests = MiniSliceQuestLibrary.CreateQuests();
            for (int i = 0; i < quests.Length; i++)
            {
                string path = QuestFolder + "/Quest_" + LastPart(quests[i].Id) + ".asset";
                QuestDefinition asset = TestGroundSerialized.EnsureAsset<QuestDefinition>(path, report, null);
                if (asset == null)
                {
                    continue;
                }

                List<string> missing = QuestAssetWriter.WriteQuest(asset, quests[i]);
                if (missing.Count > 0)
                {
                    report.Warning(path + ": Felder nicht gefunden (Code umbenannt?): " + string.Join(", ", missing));
                }

                EditorUtility.SetDirty(asset);
                definitions.Add(asset);
            }

            int added = AddToCatalog(catalog, definitions);
            AssetDatabase.SaveAssets();
            report.Info("Mini-Slice: " + quests.Length + " Quests, " + dialogues.Length + " Dialoge, " + npcs.Length + " NPCs, " + flags.Length +
                        " Flags, 1 Questgegenstand geschrieben (" + added + " neu im Inhaltskatalog).");

            QuestValidationResult result = QuestValidationMenu.Run();
            report.Info("Quests geprüft: " + result.QuestCount + " Quest(s), " + result.Report.ErrorCount + " Fehler, " + result.Report.WarningCount + " Warnung(en).");
            foreach (ValidationIssue issue in result.Report.Issues)
            {
                if (issue.Severity == ValidationSeverity.Error)
                {
                    report.Warning("Quest-Prüfung " + issue.Code + " bei " + issue.Location + ": " + issue.Message);
                }
                else if (issue.Severity == ValidationSeverity.Warning)
                {
                    report.Info("Quest-Prüfung (Warnung) " + issue.Code + " bei " + issue.Location + ": " + issue.Message);
                }
            }

            return !result.Report.HasErrors;
        }

        /// <summary>Folder of the merchants.</summary>
        public const string MerchantFolder = "Assets/_Project/Data/Merchants";

        /// <summary>Tobold's smithy in Lindenhain (GDD 04 8.2: weaponsmith, gold base 800).</summary>
        public const string SmithyMerchant = "merchant.eichental.schmiede_lindenhain";

        /// <summary>Ulf's inn "Zum Krummen Kessel" (general goods, gold base 400).</summary>
        public const string InnMerchant = "merchant.eichental.krummer_kessel";

        /// <summary>
        /// The two merchants of Lindenhain (Stufe A, GDD 00): Tobold sells one-handed weapons, shields and plate (weapon types of
        /// the slice, GDD 03 5.3), Ulf healing potions and light armour. Eichental has plenty of food and lacks Aether crystals
        /// (GDD 04 8.4, region factors).
        /// </summary>
        private static IEnumerable<GameDefinition> CreateMerchants(TestGroundReport report)
        {
            if (!TestGroundAssets.EnsureFolder(MerchantFolder, report))
            {
                yield break;
            }

            string[] surplus = { "item.material.wolfsfleisch" };
            string[] scarce = { "item.material.wolfspelz_aether" };
            yield return WriteMerchant("Merchant_schmiede_lindenhain", SmithyMerchant, MiniSliceDialogueLibrary.Tobold, "Tobolds Schmiede",
                MerchantKind.Weaponsmith, 800, new[]
                {
                    new MerchantStockEntry("item.weapon.einhandschwert_eisen", 2), new MerchantStockEntry("item.weapon.streitkolben_eisen", 1),
                    new MerchantStockEntry("item.weapon.holzschild", 2), new MerchantStockEntry("item.weapon.eisenschild", 1),
                    new MerchantStockEntry("item.armor.eisenhelm", 1), new MerchantStockEntry("item.armor.panzerhandschuhe", 1),
                    new MerchantStockEntry("item.armor.plattenharnisch", 1), new MerchantStockEntry("item.armor.plattenbeinschienen", 1),
                    new MerchantStockEntry("item.armor.plattenstiefel", 1)
                }, surplus, scarce, report);
            yield return WriteMerchant("Merchant_krummer_kessel", InnMerchant, MiniSliceDialogueLibrary.Ulf, "Ulfs Waren",
                MerchantKind.General, 400, new[]
                {
                    new MerchantStockEntry("item.potion.heiltrank_schwach", 10), new MerchantStockEntry("item.armor.lederkappe", 1),
                    new MerchantStockEntry("item.armor.lederwams", 1), new MerchantStockEntry("item.armor.lederhose", 1),
                    new MerchantStockEntry("item.armor.lederhandschuhe", 1), new MerchantStockEntry("item.armor.lederstiefel", 1),
                    new MerchantStockEntry("item.armor.stoffkappe", 1), new MerchantStockEntry("item.armor.stoffhandschuhe", 1),
                    new MerchantStockEntry("item.armor.stoffschuhe", 1), new MerchantStockEntry("item.armor.wollumhang", 1),
                    new MerchantStockEntry("item.trinket.eisenring", 1)
                }, surplus, scarce, report);
        }

        private static MerchantDefinition WriteMerchant(string file, string id, string npcId, string name, MerchantKind kind, int goldBase,
            MerchantStockEntry[] stock, string[] surplus, string[] scarce, TestGroundReport report)
        {
            string path = MerchantFolder + "/" + file + ".asset";
            MerchantDefinition merchant = TestGroundSerialized.EnsureAsset<MerchantDefinition>(path, report, null);
            if (merchant == null)
            {
                return null;
            }

            merchant.EditorSetUp(npcId, name, kind, goldBase, 5, stock, surplus, scarce);
            var serialized = new SerializedObject(merchant);
            serialized.FindProperty("id").stringValue = id;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(merchant);
            report.Info("Händler " + id + ": " + stock.Length + " Waren, Gold " + merchant.MaxGold + ".");
            return merchant;
        }

        /// <summary>
        /// Makes an NPC marker talkable if the NPC has an asset: trigger "Interaktion" on the Interactable layer, chest point,
        /// <see cref="NpcLookAt"/> towards the player and <see cref="NpcInteractable"/> with the NPC's default dialogue.
        /// </summary>
        /// <param name="root">Marker root (pivot on the ground).</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="player">Player object (look target, may be null).</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the NPC can be talked to.</returns>
        public static bool TryMakeTalkable(GameObject root, string npcId, GameObject player, int interactableLayer, TestGroundReport report)
        {
            var npc = AssetDatabase.LoadAssetAtPath<NpcDefinition>(NpcPath(npcId));
            if (npc == null)
            {
                return false;
            }

            var chest = new GameObject("Brust");
            chest.transform.SetParent(root.transform, false);
            chest.transform.localPosition = new Vector3(0f, 1.5f, 0f);

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(root.transform, false);
            trigger.layer = interactableLayer >= 0 ? interactableLayer : 0;
            CapsuleCollider capsule = trigger.AddComponent<CapsuleCollider>();
            capsule.isTrigger = true;
            capsule.center = new Vector3(0f, 0.9f, 0f);
            capsule.height = 1.8f;
            capsule.radius = 0.7f;

            NpcLookAt look = root.AddComponent<NpcLookAt>();
            TestGroundFields.SetReference(look, "lookTarget", player != null ? player.transform : null, report);
            NpcInteractable interactable = root.AddComponent<NpcInteractable>();
            TestGroundFields.SetReference(interactable, "npc", npc, report);
            TestGroundFields.SetReference(interactable, "interactionPoint", chest.transform, report);
            TestGroundFields.SetReference(interactable, "lookAt", look, report);
            return true;
        }

        /// <summary>
        /// Named enemy of the layout (spawner with a boss id) as <see cref="Aetherfall.AI.Bosses.BossDefinition"/>: gives the
        /// quest objective "Töte bestimmten Gegner" a known id. Built on the Aether wolf until the own enemy types exist.
        /// </summary>
        private static void EnsureNamedEnemy(string file, string bossId, string displayName, string title, TestGroundReport report)
        {
            var aetherWolf = AssetDatabase.LoadAssetAtPath<Aetherfall.AI.EnemyTypeDefinition>(TestGroundPaths.EnemyFolder + "/AetherWolf.asset");
            TestGroundSerialized.EnsureAsset<Aetherfall.AI.Bosses.BossDefinition>(TestGroundPaths.EnemyFolder + "/" + file + ".asset", report, so =>
            {
                TestGroundSerialized.Set(so, "bossId", bossId, report);
                TestGroundSerialized.Set(so, "displayName", displayName, report);
                TestGroundSerialized.Set(so, "title", title, report);
                TestGroundSerialized.Set(so, "baseType", aetherWolf, report);
            });
        }

        private static ItemDefinition EnsureSplinterItem(TestGroundReport report)
        {
            return TestGroundSerialized.EnsureAsset<ItemDefinition>(SplinterItemPath, report, so =>
            {
                TestGroundSerialized.Set(so, "id", MiniSliceQuestLibrary.SplinterItem, report);
                TestGroundSerialized.Set(so, "displayName", "Aether-Splitter vom Nordhang", report);
                TestGroundSerialized.Set(so, "description", "Ein Splitter aus reinem Aether, herausgebrochen aus dem Fels im Wolfsbau. Er leuchtet von innen.", report);
                TestGroundSerialized.Set(so, "category", (int)ItemCategory.QuestItem, report);
                TestGroundSerialized.Set(so, "equipKind", (int)EquipKind.None, report);
                TestGroundSerialized.Set(so, "stackSize", 1, report);
                TestGroundSerialized.Set(so, "weight", 0.5f, report);
                TestGroundSerialized.Set(so, "value", 150f, report);
                TestGroundSerialized.Set(so, "baseRarity", (int)ItemRarity.Uncommon, report);
                TestGroundSerialized.Set(so, "questItem", true, report);
                TestGroundSerialized.Set(so, "randomDrop", false, report);
            });
        }

        private static int AddToCatalog(ContentCatalog catalog, List<GameDefinition> definitions)
        {
            var serialized = new SerializedObject(catalog);
            SerializedProperty list = serialized.FindProperty("definitions");
            var present = new HashSet<Object>();
            for (int i = 0; i < list.arraySize; i++)
            {
                present.Add(list.GetArrayElementAtIndex(i).objectReferenceValue);
            }

            int added = 0;
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] == null || !present.Add(definitions[i]))
                {
                    continue;
                }

                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = definitions[i];
                added++;
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
            return added;
        }

        private static string LastPart(string id)
        {
            int dot = id.LastIndexOf('.');
            return dot >= 0 && dot < id.Length - 1 ? id.Substring(dot + 1) : id;
        }
    }
}
