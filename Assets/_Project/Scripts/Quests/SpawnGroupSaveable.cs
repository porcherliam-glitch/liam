using System;
using Aetherfall.SaveSystem;
using Aetherfall.World;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Saves the <see cref="ISpawnGroupRegistry"/> of the world (section <c>spawners</c>, architecture 9.2, load order 88): which
    /// quest groups (<c>Gegner+(spawn-id)</c>) are switched on and which are defeated. Without it a pack that a quest stage
    /// called would be missing after loading, because the start actions of a stage do not run again.
    /// </summary>
    /// <remarks>
    /// Registered by the <see cref="QuestInstaller"/> and not by the World installer: Aetherfall.World must compile without the
    /// Newtonsoft package and therefore cannot reference the save system (asmdef <c>defineConstraints</c>).
    /// </remarks>
    public sealed class SpawnGroupSaveable : Saveable<SpawnGroupsDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "spawners";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 88;

        private readonly ISpawnGroupRegistry _registry;

        /// <summary>Creates the saveable.</summary>
        /// <param name="registry">Registry of the enemy groups.</param>
        public SpawnGroupSaveable(ISpawnGroupRegistry registry) : base(Key, Order)
        {
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        }

        /// <inheritdoc />
        protected override SpawnGroupsDto Capture()
        {
            var dto = new SpawnGroupsDto();
            dto.Activated.AddRange(_registry.ActivatedIds);
            dto.Cleared.AddRange(_registry.ClearedIds);
            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(SpawnGroupsDto data, in LoadContext ctx)
        {
            _registry.Restore(data?.Activated, data?.Cleared);
        }
    }
}
