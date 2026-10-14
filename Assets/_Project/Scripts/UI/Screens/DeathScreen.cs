using System;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Death screen: "Du bist gefallen" with "Letzten Stand laden" (newest save, disabled without one) and "Am Spawnpunkt
    /// wiederbeleben". B / Esc do nothing here. Opened by <see cref="UiStateDirector"/> a moment after <c>PlayerDied</c>.
    /// </summary>
    public sealed class DeathScreen : MenuScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.death";

        private const int LoadLastItem = 0;
        private const int RespawnItem = 1;

        private readonly IGameFlow _flow;
        private readonly Action _onLoadLast;
        private readonly Action _onRespawn;
        private readonly MenuItemList _list;
        private readonly Label _loadInfo;
        private readonly Label _status;

        /// <summary>Builds the screen from DeathScreen.uxml.</summary>
        /// <param name="root">Instantiated DeathScreen.uxml.</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="flow">Game flow (newest save).</param>
        /// <param name="onLoadLast">Called for "Letzten Stand laden".</param>
        /// <param name="onRespawn">Called for "Am Spawnpunkt wiederbeleben".</param>
        public DeathScreen(VisualElement root, IGlyphService glyphs, IGameFlow flow, Action onLoadLast, Action onRespawn) : base(Id, root, glyphs)
        {
            _flow = flow;
            _onLoadLast = onLoadLast;
            _onRespawn = onRespawn;
            _list = CreateList("death");
            _list.Add(root.Q<VisualElement>("death-load-last"));
            _list.Add(root.Q<VisualElement>("death-respawn"));
            _loadInfo = root.Q<Label>("death-load-info");
            _status = root.Q<Label>("death-status");
            BindGlyphs();
            Activate(_list, LoadLastItem);
        }

        /// <summary>Shows an error (e.g. the load failed).</summary>
        /// <param name="message">German text; empty hides it.</param>
        public void ShowStatus(string message)
        {
            UiElementUtility.SetText(_status, message);
            UiElementUtility.SetDisplayed(_status, !string.IsNullOrEmpty(message));
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            if (_flow.IsBusy)
            {
                return;
            }

            if (index == LoadLastItem)
            {
                _onLoadLast?.Invoke();
            }
            else if (index == RespawnItem)
            {
                _onRespawn?.Invoke();
            }
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            return BackOutcome.Ignored;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            ShowStatus(string.Empty);
            bool hasSave = _flow.TryGetLatestSave(out SaveSlotInfo latest);
            _list.SetEnabled(LoadLastItem, hasSave);
            UiElementUtility.SetText(_loadInfo, hasSave
                ? UiTexts.Format(UiTextKeys.ContinueInfo, SaveSlotText.KindName(latest.Kind), SaveSlotText.DateTime(latest.CreatedUtc))
                : UiTexts.Get(UiTextKeys.NoSave));
            _list.Focus.FocusFirst();
            Activate(_list);
            base.OnOpen(args);
        }
    }
}
