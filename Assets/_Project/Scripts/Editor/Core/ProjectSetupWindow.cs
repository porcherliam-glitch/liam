using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Editor window "Aetherfall > Projekt-Setup …" (Phase 0, step 4; architecture section 2). Shows a checklist with
    /// the status ✓ / ✗ / – of every setup step, one button per step and a "run all" button. Every step is idempotent,
    /// writes what it does into the protocol (and the console) and asks before destructive actions.
    /// </summary>
    /// <remarks>
    /// Steps: a) packages, b) editor/player settings, c) folders, d) template cleanup, e) boot assets and boot scene,
    /// f) read-only checks. Guide for the user: docs/Anleitungen/01_Projekt-Setup.md.
    /// </remarks>
    public sealed class ProjectSetupWindow : EditorWindow
    {
        private const string MenuPath = "Aetherfall/Projekt-Setup …";
        private const string WindowTitle = "Projekt-Setup";
        private const float LogHeight = 170f;

        [SerializeField] private SetupLog log = new SetupLog();
        [SerializeField] private PackageSetupStep packageStep = new PackageSetupStep();
        [SerializeField] private ProjectSettingsSetupStep settingsStep = new ProjectSettingsSetupStep();
        [SerializeField] private FolderSetupStep folderStep = new FolderSetupStep();
        [SerializeField] private TemplateCleanupStep cleanupStep = new TemplateCleanupStep();
        [SerializeField] private BootContentSetupStep bootStep = new BootContentSetupStep();
        [SerializeField] private ProjectChecksStep checksStep = new ProjectChecksStep();
        [SerializeField] private Vector2 scrollPosition;
        [SerializeField] private Vector2 logScrollPosition;
        [SerializeField] private bool logScrollToEnd = true;

        private SetupStep[] _steps;
        private bool _wasBusy;
        private bool _actionPending;
        private GUIStyle _statusStyle;
        private GUIStyle _foldoutStyle;
        private GUIStyle _itemLabelStyle;
        private GUIStyle _detailStyle;
        private GUIStyle _logStyle;

        /// <summary>Opens the setup window (menu "Aetherfall > Projekt-Setup …").</summary>
        [MenuItem(MenuPath, false, 0)]
        public static void Open()
        {
            var window = GetWindow<ProjectSetupWindow>(false, WindowTitle, true);
            window.minSize = new Vector2(560f, 480f);
            window.Show();
        }

        private void OnEnable()
        {
            titleContent = new GUIContent(WindowTitle);
            EnsureSteps();
            log.Changed += OnLogChanged;
            for (int i = 0; i < _steps.Length; i++)
            {
                _steps[i].OnWindowEnabled(log);
            }

            // Defer the first refresh: Package Manager requests and AssetDatabase queries are safer outside of OnEnable,
            // which also runs during domain reloads.
            EditorApplication.delayCall += DeferredRefresh;
        }

        private void OnDisable()
        {
            EditorApplication.delayCall -= DeferredRefresh;
            if (log != null)
            {
                log.Changed -= OnLogChanged;
            }

            if (_steps == null)
            {
                return;
            }

            for (int i = 0; i < _steps.Length; i++)
            {
                _steps[i].OnWindowDisabled();
            }
        }

        private void OnFocus()
        {
            RefreshAll(false);
        }

        private void OnProjectChange()
        {
            RefreshAll(false);
        }

        private void Update()
        {
            bool busy = IsAnyStepBusy();
            if (busy || _wasBusy)
            {
                if (!busy)
                {
                    RefreshAll(false);
                }

                Repaint();
            }

            _wasBusy = busy;
        }

        private void OnGUI()
        {
            EnsureSteps();
            EnsureStyles();

            bool blocked = EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling || EditorApplication.isUpdating;

            EditorGUILayout.Space(4f);
            EditorGUILayout.LabelField("Chroniken von Aetherfall – Projekt-Setup (Phase 0, Schritt 4)", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Richtet das Projekt nach Architektur Abschnitt 2 ein. Jeder Schritt kann beliebig oft ausgeführt werden und ändert nur, was noch fehlt. " +
                "Vor dem Löschen, Ersetzen oder Umbenennen fragt das Werkzeug nach. Anleitung: docs/Anleitungen/01_Projekt-Setup.md.\n" +
                "Status: ✓ erledigt · ✗ offen · – unbekannt bzw. nur Hinweis (z. B. manuelle Einstellung)",
                MessageType.Info);

            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorGUILayout.HelpBox("Play Mode ist aktiv. Das Setup läuft nur im Edit Mode – bitte Play Mode beenden.", MessageType.Warning);
            }
            else if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorGUILayout.HelpBox("Unity kompiliert bzw. importiert gerade. Bitte warten …", MessageType.Info);
            }

            EditorGUILayout.BeginHorizontal();
            using (new EditorGUI.DisabledScope(blocked || IsAnyStepBusy()))
            {
                if (GUILayout.Button(new GUIContent("Alles ausführen", "Reihenfolge: b → c → d → e → f → a (Pakete zuletzt, weil Unity danach neu kompiliert)."),
                        GUILayout.Height(28f), GUILayout.Width(160f)))
                {
                    Schedule(RunAll);
                }
            }

            if (GUILayout.Button("Status aktualisieren", GUILayout.Height(28f), GUILayout.Width(160f)))
            {
                Schedule(() => RefreshAll(true));
            }

            GUILayout.FlexibleSpace();
            EditorGUILayout.EndHorizontal();
            EditorGUILayout.Space(4f);

            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
            for (int i = 0; i < _steps.Length; i++)
            {
                DrawStep(_steps[i], blocked);
            }

            EditorGUILayout.EndScrollView();

            DrawLog();
        }

        private void DrawStep(SetupStep step, bool blocked)
        {
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.BeginHorizontal();
            DrawStatus(step.Status, _statusStyle, 22f);
            step.Expanded = EditorGUILayout.Foldout(step.Expanded, step.Letter + ") " + step.Title, true, _foldoutStyle);
            GUILayout.FlexibleSpace();
            using (new EditorGUI.DisabledScope(blocked || step.IsBusy))
            {
                if (GUILayout.Button(step.IsBusy ? "läuft …" : step.RunButtonLabel, GUILayout.Width(110f)))
                {
                    SetupStep captured = step;
                    Schedule(() => RunStep(captured));
                }
            }

            EditorGUILayout.EndHorizontal();

            if (step.Expanded)
            {
                EditorGUILayout.LabelField(step.Description, _detailStyle);
                EditorGUILayout.Space(2f);
                using (new EditorGUI.DisabledScope(blocked))
                {
                    step.DrawOptions();
                }

                IReadOnlyList<SetupCheckItem> items = step.Items;
                for (int i = 0; i < items.Count; i++)
                {
                    DrawItem(items[i]);
                }
            }

            EditorGUILayout.EndVertical();
        }

        private void DrawItem(SetupCheckItem item)
        {
            EditorGUILayout.BeginHorizontal();
            GUILayout.Space(12f);
            DrawStatus(item.Status, _itemLabelStyle, 16f);
            EditorGUILayout.BeginVertical();
            EditorGUILayout.LabelField(item.Label, _itemLabelStyle);
            if (item.Detail.Length > 0)
            {
                EditorGUILayout.LabelField(item.Detail, _detailStyle);
            }

            if (item.MenuPath.Length > 0)
            {
                EditorGUILayout.LabelField("Menü: " + item.MenuPath, _detailStyle);
            }

            EditorGUILayout.EndVertical();
            EditorGUILayout.EndHorizontal();
        }

        private void DrawLog()
        {
            EditorGUILayout.Space(4f);
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("Protokoll", EditorStyles.boldLabel, GUILayout.Width(80f));
            logScrollToEnd = EditorGUILayout.ToggleLeft("automatisch ans Ende scrollen", logScrollToEnd, GUILayout.Width(210f));
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Kopieren", GUILayout.Width(80f)))
            {
                EditorGUIUtility.systemCopyBuffer = log.ToText();
            }

            if (GUILayout.Button("Leeren", GUILayout.Width(80f)))
            {
                log.Clear();
            }

            EditorGUILayout.EndHorizontal();

            string text = log.Entries.Count == 0 ? "(noch keine Einträge)" : log.ToText();
            float width = Mathf.Max(100f, position.width - 40f);
            float height = Mathf.Max(LogHeight - 10f, _logStyle.CalcHeight(new GUIContent(text), width));
            logScrollPosition = EditorGUILayout.BeginScrollView(logScrollPosition, EditorStyles.helpBox, GUILayout.Height(LogHeight));
            EditorGUILayout.SelectableLabel(text, _logStyle, GUILayout.Height(height));
            EditorGUILayout.EndScrollView();
        }

        private static void DrawStatus(SetupStatus status, GUIStyle style, float width)
        {
            Color previous = GUI.contentColor;
            GUI.contentColor = StatusColor(status);
            GUILayout.Label(SetupStatuses.Symbol(status), style, GUILayout.Width(width));
            GUI.contentColor = previous;
        }

        private static Color StatusColor(SetupStatus status)
        {
            switch (status)
            {
                case SetupStatus.Done:
                    return new Color(0.25f, 0.8f, 0.35f);
                case SetupStatus.Open:
                    return new Color(0.95f, 0.35f, 0.3f);
                default:
                    return new Color(0.6f, 0.6f, 0.6f);
            }
        }

        private void RunStep(SetupStep step)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                log.Warning("Setup im Play Mode nicht möglich. Bitte Play Mode beenden.");
                return;
            }

            log.Info("— Schritt " + step.Letter + ") " + step.Title + " —");
            try
            {
                step.Run(log);
            }
            catch (Exception exception)
            {
                log.Error("Schritt " + step.Letter + ") abgebrochen: " + exception.GetType().Name + ": " + exception.Message);
                Debug.LogException(exception);
            }
            finally
            {
                RefreshAll(false);
            }
        }

        private void RunAll()
        {
            if (!EditorUtility.DisplayDialog(
                    "Alle Schritte ausführen?",
                    "Reihenfolge: b) Einstellungen → c) Ordner → d) Template aufräumen → e) Boot-Inhalte → f) Prüfungen → a) Pakete.\n\n" +
                    "Die Pakete kommen zuletzt, weil Unity danach neu kompiliert. Jeder Schritt fragt vor dem Löschen, Ersetzen oder Umbenennen " +
                    "einzeln nach. Ungespeicherte Szenen werden vorher abgefragt.",
                    "Ausführen",
                    "Abbrechen"))
            {
                return;
            }

            log.Info("=== Alles ausführen ===");
            SetupStep[] order = { settingsStep, folderStep, cleanupStep, bootStep, checksStep, packageStep };
            for (int i = 0; i < order.Length; i++)
            {
                RunStep(order[i]);
            }

            log.Info("=== Alle Schritte gestartet. Die Paketinstallation (a) läuft im Hintergrund weiter; danach kompiliert Unity neu. " +
                     "Anschließend Active Input Handling von Hand umstellen (Schritt b, Anleitung 01). ===");
        }

        private void RefreshAll(bool invalidate)
        {
            EnsureSteps();
            for (int i = 0; i < _steps.Length; i++)
            {
                if (invalidate)
                {
                    _steps[i].Invalidate();
                }

                _steps[i].Refresh();
            }

            Repaint();
        }

        private void DeferredRefresh()
        {
            if (this != null)
            {
                RefreshAll(false);
            }
        }

        private void Schedule(Action action)
        {
            // Work runs after the current GUI event: dialogs, scene changes and asset operations inside OnGUI would
            // break the IMGUI layout.
            if (_actionPending)
            {
                return;
            }

            _actionPending = true;
            EditorApplication.delayCall += () =>
            {
                if (this == null)
                {
                    return;
                }

                try
                {
                    action();
                }
                finally
                {
                    _actionPending = false;
                }
            };
        }

        private bool IsAnyStepBusy()
        {
            if (_steps == null)
            {
                return false;
            }

            for (int i = 0; i < _steps.Length; i++)
            {
                if (_steps[i].IsBusy)
                {
                    return true;
                }
            }

            return false;
        }

        private void OnLogChanged()
        {
            if (logScrollToEnd)
            {
                logScrollPosition = new Vector2(0f, float.MaxValue);
            }

            Repaint();
        }

        private void EnsureSteps()
        {
            if (log == null)
            {
                log = new SetupLog();
            }

            if (packageStep == null)
            {
                packageStep = new PackageSetupStep();
            }

            if (settingsStep == null)
            {
                settingsStep = new ProjectSettingsSetupStep();
            }

            if (folderStep == null)
            {
                folderStep = new FolderSetupStep();
            }

            if (cleanupStep == null)
            {
                cleanupStep = new TemplateCleanupStep();
            }

            if (bootStep == null)
            {
                bootStep = new BootContentSetupStep();
            }

            if (checksStep == null)
            {
                checksStep = new ProjectChecksStep();
            }

            if (_steps == null || _steps.Length != 6)
            {
                _steps = new SetupStep[] { packageStep, settingsStep, folderStep, cleanupStep, bootStep, checksStep };
            }
        }

        private void EnsureStyles()
        {
            if (_statusStyle != null)
            {
                return;
            }

            _statusStyle = new GUIStyle(EditorStyles.boldLabel) { fontSize = 15, alignment = TextAnchor.MiddleCenter };
            _foldoutStyle = new GUIStyle(EditorStyles.foldout) { fontStyle = FontStyle.Bold };
            _itemLabelStyle = new GUIStyle(EditorStyles.label) { wordWrap = true, fontStyle = FontStyle.Bold };
            _detailStyle = new GUIStyle(EditorStyles.wordWrappedMiniLabel) { richText = false };
            _logStyle = new GUIStyle(EditorStyles.label) { wordWrap = true, fontSize = 11, richText = false };
        }
    }
}
