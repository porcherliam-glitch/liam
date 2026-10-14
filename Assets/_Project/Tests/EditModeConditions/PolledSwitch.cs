using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Condition without triggers (polled by the watcher).</summary>
    [Serializable]
    public sealed class PolledSwitch : Condition
    {
        private readonly string _key;

        public PolledSwitch(string key)
        {
            _key = key;
        }

        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<SwitchBoard>().Get(_key);
        }
    }
}
