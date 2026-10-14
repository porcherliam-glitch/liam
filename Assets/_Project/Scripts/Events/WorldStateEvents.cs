// Global events of the world state (architecture 4.3, event #18). Several event structs of one area may share a file
// (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A world state flag got a new value (architecture 8.3: sent synchronously after every real change, never for an
    /// unchanged value). Sender: WorldState. Receivers: condition watcher, world, NPCs, quests.
    /// </summary>
    public readonly struct FlagChanged : IGameEvent
    {
        /// <summary>Flag id, e.g. <c>flag.eichental.dorf_zerstoert</c> or <c>stat.global.banditen_getoetet</c>.</summary>
        public readonly string FlagId;

        /// <summary>Value before the change (bool flags: 0 or 1).</summary>
        public readonly int OldValue;

        /// <summary>Value after the change.</summary>
        public readonly int NewValue;

        /// <summary>Creates the event.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="oldValue">Old value.</param>
        /// <param name="newValue">New value.</param>
        public FlagChanged(string flagId, int oldValue, int newValue)
        {
            FlagId = flagId ?? string.Empty;
            OldValue = oldValue;
            NewValue = newValue;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "FlagChanged(" + FlagId + ": " + OldValue + " -> " + NewValue + ")";
        }
    }
}
