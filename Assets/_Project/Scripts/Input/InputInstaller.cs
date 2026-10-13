using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Input
{
    /// <summary>
    /// Registers <see cref="IInputService"/> (<see cref="InputService"/> with a new <see cref="GameInputActions"/>
    /// instance). Requires <see cref="IEventBus"/> and <see cref="IGameStateService"/>, so it comes after the GameState
    /// installer in the BootConfig (the menu "Aetherfall > Testgelaende erstellen" (German menu text) adds it there).
    /// </summary>
    /// <remarks>
    /// Deviation from the boot order of architecture 4.1 (Input as step 6, before GameState): the service sets the initial
    /// action map from the current game state and routes the pause button, so it needs the game state service at creation.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Input", fileName = "InputInstaller", order = 103)]
    public sealed class InputInstaller : ServiceInstaller
    {
        [Tooltip("Start/Esc pausiert das Spiel und setzt es fort, solange es noch kein Pausemenü gibt. " +
                 "Ausschalten, sobald der Pausebildschirm (UI-Schritt) die Taste selbst behandelt.")]
        [SerializeField] private bool routePauseButton = true;

        [Tooltip("Mauszeiger im Spiel sperren und ausblenden, in Menüs freigeben (aus = Zeiger bleibt, wie er ist).")]
        [SerializeField] private bool manageCursor = true;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IInputService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IGameStateService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
#if !ENABLE_INPUT_SYSTEM
            Log.Error(LogCategory.Input, "Active Input Handling does not include the Input System Package: the game receives no input. " +
                                         "Set Edit > Project Settings > Player > Other Settings > Configuration > Active Input Handling " +
                                         "to 'Input System Package (New)' and restart the editor.");
#endif
            GameInputActions actions = GameInputActions.Create();
            ICursorController cursor = manageCursor ? new UnityCursorController() : null;
            registry.Register<IInputService>(new InputService(locator.Get<IEventBus>(), locator.Get<IGameStateService>(), actions,
                cursor, routePauseButton));
        }
    }
}
