using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Fills ObjectiveRow.uxml instances (Unity adapter, shared by the quest details and the HUD tracker): text, counter
    /// "1/3", and the classes <c>is-done</c> (check mark pops in, USS transition), <c>is-optional</c> (italics),
    /// <c>is-failed</c> and <c>is-just-done</c> (short highlight). Rows are reused, so a row that gets done animates.
    /// </summary>
    public static class ObjectiveRowView
    {
        /// <summary>Makes sure a container holds at least <paramref name="count"/> rows; rows beyond it are hidden.</summary>
        /// <param name="container">Container.</param>
        /// <param name="template">ObjectiveRow.uxml.</param>
        /// <param name="count">Rows needed.</param>
        public static void EnsureRows(VisualElement container, VisualTreeAsset template, int count)
        {
            if (container == null || template == null)
            {
                return;
            }

            while (container.childCount < count)
            {
                template.CloneTree(container);
            }

            for (int i = 0; i < container.childCount; i++)
            {
                UiElementUtility.SetDisplayed(container[i], i < count);
            }
        }

        /// <summary>Shows one objective in a row.</summary>
        /// <param name="row">Row (ObjectiveRow.uxml root).</param>
        /// <param name="line">Objective.</param>
        /// <param name="flashing">True while it was just ticked off.</param>
        public static void Bind(VisualElement row, in QuestObjectiveLine line, bool flashing)
        {
            if (row == null)
            {
                return;
            }

            UiElementUtility.SetText(row.Q<Label>("objective-text"), line.Text);
            Label count = row.Q<Label>("objective-count");
            UiElementUtility.SetText(count, line.CountText);
            UiElementUtility.SetDisplayed(count, line.ShowsCount);
            row.EnableInClassList("is-done", line.Done);
            row.EnableInClassList("is-failed", line.Failed);
            row.EnableInClassList("is-optional", line.Optional);
            row.EnableInClassList("is-just-done", flashing);
        }
    }
}
