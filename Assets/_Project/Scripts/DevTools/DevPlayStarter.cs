using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer shortcut for test scenes: if Play Mode was started directly in this scene (not in the boot scene, see
    /// <see cref="PlayModeStart"/>), it switches through the allowed transitions MainMenu → Loading → Playing as soon as the
    /// boot has finished, so the game starts without the main menu. If the scene was loaded through the main menu ("Neues
    /// Spiel", "Laden"), it does nothing.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: any object in a test scene (the menu "Aetherfall > Testgelaende erstellen" (German menu text) adds "DevPlayStarter").
    /// Active only in the editor and in development builds; in release builds it disables itself. No package dependency.</para>
    /// <para>Waits for the services with <see cref="Services.WaitForAsync{T}"/> (in the editor the boot scene is loaded after
    /// the test scene). Logs a warning if the boot has not finished after <see cref="WarnAfterSeconds"/> seconds.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class DevPlayStarter : MonoBehaviour
    {
        /// <summary>Seconds after which a still unfinished boot is reported once.</summary>
        public const float WarnAfterSeconds = 10f;

        private const string Reason = "DevPlayStarter (test scene)";

        [Tooltip("Aus = die Szene bleibt im Hauptmenü-Zustand (zum Testen der Menü-Zustände mit dem Debug-Overlay).")]
        [SerializeField] private bool startPlaying = true;

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
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            if (!enabled || !startPlaying)
            {
                return;
            }

            if (!PlayModeStart.IsDirectStartOf(gameObject.scene.path))
            {
                // Loaded by the scene loader (main menu → "Neues Spiel"/"Laden"): the game flow sets the state itself.
                return;
            }

            try
            {
                IGameStateService gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                float waitStart = Time.realtimeSinceStartup;
                bool warned = false;
                while (gameState.Current == GameState.Boot)
                {
                    if (!warned && Time.realtimeSinceStartup - waitStart > WarnAfterSeconds)
                    {
                        warned = true;
                        Log.Warning(LogCategory.DevTools, "DevPlayStarter: the boot has not finished after " + WarnAfterSeconds +
                                                          " s (state Boot). Check the console for boot errors.");
                    }

                    await Awaitable.NextFrameAsync(destroyCancellationToken);
                }

                if (gameState.Current != GameState.MainMenu)
                {
                    Log.Info(LogCategory.DevTools, "DevPlayStarter: game state is already " + gameState.Current + ", nothing to do.");
                    return;
                }

                if (!gameState.SwitchBase(GameState.Loading, Reason))
                {
                    return;
                }

                // One frame in Loading, so listeners of Loading run like in a real load.
                await Awaitable.NextFrameAsync(destroyCancellationToken);
                if (gameState.Current == GameState.Loading && gameState.SwitchBase(GameState.Playing, Reason))
                {
                    Log.Info(LogCategory.DevTools, "DevPlayStarter: MainMenu -> Loading -> Playing. Have fun testing.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting (Play Mode ended).
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "DevPlayStarter failed.");
            }
        }
    }
}
