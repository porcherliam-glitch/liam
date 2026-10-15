using Aetherfall.Events;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// HUD overlay of the detective mode (GDD 02 5.1, GDD 03 "Untersuchen → Aether-Sicht", task list S37): a warm frame at the
    /// screen edges while investigating, an Aether turquoise one in Aether sight, and a line at the bottom centre with the
    /// number of lit clues. Fed by <see cref="InvestigateModeChanged"/>.
    /// </summary>
    /// <remarks>Built in code over the HUD (styles in Hud.uss, classes <c>af-investigate…</c>).</remarks>
    public sealed class InvestigateOverlayView
    {
        private readonly VisualElement _frame;
        private readonly Label _text;

        /// <summary>Creates the (hidden) overlay.</summary>
        /// <param name="hudRoot">Root of the HUD document.</param>
        public InvestigateOverlayView(VisualElement hudRoot)
        {
            _frame = new VisualElement { name = "hud-investigate", pickingMode = PickingMode.Ignore };
            _frame.AddToClassList("af-investigate");
            _text = new Label { name = "hud-investigate-text", pickingMode = PickingMode.Ignore };
            _text.AddToClassList("af-text");
            _text.AddToClassList("af-investigate__text");
            _frame.Add(_text);
            hudRoot.Insert(0, _frame);
            UiElementUtility.SetDisplayed(_frame, false);
        }

        /// <summary>True while the overlay is shown.</summary>
        public bool IsVisible { get; private set; }

        /// <summary>Current text (for tests and the tour).</summary>
        public string Text => _text.text;

        /// <summary>Shows or hides the overlay.</summary>
        /// <param name="evt">State of the detective mode.</param>
        public void Apply(in InvestigateModeChanged evt)
        {
            IsVisible = evt.Active;
            UiElementUtility.SetDisplayed(_frame, evt.Active);
            _frame.EnableInClassList("af-investigate--aether", evt.AetherSight);
            _text.text = TextFor(evt.Active, evt.AetherSight, evt.Revealed);
        }

        /// <summary>The line at the bottom: mode and number of lit things.</summary>
        /// <param name="active">Detective mode on.</param>
        /// <param name="aetherSight">Aether sight.</param>
        /// <param name="revealed">Number of lit clues, trails and hidden paths.</param>
        public static string TextFor(bool active, bool aetherSight, int revealed)
        {
            if (!active)
            {
                return string.Empty;
            }

            string mode = aetherSight ? "Aether-Sicht" : "Untersuchen";
            if (revealed <= 0)
            {
                return mode + ": hier ist nichts zu finden.";
            }

            return mode + ": " + revealed + (revealed == 1 ? " Hinweis leuchtet." : " Hinweise leuchten.");
        }
    }
}
