using System;
using Aetherfall.Progression;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The thin experience bar of the HUD (GDD 05 1.2 "XP-Leiste", bottom centre) with the level ("Stufe 2"). Shown by
    /// <see cref="HudVisibilityRules.ShowXp"/> (4 s after experience, always in the mode "Vollständig").
    /// </summary>
    public sealed class XpBarView
    {
        private readonly VisualElement _root;
        private readonly Label _level;
        private readonly VisualElement _fill;
        private readonly IProgressionService _progression;
        private int _revision = -1;

        /// <summary>Binds the view to the HUD element <c>hud-xp</c>.</summary>
        /// <param name="root">Element <c>hud-xp</c>.</param>
        /// <param name="progression">Progression.</param>
        public XpBarView(VisualElement root, IProgressionService progression)
        {
            _root = root ?? throw new ArgumentNullException(nameof(root));
            _progression = progression ?? throw new ArgumentNullException(nameof(progression));
            _level = root.Q<Label>("hud-xp-level");
            _fill = root.Q<VisualElement>("hud-xp-fill");
            UiElementUtility.SetDisplayed(_root, false);
        }

        /// <summary>Updates the bar.</summary>
        /// <param name="visible">True if the HUD rules show it now.</param>
        public void Tick(bool visible)
        {
            if (_progression.Revision != _revision)
            {
                _revision = _progression.Revision;
                UiElementUtility.SetText(_level, UiTexts.Format(UiTextKeys.HudLevel, CharacterSheetModel.Number(_progression.Level)));
                UiElementUtility.SetFill(_fill, CharacterSheetModel.XpFill(_progression));
            }

            UiElementUtility.SetDisplayed(_root, visible);
        }
    }
}
