using System;
using System.Globalization;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>Loading screen elements (Loading.uxml): title, tip and progress bar with percent.</summary>
    public sealed class LoadingScreenView
    {
        private readonly Label _title;
        private readonly Label _percent;
        private readonly VisualElement _fill;
        private int _shownPercent = -1;

        /// <summary>Binds the view to the root of the loading document.</summary>
        /// <param name="root">Root element (contains <c>loading</c>).</param>
        public LoadingScreenView(VisualElement root)
        {
            if (root == null)
            {
                throw new ArgumentNullException(nameof(root));
            }

            UiElementUtility.ApplyTexts(root);
            _title = root.Q<Label>("loading-title");
            _percent = root.Q<Label>("loading-percent");
            _fill = root.Q<VisualElement>("loading-progress-fill");
        }

        /// <summary>Sets the title and resets the bar.</summary>
        /// <param name="title">Title.</param>
        public void Show(string title)
        {
            UiElementUtility.SetText(_title, title);
            _shownPercent = -1;
            SetProgress(0f);
        }

        /// <summary>Sets the bar and the percent text.</summary>
        /// <param name="progress01">Progress 0..1.</param>
        public void SetProgress(float progress01)
        {
            float clamped = float.IsNaN(progress01) ? 0f : Math.Max(0f, Math.Min(1f, progress01));
            UiElementUtility.SetFill(_fill, clamped);
            int percent = (int)Math.Round(clamped * 100f);
            if (percent != _shownPercent)
            {
                _shownPercent = percent;
                UiElementUtility.SetText(_percent, UiTexts.Format(UiTextKeys.Percent, percent.ToString(CultureInfo.InvariantCulture)));
            }
        }
    }
}
