using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Action that throws.</summary>
    [Serializable]
    public sealed class ThrowingAction : GameAction
    {
        public override void Execute(in ActionContext ctx)
        {
            throw new InvalidOperationException("boom");
        }
    }
}
