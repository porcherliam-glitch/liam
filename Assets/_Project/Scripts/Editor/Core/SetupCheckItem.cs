namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// One line of the checklist in the project setup window: what is checked, its status, an explanation for the user
    /// and, where it helps, the menu path to do or verify it by hand. Plain data without Unity calls.
    /// </summary>
    public sealed class SetupCheckItem
    {
        /// <summary>Creates a checklist line.</summary>
        /// <param name="label">Short German label (what is checked).</param>
        /// <param name="status">Result of the check.</param>
        /// <param name="detail">Optional German explanation (current value, what the step will do, manual instructions).</param>
        /// <param name="menuPath">Optional Unity menu path for manual verification, e.g. "Edit > Project Settings > Editor".</param>
        public SetupCheckItem(string label, SetupStatus status, string detail = null, string menuPath = null)
        {
            Label = label ?? string.Empty;
            Status = status;
            Detail = detail ?? string.Empty;
            MenuPath = menuPath ?? string.Empty;
        }

        /// <summary>Short German label of the check.</summary>
        public string Label { get; }

        /// <summary>Result of the check.</summary>
        public SetupStatus Status { get; }

        /// <summary>German explanation, or empty.</summary>
        public string Detail { get; }

        /// <summary>Unity menu path for manual verification, or empty.</summary>
        public string MenuPath { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            string text = SetupStatuses.Symbol(Status) + " " + Label;
            if (Detail.Length > 0)
            {
                text += " – " + Detail;
            }

            if (MenuPath.Length > 0)
            {
                text += " (Menü: " + MenuPath + ")";
            }

            return text;
        }
    }
}
