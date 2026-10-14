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
    /// <see cref="IPlayerHudRegistry"/> and the <see cref="IGameFlow"/> of the menus (also as <see cref="IGameLoader"/>). The
    /// visual part (UIDocuments, screens) is attached later by <see cref="UIRoot"/> in the boot scene.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/UIInstaller.asset</c>, last entry of the BootConfig (the menu
    /// "Aetherfall > Oberflaeche einrichten" or "Aetherfall > Testgelaende erstellen" adds it and sets the gameplay scene; the
    /// world generators enter their world space in <see cref="WorldSpaces"/>).
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

        [Tooltip("Welt-ID → Szene: „Laden“ öffnet die Szene, in der der Spielstand gemacht wurde (z. B. die Gruft). " +
                 "Die Generatoren tragen ihre Welt hier ein; unbekannte Welt-IDs laden die Szene oben.")]
        [SerializeField] private WorldSpaceScene[] worldSpaces = new WorldSpaceScene[0];

        /// <summary>Scene key of the gameplay scene.</summary>
        public string GameplayScenePath => gameplayScenePath;

        /// <summary>The known world spaces (for editor tools and tests).</summary>
        public IReadOnlyList<WorldSpaceScene> WorldSpaces => worldSpaces ?? new WorldSpaceScene[0];

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[]
        {
            typeof(IUIManager), typeof(IGlyphService), typeof(ILoadingScreen), typeof(IPlayerHudRegistry), typeof(IGameFlow), typeof(IGameLoader)
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
            var directory = new WorldSpaceDirectory();
            for (int i = 0; worldSpaces != null && i < worldSpaces.Length; i++)
            {
                directory.Add(worldSpaces[i].WorldSpaceId, worldSpaces[i].ScenePath, worldSpaces[i].Title);
            }

            var flow = new GameFlow(locator.Get<IGameStateService>(), locator.Get<ISceneLoader>(), locator.Get<ISaveManager>(), ui, loadingScreen,
                players, gameplayScenePath, gameplaySceneTitle, Application.exitCancellationToken, null, directory);

            registry.Register<IUIManager>(ui);
            registry.Register<IGlyphService>(glyphs);
            registry.Register<ILoadingScreen>(loadingScreen);
            registry.Register<IPlayerHudRegistry>(players);
            registry.Register<IGameFlow>(flow);
            registry.Register<IGameLoader>(flow);
        }
    }

    /// <summary>One entry of <see cref="UIInstaller"/>: which scene belongs to a world space.</summary>
    [Serializable]
    public struct WorldSpaceScene
    {
        [Tooltip("Welt-ID, z. B. worldspace.eichental.gruft.")]
        [SerializeField] private string worldSpaceId;

        [Tooltip("Szene als Pfad wie in der Szenenliste.")]
        [SerializeField] private string scenePath;

        [Tooltip("Titel des Ladebildschirms.")]
        [SerializeField] private string title;

        /// <summary>Creates an entry.</summary>
        /// <param name="worldSpaceId">World space id.</param>
        /// <param name="scenePath">Scene path.</param>
        /// <param name="title">Loading screen title.</param>
        public WorldSpaceScene(string worldSpaceId, string scenePath, string title)
        {
            this.worldSpaceId = worldSpaceId;
            this.scenePath = scenePath;
            this.title = title;
        }

        /// <summary>World space id.</summary>
        public string WorldSpaceId => worldSpaceId ?? string.Empty;

        /// <summary>Scene path.</summary>
        public string ScenePath => scenePath ?? string.Empty;

        /// <summary>Loading screen title.</summary>
        public string Title => title ?? string.Empty;
    }
}
