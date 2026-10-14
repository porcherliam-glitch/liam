using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Stand-in for the condition <c>TimeOfDayBetween</c> (architecture 7.7, assembly GameTime; not built yet): holds while the
    /// hour of the <see cref="TestDayClock"/> is in the window. Re-evaluated every game hour.
    /// </summary>
    [Serializable]
    [TypeMenu("Test/Tageszeit zwischen")]
    public sealed class TestHourBetween : Condition
    {
        private readonly int _fromHour;
        private readonly int _toHour;

        /// <summary>Creates the condition (window from inclusive, to exclusive).</summary>
        /// <param name="fromHour">First hour.</param>
        /// <param name="toHour">Hour after the window.</param>
        public TestHourBetween(int fromHour, int toHour)
        {
            _fromHour = fromHour;
            _toHour = toHour;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            int hour = ctx.Get<TestDayClock>().Hour;
            return _fromHour <= _toHour ? hour >= _fromHour && hour < _toHour : hour >= _fromHour || hour < _toHour;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.OnGameHour();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Tageszeit " + _fromHour + "–" + _toHour + " Uhr";
        }
    }
}
