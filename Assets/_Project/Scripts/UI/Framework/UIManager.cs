using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Default <see cref="IUIManager"/> (architecture 4.9). Pure C# service, ticked with unscaled time by the central
    /// TickRunner (menus work while the game is paused). Created by the UI installer (UI.Screens) with the input source of the
    /// UI action map; the screens and the layer host are attached by the UI root of the boot scene.
    /// </summary>
    /// <remarks>
    /// <para>Per frame: read the UI input (only while the UI map is enabled and the top screen accepts input), apply it to the
    /// top screen with <see cref="UiNavigationController"/>, tick the open screens, update the message queue.</para>
    /// <para>In the frame a screen opens, its input is ignored, so the button press that opened it does not also confirm or
    /// close it. A direction that is still held when a screen opens or closes (walking with W or the stick, then Esc/Start)
    /// moves the focus only after it was released once.</para>
    /// </remarks>
    public sealed class UIManager : IUIManager, IUnscaledTickable, IDisposable
    {
        private readonly IUiCommandSource _input;
        private readonly Func<double> _clock;
        private readonly UiNavigationController _navigation;
        private readonly ScreenStack<UIScreen> _stack = new ScreenStack<UIScreen>();
        private readonly List<UIScreen> _registered = new List<UIScreen>(8);
        private readonly List<UIScreen> _tickBuffer = new List<UIScreen>(8);
        private readonly bool[] _layerVisible = new bool[(int)UILayer.Debug + 1];
        private UiInputFrame _frame;
        private IUiLayerHost _layerHost;
        private int _pointerHoldIndex = -1;
        private UIScreen _pointerHoldScreen;
        private bool _skipInput;
        private bool _disposed;

        /// <summary>Creates the manager.</summary>
        /// <param name="input">UI input of each frame.</param>
        /// <param name="clock">Real time in seconds (message queue).</param>
        /// <param name="holdDuration">Hold-to-confirm duration in seconds (GDD 05 1.4: 1.0).</param>
        public UIManager(IUiCommandSource input, Func<double> clock, float holdDuration = HoldToConfirm.DefaultDuration)
        {
            _input = input ?? throw new ArgumentNullException(nameof(input));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _navigation = new UiNavigationController(new NavigationRepeater(), new HoldToConfirm(holdDuration));
            for (int i = 0; i < _layerVisible.Length; i++)
            {
                _layerVisible[i] = true;
            }
        }

        /// <inheritdoc />
        public UIScreen Top => _stack.Top;

        /// <inheritdoc />
        public NotificationQueue Notifications { get; } = new NotificationQueue();

        /// <inheritdoc />
        public bool InputBlocked { get; set; }

        /// <summary>Number of open screens.</summary>
        public int OpenCount => _stack.Count;

        /// <summary>Hold-to-confirm timer (its duration is an option).</summary>
        public HoldToConfirm Hold => _navigation.Hold;

        /// <inheritdoc />
        public event Action<UIScreen> ScreenOpened;

        /// <inheritdoc />
        public event Action<UIScreen> ScreenClosed;

        /// <inheritdoc />
        public void RegisterScreen(UIScreen screen)
        {
            if (screen == null)
            {
                throw new ArgumentNullException(nameof(screen));
            }

            if (_registered.Contains(screen))
            {
                return;
            }

            _registered.Add(screen);
            screen.AttachTo(this);
        }

        /// <inheritdoc />
        public TScreen Get<TScreen>() where TScreen : UIScreen
        {
            for (int i = 0; i < _registered.Count; i++)
            {
                if (_registered[i] is TScreen screen)
                {
                    return screen;
                }
            }

            return null;
        }

        /// <inheritdoc />
        public TScreen Open<TScreen>(object args = null) where TScreen : UIScreen
        {
            TScreen screen = Get<TScreen>();
            if (screen == null)
            {
                Log.Warning(LogCategory.UI, "Open<" + typeof(TScreen).Name + ">: no such screen is registered.");
                return null;
            }

            Open(screen, args);
            return screen;
        }

        /// <inheritdoc />
        public void Open(UIScreen screen, object args = null)
        {
            if (screen == null)
            {
                throw new ArgumentNullException(nameof(screen));
            }

            RegisterScreen(screen);
            if (screen.IsOpen)
            {
                if (_stack.Push(screen))
                {
                    ResetInput();
                }

                return;
            }

            _stack.Push(screen);
            ResetInput();
            screen.OpenInternal(args);
            Log.Debug(LogCategory.UI, "Screen opened: " + screen.ScreenId + " (stack " + _stack.Count + ").");
            Action<UIScreen> opened = ScreenOpened;
            if (opened != null)
            {
                opened(screen);
            }
        }

        /// <inheritdoc />
        public void Close(UIScreen screen)
        {
            if (screen == null || !screen.IsOpen)
            {
                return;
            }

            _stack.Remove(screen);
            ResetInput();
            screen.CloseInternal();
            Log.Debug(LogCategory.UI, "Screen closed: " + screen.ScreenId + " (stack " + _stack.Count + ").");
            Action<UIScreen> closed = ScreenClosed;
            if (closed != null)
            {
                closed(screen);
            }
        }

        /// <inheritdoc />
        public void CloseAll()
        {
            while (_stack.Count > 0)
            {
                Close(_stack.Top);
            }
        }

        /// <inheritdoc />
        public bool Back()
        {
            UIScreen top = _stack.Top;
            if (top == null)
            {
                return false;
            }

            BackOutcome outcome = top.Back(false);
            if (outcome == BackOutcome.Close)
            {
                Close(top);
            }

            return outcome != BackOutcome.Ignored;
        }

        /// <inheritdoc />
        public void ShowToast(in Notification notification)
        {
            Notifications.Enqueue(notification, _clock());
        }

        /// <inheritdoc />
        public void SetLayerVisible(UILayer layer, bool visible)
        {
            int index = (int)layer;
            if (index < 0 || index >= _layerVisible.Length)
            {
                return;
            }

            _layerVisible[index] = visible;
            if (_layerHost != null)
            {
                _layerHost.SetLayerVisible(layer, visible);
            }
        }

        /// <inheritdoc />
        public bool IsLayerVisible(UILayer layer)
        {
            int index = (int)layer;
            return index >= 0 && index < _layerVisible.Length && _layerVisible[index];
        }

        /// <inheritdoc />
        public void AttachLayerHost(IUiLayerHost host)
        {
            _layerHost = host;
            if (host == null)
            {
                return;
            }

            foreach (UILayer layer in new[] { UILayer.Hud, UILayer.WorldMarkers, UILayer.Screens, UILayer.Modals, UILayer.Toasts, UILayer.Loading, UILayer.Debug })
            {
                host.SetLayerVisible(layer, _layerVisible[(int)layer]);
            }
        }

        /// <summary>Hover over an item of a screen: the item gets the focus if the screen is the top screen.</summary>
        /// <param name="screen">Screen of the item.</param>
        /// <param name="index">Item index.</param>
        public void PointerFocus(UIScreen screen, int index)
        {
            if (!IsInteractive(screen) || screen.Focus == null)
            {
                return;
            }

            FocusGroup focus = screen.Focus;
            int previous = focus.Current;
            if (previous == index || !focus.SetCurrent(index))
            {
                return;
            }

            if (_navigation.Hold.IsHolding)
            {
                _navigation.Reset();
            }

            if (previous >= 0)
            {
                screen.HoldProgress(previous, 0f);
            }

            screen.FocusChanged(previous, index);
        }

        /// <summary>Mouse button down (true) or up (false) on an item of a screen.</summary>
        /// <param name="screen">Screen of the item.</param>
        /// <param name="index">Item index.</param>
        /// <param name="held">True while held.</param>
        public void PointerHold(UIScreen screen, int index, bool held)
        {
            if (!held)
            {
                if (ReferenceEquals(_pointerHoldScreen, screen))
                {
                    _pointerHoldIndex = -1;
                    _pointerHoldScreen = null;
                }

                return;
            }

            if (!IsInteractive(screen) || screen.Focus == null || !screen.Focus.IsEnabled(index))
            {
                return;
            }

            PointerFocus(screen, index);
            if (!screen.RequiresHold(index))
            {
                return;
            }

            _pointerHoldIndex = index;
            _pointerHoldScreen = screen;
            _navigation.BeginPointerHold(screen, index);
        }

        /// <summary>A click on an item of a screen: confirms it unless it needs holding.</summary>
        /// <param name="screen">Screen of the item.</param>
        /// <param name="index">Item index.</param>
        public void PointerClick(UIScreen screen, int index)
        {
            if (!IsInteractive(screen) || screen.Focus == null || !screen.Focus.IsEnabled(index) || screen.RequiresHold(index))
            {
                return;
            }

            PointerFocus(screen, index);
            screen.PointerSubmit(index);
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (_disposed)
            {
                return;
            }

            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            UIScreen top = _stack.Top;
            if (top != null && !InputBlocked && _input.IsActive)
            {
                _frame.Clear();
                _input.Read(ref _frame);
                _frame.PointerHoldIndex = ReferenceEquals(_pointerHoldScreen, top) ? _pointerHoldIndex : -1;
                if (_skipInput)
                {
                    _skipInput = false;
                }
                else
                {
                    UiNavResult result = _navigation.Process(top, _frame, dt);
                    if (result == UiNavResult.CloseRequested && ReferenceEquals(_stack.Top, top))
                    {
                        Close(top);
                    }
                }
            }
            else
            {
                _navigation.Reset();
            }

            _tickBuffer.Clear();
            for (int i = 0; i < _stack.Count; i++)
            {
                _tickBuffer.Add(_stack[i]);
            }

            for (int i = 0; i < _tickBuffer.Count; i++)
            {
                if (_tickBuffer[i].IsOpen)
                {
                    _tickBuffer[i].Tick(dt);
                }
            }

            Notifications.Update(_clock(), dt);
        }

        /// <summary>Closes all screens and forgets the layer host.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            CloseAll();
            _layerHost = null;
            _disposed = true;
        }

        private bool IsInteractive(UIScreen screen)
        {
            return screen != null && screen.IsOpen && ReferenceEquals(_stack.Top, screen) && !InputBlocked;
        }

        private void ResetInput()
        {
            _navigation.ResetUntilNeutral();
            _pointerHoldIndex = -1;
            _pointerHoldScreen = null;
            _skipInput = true;
        }
    }
}
