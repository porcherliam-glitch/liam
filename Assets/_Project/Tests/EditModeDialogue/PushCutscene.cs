using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Test action that starts a cutscene from inside a dialogue step (architecture 4.4 "Dialog → Zwischensequenz: Aktion im
    /// Dialog"): pushes the game state <c>Cutscene</c>, which replaces <c>Dialogue</c> on the modal stack.
    /// </summary>
    [Serializable]
    public sealed class PushCutscene : GameAction
    {
        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IGameStateService>().Push(GameState.Cutscene, "test cutscene");
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Zwischensequenz";
        }
    }
}
