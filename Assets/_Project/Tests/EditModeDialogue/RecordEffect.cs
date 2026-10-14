using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Stand-in action for systems that do not exist yet: writes its text into the <see cref="EffectLog"/> service.</summary>
    [Serializable]
    public sealed class RecordEffect : GameAction
    {
        private readonly string _text;

        /// <summary>Creates the action.</summary>
        /// <param name="text">Effect text.</param>
        public RecordEffect(string text)
        {
            _text = text ?? string.Empty;
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<EffectLog>().Add(ctx.SourceId, _text);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return _text;
        }
    }
}
