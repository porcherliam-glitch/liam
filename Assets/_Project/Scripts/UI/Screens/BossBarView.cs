using Aetherfall.AI.Bosses;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Boss health bar of the HUD (GDD 05 1.2: wide bar at the top centre under the compass; guide 12, 11.3): name, title,
    /// health with the delayed loss trail like the target bar, and one mark per phase boundary. Fed by
    /// <see cref="IBossBarService.Changed"/>; while it is visible the HUD hides the normal lock-on target bar.
    /// </summary>
    /// <remarks>Built in code next to the target panel of Hud.uxml (styles in Hud.uss, classes <c>af-boss…</c>).</remarks>
    public sealed class BossBarView
    {
        private readonly DelayedBar _bar = new DelayedBar();
        private readonly VisualElement _panel;
        private readonly Label _name;
        private readonly Label _title;
        private readonly VisualElement _fill;
        private readonly VisualElement _trail;
        private readonly VisualElement _health;
        private string _bossId = string.Empty;
        private int _markCount = -1;

        /// <summary>Creates the (hidden) bar under the compass.</summary>
        /// <param name="hudRoot">Root of the HUD document.</param>
        public BossBarView(VisualElement hudRoot)
        {
            _panel = new VisualElement { name = "hud-boss", pickingMode = PickingMode.Ignore };
            _panel.AddToClassList("af-boss");
            _name = NewLabel("af-boss__name");
            _title = NewLabel("af-boss__title");
            _health = new VisualElement { name = "hud-boss-health", pickingMode = PickingMode.Ignore };
            _health.AddToClassList("af-bar");
            _health.AddToClassList("af-bar--boss");
            _trail = NewPart("af-bar__trail");
            _fill = NewPart("af-bar__fill");
            _fill.AddToClassList("af-bar__fill--enemy");
            _health.Add(_trail);
            _health.Add(_fill);
            _panel.Add(_name);
            _panel.Add(_title);
            _panel.Add(_health);

            // Same column as the lock-on target panel (under the compass); without it at the top of the HUD.
            VisualElement target = hudRoot.Q<VisualElement>("hud-target");
            VisualElement parent = target != null && target.parent != null ? target.parent : hudRoot;
            int index = target != null && target.parent != null ? parent.IndexOf(target) : parent.childCount;
            parent.Insert(index, _panel);
            UiElementUtility.SetDisplayed(_panel, false);
        }

        /// <summary>True while a boss fight shows the bar.</summary>
        public bool IsVisible { get; private set; }

        /// <summary>Shows, updates or hides the bar.</summary>
        /// <param name="state">State of the boss bar service.</param>
        public void Apply(BossBarState state)
        {
            IsVisible = state.Visible;
            UiElementUtility.SetDisplayed(_panel, state.Visible);
            if (!state.Visible)
            {
                return;
            }

            if (state.BossId != _bossId)
            {
                // A new fight starts with a full trail (no drain animation from the last boss).
                _bossId = state.BossId;
                _bar.Snap(state.HealthFraction);
            }

            UiElementUtility.SetText(_name, state.DisplayName);
            UiElementUtility.SetText(_title, state.Title);
            UiElementUtility.SetDisplayed(_title, !string.IsNullOrEmpty(state.Title));
            SetPhaseMarks(state.PhaseCount);
            _bar.SetValue(state.HealthFraction);
        }

        /// <summary>Animates the loss trail.</summary>
        /// <param name="deltaTime">Unscaled seconds since the last frame.</param>
        public void Tick(float deltaTime)
        {
            if (!IsVisible)
            {
                return;
            }

            _bar.Update(deltaTime);
            UiElementUtility.SetFill(_fill, _bar.Value);
            UiElementUtility.SetFill(_trail, _bar.Trail);
        }

        private void SetPhaseMarks(int phaseCount)
        {
            if (phaseCount == _markCount)
            {
                return;
            }

            _markCount = phaseCount;
            for (int i = _health.childCount - 1; i >= 0; i--)
            {
                if (_health[i].ClassListContains("af-boss__mark"))
                {
                    _health.RemoveAt(i);
                }
            }

            // Equal phase lengths (GDD 03: the knight enters phase 2 at 50 %).
            for (int i = 1; i < phaseCount; i++)
            {
                VisualElement mark = NewPart("af-boss__mark");
                mark.style.left = new Length(100f * i / phaseCount, LengthUnit.Percent);
                _health.Add(mark);
            }
        }

        private static Label NewLabel(string className)
        {
            var label = new Label { pickingMode = PickingMode.Ignore };
            label.AddToClassList("af-text");
            label.AddToClassList(className);
            return label;
        }

        private static VisualElement NewPart(string className)
        {
            var part = new VisualElement { pickingMode = PickingMode.Ignore };
            part.AddToClassList(className);
            return part;
        }
    }
}
