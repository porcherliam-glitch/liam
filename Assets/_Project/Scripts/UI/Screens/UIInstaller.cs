using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Registers the UI services (architecture 4.1 step 15): <see cref="IUIManager"/> with the own focus layer on the UI action
    /// map, <see cref="IGlyphService"/>, the <see cref="ILoadingScreen"/> used by the scene loader, the
    /// <see cref="IPlayerHudRegistry"/> and the <see cref="IGameFlow"/> of the menus. The visual part (UIDocuments, screens) is
    /// attached later by <see cref="UIRoot"/> in the boot scene.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/UIInstaller.asset</c>, last entry of the BootConfig (the menu
    /// "Aetherfall > Oberflaeche einrichten" or "Aetherfall > Testgelaende erstellen" adds it and sets the gameplay scene).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: UI", fileName = "UIInstaller", order = 115)]
    public sealed class UIInstaller : ServiceInstaller
    {
        [Tooltip("Szene, die „Neues Spiel“ und „Laden“ laden (vorerst das Testgelände). Pfad wie in der Szenenliste, " +
                 "z. B. Assets/_Project/Scenes/Test/Testgelaende.unity.")]
        [SerializeField] private string gameplayScenePath = "Assets/_Project/Scenes/Test/Testgelaende.unity";

        [Tooltip("Titel des Ladebildschirms beim Laden dieser Szene.")]
        [SerializeField] private string gameplaySceneTitle = "Testgelände";

        [Tooltip("Dauer von „Halten zum Bestätigen“ in Sekunden (GDD 05, 1.4: 1,0; erlaubt 0,5–1,5).")]
        [Range(HoldToConfirm.MinDuration, HoldToConfirm.MaxDuration)]
        [SerializeField] private float holdDuration = HoldToConfirm.DefaultDuration;

        /// <summary>Scene key of the gameplay scene.</summary>
        public string GameplayScenePath => gameplayScenePath;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[]
        {
            typeof(IUIManager), typeof(IGlyphService), typeof(ILoadingScreen), typeof(IPlayerHudRegistry), typeof(IGameFlow)
        };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[]
        {
            typeof(IEventBus), typeof(IGameStateService), typeof(IInputService), typeof(ISaveManager), typeof(ISceneLoader)
        };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            IInputService input = locator.Get<IInputService>();
            var ui = new UIManager(new InputUiCommandSource(input.UI), () => Time.realtimeSinceStartupAsDouble, holdDuration);
            var glyphs = new GlyphService(locator.Get<IEventBus>(), input.ActiveGlyphFamily);
            var loadingScreen = new LoadingScreenProxy(ui);
            var players = new PlayerHudRegistry();
            var flow = new GameFlow(locator.Get<IGameStateService>(), locator.Get<ISceneLoader>(), locator.Get<ISaveManager>(), ui, loadingScreen,
                players, gameplayScenePath, gameplaySceneTitle, Application.exitCancellationToken);

            registry.Register<IUIManager>(ui);
            registry.Register<IGlyphService>(glyphs);
            registry.Register<ILoadingScreen>(loadingScreen);
            registry.Register<IPlayerHudRegistry>(players);
            registry.Register<IGameFlow>(flow);
        }
    }
}
