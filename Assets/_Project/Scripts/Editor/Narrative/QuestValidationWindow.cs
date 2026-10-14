using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Result window of "Aetherfall > Quests pruefen": summary, filters for errors, warnings and hints, one row per finding
    /// (rule code, location, German message). Clicking a row selects and pings the quest asset. "Erneut pruefen" runs the
    /// validation again. Opened by <see cref="QuestValidationMenu"/>.
    /// </summary>
    public sealed class QuestValidationWindow : EditorWindow
    {
        private QuestValidationResult _result;
        private Vector2 _scroll;
        private bool _showErrors = true;
        private bool _showWarnings = true;
        private bool _showInfos = true;

        /// <summary>Opens the window with a result.</summary>
        /// <param name="result">Validation result.</param>
        public static void ShowResult(QuestValidationResult result)
        {
            var window = GetWindow<QuestValidationWindow>(false, "Quests prüfen", true);
            window.minSize = new Vector2(520f, 240f);
            window._result = result;
            window._scroll = Vector2.zero;
            window.Show();
            window.Repaint();
        }

        private void OnGUI()
        {
            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                if (GUILayout.Button("Erneut prüfen", EditorStyles.toolbarButton, GUILayout.Width(110f)))
                {
                    _result = QuestValidationMenu.Run();
                }

                GUILayout.FlexibleSpace();
                _showErrors = GUILayout.Toggle(_showErrors, "Fehler", EditorStyles.toolbarButton, GUILayout.Width(70f));
                _showWarnings = GUILayout.Toggle(_showWarnings, "Warnungen", EditorStyles.toolbarButton, GUILayout.Width(90f));
                _showInfos = GUILayout.Toggle(_showInfos, "Hinweise", EditorStyles.toolbarButton, GUILayout.Width(80f));
            }

            if (_result == null)
            {
                EditorGUILayout.HelpBox("Noch nicht geprüft. Menü „Aetherfall > Quests prüfen“ oder „Erneut prüfen“ drücken.", MessageType.Info);
                return;
            }

            MessageType summaryType = _result.Report.HasErrors ? MessageType.Error : _result.Report.WarningCount > 0 ? MessageType.Warning : MessageType.Info;
            EditorGUILayout.HelpBox(_result.Summary + (_result.QuestCount == 0 ? " Es gibt noch keine Quest-Assets (Rechtsklick > Create > Aetherfall > Quests > Quest)." : string.Empty), summaryType);

            IReadOnlyList<ValidationIssue> issues = _result.Report.Issues;
            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            for (int i = 0; i < issues.Count; i++)
            {
                ValidationIssue issue = issues[i];
                if (!IsVisible(issue.Severity))
                {
                    continue;
                }

                DrawIssue(issue);
            }

            EditorGUILayout.EndScrollView();
        }

        private bool IsVisible(ValidationSeverity severity)
        {
            switch (severity)
            {
                case ValidationSeverity.Error:
                    return _showErrors;
                case ValidationSeverity.Warning:
                    return _showWarnings;
                default:
                    return _showInfos;
            }
        }

        private void DrawIssue(in ValidationIssue issue)
        {
            string icon = issue.Severity == ValidationSeverity.Error ? "console.erroricon.sml" : issue.Severity == ValidationSeverity.Warning ? "console.warnicon.sml" : "console.infoicon.sml";
            using (new EditorGUILayout.HorizontalScope(EditorStyles.helpBox))
            {
                GUILayout.Label(EditorGUIUtility.IconContent(icon), GUILayout.Width(20f), GUILayout.Height(18f));
                GUILayout.Label(issue.Code, EditorStyles.boldLabel, GUILayout.Width(40f));
                using (new EditorGUILayout.VerticalScope())
                {
                    GUILayout.Label(issue.Message, EditorStyles.wordWrappedLabel);
                    if (issue.Location.Length > 0)
                    {
                        GUILayout.Label(issue.Location, EditorStyles.miniLabel);
                    }
                }

                string path = _result.AssetPathOf(issue);
                using (new EditorGUI.DisabledScope(path.Length == 0))
                {
                    if (GUILayout.Button("Zeigen", GUILayout.Width(60f)))
                    {
                        Object asset = AssetDatabase.LoadMainAssetAtPath(path);
                        if (asset != null)
                        {
                            Selection.activeObject = asset;
                            EditorGUIUtility.PingObject(asset);
                        }
                    }
                }
            }
        }
    }
}
