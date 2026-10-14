using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Saves and restores the section <c>npcs</c> (architecture 9.2, load order 70): relationship, alive, hostile NPCs and groups.
    /// </summary>
    public sealed class NpcSaveable : Saveable<NpcsDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "npcs";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 70;

        private readonly NpcService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">NPC service.</param>
        public NpcSaveable(NpcService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override NpcsDto Capture()
        {
            return _service.Capture();
        }

        /// <inheritdoc />
        protected override void Restore(NpcsDto data, in LoadContext ctx)
        {
            _service.Restore(data);
        }
    }
}
