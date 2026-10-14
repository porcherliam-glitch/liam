using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>Command source without input (the flow tests do not navigate).</summary>
    public sealed class NoInput : IUiCommandSource
    {
        /// <inheritdoc />
        public bool IsActive => false;

        /// <inheritdoc />
        public void Read(ref UiInputFrame frame)
        {
        }
    }
}
