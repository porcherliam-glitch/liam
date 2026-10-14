// Global events of NPCs (architecture 4.3, area "NPC/Fraktion": RelationshipChanged, NPCDied). Several event structs of one
// area may share a file (architecture 15.2, rule 18). Sender of all of them: Aetherfall.NPC.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The relationship of an NPC to the player changed (GDD 01, 7.5: -100 to +100). Receivers: condition watcher ("NPC/Beziehung
    /// mindestens"), UI (message), dialogue (situation bonus later). Not sent when a save is loaded.
    /// </summary>
    public readonly struct RelationshipChanged : IGameEvent
    {
        /// <summary>NPC id, e.g. <c>npc.eichental.bauer_hollmann</c>.</summary>
        public readonly string NpcId;

        /// <summary>Value before the change.</summary>
        public readonly int OldValue;

        /// <summary>Value after the change (clamped to -100 .. +100).</summary>
        public readonly int NewValue;

        /// <summary>Creates the event.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="oldValue">Old value.</param>
        /// <param name="newValue">New value.</param>
        public RelationshipChanged(string npcId, int oldValue, int newValue)
        {
            NpcId = npcId ?? string.Empty;
            OldValue = oldValue;
            NewValue = newValue;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "RelationshipChanged(" + NpcId + ": " + OldValue + " -> " + NewValue + ")";
        }
    }

    /// <summary>
    /// A named NPC died (killed in a fight, assassinated in a dialogue, quest action). Receivers: quests (death branches, GDD 02
    /// 6.6), condition watcher ("NPC/Lebt"), world (corpse), telemetry.
    /// </summary>
    public readonly struct NPCDied : IGameEvent
    {
        /// <summary>NPC id.</summary>
        public readonly string NpcId;

        /// <summary>Killer id (<c>player</c>, an NPC id) or empty if unknown.</summary>
        public readonly string KillerId;

        /// <summary>Creates the event.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="killerId">Killer id or empty.</param>
        public NPCDied(string npcId, string killerId)
        {
            NpcId = npcId ?? string.Empty;
            KillerId = killerId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "NPCDied(" + NpcId + " by '" + KillerId + "')";
        }
    }
}
