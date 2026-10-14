using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>A menu screen without visual elements that counts opening and closing and records error lines.</summary>
    public sealed class FakeMenuScreen : UIScreen, IErrorDisplay
    {
        /// <summary>Creates the screen with two items.</summary>
        /// <param name="id">Screen id.</param>
        public FakeMenuScreen(string id) : base(id, UILayer.Screens)
        {
            Focus = new FocusGroup(2);
        }

        /// <summary>Number of times the screen opened.</summary>
        public int OpenCount { get; private set; }

        /// <summary>Number of times the screen closed.</summary>
        public int CloseCount { get; private set; }

        /// <summary>Arguments of the last opening.</summary>
        public object LastArgs { get; private set; }

        /// <summary>Last error line, or null.</summary>
        public string LastError { get; private set; }

        /// <inheritdoc />
        public override void Submit(int index)
        {
        }

        /// <inheritdoc />
        public void ShowError(string message)
        {
            LastError = message;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            OpenCount++;
            LastArgs = args;
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            CloseCount++;
        }
    }
}
