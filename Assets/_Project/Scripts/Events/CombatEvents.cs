// Global events of the combat system (architecture 4.3). Several event structs of one area may share a file
// (architecture 15.2, rule 18). Event #11 is defined already now because the save system blocks saving in combat
// (architecture 9.8); the combat system sends it from Phase 2 on.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player entered or left combat (GDD 05 5.2: an enemy targets the player, or damage dealt or taken in the last
    /// 5 s). Receivers: save system (save lock), audio, UI.
    /// </summary>
    public readonly struct CombatStateChanged : IGameEvent
    {
        /// <summary>True while in combat.</summary>
        public readonly bool InCombat;

        /// <summary>Creates the event.</summary>
        /// <param name="inCombat">True while in combat.</param>
        public CombatStateChanged(bool inCombat)
        {
            InCombat = inCombat;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CombatStateChanged(inCombat=" + InCombat + ")";
        }
    }
}
