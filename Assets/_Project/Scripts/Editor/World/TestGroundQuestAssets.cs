using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using UnityEditor;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Quest data of the test ground (guide 09): the flag definitions and the two test quests of
    /// <see cref="TestGroundQuestLibrary"/> as assets in <c>Data/WorldState/Test</c> and <c>Data/Quests/Test</c>, entered in the
    /// content catalog, then checked with the quest validator (the same check as "Aetherfall > Quests pruefen").
    /// </summary>
    /// <remarks>
    /// Existing assets are kept unchanged (they may have been tuned in the inspector). To get the newest version of a test
    /// quest, delete its asset and run the menu again.
    /// </remarks>
    public sealed class TestGroundQuestAssets
    {
        private readonly TestGroundReport _report;
        private readonly List<GameDefinition> _definitions = new List<GameDefinition>();

        /// <summary>Creates or loads the assets and enters them in the catalog.</summary>
        /// <param name="catalog">Content catalog (may be null: then the quests are not registered).</param>
        /// <param name="report">Protocol.</param>
        public TestGroundQuestAssets(ContentCatalog catalog, TestGroundReport report)
        {
            _report = report;
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.QuestFolder, report) || !TestGroundAssets.EnsureFolder(TestGroundPaths.FlagFolder, report))
            {
                report.Warning("Ordner für die Test-Quests fehlen – Quests nicht angelegt.");
                return;
            }

            FlagSpec[] flags = TestGroundQuestLibrary.CreateFlags();
            for (int i = 0; i < flags.Length; i++)
            {
                EnsureFlag(flags[i]);
            }

            QuestSpec[] quests = TestGroundQuestLibrary.CreateQuests();
            for (int i = 0; i < quests.Length; i++)
            {
                EnsureQuest(quests[i]);
            }

            if (catalog == null)
            {
                report.Warning("Kein Inhaltskatalog – die Test-Quests sind im Spiel nicht bekannt.");
                return;
            }

            AddToCatalog(catalog);
        }

        /// <summary>Number of quest and flag assets of the test ground.</summary>
        public int Count => _definitions.Count;

        /// <summary>
        /// Saves the assets and checks every quest of the project with the validator (GDD 02 10.2). Errors and warnings go into
        /// the protocol.
        /// </summary>
        /// <returns>True if no quest has an error.</returns>
        public bool Validate()
        {
            AssetDatabase.SaveAssets();
            QuestValidationResult result = QuestValidationMenu.Run();
            ValidationReport report = result.Report;
            _report.Info("Quests geprüft (wie „" + QuestValidationMenu.MenuPath + "“): " + result.QuestCount + " Quest(s), " + report.ErrorCount +
                         " Fehler, " + report.WarningCount + " Warnung(en).");
            IReadOnlyList<ValidationIssue> issues = report.Issues;
            for (int i = 0; i < issues.Count; i++)
            {
                ValidationIssue issue = issues[i];
                if (issue.Severity == ValidationSeverity.Error)
                {
                    _report.Warning("Quest-Prüfung " + issue.Code + " bei " + issue.Location + ": " + issue.Message);
                }
                else if (issue.Severity == ValidationSeverity.Warning)
                {
                    _report.Info("Quest-Prüfung (Warnung) " + issue.Code + " bei " + issue.Location + ": " + issue.Message);
                }
            }

            return !report.HasErrors;
        }

        private void EnsureFlag(FlagSpec spec)
        {
            string path = TestGroundPaths.FlagFolder + "/" + FileName(spec.Id) + ".asset";
            FlagDefinition asset = AssetDatabase.LoadAssetAtPath<FlagDefinition>(path);
            if (asset == null)
            {
                asset = TestGroundSerialized.EnsureAsset<FlagDefinition>(path, _report, null);
                if (asset == null)
                {
                    return;
                }

                ReportMissing(QuestAssetWriter.WriteFlag(asset, spec), path);
            }
            else
            {
                _report.Info("Vorhanden (unverändert): " + path);
            }

            _definitions.Add(asset);
        }

        private void EnsureQuest(QuestSpec spec)
        {
            string path = TestGroundPaths.QuestFolder + "/" + FileName(spec.Id) + ".asset";
            QuestDefinition asset = AssetDatabase.LoadAssetAtPath<QuestDefinition>(path);
            if (asset == null)
            {
                asset = TestGroundSerialized.EnsureAsset<QuestDefinition>(path, _report, null);
                if (asset == null)
                {
                    return;
                }

                ReportMissing(QuestAssetWriter.WriteQuest(asset, spec), path);
                _report.Info("Quest „" + spec.Title + "“ (" + spec.Id + ") mit " + spec.Stages.Count + " Stages angelegt.");
            }
            else
            {
                _report.Info("Vorhanden (unverändert): " + path + " – zum Erneuern löschen und das Menü erneut ausführen.");
            }

            _definitions.Add(asset);
        }

        private void ReportMissing(List<string> missing, string path)
        {
            if (missing.Count > 0)
            {
                _report.Warning(path + ": Felder nicht gefunden (Code umbenannt?): " + string.Join(", ", missing));
            }
        }

        private void AddToCatalog(ContentCatalog catalog)
        {
            var so = new SerializedObject(catalog);
            SerializedProperty list = TestGroundSerialized.Property(so, "definitions", _report);
            if (list == null)
            {
                return;
            }

            var present = new HashSet<Object>();
            for (int i = 0; i < list.arraySize; i++)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry != null)
                {
                    present.Add(entry);
                }
            }

            int added = 0;
            for (int i = 0; i < _definitions.Count; i++)
            {
                if (_definitions[i] == null || present.Contains(_definitions[i]))
                {
                    continue;
                }

                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = _definitions[i];
                added++;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
            _report.Info("Inhaltskatalog: " + _definitions.Count + " Test-Quest-Daten (Quests und Flags), " + added + " neu eingetragen.");
        }

        private static string FileName(string id)
        {
            // quest.side.test.wolfsjagd -> Quest_side_test_wolfsjagd (readable, unique, no dots in the file name).
            string name = id.Replace('.', '_');
            return name.Length > 0 ? char.ToUpperInvariant(name[0]) + name.Substring(1) : "Unbenannt";
        }
    }
}
