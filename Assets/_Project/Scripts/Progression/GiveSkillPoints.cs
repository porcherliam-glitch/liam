using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Action "Skillpunkt geben" (architecture 7.7 proposal <c>GiveSkillPoint</c>, GDD 03 12.2: extra skill points from puzzle
    /// quests, great secrets, act endings and companion quests).
    /// </summary>
    [Serializable]
    [TypeMenu("Spieler/Skillpunkt geben", 1)]
    public sealed class GiveSkillPoints : GameAction
    {
        [Tooltip("Anzahl Skillpunkte.")]
        [Min(1)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty action (1 point).</summary>
        public GiveSkillPoints()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="amount">Points.</param>
        public GiveSkillPoints(int amount)
        {
            this.amount = amount;
        }

        /// <summary>Points.</summary>
        public int Amount => amount;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IProgressionService>().AddSkillPoints(amount, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Skillpunkte +" + amount;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequirePositive(amount, "Skillpunkte");
        }
    }
}
