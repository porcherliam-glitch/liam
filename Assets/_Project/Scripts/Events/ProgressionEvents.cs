// Global events of the progression system (architecture 4.3, events #26 and #27). Defined now so that the HUD can show
// experience and level-up messages; the sender (Aetherfall.Progression) follows with the experience step. Several event
// structs of one area may share a file (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>The player gained experience points. Sender: Progression. Receivers: UI (message "+50 EP").</summary>
    public readonly struct XpGained : IGameEvent
    {
        /// <summary>Gained experience points (positive).</summary>
        public readonly int Amount;

        /// <summary>Id of the source, e.g. an enemy type or quest id; empty if unknown.</summary>
        public readonly string SourceId;

        /// <summary>Creates the event.</summary>
        /// <param name="amount">Gained experience points.</param>
        /// <param name="sourceId">Id of the source.</param>
        public XpGained(int amount, string sourceId)
        {
            Amount = amount;
            SourceId = sourceId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "XpGained(" + Amount + ", '" + SourceId + "')";
        }
    }

    /// <summary>
    /// The player reached a new level. Sender: Progression. Receivers: UI (milestone banner), audio, condition watcher,
    /// telemetry.
    /// </summary>
    public readonly struct LevelUp : IGameEvent
    {
        /// <summary>The new level.</summary>
        public readonly int NewLevel;

        /// <summary>Creates the event.</summary>
        /// <param name="newLevel">The new level.</param>
        public LevelUp(int newLevel)
        {
            NewLevel = newLevel;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "LevelUp(" + NewLevel + ")";
        }
    }
}
