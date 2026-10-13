// Global events of the world area (architecture 4.3, "Weitere verbindliche Event-Namen", area Welt). Several event structs
// of one area may share a file (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player interacted with a world object (chest opened, loot picked up, later lever, door, NPC). Sender: the
    /// player's interactor. Receivers: quests, telemetry (pacing: "ChestOpened → Interacted (Verb open)", architecture 14.5).
    /// </summary>
    public readonly struct Interacted : IGameEvent
    {
        /// <summary>Stable id of the object (<c>obj.*</c>, <c>rt.*</c>, NPC id).</summary>
        public readonly string ObjectId;

        /// <summary>Verb id (Aetherfall.Core.InteractionVerbs), e.g. <c>open</c>, <c>pickup</c>.</summary>
        public readonly string Verb;

        /// <summary>Creates the event.</summary>
        /// <param name="objectId">Object id.</param>
        /// <param name="verb">Verb id.</param>
        public Interacted(string objectId, string verb)
        {
            ObjectId = objectId ?? string.Empty;
            Verb = verb ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "Interacted(" + ObjectId + ", " + Verb + ")";
        }
    }
}
