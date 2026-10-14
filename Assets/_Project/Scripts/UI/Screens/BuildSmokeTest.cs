using System;
using Aetherfall.Core;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Start test of a built game (<c>Aetherfall.exe -smoketest</c>): waits for the main menu, presses "Neues Spiel", waits until
    /// the first world is playable, stays there a few seconds, travels into the crypt like its portal and quits after a few
    /// seconds there. Every error or exception in the log counts; the exit
    /// code is 0 (all fine), 1 (errors) or 2 (time out). Lines start with "[Starttest]" in Player.log. Without the argument
    /// nothing happens.
    /// </summary>
    public sealed class BuildSmokeTest : MonoBehaviour
    {
        private const string Argument = "-smoketest";
        private const float TimeoutSeconds = 120f;
        private const float StaySeconds = 6f;

        private IGameStateService _state;
        private IGameFlow _flow;
        private int _errors;
        private float _started;
        private const string CryptScene = "Assets/_Project/Scenes/Dungeons/Gruft.unity";

        private float _playingSince = -1f;
        private string _playingScene = string.Empty;
        private bool _newGameRequested;
        private bool _travelled;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void StartIfRequested()
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), Argument) < 0)
            {
                return;
            }

            var host = new GameObject("Starttest");
            DontDestroyOnLoad(host);
            host.AddComponent<BuildSmokeTest>();
        }

        private void OnEnable()
        {
            Application.logMessageReceived += OnLog;
        }

        private void OnDisable()
        {
            Application.logMessageReceived -= OnLog;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            _started = Time.realtimeSinceStartup;
            Debug.Log("[Starttest] Start, Unity " + Application.unityVersion + ", " + Application.productName + " " + Application.version + ".");
            try
            {
                _state = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                _flow = await Services.WaitForAsync<IGameFlow>(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Quit while waiting.
            }
        }

        private void Update()
        {
            float elapsed = Time.realtimeSinceStartup - _started;
            if (elapsed > TimeoutSeconds)
            {
                Finish(2, "Zeit abgelaufen (" + TimeoutSeconds + " s), Zustand " + (_state != null ? _state.Current.ToString() : "ohne Dienste") + ".");
                return;
            }

            if (_state == null || _flow == null)
            {
                return;
            }

            if (!_newGameRequested && _state.Current == GameState.MainMenu)
            {
                _newGameRequested = true;
                Debug.Log("[Starttest] Hauptmenü nach " + elapsed.ToString("0.0") + " s, starte „Neues Spiel“.");
                _flow.StartNewGame();
                return;
            }

            if (_newGameRequested && _state.Current == GameState.Playing)
            {
                string scene = SceneManager.GetActiveScene().name;
                if (_playingSince < 0f || scene != _playingScene)
                {
                    _playingSince = elapsed;
                    _playingScene = scene;
                    Debug.Log("[Starttest] Spielbar nach " + elapsed.ToString("0.0") + " s, aktive Szene „" + scene + "“.");
                }
                else if (elapsed - _playingSince > StaySeconds)
                {
                    if (!_travelled)
                    {
                        // Second scene of the build: the crypt, the way its portal loads it (without arrival anchor).
                        _travelled = true;
                        TravelAsync(CryptScene);
                        return;
                    }

                    Finish(_errors > 0 ? 1 : 0, _errors + " Fehler.");
                }
            }
        }

        private async void TravelAsync(string sceneKey)
        {
            // async void: started from Update (Unity adapter), errors end the test.
            try
            {
                Debug.Log("[Starttest] Reise nach „" + sceneKey + "“.");
                ISceneLoader scenes = Services.Locator.Get<ISceneLoader>();
                if (!_state.SwitchBase(GameState.Loading, "Starttest"))
                {
                    Finish(1, "Ladezustand nicht erreichbar.");
                    return;
                }

                Aetherfall.Core.SceneHandle handle = await scenes.ChangeWorldSpaceAsync(new WorldSpaceRequest(sceneKey, "Die vergessene Gruft", false), destroyCancellationToken);
                await Awaitable.NextFrameAsync(destroyCancellationToken);
                await Awaitable.NextFrameAsync(destroyCancellationToken);
                if (!handle.IsValid)
                {
                    Finish(1, "Szene „" + sceneKey + "“ nicht geladen.");
                    return;
                }

                _state.SwitchBase(GameState.Playing, "Starttest");
            }
            catch (OperationCanceledException)
            {
                // Quit while travelling.
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                Finish(1, "Reise fehlgeschlagen.");
            }
        }

        private void OnLog(string condition, string stackTrace, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
            {
                _errors++;
            }
        }

        private void Finish(int exitCode, string message)
        {
            Debug.Log("[Starttest] Ende (Code " + exitCode + "): " + message);
            enabled = false;
            Application.Quit(exitCode);
        }
    }
}
