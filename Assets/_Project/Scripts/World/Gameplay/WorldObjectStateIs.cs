using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Condition "Weltobjekt-Zustand" (architecture 9.7): a world object (lever, cage, door, checkpoint, beaten boss) has the
    /// given state, e.g. <c>obj.eichental.gruft_kaefig = 1</c> (Fenn freed) or <c>boss.eichental.wachender_ritter = 1</c>.
    /// Re-evaluated on <c>WorldObjectStateChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Weltobjekt-Zustand", 2)]
    public sealed class WorldObjectStateIs : Condition
    {
        [Tooltip("Objekt-, Tür-, Rätsel- oder Boss-ID.")]
        [SerializeField] private string objectId = string.Empty;

        [Tooltip("Geforderter Zustand (1 = erledigt/offen/gelöst/besiegt, 0 = Anfangszustand).")]
        [SerializeField] private int state = WorldObjectStates.Done;

        /// <summary>Creates an empty condition.</summary>
        public WorldObjectStateIs()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="objectId">Object id.</param>
        /// <param name="state">Required state.</param>
        public WorldObjectStateIs(string objectId, int state)
        {
            this.objectId = objectId ?? string.Empty;
            this.state = state;
        }

        /// <summary>Object id.</summary>
        public string ObjectId => objectId;

        /// <summary>Required state.</summary>
        public int State => state;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IWorldObjectStateStore>().GetState(objectId) == state;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<WorldObjectStateChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Weltobjekt " + (string.IsNullOrEmpty(objectId) ? "?" : objectId) + " = " + state;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(objectId, string.Empty, "Objekt-ID");
        }
    }
}
