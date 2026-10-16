using System;
using Aetherfall.SaveSystem;
using Aetherfall.World.Exploration;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Saves and restores the exploration of the world (section <c>world</c>, architecture 9.2, load order 80; S34): fog,
    /// discovered places and viewpoints per map. A new game (data null) puts every map back into fog.
    /// </summary>
    public sealed class ExplorationSaveable : Saveable<ExplorationDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "world";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 80;

        private readonly IExplorationService _exploration;

        /// <summary>Creates the saveable.</summary>
        /// <param name="exploration">The registered exploration service.</param>
        public ExplorationSaveable(IExplorationService exploration) : base(Key, Order)
        {
            _exploration = exploration ?? throw new ArgumentNullException(nameof(exploration));
        }

        /// <inheritdoc />
        protected override ExplorationDto Capture()
        {
            return _exploration.Capture();
        }

        /// <inheritdoc />
        protected override void Restore(ExplorationDto data, in LoadContext ctx)
        {
            _exploration.Restore(data);
        }
    }
}
