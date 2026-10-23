namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Base class of all navigable screens (main menu, pause menu, death screen …), architecture 4.9. Holds the logical part
    /// (id, layer, open state, focus group, reactions to confirm/back/tabs); the visual elements live in the derived class
    /// (UI.Screens), which shows and hides them in <see cref="OnOpen"/> / <see cref="OnClose"/>.
    /// </summary>
    /// <remarks>
    /// Pure C# (no UnityEngine calls in this base class), so the manager and the navigation can be tested with fake screens.
    /// The pointer helpers (<see cref="PointerEntered"/>, <see cref="PointerHold"/>, <see cref="PointerClicked"/>) are called
    /// by the UI Toolkit callbacks of the derived class: hovering sets the focus, clicking confirms, holding the mouse button
    /// on a hold item runs hold-to-confirm (GDD 05 1.4 "Maus").
    /// </remarks>
    public abstract class UIScreen : IUiScreenNode
    {
        private UIManager _manager;

        /// <summary>Creates the screen.</summary>
        /// <param name="screenId">Stable id, e.g. <c>screen.pause</c> (telemetry event ScreenOpened).</param>
        /// <param name="layer">Layer of the screen (Screens or Modals).</param>
        protected UIScreen(string screenId, UILayer layer)
        {
            ScreenId = screenId ?? string.Empty;
            Layer = layer;
        }

        /// <summary>Stable id of the screen.</summary>
        public string ScreenId { get; }

        /// <summary>Layer of the screen.</summary>
        public UILayer Layer { get; }

        /// <summary>True while the screen is open (on the focus stack).</summary>
        public bool IsOpen { get; private set; }

        /// <inheritdoc />
        public FocusGroup Focus { get; protected set; }

        /// <summary>The manager the screen is registered with (null before registration).</summary>
        protected IUIManager Manager => _manager;

        /// <summary>Called every frame while the screen is open (unscaled frame time).</summary>
        /// <param name="unscaledDeltaTime">Frame time in seconds.</param>
        public virtual void Tick(float unscaledDeltaTime)
        {
        }

        /// <inheritdoc />
        public virtual BackOutcome Back(bool closeHub)
        {
            return BackOutcome.Close;
        }

        /// <inheritdoc />
        public virtual bool RequiresHold(int index)
        {
            return false;
        }

        /// <inheritdoc />
        public virtual bool TryNavigate(NavDirection direction)
        {
            return false;
        }

        /// <inheritdoc />
        public virtual bool TryAdjust(int index, int delta)
        {
            return false;
        }

        /// <inheritdoc />
        public abstract void Submit(int index);

        /// <summary>
        /// A click confirmed an item (default: like <see cref="Submit"/>). Screens whose confirm button has a second meaning
        /// (the map cursor) tell the click on an item apart here.
        /// </summary>
        /// <param name="index">Item index.</param>
        public virtual void PointerSubmit(int index)
        {
            Submit(index);
        }

        /// <inheritdoc />
        public virtual void Tab(int delta)
        {
        }

        /// <inheritdoc />
        public virtual void SubTab(int delta)
        {
        }

        /// <inheritdoc />
        public virtual void Secondary(int index)
        {
        }

        /// <inheritdoc />
        public virtual void FocusChanged(int previous, int current)
        {
        }

        /// <inheritdoc />
        public virtual void HoldProgress(int index, float progress01)
        {
        }

        internal void AttachTo(UIManager manager)
        {
            _manager = manager;
        }

        internal void OpenInternal(object args)
        {
            IsOpen = true;
            OnOpen(args);
        }

        internal void CloseInternal()
        {
            IsOpen = false;
            OnClose();
        }

        /// <summary>Shows the visual elements and prepares the focus (e.g. <c>Focus.FocusFirst()</c>).</summary>
        /// <param name="args">Arguments passed to <see cref="IUIManager.Open{TScreen}"/>.</param>
        protected abstract void OnOpen(object args);

        /// <summary>Hides the visual elements.</summary>
        protected abstract void OnClose();

        /// <summary>The mouse entered an item: it gets the focus (only while this screen owns the focus).</summary>
        /// <param name="index">Item index.</param>
        protected void PointerEntered(int index)
        {
            if (_manager != null)
            {
                _manager.PointerFocus(this, index);
            }
        }

        /// <summary>The mouse button went down (true) or up (false) on an item; hold items run hold-to-confirm.</summary>
        /// <param name="index">Item index.</param>
        /// <param name="held">True while held.</param>
        protected void PointerHold(int index, bool held)
        {
            if (_manager != null)
            {
                _manager.PointerHold(this, index, held);
            }
        }

        /// <summary>An item was clicked: confirms it (items that need holding ignore clicks).</summary>
        /// <param name="index">Item index.</param>
        protected void PointerClicked(int index)
        {
            if (_manager != null)
            {
                _manager.PointerClick(this, index);
            }
        }
    }
}
