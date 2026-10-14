using System;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>One requirement of a <see cref="StateInteractable"/>: object id and the state it must have.</summary>
    [Serializable]
    public sealed class StateRequirement
    {
        [Tooltip("Objekt-, Rätsel-, Boss- oder Bedingungs-ID, z. B. boss.eichental.wachender_ritter.")]
        [SerializeField] private string objectId = string.Empty;

        [Tooltip("Geforderter Zustand (1 = erledigt/besiegt/gelöst/offen).")]
        [SerializeField] private int state = WorldObjectStates.Done;

        /// <summary>Creates an empty requirement (inspector).</summary>
        public StateRequirement()
        {
        }

        /// <summary>Creates a requirement.</summary>
        /// <param name="objectId">Id.</param>
        /// <param name="state">Required state.</param>
        public StateRequirement(string objectId, int state)
        {
            this.objectId = objectId ?? string.Empty;
            this.state = state;
        }

        /// <summary>Id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Required state.</summary>
        public int State => state;

        /// <summary>True if the store has the state.</summary>
        /// <param name="store">Store.</param>
        public bool IsMet(IWorldObjectStateStore store)
        {
            return store != null && store.GetState(ObjectId) == state;
        }
    }
}
