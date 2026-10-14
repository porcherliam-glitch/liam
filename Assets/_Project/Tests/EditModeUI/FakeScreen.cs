using System.Collections.Generic;
using Aetherfall.UI.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>A <see cref="UIScreen"/> without visual elements that records every call (tests of the manager and navigation).</summary>
    public sealed class FakeScreen : UIScreen
    {
        private readonly HashSet<int> _holdItems = new HashSet<int>();

        /// <summary>Creates a screen with a vertical list.</summary>
        /// <param name="id">Screen id.</param>
        /// <param name="items">Number of items.</param>
        public FakeScreen(string id, int items) : base(id, UILayer.Screens)
        {
            Focus = new FocusGroup(items);
        }

        /// <summary>Back reaction.</summary>
        public BackOutcome BackResult { get; set; } = BackOutcome.Close;

        /// <summary>Submitted indices.</summary>
        public List<int> Submitted { get; } = new List<int>();

        /// <summary>Tab deltas.</summary>
        public List<int> Tabs { get; } = new List<int>();

        /// <summary>Back calls (true = close button).</summary>
        public List<bool> Backs { get; } = new List<bool>();

        /// <summary>Adjust calls as (index, delta).</summary>
        public List<KeyValuePair<int, int>> Adjusts { get; } = new List<KeyValuePair<int, int>>();

        /// <summary>Last hold progress per call.</summary>
        public List<float> HoldValues { get; } = new List<float>();

        /// <summary>Focus changes as (previous, current).</summary>
        public List<KeyValuePair<int, int>> FocusChanges { get; } = new List<KeyValuePair<int, int>>();

        /// <summary>Open count.</summary>
        public int OpenCount { get; private set; }

        /// <summary>Close count.</summary>
        public int CloseCount { get; private set; }

        /// <summary>Ticks received.</summary>
        public int TickCount { get; private set; }

        /// <summary>True: left/right on item 0 adjusts a value.</summary>
        public bool AdjustsFirstItem { get; set; }

        /// <summary>Marks an item as hold-to-confirm.</summary>
        /// <param name="index">Item index.</param>
        public void MakeHold(int index)
        {
            _holdItems.Add(index);
        }

        /// <summary>Simulates a hover.</summary>
        /// <param name="index">Item index.</param>
        public void Hover(int index)
        {
            PointerEntered(index);
        }

        /// <summary>Simulates mouse button down/up.</summary>
        /// <param name="index">Item index.</param>
        /// <param name="held">True = down.</param>
        public void Press(int index, bool held)
        {
            PointerHold(index, held);
        }

        /// <summary>Simulates a click.</summary>
        /// <param name="index">Item index.</param>
        public void Click(int index)
        {
            PointerClicked(index);
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            Backs.Add(closeHub);
            return BackResult;
        }

        /// <inheritdoc />
        public override bool RequiresHold(int index)
        {
            return _holdItems.Contains(index);
        }

        /// <inheritdoc />
        public override bool TryAdjust(int index, int delta)
        {
            if (!AdjustsFirstItem || index != 0)
            {
                return false;
            }

            Adjusts.Add(new KeyValuePair<int, int>(index, delta));
            return true;
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            Submitted.Add(index);
        }

        /// <inheritdoc />
        public override void Tab(int delta)
        {
            Tabs.Add(delta);
        }

        /// <inheritdoc />
        public override void FocusChanged(int previous, int current)
        {
            FocusChanges.Add(new KeyValuePair<int, int>(previous, current));
        }

        /// <inheritdoc />
        public override void HoldProgress(int index, float progress01)
        {
            HoldValues.Add(progress01);
        }

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            TickCount++;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            OpenCount++;
            Focus.FocusFirst();
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            CloseCount++;
        }
    }
}
