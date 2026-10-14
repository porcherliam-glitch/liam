using Aetherfall.UI.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary><see cref="IUiCommandSource"/> test double: the test sets the frame that the next read returns.</summary>
    public sealed class FakeCommandSource : IUiCommandSource
    {
        /// <summary>Frame returned by the next <see cref="Read"/> (cleared afterwards unless <see cref="Sticky"/>).</summary>
        public UiInputFrame Next;

        /// <summary>True: the frame is kept for every following read (held buttons).</summary>
        public bool Sticky { get; set; }

        /// <inheritdoc />
        public bool IsActive { get; set; } = true;

        /// <summary>Number of reads.</summary>
        public int ReadCount { get; private set; }

        /// <inheritdoc />
        public void Read(ref UiInputFrame frame)
        {
            ReadCount++;
            int pointer = frame.PointerHoldIndex;
            frame = Next;
            frame.PointerHoldIndex = pointer;
            if (!Sticky)
            {
                Next = default;
            }
        }
    }
}
