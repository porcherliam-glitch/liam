using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Action that writes its name into the switch board log (and optionally sets a switch).</summary>
    [Serializable]
    public sealed class LogAction : GameAction
    {
        private readonly string _name;
        private readonly string _switchToSet;

        public LogAction(string name, string switchToSet = null)
        {
            _name = name;
            _switchToSet = switchToSet;
        }

        public override void Execute(in ActionContext ctx)
        {
            SwitchBoard board = ctx.Get<SwitchBoard>();
            board.Log.Add(_name);
            board.Sources.Add(ctx.SourceId);
            board.Subjects.Add(ctx.SubjectId);
            if (_switchToSet != null)
            {
                board.Set(_switchToSet, true);
            }
        }
    }
}
