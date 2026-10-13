using System;
using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Quick save and quick load on the keyboard (GDD 05 5.4, Gameplay actions <c>QuickSave</c> F5 and <c>QuickLoad</c> F9,
    /// freely rebindable): F5 saves into the next of 3 rotating quick slots; F9 asks first and loads the newest quick save
    /// on a second press within 3 s ("Ein zweiter Druck auf F9 … bestaetigt").
    /// </summary>
    /// <remarks>
    /// <para>GameObject: any object of the gameplay scene (the test ground menu adds "QuickSaveInput"). Lives in
    /// Aetherfall.Player because that is the lowest assembly that may use both Input (8) and SaveSystem (6).</para>
    /// <para>Until the pause menu and the confirmation dialog exist (UI step), the question is shown in the Console
    /// ("Press F9 again …"); controllers save through the pause menu later (GDD 05 5.4).</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class QuickSaveInput : MonoBehaviour
    {
        [Tooltip("Zeit in Sekunden für den zweiten Druck auf F9, der das Schnellladen bestätigt (GDD 05, 5.4).")]
        [Range(1f, 10f)]
        [SerializeField] private float confirmWindowSeconds = QuickLoadConfirmation.DefaultWindowSeconds;

        private IGameplayInput _gameplay;
        private ISaveManager _saves;
        private QuickLoadConfirmation _confirmation;

        /// <summary>True while the quick load question waits for the second press.</summary>
        public bool IsQuickLoadPending => _confirmation != null && _confirmation.IsPending(Time.unscaledTime);

        private void Awake()
        {
            _confirmation = new QuickLoadConfirmation(confirmWindowSeconds);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (locator == null || !locator.TryGet(out IInputService input) || !locator.TryGet(out ISaveManager saves))
                {
                    Log.Warning(LogCategory.Save, "QuickSaveInput: IInputService or ISaveManager missing, F5/F9 do nothing. " +
                                                  "Add the Input and Save installers to the BootConfig (menu Aetherfall > Testgelaende erstellen).");
                    return;
                }

                _gameplay = input.Gameplay;
                _saves = saves;
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "QuickSaveInput could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_gameplay == null || _saves == null || !_gameplay.IsActive)
            {
                return;
            }

            if (_gameplay.WasPressedThisFrame(GameplayButton.QuickSave))
            {
                _confirmation.Cancel();
                RunQuickSave();
            }

            if (_gameplay.WasPressedThisFrame(GameplayButton.QuickLoad))
            {
                if (_confirmation.Press(Time.unscaledTime))
                {
                    RunQuickLoad();
                }
                else if (_saves.TryGetLatestSlot(Aetherfall.Events.SaveKind.Quick, out SaveSlotInfo slot))
                {
                    Log.Info(LogCategory.Save, "Quick load: press F9 again within " + confirmWindowSeconds.ToString("0") +
                                               " s to load '" + slot.SlotId + "' (" + slot.CreatedUtc + " UTC). Progress since then is lost.");
                }
                else
                {
                    _confirmation.Cancel();
                    Log.Info(LogCategory.Save, "Quick load: there is no quick save yet (press F5 first).");
                }
            }
        }

        private async void RunQuickSave()
        {
            // async void: fire-and-forget adapter of a key press; all exceptions are handled here.
            try
            {
                await _saves.QuickSaveAsync(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Play Mode ended while saving.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Quick save failed.");
            }
        }

        private async void RunQuickLoad()
        {
            // async void: fire-and-forget adapter of a key press; all exceptions are handled here.
            try
            {
                await _saves.QuickLoadAsync(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Play Mode ended while loading.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Quick load failed.");
            }
        }
    }
}
