using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// One visible answer of the current choice as the dialogue screen shows it (GDD 02, 12.4): text, tag and symbol derived
    /// from checks and actions, selectable or greyed (and why), already chosen, hold to confirm.
    /// </summary>
    public sealed class DialogueOptionView
    {
        /// <summary>Creates an option view.</summary>
        /// <param name="optionId">Option id.</param>
        /// <param name="text">Text without tag.</param>
        /// <param name="textKey">Localization key.</param>
        /// <param name="marks">Derived markings.</param>
        /// <param name="enabled">True if selectable.</param>
        /// <param name="check">Check preview (valid if <see cref="DialogueOptionMarks.Check"/>).</param>
        /// <param name="price">Bribe price (valid if <see cref="DialogueOptionMarks.Bribe"/>; 0 = unknown).</param>
        /// <param name="requirement">Lock reason ("Magier"), empty if none.</param>
        /// <param name="diceMode">True if checks are shown with their chance.</param>
        public DialogueOptionView(string optionId, string text, string textKey, DialogueOptionMarks marks, bool enabled, SkillCheckResult check,
            int price, string requirement, bool diceMode)
        {
            OptionId = optionId ?? string.Empty;
            Text = text ?? string.Empty;
            TextKey = textKey ?? string.Empty;
            Marks = marks;
            IsEnabled = enabled;
            Check = check;
            Price = price;
            Requirement = requirement ?? string.Empty;
            DiceMode = diceMode;
            Tag = DialogueOptionFormatter.TagOf(marks);
            Symbol = DialogueOptionFormatter.SymbolOf(marks, Tag);
            TagText = DialogueOptionFormatter.TagText(this);
        }

        /// <summary>Option id.</summary>
        public string OptionId { get; }

        /// <summary>Text without tag.</summary>
        public string Text { get; }

        /// <summary>Localization key <c>&lt;dialogue&gt;.&lt;node&gt;.&lt;option&gt;</c>.</summary>
        public string TextKey { get; }

        /// <summary>All derived markings.</summary>
        public DialogueOptionMarks Marks { get; }

        /// <summary>True if the option can be chosen.</summary>
        public bool IsEnabled { get; }

        /// <summary>Preview of the check (threshold and own value).</summary>
        public SkillCheckResult Check { get; }

        /// <summary>Bribe price in gold.</summary>
        public int Price { get; }

        /// <summary>Lock reason.</summary>
        public string Requirement { get; }

        /// <summary>True if checks show their chance (dice mode).</summary>
        public bool DiceMode { get; }

        /// <summary>The bracket tag shown in front of the text.</summary>
        public DialogueOptionTag Tag { get; }

        /// <summary>The quest symbol shown in front of the text.</summary>
        public DialogueQuestSymbol Symbol { get; }

        /// <summary>Tag text, e.g. "[Ueberzeugen 12]", "[80 Gold]", "[Ende]"; empty if none.</summary>
        public string TagText { get; }

        /// <summary>True if the option needs hold to confirm ("[Toeten]").</summary>
        public bool RequiresHold => (Marks & DialogueOptionMarks.Kill) != 0;

        /// <summary>True if the option was chosen before (60 % opacity).</summary>
        public bool IsAlreadyChosen => (Marks & DialogueOptionMarks.AlreadyChosen) != 0;

        /// <summary>True if this option ends the conversation ("[Ende]").</summary>
        public bool IsEndOption => Tag == DialogueOptionTag.End;

        /// <summary>
        /// True if B / Circle / Esc chooses this option: "[Ende]", or an untagged answer that returns from a jumped-to dialogue
        /// ("Zurueck", <see cref="DialogueOptionMarks.Return"/>).
        /// </summary>
        public bool IsBackOption => IsEndOption || (Tag == DialogueOptionTag.None && (Marks & DialogueOptionMarks.Return) != 0);

        /// <summary>Attribute colour key of a check (<c>charisma</c>, <c>strength</c>); empty without check.</summary>
        public string AttributeKey => (Marks & DialogueOptionMarks.Check) != 0 ? SkillCheckRules.AttributeColorKey(Check.Attribute) : string.Empty;

        /// <summary>Text shown in the list: symbol, tag and text.</summary>
        public string DisplayText => DialogueOptionFormatter.DisplayText(this);

        /// <inheritdoc />
        public override string ToString()
        {
            return OptionId + ": " + DisplayText + (IsEnabled ? string.Empty : " (grau)");
        }
    }
}
