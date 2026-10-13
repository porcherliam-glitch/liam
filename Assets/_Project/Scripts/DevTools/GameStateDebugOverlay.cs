using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer overlay (IMGUI) for the game state machine (Phase 1 step 1.2, architecture 14.3 "Zustand"):
    /// shows the current state, the base state, the modal stack, the time scale and the last 10
    /// <see cref="GameStateChanged"/> events, and offers mouse buttons to trigger transitions.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: any GameObject in <c>Boot.unity</c> (the setup tool adds it there). Active only in the editor and in
    /// development builds (<c>DEVELOPMENT_BUILD</c>, <c>AETHERFALL_DEV</c>); in release builds it disables itself in Awake.</para>
    /// <para>Mouse only, no keyboard input (the input system is not part of this step). Dimmed buttons are transitions the
    /// table does not allow from the current state; pressing them shows the rejection warning in the console.</para>
    /// <para>The services are resolved via <see cref="Services.Locator"/>: opportunistically in the first <c>OnEnable</c>,
    /// otherwise in <c>Start</c>, waiting frame by frame until the boot has registered them. The event subscription
    /// follows OnEnable/OnDisable. The locator is never touched in Update or OnGUI.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class GameStateDebugOverlay : MonoBehaviour
    {
        private const int HistorySize = 10;
        private const float ReferenceHeight = 1080f;
        private const float PanelWidth = 380f;
        private const string ButtonReason = "Debug overlay";

        [Tooltip("Overlay beim Start aufgeklappt anzeigen. Zugeklappt bleibt nur ein kleiner Knopf zum Aufklappen sichtbar.")]
        [SerializeField] private bool startExpanded = true;

        [Tooltip("Zusätzliche Skalierung des Overlays. Es wird außerdem automatisch ab einer Bildschirmhöhe von 1080 Pixeln mitskaliert.")]
        [Range(0.5f, 3f)]
        [SerializeField] private float uiScale = 1f;

        [Tooltip("Position der linken oberen Ecke in Referenz-Pixeln (bezogen auf 1080 Pixel Bildschirmhöhe).")]
        [SerializeField] private Vector2 screenPosition = new Vector2(10f, 10f);

        private readonly string[] _history = new string[HistorySize];
        private int _historyCount;
        private int _historyNext;

        private IGameStateService _gameState;
        private IEventBus _eventBus;
        private bool _subscribed;
        private bool _expanded;
        private string _currentText = string.Empty;
        private string _baseText = string.Empty;
        private string _stackText = string.Empty;

        private static bool IsAvailableInThisBuild
        {
            get
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD || AETHERFALL_DEV
                return true;
#else
                return false;
#endif
            }
        }

        private void Awake()
        {
            if (!IsAvailableInThisBuild)
            {
                enabled = false;
                return;
            }

            _expanded = startExpanded;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters; all exceptions are handled here.
            try
            {
                while (_eventBus == null && !TryResolveServices())
                {
                    await Awaitable.NextFrameAsync(destroyCancellationToken);
                }

                Subscribe();
                RefreshTexts();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot: nothing to do.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "GameStateDebugOverlay could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            // In Boot.unity the bootstrapper (execution order -10000) has already registered the services here, so the
            // overlay also catches the first change Boot -> MainMenu. Elsewhere Start waits for them.
            if (_eventBus == null)
            {
                TryResolveServices();
            }

            Subscribe();
        }

        private void OnDisable()
        {
            Unsubscribe();
        }

        private bool TryResolveServices()
        {
            IServiceLocator locator = Services.Locator;
            if (locator == null)
            {
                return false;
            }

            if (!locator.TryGet(out IGameStateService gameState) || !locator.TryGet(out IEventBus eventBus))
            {
                return false;
            }

            _gameState = gameState;
            _eventBus = eventBus;
            return true;
        }

        private void Subscribe()
        {
            if (_eventBus == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _subscribed = true;
            RefreshTexts();
        }

        private void Unsubscribe()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
            _subscribed = false;
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            _history[_historyNext] = "Frame " + Time.frameCount + ": " + evt.Previous + " -> " + evt.Current +
                                     "  (t = " + Time.realtimeSinceStartup.ToString("0.00") + " s)";
            _historyNext = (_historyNext + 1) % HistorySize;
            if (_historyCount < HistorySize)
            {
                _historyCount++;
            }

            RefreshTexts();
        }

        private void RefreshTexts()
        {
            if (_gameState == null)
            {
                return;
            }

            _currentText = "Current: " + _gameState.Current;
            _baseText = "Base state: " + _gameState.BaseState;

            int count = _gameState.ModalCount;
            if (count == 0)
            {
                _stackText = "Modal stack: (empty)";
                return;
            }

            string text = "Modal stack: " + _gameState.BaseState;
            for (int i = 0; i < count; i++)
            {
                text += " > " + _gameState.GetModalAt(i);
            }

            _stackText = text;
        }

        private void OnGUI()
        {
            float scale = uiScale * Mathf.Max(1f, Screen.height / ReferenceHeight);
            Matrix4x4 previousMatrix = GUI.matrix;
            Color previousColor = GUI.color;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            try
            {
                if (!_expanded)
                {
                    if (GUI.Button(new Rect(screenPosition.x, screenPosition.y, 160f, 26f), "GameState overlay"))
                    {
                        _expanded = true;
                    }

                    return;
                }

                float availableHeight = Mathf.Max(100f, Screen.height / scale - screenPosition.y - 10f);
                GUILayout.BeginArea(new Rect(screenPosition.x, screenPosition.y, PanelWidth, availableHeight));
                GUILayout.BeginVertical(GUI.skin.box);
                DrawPanel();
                GUILayout.EndVertical();
                GUILayout.EndArea();
            }
            finally
            {
                GUI.matrix = previousMatrix;
                GUI.color = previousColor;
            }
        }

        private void DrawPanel()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Game State (debug)");
            if (GUILayout.Button("Hide", GUILayout.Width(60f)))
            {
                _expanded = false;
            }

            GUILayout.EndHorizontal();

            if (_gameState == null)
            {
                GUILayout.Label("Waiting for services (boot not finished or failed) ...");
                return;
            }

            GUILayout.Label(_currentText);
            GUILayout.Label(_baseText);
            GUILayout.Label(_stackText);
            GUILayout.Label("Time.timeScale: " + Time.timeScale.ToString("0.##") + "   AudioListener.pause: " + AudioListener.pause);

            GameState current = _gameState.Current;

            GUILayout.Space(6f);
            GUILayout.Label("SwitchBase");
            GUILayout.BeginHorizontal();
            DrawSwitchBaseButton(current, GameState.MainMenu);
            DrawSwitchBaseButton(current, GameState.Loading);
            DrawSwitchBaseButton(current, GameState.Playing);
            GUILayout.EndHorizontal();

            GUILayout.Label("Push");
            GUILayout.BeginHorizontal();
            DrawPushButton(current, GameState.Menu);
            DrawPushButton(current, GameState.Paused);
            DrawPushButton(current, GameState.Dialogue);
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            DrawPushButton(current, GameState.Cutscene);
            DrawPushButton(current, GameState.Building);
            GUILayout.EndHorizontal();

            GUI.color = _gameState.ModalCount > 0 ? Color.white : DimmedColor();
            if (GUILayout.Button("Pop (" + current + ")"))
            {
                _gameState.Pop(current);
            }

            GUI.color = Color.white;
            GUILayout.Space(6f);
            GUILayout.Label("Last " + HistorySize + " GameStateChanged events (newest first):");
            if (_historyCount == 0)
            {
                GUILayout.Label("  (none yet)");
            }

            for (int i = 0; i < _historyCount; i++)
            {
                int index = (_historyNext - 1 - i + HistorySize) % HistorySize;
                GUILayout.Label("  " + _history[index]);
            }
        }

        private void DrawSwitchBaseButton(GameState current, GameState target)
        {
            GUI.color = GameStateTransitions.CanSwitchBase(current, target) ? Color.white : DimmedColor();
            if (GUILayout.Button(target.ToString()))
            {
                _gameState.SwitchBase(target, ButtonReason);
            }
        }

        private void DrawPushButton(GameState current, GameState modal)
        {
            GUI.color = GameStateTransitions.CanPush(current, modal) ? Color.white : DimmedColor();
            if (GUILayout.Button(modal.ToString()))
            {
                _gameState.Push(modal, ButtonReason);
            }
        }

        private static Color DimmedColor()
        {
            return new Color(1f, 1f, 1f, 0.45f);
        }
    }
}
