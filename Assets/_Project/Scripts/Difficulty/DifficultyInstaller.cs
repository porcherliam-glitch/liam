using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Difficulty
{
    /// <summary>Registers <see cref="IDifficultyService"/> (GDD 03 9.7) with its save section <c>difficulty</c>.</summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Schwierigkeit", fileName = "DifficultyInstaller", order = 115)]
    public sealed class DifficultyInstaller : ServiceInstaller
    {
        [Tooltip("Schwierigkeit eines neuen Spiels, bis der Spieler sie in den Optionen ändert.")]
        [SerializeField] private DifficultyLevel startLevel = DifficultyLevel.Normal;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IDifficultyService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var service = new DifficultyService(startLevel);
            locator.Get<ISaveManager>().Register(new DifficultySaveable(service));
            registry.Register<IDifficultyService>(service);
        }
    }
}
