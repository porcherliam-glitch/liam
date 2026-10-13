using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>Who interacts with an <see cref="IInteractable"/> and from where (plain values, no object references).</summary>
    public readonly struct InteractionContext
    {
        /// <summary>Id of the interacting actor: <c>player</c> (reserved id, architecture 6.1) or a companion id.</summary>
        public readonly string InteractorId;

        /// <summary>World position of the interacting actor (feet).</summary>
        public readonly Vector3 Position;

        /// <summary>True while the actor is in combat (e.g. no looting of equipment in combat, GDD 04 5.9).</summary>
        public readonly bool InCombat;

        /// <summary>Creates the context.</summary>
        /// <param name="interactorId">Id of the actor; null is stored as empty.</param>
        /// <param name="position">World position of the actor.</param>
        /// <param name="inCombat">True while the actor is in combat.</param>
        public InteractionContext(string interactorId, Vector3 position, bool inCombat)
        {
            InteractorId = interactorId ?? string.Empty;
            Position = position;
            InCombat = inCombat;
        }
    }
}
