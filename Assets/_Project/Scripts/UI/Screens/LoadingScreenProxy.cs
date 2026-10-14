using Aetherfall.Core;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The <see cref="ILoadingScreen"/> registered in the service locator (architecture 3.5: interface in Core, implementation
    /// in UI.Screens). Exists from boot step 15 on; forwards to the <see cref="LoadingScreenView"/> as soon as the UI root of
    /// the boot scene attached it. While visible, menu input is blocked and the loading layer is shown.
    /// </summary>
    public sealed class LoadingScreenProxy : ILoadingScreen
    {
        private readonly IUIManager _ui;
        private LoadingScreenView _view;
        private string _title = string.Empty;
        private float _progress;

        /// <summary>Creates the proxy (hidden).</summary>
        /// <param name="ui">UI manager (layer visibility, input block).</param>
        public LoadingScreenProxy(IUIManager ui)
        {
            _ui = ui;
            if (_ui != null)
            {
                _ui.SetLayerVisible(UILayer.Loading, false);
            }
        }

        /// <inheritdoc />
        public bool IsVisible { get; private set; }

        /// <summary>Connects the view (the UI root calls this; null disconnects).</summary>
        /// <param name="view">View or null.</param>
        public void Attach(LoadingScreenView view)
        {
            _view = view;
            if (_view != null && IsVisible)
            {
                _view.Show(_title);
                _view.SetProgress(_progress);
            }
        }

        /// <inheritdoc />
        public void Show(string title)
        {
            _title = string.IsNullOrEmpty(title) ? UiTexts.Get(UiTextKeys.LoadingDefault) : title;
            _progress = 0f;
            IsVisible = true;
            if (_ui != null)
            {
                _ui.InputBlocked = true;
                _ui.SetLayerVisible(UILayer.Loading, true);
            }

            if (_view != null)
            {
                _view.Show(_title);
            }
        }

        /// <inheritdoc />
        public void SetProgress(float progress01)
        {
            _progress = progress01;
            if (_view != null)
            {
                _view.SetProgress(progress01);
            }
        }

        /// <inheritdoc />
        public void Hide()
        {
            IsVisible = false;
            if (_ui != null)
            {
                _ui.InputBlocked = false;
                _ui.SetLayerVisible(UILayer.Loading, false);
            }
        }
    }
}
