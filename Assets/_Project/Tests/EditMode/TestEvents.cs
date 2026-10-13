// Event structs used only by the EditMode tests. Several event structs may share one file (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Test event with an integer payload.</summary>
    public readonly struct TestEventA : IGameEvent
    {
        /// <summary>Payload.</summary>
        public readonly int Value;

        /// <summary>Creates the event.</summary>
        /// <param name="value">Payload.</param>
        public TestEventA(int value)
        {
            Value = value;
        }
    }

    /// <summary>Second test event type, to check that delivery is per type.</summary>
    public readonly struct TestEventB : IGameEvent
    {
        /// <summary>Payload.</summary>
        public readonly string Id;

        /// <summary>Creates the event.</summary>
        /// <param name="id">Payload.</param>
        public TestEventB(string id)
        {
            Id = id;
        }
    }
}
