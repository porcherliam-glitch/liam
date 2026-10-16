using System;
using System.Collections.Generic;
using Aetherfall.Cinematics;
using Aetherfall.Input;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Cutscene screen (S58): black cinema bars (<see cref="LetterboxMath"/>), the black or white veil, the caption card in the
    /// middle, the subtitle with its speaker at the bottom and the hint "Überspringen (halten)" with a hold bar. What it shows over
    /// the picture comes from <see cref="ICutsceneService.Overlay"/>. Holding the skip button (A / Space, a fresh press, for the hold
    /// duration) skips the cutscene; B, Esc and Start do nothing. Opened by <see cref="UiStateDirector"/> exactly while the game
    /// state is Cutscene.
    /// </summary>
    /// <remarks>
    /// Built by the UI root from <c>Cutscene.uxml</c> (styles: <c>Cutscene.uss</c> through the theme). On closing, the veil fades out
    /// over 0.5 s and the bars slide out over 0.4 s (scheduled on the element, the screen no longer ticks), then it is hidden.
    /// </remarks>
    public sealed class CutsceneScreen : UIScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.cutscene";

        /// <summary>Seconds the bars take to slide in or out.</summary>
        public const float BarSeconds = 0.4f;

        /// <summary>Seconds the veil takes to fade out when the screen closes.</summary>
        public const float VeilOutSeconds = 0.5f;

        private const string HoldingClass = "is-holding";
        private const string WhiteClass = "is-white";
        private const string SkipReason = "hold";
        private const long CloseFrameMilliseconds = 16;

        private readonly VisualElement _root;
        private readonly VisualElement _barTop;
        private readonly VisualElement _barBottom;
        private readonly VisualElement _veil;
        private readonly Label _caption;
        private readonly VisualElement _subtitle;
        private readonly Label _speaker;
        private readonly Label _text;
        private readonly VisualElement _hint;
        private readonly VisualElement _holdFill;
        private readonly List<KeyValuePair<Label, UiGlyph>> _glyphLabels = new List<KeyValuePair<Label, UiGlyph>>();
        private readonly IGlyphService _glyphs;
        private readonly ICutsceneService _cutscenes;
        private readonly IUiInput _input;
        private readonly Func<float> _holdSeconds;
        private readonly CutsceneSkipHold _hold = new CutsceneSkipHold();
        private int _renderedRevision = -1;
        private float _barAnimation;
        private float _barPercent = -1f;
        private float _veilAlpha = -1f;
        private CutsceneFadeColor _veilColor = CutsceneFadeColor.Black;
        private bool _lastHolding;
        private float _lastProgress;
        private int _closeTicket;
        private bool _closing;

        /// <summary>Builds the screen from Cutscene.uxml.</summary>
        /// <param name="root">Instantiated Cutscene.uxml (element <c>cutscene</c>).</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="cutscenes">Cutscene service.</param>
        /// <param name="input">UI map input (may be null: no skipping).</param>
        /// <param name="holdSeconds">Current hold duration in seconds (option); null = 1 s.</param>
        public CutsceneScreen(VisualElement root, IGlyphService glyphs, ICutsceneService cutscenes, IUiInput input, Func<float> holdSeconds)
            : base(Id, UILayer.Screens)
        {
            _root = root ?? throw new ArgumentNullException(nameof(root));
            _cutscenes = cutscenes ?? throw new ArgumentNullException(nameof(cutscenes));
            _glyphs = glyphs;
            _input = input;
            _holdSeconds = holdSeconds;

            // "cutscene-hint-skip" gets its text from UiTexts ("hint-skip"); the glyph label from the glyph service.
            UiElementUtility.ApplyTexts(root);
            _barTop = root.Q<VisualElement>("cutscene-bar-top");
            _barBottom = root.Q<VisualElement>("cutscene-bar-bottom");
            _veil = root.Q<VisualElement>("cutscene-veil");
            _caption = root.Q<Label>("cutscene-caption");
            _subtitle = root.Q<VisualElement>("cutscene-subtitle");
            _speaker = root.Q<Label>("cutscene-speaker");
            _text = root.Q<Label>("cutscene-text");
            _hint = root.Q<VisualElement>("cutscene-hint");
            _holdFill = root.Q<VisualElement>("cutscene-hold-fill");
            UiElementUtility.CollectGlyphLabels(root, _glyphLabels);
            RefreshGlyphs();
            root.style.display = DisplayStyle.None;
        }

        /// <summary>Share of the screen height each bar covers right now (tours).</summary>
        public float ShownBarFraction => Math.Max(0f, _barPercent) / 100f;

        /// <summary>Strength of the veil right now (tours).</summary>
        public float ShownVeilAlpha => Math.Max(0f, _veilAlpha);

        /// <summary>True while the skip hint is shown (tours).</summary>
        public bool HintShown { get; private set; }

        /// <summary>Shows the glyphs of the current device (call when the glyph service changed).</summary>
        public void RefreshGlyphs()
        {
            UiElementUtility.RefreshGlyphs(_root, _glyphLabels, _glyphs);
        }

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            float dt = float.IsNaN(unscaledDeltaTime) || unscaledDeltaTime < 0f ? 0f : unscaledDeltaTime;
            bool canSkip = _cutscenes.IsPlaying && _cutscenes.CanSkip;
            IUIManager manager = Manager;
            bool readInput = canSkip && manager != null && ReferenceEquals(manager.Top, this) && !manager.InputBlocked && _input != null &&
                             _input.IsActive;
            if (readInput)
            {
                _hold.Duration = _holdSeconds != null ? _holdSeconds() : HoldToConfirm.DefaultDuration;
                HoldStep step = _hold.Update(_input.WasPressedThisFrame(UiButton.Skip), _input.IsPressed(UiButton.Skip), dt);
                if (step == HoldStep.Completed && _cutscenes.Skip(SkipReason) && !IsOpen)
                {
                    // Skipping left the Cutscene state and closed this screen in the same call: its fade-out runs on its own.
                    return;
                }
            }
            else if (_hold.IsHolding)
            {
                _hold.Reset();
            }

            // Only a change of the real hold redraws the bar, so a tour can show a progress through HoldProgress.
            if (_hold.IsHolding != _lastHolding || Math.Abs(_hold.Progress - _lastProgress) > 0.0001f)
            {
                _lastHolding = _hold.IsHolding;
                _lastProgress = _hold.Progress;
                HoldProgress(0, _hold.IsHolding ? _hold.Progress : 0f);
            }

            ShowHint(canSkip);
            if (_cutscenes.OverlayRevision != _renderedRevision)
            {
                RenderOverlay(_cutscenes.IsPlaying ? _cutscenes.Overlay : CutsceneOverlay.Empty);
            }

            _barAnimation = Math.Min(1f, _barAnimation + (BarSeconds > 0f ? dt / BarSeconds : 1f));
            ApplyBars();
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            // No focus: Submit (also A / Space) never reaches this screen; skipping is the held SkipCutscene action.
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            // B / Esc / Start: no pause and no closing during a cutscene (Stufe A).
            return BackOutcome.Ignored;
        }

        /// <inheritdoc />
        public override void HoldProgress(int index, float progress01)
        {
            float progress = float.IsNaN(progress01) ? 0f : Math.Max(0f, Math.Min(1f, progress01));
            _hint?.EnableInClassList(HoldingClass, progress > 0f);
            UiElementUtility.SetFill(_holdFill, progress);
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            _closeTicket++;
            _closing = false;
            _hold.Reset();
            _lastHolding = false;
            _lastProgress = 0f;
            HoldProgress(0, 0f);
            RefreshGlyphs();
            _root.style.display = DisplayStyle.Flex;
            _root.BringToFront();
            _barAnimation = 0f;
            _barPercent = -1f;
            ApplyBars();
            // A state pushed without a playing cutscene (debug) shows no black screen.
            RenderOverlay(_cutscenes.IsPlaying ? _cutscenes.Overlay : CutsceneOverlay.Empty);
            ShowHint(_cutscenes.IsPlaying && _cutscenes.CanSkip);
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            _hold.Reset();
            HoldProgress(0, 0f);
            ShowHint(false);
            UiElementUtility.SetDisplayed(_caption, false);
            UiElementUtility.SetDisplayed(_subtitle, false);
            if (_cutscenes.OverlayRevision != _renderedRevision)
            {
                // Skipping turned the veil black right before the state switch: fade out from there.
                _renderedRevision = _cutscenes.OverlayRevision;
                CutsceneOverlay last = _cutscenes.Overlay;
                SetVeil(last.FadeAlpha, last.FadeColor);
            }

            _closing = true;
            int ticket = ++_closeTicket;
            float startBars = _barAnimation;
            float startVeil = Math.Max(0f, _veilAlpha);
            float elapsed = 0f;
            bool done = false;
            _root.schedule.Execute(timer =>
            {
                if (ticket != _closeTicket)
                {
                    done = true;
                    return;
                }

                elapsed += timer.deltaTime / 1000f;
                _barAnimation = Math.Max(0f, startBars - elapsed / BarSeconds);
                ApplyBars();
                SetVeil(startVeil * Math.Max(0f, 1f - elapsed / VeilOutSeconds), _veilColor);
                if (elapsed >= Math.Max(BarSeconds, VeilOutSeconds))
                {
                    done = true;
                    _closing = false;
                    _root.style.display = DisplayStyle.None;
                }
            }).Every(CloseFrameMilliseconds).Until(() => done);
        }

        private void RenderOverlay(in CutsceneOverlay overlay)
        {
            _renderedRevision = _cutscenes.OverlayRevision;
            if (_closing)
            {
                return;
            }

            SetVeil(overlay.FadeAlpha, overlay.FadeColor);
            UiElementUtility.SetText(_caption, overlay.Caption);
            UiElementUtility.SetDisplayed(_caption, overlay.Caption.Length > 0);
            bool subtitle = overlay.Text.Length > 0;
            UiElementUtility.SetDisplayed(_subtitle, subtitle);
            if (subtitle)
            {
                // The script rules keep every text on one subtitle page; the label wraps by its width (no orphaned last word).
                UiElementUtility.SetText(_text, overlay.Text);
                UiElementUtility.SetText(_speaker, overlay.Speaker);
                UiElementUtility.SetDisplayed(_speaker, overlay.Speaker.Length > 0);
            }
        }

        private void SetVeil(float alpha, CutsceneFadeColor color)
        {
            if (_veil == null)
            {
                return;
            }

            if (Math.Abs(alpha - _veilAlpha) > 0.001f)
            {
                _veilAlpha = alpha;
                _veil.style.opacity = alpha;
            }

            if (color != _veilColor)
            {
                _veilColor = color;
                _veil.EnableInClassList(WhiteClass, color == CutsceneFadeColor.White);
            }
        }

        private void ShowHint(bool shown)
        {
            // SetDisplayed only writes the style when it changes.
            HintShown = shown;
            UiElementUtility.SetDisplayed(_hint, shown);
        }

        private void ApplyBars()
        {
            float t = Math.Max(0f, Math.Min(1f, _barAnimation));
            float eased = t * t * (3f - 2f * t);
            float percent = LetterboxMath.BarFraction(Aspect()) * eased * 100f;
            if (Math.Abs(percent - _barPercent) < 0.01f)
            {
                return;
            }

            _barPercent = percent;
            if (_barTop != null)
            {
                _barTop.style.height = Length.Percent(percent);
            }

            if (_barBottom != null)
            {
                _barBottom.style.height = Length.Percent(percent);
            }
        }

        private float Aspect()
        {
            float width = _root.layout.width;
            float height = _root.layout.height;
            return width > 1f && height > 1f && !float.IsNaN(width) && !float.IsNaN(height) ? width / height : 16f / 9f;
        }
    }
}
