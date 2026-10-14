using System;
using Aetherfall.Conditions;
using Aetherfall.Dialogue;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Test action that ends the running conversation from inside a step (like a partner who dies of a trap while talking).
    /// Checks the re-entrancy rule of the runner: the end happens at the next node, the line behind it is not shown.
    /// </summary>
    [Serializable]
    public sealed class EndRunningDialogue : GameAction
    {
        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IDialogueService>().ForceEnd("test action");
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Gespraech beenden";
        }
    }
}
