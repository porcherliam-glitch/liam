using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step d) of the project setup (architecture 2.2 #9): removes the sample content of the "Universal 3D" template
    /// and moves its settings assets below <c>Assets/_Project/Settings/</c> with <c>AssetDatabase.MoveAsset</c>, so
    /// their GUIDs (and all references, e.g. from Graphics and Quality settings) stay intact. Asks before acting and
    /// only touches what exists. Deleted items go to the system trash (recoverable).
    /// </summary>
    [Serializable]
    internal sealed class TemplateCleanupStep : SetupStep
    {
        private const string TemplateSettingsFolder = "Assets/Settings";
        private const string SampleScenePath = "Assets/Scenes/SampleScene.unity";
        private const string TemplateScenesFolder = "Assets/Scenes";
        private const string TemplateBuildProfilesFolderName = "Build Profiles";
        private const string BuildSettingsFolder = SetupPaths.ProjectFolder + "/Settings/Build";

        /// <inheritdoc />
        public override string Letter => "d";

        /// <inheritdoc />
        public override string Title => "Template aufräumen";

        /// <inheritdoc />
        public override string Description =>
            "Verschiebt Assets/TutorialInfo, Assets/Readme.asset und die Beispielszene in den Papierkorb und verschiebt Assets/Settings " +
            "nach Assets/_Project/Settings/Rendering sowie die Input-Actions des Templates nach Assets/_Project/Settings/Input " +
            "(GUIDs bleiben erhalten). Fragt vorher nach.";

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            List<string> deletions = CollectDeletions();
            List<KeyValuePair<string, string>> moves = CollectMoves();
            List<string> emptyFolders = CollectFoldersThatBecomeEmpty(deletions, moves);

            if (deletions.Count == 0 && moves.Count == 0 && emptyFolders.Count == 0)
            {
                log.Info("d) Template ist bereits aufgeräumt. Nichts zu tun.");
                return;
            }

            if (!SetupDialogs.Confirm("Template aufräumen?", BuildDialogText(deletions, moves, emptyFolders), "Aufräumen", "Abbrechen"))
            {
                log.Info("d) Abgebrochen – nichts verändert.");
                return;
            }

            if (deletions.Contains(SampleScenePath) && !CloseSampleSceneIfOpen(log))
            {
                return;
            }

            for (int i = 0; i < moves.Count; i++)
            {
                MoveAsset(moves[i].Key, moves[i].Value, log);
            }

            for (int i = 0; i < deletions.Count; i++)
            {
                TrashAsset(deletions[i], log);
            }

            string[] foldersToCheck = { TemplateSettingsFolder + "/" + TemplateBuildProfilesFolderName, TemplateSettingsFolder, TemplateScenesFolder };
            for (int i = 0; i < foldersToCheck.Length; i++)
            {
                if (AssetDatabase.IsValidFolder(foldersToCheck[i]) && AssetFolderUtility.IsEmptyExceptPlaceholders(foldersToCheck[i]))
                {
                    TrashAsset(foldersToCheck[i], log);
                }
            }

            AssetDatabase.SaveAssets();
            log.Info("d) Template aufgeräumt. Gelöschtes liegt im Papierkorb des Systems.");
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            List<string> deletions = CollectDeletions();
            List<KeyValuePair<string, string>> moves = CollectMoves();

            for (int i = 0; i < deletions.Count; i++)
            {
                items.Add(new SetupCheckItem(deletions[i], SetupStatus.Open, "Template-Inhalt – wird in den Papierkorb verschoben"));
            }

            for (int i = 0; i < moves.Count; i++)
            {
                bool blocked = AssetFolderUtility.Exists(moves[i].Value);
                items.Add(new SetupCheckItem(moves[i].Key, blocked ? SetupStatus.Unknown : SetupStatus.Open,
                    blocked
                        ? "Ziel " + moves[i].Value + " existiert schon – wird nicht überschrieben. Bitte von Hand vergleichen und eine Datei entfernen."
                        : "wird verschoben nach " + moves[i].Value + " (GUID bleibt)"));
            }

            string[] templateFolders = { TemplateSettingsFolder, TemplateScenesFolder };
            bool emptyTemplateFolder = false;
            for (int i = 0; i < templateFolders.Length; i++)
            {
                if (AssetDatabase.IsValidFolder(templateFolders[i]) && AssetFolderUtility.IsEmptyExceptPlaceholders(templateFolders[i]))
                {
                    emptyTemplateFolder = true;
                    items.Add(new SetupCheckItem(templateFolders[i], SetupStatus.Open, "leerer Template-Ordner – wird entfernt"));
                }
            }

            if (deletions.Count == 0 && moves.Count == 0 && !emptyTemplateFolder)
            {
                items.Add(new SetupCheckItem("Template-Inhalte", SetupStatus.Done, "keine Beispielinhalte im Assets-Hauptordner"));
            }

            List<string> unexpected = CollectUnexpectedRootEntries(deletions, moves);
            if (unexpected.Count > 0)
            {
                items.Add(new SetupCheckItem("Weitere Einträge im Assets-Hauptordner", SetupStatus.Unknown,
                    string.Join(", ", unexpected) + " – nur ein Hinweis: Eigene Inhalte gehören nach Assets/_Project/, Fremd-Assets nach Assets/ThirdParty/ (§5)."));
            }
        }

        private static List<string> CollectDeletions()
        {
            var result = new List<string>();
            string[] candidates = { "Assets/TutorialInfo", "Assets/Readme.asset", SampleScenePath };
            for (int i = 0; i < candidates.Length; i++)
            {
                if (AssetFolderUtility.Exists(candidates[i]))
                {
                    result.Add(candidates[i]);
                }
            }

            return result;
        }

        private static List<KeyValuePair<string, string>> CollectMoves()
        {
            var moves = new List<KeyValuePair<string, string>>();

            // Content of Assets/Settings (URP assets, renderers, volume profiles, global settings) -> Settings/Rendering.
            // Exception: Unity 6 saves new build profiles in Assets/Settings/Build Profiles -> their content goes to Settings/Build.
            if (AssetDatabase.IsValidFolder(TemplateSettingsFolder))
            {
                foreach (string name in ListAssetEntries(TemplateSettingsFolder))
                {
                    string source = TemplateSettingsFolder + "/" + name;
                    if (name == TemplateBuildProfilesFolderName && AssetDatabase.IsValidFolder(source))
                    {
                        foreach (string profile in ListAssetEntries(source))
                        {
                            moves.Add(new KeyValuePair<string, string>(source + "/" + profile, BuildSettingsFolder + "/" + profile));
                        }

                        continue;
                    }

                    moves.Add(new KeyValuePair<string, string>(source, SetupPaths.RenderingSettingsFolder + "/" + name));
                }
            }

            AddFileMove(moves, "Assets/UniversalRenderPipelineGlobalSettings.asset", SetupPaths.RenderingSettingsFolder);
            AddFileMove(moves, "Assets/DefaultVolumeProfile.asset", SetupPaths.RenderingSettingsFolder);
            AddFileMove(moves, "Assets/InputSystem_Actions.inputactions", SetupPaths.InputSettingsFolder);
            return moves;
        }

        private static void AddFileMove(List<KeyValuePair<string, string>> moves, string source, string targetFolder)
        {
            if (AssetFolderUtility.Exists(source))
            {
                moves.Add(new KeyValuePair<string, string>(source, targetFolder + "/" + Path.GetFileName(source)));
            }
        }

        private static List<string> CollectFoldersThatBecomeEmpty(List<string> deletions, List<KeyValuePair<string, string>> moves)
        {
            var result = new List<string>();
            if (AssetDatabase.IsValidFolder(TemplateSettingsFolder))
            {
                result.Add(TemplateSettingsFolder + " (falls danach leer)");
            }

            if (AssetDatabase.IsValidFolder(TemplateScenesFolder) && (deletions.Contains(SampleScenePath) || AssetFolderUtility.IsEmptyExceptPlaceholders(TemplateScenesFolder)))
            {
                result.Add(TemplateScenesFolder + " (falls danach leer)");
            }

            return result;
        }

        private static List<string> CollectUnexpectedRootEntries(List<string> deletions, List<KeyValuePair<string, string>> moves)
        {
            var expected = new HashSet<string>(StringComparer.Ordinal)
            {
                "Assets/_Project", "Assets/ThirdParty", "Assets/TextMesh Pro", "Assets/AddressableAssetsData", TemplateSettingsFolder, TemplateScenesFolder
            };
            for (int i = 0; i < deletions.Count; i++)
            {
                expected.Add(deletions[i]);
            }

            for (int i = 0; i < moves.Count; i++)
            {
                expected.Add(moves[i].Key);
            }

            var result = new List<string>();
            foreach (string name in ListAssetEntries("Assets"))
            {
                string path = "Assets/" + name;
                if (!expected.Contains(path))
                {
                    result.Add(path);
                }
            }

            return result;
        }

        private static IEnumerable<string> ListAssetEntries(string assetFolder)
        {
            string fullPath = AssetFolderUtility.ToFullPath(assetFolder);
            var names = new List<string>();
            if (!Directory.Exists(fullPath))
            {
                return names;
            }

            foreach (string entry in Directory.EnumerateFileSystemEntries(fullPath))
            {
                string name = Path.GetFileName(entry);
                if (name.StartsWith(".", StringComparison.Ordinal) || name.EndsWith(".meta", StringComparison.OrdinalIgnoreCase) ||
                    name.EndsWith("~", StringComparison.Ordinal))
                {
                    continue; // Unity ignores hidden files and folders ending with "~"; .meta files move with their asset.
                }

                names.Add(name);
            }

            names.Sort(StringComparer.Ordinal);
            return names;
        }

        private static string BuildDialogText(List<string> deletions, List<KeyValuePair<string, string>> moves, List<string> emptyFolders)
        {
            string text = string.Empty;
            if (deletions.Count > 0)
            {
                text += "In den Papierkorb (wiederherstellbar):\n• " + string.Join("\n• ", deletions) + "\n\n";
            }

            if (moves.Count > 0)
            {
                var lines = new List<string>();
                for (int i = 0; i < moves.Count; i++)
                {
                    lines.Add(moves[i].Key + " → " + moves[i].Value);
                }

                text += "Verschieben (GUIDs und Verweise bleiben erhalten; vorhandene Ziele werden nicht überschrieben):\n• " +
                        string.Join("\n• ", lines) + "\n\n";
            }

            if (emptyFolders.Count > 0)
            {
                text += "Leere Ordner entfernen:\n• " + string.Join("\n• ", emptyFolders) + "\n\n";
            }

            return text + "Ist die Beispielszene geöffnet, wird sie vorher geschlossen (ungespeicherte Änderungen werden abgefragt).";
        }

        private static bool CloseSampleSceneIfOpen(SetupLog log)
        {
            bool open = false;
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                if (SceneManager.GetSceneAt(i).path == SampleScenePath)
                {
                    open = true;
                    break;
                }
            }

            if (!open)
            {
                return true;
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                log.Info("d) Abgebrochen – die geöffnete Szene wurde nicht geschlossen.");
                return false;
            }

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            log.Info("d) Beispielszene geschlossen (leere Szene geöffnet).");
            return true;
        }

        private static void MoveAsset(string source, string target, SetupLog log)
        {
            if (AssetFolderUtility.Exists(target))
            {
                log.Warning("d) Nicht verschoben: " + source + " – Ziel " + target + " existiert bereits (wird nicht überschrieben).");
                return;
            }

            int slash = target.LastIndexOf('/');
            if (!AssetFolderUtility.EnsureAssetFolder(target.Substring(0, slash), log))
            {
                return;
            }

            string error = AssetDatabase.MoveAsset(source, target);
            if (string.IsNullOrEmpty(error))
            {
                log.Info("d) Verschoben: " + source + " → " + target);
            }
            else
            {
                log.Error("d) Verschieben fehlgeschlagen: " + source + " → " + target + ": " + error);
            }
        }

        private static void TrashAsset(string path, SetupLog log)
        {
            if (AssetDatabase.MoveAssetToTrash(path))
            {
                log.Info("d) In den Papierkorb verschoben: " + path);
            }
            else
            {
                log.Error("d) Konnte nicht entfernt werden: " + path);
            }
        }
    }
}
