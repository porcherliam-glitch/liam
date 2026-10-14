using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Condition that declares a flag trigger.</summary>
    [Serializable]
    public sealed class FlagSwitch : Condition
    {
        private readonly string _key;

        public FlagSwitch(string key)
        {
            _key = key;
        }

        public override bool Evaluate(in ConditionContext ctx)
        {
            ctx.Get<SwitchBoard>().Evaluations++;
            return ctx.Get<SwitchBoard>().Get(_key);
        }

        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.OnFlag(_key);
        }
    }
}
