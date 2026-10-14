using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Stand-in condition: a named switch of the <see cref="TestSwitches"/> service is on.</summary>
    [Serializable]
    public sealed class SwitchOn : Condition
    {
        private readonly string _name;

        /// <summary>Creates the condition.</summary>
        /// <param name="name">Switch name.</param>
        public SwitchOn(string name)
        {
            _name = name ?? string.Empty;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<TestSwitches>().Get(_name);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.Constant();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Schalter " + _name;
        }
    }
}
