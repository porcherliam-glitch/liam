using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using UnityEngine;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Registers the cutscenes and the dialogue camera (S58): <see cref="ICutsceneService"/> (the scene's recorded cutscenes register
    /// themselves) and <see cref="IDialogueCameraDirector"/> (its cameras live in the boot scene).
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/CinematicsInstaller.asset</c>. Order in the BootConfig: after the EventBus,
    /// GameState and Dialogue installers, before the UI installer. The menus "Aetherfall > Eichental erstellen" and
    /// "Aetherfall > Testgelaende erstellen" put it there.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Zwischensequenzen", fileName = "CinematicsInstaller", order = 114)]
    public sealed class CinematicsInstaller : ServiceInstaller
    {
        [Tooltip("Zwischensequenzen abspielen. Aus: jede Anfrage endet sofort als übersprungen (Tests, Werkzeuge).")]
        [SerializeField] private bool playCutscenes = true;

        [Tooltip("So viele Sekunden im Spiel wartet eine Anfrage auf die Aufnahme der Szene, bevor sie verworfen wird.")]
        [Min(0f)] [SerializeField] private float missingPlayerGraceSeconds = 2f;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ICutsceneService), typeof(IDialogueCameraDirector) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IGameStateService), typeof(IDialogueService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<ICutsceneService>(new CutsceneService(locator.Get<IEventBus>(), locator.Get<IGameStateService>(), playCutscenes,
                missingPlayerGraceSeconds));
            registry.Register<IDialogueCameraDirector>(new DialogueCameraDirector(locator.Get<IDialogueService>(), locator.Get<IGameStateService>()));
        }
    }
}
