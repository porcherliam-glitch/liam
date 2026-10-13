using System.Collections.Generic;
using Aetherfall.Combat;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Test double of <see cref="IHitWindowReceiver"/>: records every open and close.</summary>
    public sealed class RecordingHitWindow : IHitWindowReceiver
    {
        /// <summary>Attacks whose window opened, in order.</summary>
        public List<AttackSpec> Opened { get; } = new List<AttackSpec>();

        /// <summary>Number of closes.</summary>
        public int CloseCount { get; private set; }

        /// <summary>True while a window is open.</summary>
        public bool IsOpen { get; private set; }

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
            Opened.Add(attack);
            IsOpen = true;
        }

        /// <inheritdoc />
        public void CloseHitWindow()
        {
            CloseCount++;
            IsOpen = false;
        }
    }
}
