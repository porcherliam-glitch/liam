using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>A trap: what triggers it, how much damage it does (share of the max health) and where it shoots from.</summary>
    public sealed class DungeonTrap
    {
        /// <summary>Id, e.g. <c>trap.eichental.gruft_pfeilfalle</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Kind, e.g. <c>arrows</c>.</summary>
        public string Kind { get; set; } = "arrows";

        /// <summary>Damage as share of the player's maximum health (GDD 02 11.7: 10 %).</summary>
        public float DamageFraction { get; set; } = 0.1f;

        /// <summary>Trigger: <c>puzzleFailed</c> or <c>pressurePlate</c>.</summary>
        public DungeonTrigger Trigger { get; set; } = new DungeonTrigger();

        /// <summary>Objects (kind <c>trap_slit</c>) the arrows come out of.</summary>
        public List<string> Slits { get; } = new List<string>();
    }
}
