using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Condition that declares no trigger (the watcher polls it once per second, the validator reports hint C01). Never holds.
    /// </summary>
    [Serializable]
    [TypeMenu("Test/Ohne Ausloeser")]
    public sealed class PolledTestCondition : Condition
    {
        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return false;
        }
    }
}
