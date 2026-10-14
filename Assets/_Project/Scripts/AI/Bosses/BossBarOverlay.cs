using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Placeholder boss health bar (GDD 05: wide bar with name and title at the bottom of the screen) drawn with IMGUI until
    /// the HUD of UI Toolkit shows <see cref="IBossBarService"/> itself (see guide 12, section "Integration"). Display only,
    /// needs no input.
    /// </summary>
    /// <remarks>GameObject: any object of the dungeon scene ("Boss-Lebensbalken"). Switch it off once the HUD has its bar.</remarks>
    [DisallowMultipleComponent]
    public sealed class BossBarOverlay : MonoBehaviour
    {
        [Tooltip("Breite des Balkens als Anteil der Bildschirmbreite.")]
        [Range(0.2f, 0.9f)] [SerializeField] private float widthFraction = 0.5f;

        [Tooltip("Farbe des Lebensbalkens.")]
        [SerializeField] private Color barColor = new Color(0.72f, 0.12f, 0.1f);

        [Tooltip("Farbe des verlorenen Lebens (verzögert).")]
        [SerializeField] private Color lagColor = new Color(0.95f, 0.8f, 0.4f);

        private IBossBarService _service;
        private BossBarState _state;
        private float _lagFraction = 1f;
        private bool _subscribed;
        private GUIStyle _nameStyle;
        private GUIStyle _titleStyle;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (locator != null && locator.TryGet(out _service))
                {
                    _state = _service.Current;
                    Subscribe();
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "BossBarOverlay could not start.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed)
            {
                _service.Changed -= OnChanged;
                _subscribed = false;
            }
        }

        private void Subscribe()
        {
            if (_service == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _service.Changed += OnChanged;
            _subscribed = true;
        }

        private void OnChanged(BossBarState state)
        {
            if (state.Visible && !_state.Visible)
            {
                _lagFraction = state.HealthFraction;
            }

            _state = state;
        }

        private void Update()
        {
            if (_state.Visible)
            {
                _lagFraction = Mathf.MoveTowards(_lagFraction, _state.HealthFraction, 0.25f * Time.unscaledDeltaTime);
                if (_lagFraction < _state.HealthFraction)
                {
                    _lagFraction = _state.HealthFraction;
                }
            }
        }

        private void OnGUI()
        {
            if (!_state.Visible)
            {
                return;
            }

            if (_nameStyle == null)
            {
                _nameStyle = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.LowerCenter, fontSize = 22, fontStyle = FontStyle.Bold };
                _titleStyle = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.UpperCenter, fontSize = 14, fontStyle = FontStyle.Italic };
            }

            float width = Screen.width * widthFraction;
            float x = (Screen.width - width) * 0.5f;
            float y = Screen.height - 96f;
            Color old = GUI.color;
            GUI.color = Color.white;
            GUI.Label(new Rect(x, y - 30f, width, 28f), _state.DisplayName, _nameStyle);
            GUI.color = new Color(0f, 0f, 0f, 0.75f);
            GUI.DrawTexture(new Rect(x - 2f, y - 2f, width + 4f, 18f), Texture2D.whiteTexture);
            GUI.color = lagColor;
            GUI.DrawTexture(new Rect(x, y, width * _lagFraction, 14f), Texture2D.whiteTexture);
            GUI.color = barColor;
            GUI.DrawTexture(new Rect(x, y, width * _state.HealthFraction, 14f), Texture2D.whiteTexture);
            GUI.color = new Color(1f, 1f, 1f, 0.8f);
            for (int phase = 2; phase <= _state.PhaseCount; phase++)
            {
                // Mark of the phase threshold (the knight: 50 %).
                float mark = x + width * (1f - (phase - 1f) / _state.PhaseCount);
                GUI.DrawTexture(new Rect(mark - 1f, y - 2f, 2f, 18f), Texture2D.whiteTexture);
            }

            GUI.color = new Color(0.85f, 0.85f, 0.85f, 1f);
            GUI.Label(new Rect(x, y + 18f, width, 22f), _state.Title, _titleStyle);
            GUI.color = old;
        }
    }
}
