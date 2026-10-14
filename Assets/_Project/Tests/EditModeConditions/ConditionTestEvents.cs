// Test events of the condition tests (several event structs may share an *Events.cs file).

using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Test event that switch conditions declare as trigger.</summary>
    public readonly struct SwitchFlipped : IGameEvent
    {
        public readonly string Key;

        public SwitchFlipped(string key)
        {
            Key = key;
        }
    }

    /// <summary>Unrelated test event (must not wake switch conditions).</summary>
    public readonly struct UnrelatedHappened : IGameEvent
    {
        public readonly int Value;

        public UnrelatedHappened(int value)
        {
            Value = value;
        }
    }
}
