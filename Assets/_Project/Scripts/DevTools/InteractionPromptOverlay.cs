using System;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Player;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer overlay (IMGUI) for the interaction step: the prompt of the player's current interaction target at the
    /// bottom centre ("[E] Oeffnen: Holztruhe", gamepad "[A] …") and short loot messages from <see cref="ItemPickedUp"/> and
    /// <see cref="CurrencyChanged"/> ("+ Wolfsfell x1", "+ 23 Gold"). Placeholder until the HUD (world marker with button glyph,
    /// pickup notifications, GDD 05).
    /// </summary>
    /// <remarks>
    /// GameObject: "InteractionPrompt" in the test ground (the menu adds it and sets the interactor). Active only in the editor
    /// and in development builds. Event subscriptions follow OnEnable/OnDisable once the services are resolved.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class InteractionPromptOverlay : MonoBehaviour
    {
        private const float ReferenceHeight = 1080f;
        private const int MessageCount = 5;
        private const float MessageSeconds = 4f;

        [Tooltip("Interaktion der Spielfigur (PlayerInteractor am Objekt „Player“).")]
        [SerializeField] private PlayerInteractor interactor = null;

        [Tooltip("Zusätzliche Skalierung. Ab 1080 Pixeln Bildschirmhöhe wird automatisch mitskaliert.")]
        [Range(0.5f, 3f)] [SerializeField] private float uiScale = 1f;

        private readonly string[] _messages = new string[MessageCount];
        private readonly float[] _messageTimes = new float[MessageCount];
        private int _nextMessage;
        private IEventBus _eventBus;
        private IInputService _input;
        private IInventoryService _inventory;
        private bool _subscribed;
        private string _shownPrompt;
        private bool _shownForGamepad;
        private string _promptText = string.Empty;
        private GUIStyle _promptStyle;
        private GUIStyle _messageStyle;

        private static bool IsAvailableInThisBuild
        {
            get
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD || AETHERFALL_DEV
                return true;
#else
                return false;
#endif
            }
        }

        private void Awake()
        {
            if (!IsAvailableInThisBuild)
            {
                enabled = false;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters; all exceptions are handled here.
            if (!enabled)
            {
                return;
            }

            try
            {
                _eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
                Services.Locator.TryGet(out _input);
                Services.Locator.TryGet(out _inventory);
                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "InteractionPromptOverlay could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Unsubscribe<CurrencyChanged>(OnCurrencyChanged);
            _subscribed = false;
        }

        private void Subscribe()
        {
            if (_subscribed || _eventBus == null || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Subscribe<CurrencyChanged>(OnCurrencyChanged);
            _subscribed = true;
        }

        private void OnItemPickedUp(ItemPickedUp evt)
        {
            string name = evt.ItemId;
            if (_inventory != null && _inventory.Catalog.TryGetItem(evt.ItemId, out ItemSpec spec))
            {
                name = spec.DisplayName;
            }

            AddMessage("+ " + name + (evt.Amount > 1 ? " ×" + evt.Amount : string.Empty));
        }

        private void OnCurrencyChanged(CurrencyChanged evt)
        {
            AddMessage((evt.Delta >= 0 ? "+ " : "− ") + Math.Abs(evt.Delta) + " " + CurrencyIds.GermanName(evt.CurrencyId) + "  (jetzt " + evt.NewAmount + ")");
        }

        private void AddMessage(string text)
        {
            _messages[_nextMessage] = text;
            _messageTimes[_nextMessage] = Time.unscaledTime;
            _nextMessage = (_nextMessage + 1) % MessageCount;
        }

        private void OnGUI()
        {
            EnsureStyles();
            float scale = uiScale * Mathf.Max(1f, Screen.height / ReferenceHeight);
            Matrix4x4 previous = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            try
            {
                float width = Screen.width / scale;
                float height = Screen.height / scale;
                string prompt = interactor != null ? interactor.CurrentPrompt : string.Empty;
                if (prompt.Length > 0)
                {
                    GUI.Label(new Rect(width * 0.5f - 260f, height * 0.62f, 520f, 34f), PromptText(prompt), _promptStyle);
                }

                float y = height * 0.62f + 40f;
                float now = Time.unscaledTime;
                for (int i = 0; i < MessageCount; i++)
                {
                    int index = (_nextMessage - 1 - i + MessageCount) % MessageCount;
                    if (_messages[index] == null || now - _messageTimes[index] > MessageSeconds)
                    {
                        continue;
                    }

                    GUI.Label(new Rect(width * 0.5f - 260f, y, 520f, 24f), _messages[index], _messageStyle);
                    y += 24f;
                }
            }
            finally
            {
                GUI.matrix = previous;
            }
        }

        private string PromptText(string prompt)
        {
            // OnGUI runs several times per frame: the text is only rebuilt when the target's prompt or the device changes.
            bool gamepad = _input != null && _input.ActiveDeviceKind == DeviceKind.Gamepad;
            if (!ReferenceEquals(prompt, _shownPrompt) || gamepad != _shownForGamepad)
            {
                _shownPrompt = prompt;
                _shownForGamepad = gamepad;
                _promptText = (gamepad ? "[A]" : "[E]") + "  " + prompt;
            }

            return _promptText;
        }

        private void EnsureStyles()
        {
            if (_promptStyle != null)
            {
                return;
            }

            _promptStyle = new GUIStyle(GUI.skin.box) { alignment = TextAnchor.MiddleCenter, fontSize = 18, richText = true };
            _messageStyle = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleCenter, fontSize = 15 };
        }
    }
}
