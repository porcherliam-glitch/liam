using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Stand-in action for systems that do not exist yet (spawn enemies <c>Gegner+</c>, <c>GiveXp</c>, NPC relationship):
    /// writes its text into the <see cref="ActionLog"/> service.
    /// </summary>
    [Serializable]
    [TypeMenu("Test/Protokoll")]
    public sealed class RecordAction : GameAction
    {
        private readonly string _text;

        /// <summary>Creates the action.</summary>
        /// <param name="text">Effect text, e.g. <c>Gegner+ spawn.eichental.nordhang_rudel</c>.</param>
        public RecordAction(string text)
        {
            _text = text ?? string.Empty;
        }

        /// <summary>Effect text.</summary>
        public string Text => _text;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<ActionLog>().Add(ctx.SourceId, _text);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return _text;
        }
    }
}
