using System.Globalization;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>One shown objective (quest details and HUD tracker): text, counter, done, optional, failed.</summary>
    public readonly struct QuestObjectiveLine
    {
        /// <summary>Stage-qualified objective id (<c>s10.o1</c>).</summary>
        public readonly string Key;

        /// <summary>Text, e.g. "Wölfe besiegen".</summary>
        public readonly string Text;

        /// <summary>Current progress.</summary>
        public readonly int Progress;

        /// <summary>Required progress.</summary>
        public readonly int Required;

        /// <summary>True if fulfilled.</summary>
        public readonly bool Done;

        /// <summary>True if it can no longer be fulfilled.</summary>
        public readonly bool Failed;

        /// <summary>True for optional (bonus) objectives (shown in italics, GDD 05 1.2).</summary>
        public readonly bool Optional;

        /// <summary>Creates the line.</summary>
        /// <param name="key">Stage-qualified id.</param>
        /// <param name="text">Text.</param>
        /// <param name="progress">Progress.</param>
        /// <param name="required">Required progress.</param>
        /// <param name="done">Done.</param>
        /// <param name="failed">Failed.</param>
        /// <param name="optional">Optional.</param>
        public QuestObjectiveLine(string key, string text, int progress, int required, bool done, bool failed, bool optional)
        {
            Key = key ?? string.Empty;
            Text = text ?? string.Empty;
            Progress = progress;
            Required = required;
            Done = done;
            Failed = failed;
            Optional = optional;
        }

        /// <summary>True if a counter is shown (more than one step needed).</summary>
        public bool ShowsCount => Required > 1;

        /// <summary>Counter "1/3", empty for single-step objectives.</summary>
        public string CountText => ShowsCount
            ? UiTexts.Format(UiTextKeys.ObjectiveCount, Progress.ToString(CultureInfo.InvariantCulture), Required.ToString(CultureInfo.InvariantCulture))
            : string.Empty;

        /// <inheritdoc />
        public override string ToString()
        {
            return (Done ? "[x] " : "[ ] ") + Text + (ShowsCount ? " " + CountText : string.Empty);
        }
    }
}
