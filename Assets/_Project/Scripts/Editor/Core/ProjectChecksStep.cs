using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step f) of the project setup: read-only checks (architecture 1.1, 1.2, 2.9). Editor version, URP as active render
    /// pipeline, rendering path Forward+, Git repository, Git LFS and UnityYAMLMerge. Changes nothing; where a value
    /// cannot be checked it shows the menu path for a manual check.
    /// </summary>
    /// <remarks>
    /// URP is detected by type name, so this editor assembly needs no reference to the URP package. The rendering path is
    /// read from the public property <c>UniversalRendererData.renderingMode</c> by reflection (read-only, public API).
    /// </remarks>
    [Serializable]
    internal sealed class ProjectChecksStep : SetupStep
    {
        private const string UrpAssetTypeName = "UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset";
        private const string UrpRendererDataTypeName = "UnityEngine.Rendering.Universal.UniversalRendererData";
        private const string RenderingModePropertyName = "renderingMode";
        private const string ForwardPlusValue = "ForwardPlus";
        private const string PlannedEditorLine = "6000.3.";

        [SerializeField] private bool showGitCommands;
        [SerializeField] private Vector2 commandScroll;

        /// <inheritdoc />
        public override string Letter => "f";

        /// <inheritdoc />
        public override string Title => "Prüfungen (nur lesen)";

        /// <inheritdoc />
        public override string RunButtonLabel => "Prüfen";

        /// <inheritdoc />
        public override string Description =>
            "Prüft ohne etwas zu ändern: Unity-Version, URP als aktive Render-Pipeline, Rendering Path Forward+, Git-Repository, " +
            "Git LFS und UnityYAMLMerge. Das Ergebnis steht zusätzlich im Protokoll.";

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            Refresh();
            IReadOnlyList<SetupCheckItem> items = Items;
            for (int i = 0; i < items.Count; i++)
            {
                string line = "f) " + items[i];
                if (items[i].Status == SetupStatus.Open)
                {
                    log.Warning(line);
                }
                else
                {
                    log.Info(line);
                }
            }
        }

        /// <inheritdoc />
        public override void DrawOptions()
        {
            showGitCommands = EditorGUILayout.Foldout(showGitCommands, "Git-Befehle für UnityYAMLMerge (Smart Merge) anzeigen", true);
            if (!showGitCommands)
            {
                return;
            }

            string yamlMergePath = GetYamlMergePath();
            EditorGUILayout.HelpBox("Im Terminal im Projektordner ausführen (Anleitung 01, Abschnitt 4.3). Der Pfad gehört zum gerade laufenden Editor; " +
                                    "nach einem Editor-Update die Befehle erneut ausführen.", MessageType.Info);
            commandScroll = EditorGUILayout.BeginScrollView(commandScroll, GUILayout.Height(190f));
            DrawCommandBlock("1. Merge-Tool (Unity-Manual „Smart Merge“, empfohlen):", GitRepositoryInspector.BuildYamlMergeToolCommands(yamlMergePath));
            DrawCommandBlock("2. Merge-Treiber für .gitattributes (optional, nicht verifiziert – mit Test-Konflikt prüfen):",
                GitRepositoryInspector.BuildYamlMergeDriverCommands(yamlMergePath));
            EditorGUILayout.EndScrollView();
        }

        private static void DrawCommandBlock(string title, string commands)
        {
            EditorGUILayout.LabelField(title, EditorStyles.wordWrappedMiniLabel);
            EditorGUILayout.SelectableLabel(commands, EditorStyles.textArea, GUILayout.Height(EditorStyles.textArea.CalcHeight(new GUIContent(commands), 600f)));
            if (GUILayout.Button("Kopieren", GUILayout.Width(100f)))
            {
                EditorGUIUtility.systemCopyBuffer = commands;
            }
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            items.Add(CheckEditorVersion());
            CheckRenderPipeline(items);
            CheckGit(items);
        }

        private static SetupCheckItem CheckEditorVersion()
        {
            string version = Application.unityVersion;
            return version.StartsWith(PlannedEditorLine, StringComparison.Ordinal)
                ? new SetupCheckItem("Unity-Version", SetupStatus.Done, version + " (Unity 6.3 LTS)")
                : new SetupCheckItem("Unity-Version", SetupStatus.Open,
                    version + " – geplant ist Unity 6.3 LTS (neuester 6000.3.x, Architektur 1.1). Projekt im Unity Hub mit 6000.3.x öffnen.",
                    "Unity Hub > Projects > Editor-Version in der Liste");
        }

        private static void CheckRenderPipeline(List<SetupCheckItem> items)
        {
            const string graphicsMenu = "Edit > Project Settings > Graphics > Default Render Pipeline";
            RenderPipelineAsset defaultPipeline = GraphicsSettings.defaultRenderPipeline;
            if (defaultPipeline == null)
            {
                items.Add(new SetupCheckItem("URP ist aktive Render-Pipeline", SetupStatus.Open,
                    "Keine Default Render Pipeline gesetzt (Built-in aktiv). Das Projekt muss mit dem Template „Universal 3D“ angelegt sein.", graphicsMenu));
                return;
            }

            bool defaultIsUrp = IsOfType(defaultPipeline, UrpAssetTypeName);
            items.Add(new SetupCheckItem("URP ist aktive Render-Pipeline", defaultIsUrp ? SetupStatus.Done : SetupStatus.Open,
                defaultPipeline.name + " (" + defaultPipeline.GetType().Name + ", " + AssetDatabase.GetAssetPath(defaultPipeline) + ")", graphicsMenu));

            var pipelines = new List<RenderPipelineAsset> { defaultPipeline };
            var qualityProblems = new List<string>();
            string[] qualityNames = QualitySettings.names;
            for (int i = 0; i < qualityNames.Length; i++)
            {
                RenderPipelineAsset levelPipeline = QualitySettings.GetRenderPipelineAssetAt(i);
                if (levelPipeline == null)
                {
                    continue; // The level uses the default pipeline.
                }

                if (!IsOfType(levelPipeline, UrpAssetTypeName))
                {
                    qualityProblems.Add(qualityNames[i] + ": " + levelPipeline.name);
                }
                else if (!pipelines.Contains(levelPipeline))
                {
                    pipelines.Add(levelPipeline);
                }
            }

            items.Add(new SetupCheckItem("Qualitätsstufen nutzen URP", qualityProblems.Count == 0 ? SetupStatus.Done : SetupStatus.Open,
                qualityProblems.Count == 0
                    ? qualityNames.Length + " Stufe(n): " + string.Join(", ", qualityNames)
                    : "keine URP-Assets: " + string.Join(", ", qualityProblems),
                "Edit > Project Settings > Quality > Render Pipeline Asset"));

            items.Add(CheckForwardPlus(pipelines));
        }

        private static SetupCheckItem CheckForwardPlus(List<RenderPipelineAsset> pipelines)
        {
            const string label = "Rendering Path: Forward+";
            const string manual = "Project-Fenster: Renderer-Asset (z. B. Assets/_Project/Settings/Rendering/PC_Renderer) anklicken > Inspector > Rendering > Rendering Path = Forward+";
            var modes = new List<string>();
            bool anyOther = false;
            var seen = new HashSet<string>(StringComparer.Ordinal);

            for (int p = 0; p < pipelines.Count; p++)
            {
                string pipelinePath = AssetDatabase.GetAssetPath(pipelines[p]);
                if (string.IsNullOrEmpty(pipelinePath))
                {
                    continue;
                }

                string[] dependencies = AssetDatabase.GetDependencies(pipelinePath, false);
                for (int i = 0; i < dependencies.Length; i++)
                {
                    if (!seen.Add(dependencies[i]))
                    {
                        continue;
                    }

                    UnityEngine.Object asset = AssetDatabase.LoadMainAssetAtPath(dependencies[i]);
                    if (asset == null || !IsOfType(asset, UrpRendererDataTypeName))
                    {
                        continue;
                    }

                    string mode = ReadRenderingMode(asset);
                    if (mode == null)
                    {
                        return new SetupCheckItem(label, SetupStatus.Unknown, "Wert nicht lesbar (URP-Version?). Bitte von Hand prüfen.", manual);
                    }

                    modes.Add(asset.name + " = " + mode);
                    if (mode != ForwardPlusValue)
                    {
                        anyOther = true;
                    }
                }
            }

            if (modes.Count == 0)
            {
                return new SetupCheckItem(label, SetupStatus.Unknown, "Kein Universal Renderer gefunden. Bitte von Hand prüfen.", manual);
            }

            return anyOther
                ? new SetupCheckItem(label, SetupStatus.Open, string.Join(", ", modes) + " – alle Renderer auf Forward+ stellen (Architektur 1.2). Manuell erledigen.", manual)
                : new SetupCheckItem(label, SetupStatus.Done, string.Join(", ", modes), manual);
        }

        private static string ReadRenderingMode(UnityEngine.Object rendererData)
        {
            try
            {
                PropertyInfo property = rendererData.GetType().GetProperty(RenderingModePropertyName, BindingFlags.Public | BindingFlags.Instance);
                if (property == null || !property.CanRead)
                {
                    return null;
                }

                object value = property.GetValue(rendererData, null);
                return value != null ? value.ToString() : null;
            }
            catch (Exception exception) when (exception is TargetInvocationException || exception is MethodAccessException || exception is ArgumentException)
            {
                return null;
            }
        }

        private static void CheckGit(List<SetupCheckItem> items)
        {
            string root = AssetFolderUtility.ProjectRoot;
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

            bool hasRepository = GitRepositoryInspector.HasGitRepository(root);
            items.Add(hasRepository
                ? new SetupCheckItem("Git-Repository", SetupStatus.Done, root)
                : new SetupCheckItem("Git-Repository", SetupStatus.Open,
                    "Der Projektordner ist noch kein Git-Repository. Anleitung 01, Abschnitt 4 (Repo in den Projektordner holen)."));

            bool attributes = GitRepositoryInspector.AttributesUseLfs(root);
            bool lfsConfigured = GitRepositoryInspector.IsLfsConfigured(root, home);
            SetupStatus lfsStatus = attributes && lfsConfigured ? SetupStatus.Done : hasRepository ? SetupStatus.Open : SetupStatus.Unknown;
            string lfsDetail = attributes && lfsConfigured
                ? ".gitattributes nutzt LFS, Git LFS ist eingerichtet. Nach dem ersten Commit mit „git lfs ls-files“ prüfen."
                : (!attributes ? ".gitattributes fehlt oder enthält keine LFS-Regeln. " : string.Empty) +
                  (!lfsConfigured ? "Git LFS ist nicht eingerichtet: im Terminal „brew install git-lfs“ und danach im Projektordner „git lfs install“. " : string.Empty) +
                  "Ohne LFS landen Texturen, Audio und Modelle direkt in Git (Repo wird riesig).";
            items.Add(new SetupCheckItem("Git LFS", lfsStatus, lfsDetail));

            string yamlMergePath = GetYamlMergePath();
            bool toolExists = File.Exists(yamlMergePath);
            items.Add(new SetupCheckItem("UnityYAMLMerge-Programm", toolExists ? SetupStatus.Done : SetupStatus.Unknown,
                toolExists ? yamlMergePath : "nicht gefunden unter " + yamlMergePath));

            bool mergeConfigured = hasRepository && GitRepositoryInspector.IsYamlMergeConfigured(root);
            items.Add(new SetupCheckItem("UnityYAMLMerge in der lokalen Git-Konfiguration", mergeConfigured ? SetupStatus.Done : SetupStatus.Unknown,
                mergeConfigured
                    ? "eingetragen (.git/config)"
                    : "noch nicht eingetragen – Empfehlung. Befehle über „Git-Befehle … anzeigen“ oben kopieren (Anleitung 01, Abschnitt 4.3)."));
        }

        private static string GetYamlMergePath()
        {
            string fileName = Application.platform == RuntimePlatform.WindowsEditor ? "UnityYAMLMerge.exe" : "UnityYAMLMerge";
            return Path.Combine(EditorApplication.applicationContentsPath, "Tools", fileName);
        }

        private static bool IsOfType(object instance, string fullTypeName)
        {
            for (Type type = instance.GetType(); type != null; type = type.BaseType)
            {
                if (type.FullName == fullTypeName)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
