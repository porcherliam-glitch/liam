using System;
using Aetherfall.Conditions;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Action "Weltobjekt-Zustand setzen" (quest action "Tuer oeffnen/schliessen", GDD 02 6.4): writes a state under an id, e.g.
    /// <c>door.eichental.gruft_fluchtweg_tor = 1</c> opens the door, <c>= 2</c> keeps it closed (doors: own state overrides
    /// their rule). Saved with the world objects.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Weltobjekt-Zustand setzen", 2)]
    public sealed class SetWorldObjectState : GameAction
    {
        [Tooltip("Objekt- oder Tür-ID.")]
        [SerializeField] private string objectId = string.Empty;

        [Tooltip("Neuer Zustand (Tür: 1 = offen, 2 = zu, 0 = wieder nach Regel).")]
        [SerializeField] private int state = WorldObjectStates.Done;

        /// <summary>Creates an empty action.</summary>
        public SetWorldObjectState()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="objectId">Object id.</param>
        /// <param name="state">New state.</param>
        public SetWorldObjectState(string objectId, int state)
        {
            this.objectId = objectId ?? string.Empty;
            this.state = state;
        }

        /// <summary>Object id.</summary>
        public string ObjectId => objectId;

        /// <summary>New state.</summary>
        public int State => state;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            if (!string.IsNullOrEmpty(objectId))
            {
                ctx.Get<IWorldObjectStateStore>().SetState(objectId, state);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Setze Weltobjekt " + (string.IsNullOrEmpty(objectId) ? "?" : objectId) + " = " + state;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(objectId, string.Empty, "Objekt-ID");
        }
    }
}
