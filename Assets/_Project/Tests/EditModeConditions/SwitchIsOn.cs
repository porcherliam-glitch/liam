using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Condition that reads a switch of the <see cref="SwitchBoard"/> service and declares <see cref="SwitchFlipped"/>.</summary>
    [Serializable]
    public sealed class SwitchIsOn : Condition
    {
        private readonly string _key;

        public SwitchIsOn()
        {
            _key = string.Empty;
        }

        public SwitchIsOn(string key)
        {
            _key = key;
        }

        public override bool Evaluate(in ConditionContext ctx)
        {
            SwitchBoard board = ctx.Get<SwitchBoard>();
            board.Evaluations++;
            board.Sources.Add(ctx.SourceId);
            board.Subjects.Add(ctx.SubjectId);
            return board.Get(_key);
        }

        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<SwitchFlipped>();
        }

        public override string Describe()
        {
            return "Schalter " + _key;
        }
    }
}
