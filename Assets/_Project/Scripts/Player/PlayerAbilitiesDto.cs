using UnityEngine.Scripting;

namespace Aetherfall.Player
{
    /// <summary>
    /// Save section <c>abilities.player</c> (load order 46): the ability bar (2 × 4 slots, GDD 03 11.8), the active bar, the
    /// abilities learned by the player (skill tree; flags and the class grant theirs themselves) and the abilities already
    /// placed on the bar once (a learned ability is placed automatically only the first time). Cooldowns and running buffs are
    /// not saved (seconds long).
    /// </summary>
    [Preserve]
    public sealed class PlayerAbilitiesDto
    {
        /// <summary>Ability ids of the 8 slots (0–3 bar 1, 4–7 bar 2); empty strings for empty slots.</summary>
        public string[] Bar;

        /// <summary>Active bar, 0 or 1.</summary>
        public int ActiveBar;

        /// <summary>Abilities learned by the player.</summary>
        public string[] Learned;

        /// <summary>Abilities already placed on the bar once.</summary>
        public string[] Offered;
    }
}
