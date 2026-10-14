using Aetherfall.UI.Framework;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>A <see cref="UIScreen"/> without visual elements that counts opening and closing (director tests).</summary>
    public sealed class StubScreen : UIScreen
    {
        /// <summary>Creates the screen.</summary>
        public StubScreen() : base("screen.dialogue", UILayer.Screens)
        {
            Focus = new FocusGroup(0);
        }

        /// <summary>Open count.</summary>
        public int OpenCount { get; private set; }

        /// <summary>Close count.</summary>
        public int CloseCount { get; private set; }

        /// <inheritdoc />
        public override void Submit(int index)
        {
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            OpenCount++;
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            CloseCount++;
        }
    }
}
