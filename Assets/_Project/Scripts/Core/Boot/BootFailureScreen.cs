using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Minimal full-screen error display (IMGUI) shown when the boot fails or times out (architecture 4.1, "Fehlerfall").
    /// Added at runtime by <see cref="GameBootstrapper"/> only in that case, so normal runs pay no IMGUI cost.
    /// Works without any other service (no localization, no UI framework), mouse only.
    /// </summary>
    /// <remarks>
    /// Drawn above every other IMGUI script (<see cref="GuiDepth"/>, e.g. the developer overlay) and swallows the mouse
    /// events it does not use itself, so nothing underneath can be clicked while the screen is shown.
    /// </remarks>
    [DisallowMultipleComponent]
    [AddComponentMenu("")]
    public sealed class BootFailureScreen : MonoBehaviour
    {
        /// <summary>IMGUI depth of the screen. Lower values are drawn on top and receive input first (default 0).</summary>
        public const int GuiDepth = -1000;

        private const float ReferenceHeight = 1080f;

        private string _message = string.Empty;
        private string _logPath = string.Empty;
        private Vector2 _scroll;
        private GUIStyle _titleStyle;
        private GUIStyle _textStyle;

        /// <summary>Shows the screen with the given message.</summary>
        /// <param name="message">Error description (may span several lines).</param>
        /// <param name="logPath">Path of the log file, or empty if unknown.</param>
        internal void Show(string message, string logPath)
        {
            _message = message ?? string.Empty;
            _logPath = logPath ?? string.Empty;
            enabled = true;
        }

        private void OnGUI()
        {
            GUI.depth = GuiDepth;
            EnsureStyles();

            float scale = Mathf.Max(1f, Screen.height / ReferenceHeight);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            float width = Screen.width / scale;
            float height = Screen.height / scale;

            GUI.color = Color.white;
            GUI.DrawTexture(new Rect(0f, 0f, width, height), Texture2D.blackTexture);

            GUILayout.BeginArea(new Rect(40f, 40f, width - 80f, height - 80f));
            GUILayout.Label("Aetherfall could not start", _titleStyle);
            GUILayout.Space(12f);
            _scroll = GUILayout.BeginScrollView(_scroll);
            GUILayout.Label(_message, _textStyle);
            GUILayout.EndScrollView();
            GUILayout.Space(12f);
            GUILayout.Label(string.IsNullOrEmpty(_logPath) ? "Log file: (unknown)" : "Log file: " + _logPath, _textStyle);
            GUILayout.Label("The game was stopped before it was fully initialized. Please send the log file to the developers.", _textStyle);
            GUILayout.Space(12f);
            if (GUILayout.Button("Quit", GUILayout.Width(160f), GUILayout.Height(36f)))
            {
                // Has no effect in the editor; stop Play Mode there.
                Application.Quit();
            }

            GUILayout.EndArea();

            // The screen covers everything: mouse input must not reach (invisible) controls of other IMGUI scripts.
            Event current = Event.current;
            if (current.isMouse || current.type == EventType.ScrollWheel)
            {
                current.Use();
            }
        }

        private void EnsureStyles()
        {
            if (_titleStyle != null)
            {
                return;
            }

            _titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 28, fontStyle = FontStyle.Bold, wordWrap = true };
            _textStyle = new GUIStyle(GUI.skin.label) { fontSize = 16, wordWrap = true };
        }
    }
}
