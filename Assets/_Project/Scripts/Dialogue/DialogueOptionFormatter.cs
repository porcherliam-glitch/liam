using System;
using System.Globalization;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Turns the derived <see cref="DialogueOptionMarks"/> of an option into the visible tag and symbol (GDD 02, 12.4), pure
    /// logic:
    /// <list type="bullet">
    /// <item>one bracket tag by priority: "[Toeten]" › "[Angriff]" › "[Ueberzeugen 12]" › "[80 Gold]" › "[Grund]" › "[Handel]" ›
    /// "[Ende]"</item>
    /// <item>one quest symbol by priority: star (complete) › "!" (new quest) › diamond (progress); the diamond only on options
    /// without a tag (the example dialogue 12.10 shows "[80 Gold] Nehmt das Gold …" without diamond).</item>
    /// </list>
    /// </summary>
    public static class DialogueOptionFormatter
    {
        /// <summary>Symbol of quest progress.</summary>
        public const string ProgressSymbol = "◆";

        /// <summary>Symbol of a new quest.</summary>
        public const string NewQuestSymbol = "!";

        /// <summary>Symbol of a quest completion.</summary>
        public const string CompleteSymbol = "★";

        /// <summary>The bracket tag of a set of markings.</summary>
        /// <param name="marks">Markings.</param>
        public static DialogueOptionTag TagOf(DialogueOptionMarks marks)
        {
            if (Has(marks, DialogueOptionMarks.Kill))
            {
                return DialogueOptionTag.Kill;
            }

            if (Has(marks, DialogueOptionMarks.Combat))
            {
                return DialogueOptionTag.Combat;
            }

            if (Has(marks, DialogueOptionMarks.Check))
            {
                return DialogueOptionTag.Check;
            }

            if (Has(marks, DialogueOptionMarks.Bribe))
            {
                return DialogueOptionTag.Bribe;
            }

            if (Has(marks, DialogueOptionMarks.Requirement))
            {
                return DialogueOptionTag.Requirement;
            }

            if (Has(marks, DialogueOptionMarks.Trade))
            {
                return DialogueOptionTag.Trade;
            }

            return Has(marks, DialogueOptionMarks.End) ? DialogueOptionTag.End : DialogueOptionTag.None;
        }

        /// <summary>The quest symbol of a set of markings.</summary>
        /// <param name="marks">Markings.</param>
        /// <param name="tag">The tag chosen by <see cref="TagOf"/>.</param>
        public static DialogueQuestSymbol SymbolOf(DialogueOptionMarks marks, DialogueOptionTag tag)
        {
            if (Has(marks, DialogueOptionMarks.QuestComplete))
            {
                return DialogueQuestSymbol.Complete;
            }

            if (Has(marks, DialogueOptionMarks.NewQuest))
            {
                return DialogueQuestSymbol.NewQuest;
            }

            return Has(marks, DialogueOptionMarks.QuestProgress) && tag == DialogueOptionTag.None ? DialogueQuestSymbol.Progress : DialogueQuestSymbol.None;
        }

        /// <summary>Text of the quest symbol ("◆", "!", "★") or empty.</summary>
        /// <param name="symbol">Symbol.</param>
        public static string SymbolText(DialogueQuestSymbol symbol)
        {
            switch (symbol)
            {
                case DialogueQuestSymbol.Complete: return CompleteSymbol;
                case DialogueQuestSymbol.NewQuest: return NewQuestSymbol;
                case DialogueQuestSymbol.Progress: return ProgressSymbol;
                default: return string.Empty;
            }
        }

        /// <summary>The German tag text of an option, e.g. "[Ueberzeugen 12 · dein Wert 9]"; empty without tag.</summary>
        /// <param name="option">Option.</param>
        public static string TagText(DialogueOptionView option)
        {
            if (option == null)
            {
                return string.Empty;
            }

            switch (option.Tag)
            {
                case DialogueOptionTag.Kill:
                    return "[Töten]";
                case DialogueOptionTag.Combat:
                    return "[Angriff]";
                case DialogueOptionTag.Check:
                    return CheckText(option.Check, option.DiceMode);
                case DialogueOptionTag.Bribe:
                    return option.Price > 0 ? "[" + option.Price.ToString(CultureInfo.InvariantCulture) + " Gold]" : "[Gold]";
                case DialogueOptionTag.Requirement:
                    return "[" + option.Requirement + "]";
                case DialogueOptionTag.Trade:
                    return "[Handel]";
                case DialogueOptionTag.End:
                    return "[Ende]";
                default:
                    return string.Empty;
            }
        }

        /// <summary>
        /// Tag of a check: "[Ueberzeugen 12]" (met), "[Ueberzeugen 12 · dein Wert 9]" (not met, deterministic),
        /// "[Ueberzeugen · 65 %]" (dice), "[Ueberzeugen · gescheitert]" (remembered failure in the dice mode).
        /// </summary>
        /// <param name="check">Check preview.</param>
        /// <param name="diceMode">True in the dice mode.</param>
        public static string CheckText(in SkillCheckResult check, bool diceMode)
        {
            string name = SkillCheckRules.GermanName(check.Type);
            if (diceMode)
            {
                if (check.Remembered)
                {
                    return "[" + name + " · " + (check.Success ? "bestanden" : "gescheitert") + "]";
                }

                int percent = (int)Math.Round(check.Chance * 100f, MidpointRounding.AwayFromZero);
                return "[" + name + " · " + percent.ToString(CultureInfo.InvariantCulture) + " %]";
            }

            string threshold = check.Threshold.ToString(CultureInfo.InvariantCulture);
            return check.Success
                ? "[" + name + " " + threshold + "]"
                : "[" + name + " " + threshold + " · dein Wert " + check.Value.ToString(CultureInfo.InvariantCulture) + "]";
        }

        /// <summary>Full list text: symbol, tag and text, separated by spaces.</summary>
        /// <param name="option">Option.</param>
        public static string DisplayText(DialogueOptionView option)
        {
            if (option == null)
            {
                return string.Empty;
            }

            string symbol = SymbolText(option.Symbol);
            string result = option.Text;
            if (option.TagText.Length > 0)
            {
                result = option.TagText + " " + result;
            }

            return symbol.Length > 0 ? symbol + " " + result : result;
        }

        private static bool Has(DialogueOptionMarks marks, DialogueOptionMarks flag)
        {
            return (marks & flag) != 0;
        }
    }
}
