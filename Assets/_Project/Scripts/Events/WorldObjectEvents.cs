// Global events of persistent world objects (architecture 9.7 "WorldObjectState": doors, levers, cages, chests of a dungeon).
// Several event structs of one area may share a file (architecture 15.2, rule 18). Sender: the world object state service of
// Aetherfall.World (every change while playing; not on loading, the condition watcher re-evaluates everything after a load).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The state of a world object changed while playing (lever pulled, cage opened, door opened by a quest action, boss beaten).
    /// Receivers: condition watchers (conditions "Weltobjekt-Zustand", "Raetsel geloest"), quest objectives, telemetry.
    /// </summary>
    public readonly struct WorldObjectStateChanged : IGameEvent
    {
        /// <summary>Object, puzzle, door or boss id, e.g. <c>obj.eichental.gruft_kaefig</c>.</summary>
        public readonly string ObjectId;

        /// <summary>New state (0 = start state, 1 = done/open/solved/beaten; meaning per object).</summary>
        public readonly int State;

        /// <summary>Creates the event.</summary>
        /// <param name="objectId">Object id.</param>
        /// <param name="state">New state.</param>
        public WorldObjectStateChanged(string objectId, int state)
        {
            ObjectId = objectId ?? string.Empty;
            State = state;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "WorldObjectStateChanged(" + ObjectId + " = " + State + ")";
        }
    }
}
