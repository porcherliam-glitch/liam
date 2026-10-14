using Aetherfall.Input;
using Aetherfall.UI.Framework;
using UnityEngine;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// <see cref="IUiCommandSource"/> on top of the UI action map of the input service (Navigate, Submit, Cancel,
    /// TabPrev/TabNext, SubTabPrev/SubTabNext, Secondary, CloseHub): A / Cross / Enter / Space = confirm, B / Circle / Esc /
    /// right mouse button = back, LB/RB / L1/R1 / Q/E = tabs, LT/RT / L2/R2 / Z/C = sub categories, X / Square / F = secondary
    /// action, Start / Options / Esc / Tab / J = close.
    /// </summary>
    public sealed class InputUiCommandSource : IUiCommandSource
    {
        private readonly IUiInput _ui;

        /// <summary>Creates the source.</summary>
        /// <param name="ui">UI map reader of the input service.</param>
        public InputUiCommandSource(IUiInput ui)
        {
            _ui = ui ?? throw new System.ArgumentNullException(nameof(ui));
        }

        /// <inheritdoc />
        public bool IsActive => _ui.IsActive;

        /// <inheritdoc />
        public void Read(ref UiInputFrame frame)
        {
            Vector2 navigate = _ui.Navigate;
            frame.NavigateX = navigate.x;
            frame.NavigateY = navigate.y;
            frame.SubmitPressed = _ui.WasPressedThisFrame(UiButton.Submit);
            frame.SubmitHeld = _ui.IsPressed(UiButton.Submit);
            frame.CancelPressed = _ui.WasPressedThisFrame(UiButton.Cancel);
            frame.CloseHubPressed = _ui.WasPressedThisFrame(UiButton.CloseHub);
            int tab = 0;
            if (_ui.WasPressedThisFrame(UiButton.TabPrev))
            {
                tab--;
            }

            if (_ui.WasPressedThisFrame(UiButton.TabNext))
            {
                tab++;
            }

            frame.TabDelta = tab;
            int subTab = 0;
            if (_ui.WasPressedThisFrame(UiButton.SubTabPrev))
            {
                subTab--;
            }

            if (_ui.WasPressedThisFrame(UiButton.SubTabNext))
            {
                subTab++;
            }

            frame.SubTabDelta = subTab;
            frame.SecondaryPressed = _ui.WasPressedThisFrame(UiButton.Secondary);
        }
    }
}
