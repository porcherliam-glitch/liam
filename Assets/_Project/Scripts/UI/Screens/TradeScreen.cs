using System;
using System.Collections.Generic;
using Aetherfall.Economy;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>Pages of the trade screen.</summary>
    public enum TradePage
    {
        /// <summary>The merchant's goods.</summary>
        Buy = 0,

        /// <summary>The player's bag (what the merchant buys).</summary>
        Sell = 1,

        /// <summary>Items sold since the restock.</summary>
        Buyback = 2
    }

    /// <summary>
    /// Trading with a merchant (Trade.uxml, GDD 04 8.2): tabs "Kaufen", "Verkaufen" and "Zurückkaufen" (LB/RB or Q/E), the goods on
    /// the left (6 rows visible), the focused item on the right with price, the gold of player and merchant and the result of
    /// the last action. A / Enter / click: one piece; X / F: all affordable pieces or the whole stack. B / Esc closes.
    /// </summary>
    /// <remarks>
    /// Opened by <see cref="UiStateDirector.OpenMenu"/> with the merchant id as argument (after a conversation that ended with
    /// "Handeln"); the rows are rebuilt when the merchant service or the inventory changes.
    /// </remarks>
    public sealed class TradeScreen : MenuScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.trade";

        /// <summary>Rows visible in the list.</summary>
        public const int VisibleRows = 6;

        private const int PageCount = 3;
        private const string PlayerId = MerchantService.PlayerId;

        private readonly IMerchantService _merchants;
        private readonly IInventoryService _inventory;
        private readonly Action _closeRequested;
        private readonly VisualTreeAsset _rowAsset;
        private readonly MenuItemList _list;
        private readonly VisualElement[] _tabs = new VisualElement[PageCount];
        private readonly Label _title;
        private readonly Label _gold;
        private readonly VisualElement _rows;
        private readonly Label _moreUp;
        private readonly Label _moreDown;
        private readonly Label _empty;
        private readonly VisualElement _details;
        private readonly Label _detailTitle;
        private readonly Label _detailMeta;
        private readonly Label _detailPrice;
        private readonly Label _detailNote;
        private readonly Label _message;
        private readonly Label _hintConfirm;
        private readonly Label _hintSecondary;
        private readonly ListWindow _window = new ListWindow(VisibleRows);
        private readonly List<TradeRow> _entries = new List<TradeRow>();
        private string _merchantId = string.Empty;
        private TradePage _page;
        private int _merchantRevision = -1;
        private int _inventoryRevision = -1;

        /// <summary>Builds the screen from Trade.uxml.</summary>
        /// <param name="root">Instantiated Trade.uxml.</param>
        /// <param name="rowAsset">Row template (QuestRow.uxml: title, info, badge).</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="merchants">Merchant service.</param>
        /// <param name="inventory">Inventory (player gold and bag).</param>
        /// <param name="closeRequested">Called for B / Esc (the director pops <c>Menu</c>); null: the screen closes itself.</param>
        public TradeScreen(VisualElement root, VisualTreeAsset rowAsset, IGlyphService glyphs, IMerchantService merchants, IInventoryService inventory,
            Action closeRequested) : base(Id, root, glyphs)
        {
            _rowAsset = rowAsset ?? throw new ArgumentNullException(nameof(rowAsset));
            _merchants = merchants ?? throw new ArgumentNullException(nameof(merchants));
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _closeRequested = closeRequested;

            _title = root.Q<Label>("trade-title");
            _gold = root.Q<Label>("trade-gold");
            _tabs[(int)TradePage.Buy] = root.Q<VisualElement>("trade-tab-buy");
            _tabs[(int)TradePage.Sell] = root.Q<VisualElement>("trade-tab-sell");
            _tabs[(int)TradePage.Buyback] = root.Q<VisualElement>("trade-tab-buyback");
            for (int i = 0; i < PageCount; i++)
            {
                var page = (TradePage)i;
                UiElementUtility.BindItem(_tabs[i], () => { }, held => { }, () => SelectPage(page));
            }

            _rows = root.Q<VisualElement>("trade-list");
            _moreUp = root.Q<Label>("trade-more-up");
            _moreDown = root.Q<Label>("trade-more-down");
            _empty = root.Q<Label>("trade-empty");
            _details = root.Q<VisualElement>("trade-details");
            _detailTitle = root.Q<Label>("trade-detail-title");
            _detailMeta = root.Q<Label>("trade-detail-meta");
            _detailPrice = root.Q<Label>("trade-detail-price");
            _detailNote = root.Q<Label>("trade-detail-note");
            _message = root.Q<Label>("trade-message");
            _hintConfirm = root.Q<Label>("trade-hint-confirm");
            _hintSecondary = root.Q<Label>("trade-hint-secondary");
            _list = CreateList("trade");
            BindGlyphs();
        }

        /// <summary>The page shown.</summary>
        public TradePage Page => _page;

        /// <summary>The merchant traded with.</summary>
        public string MerchantId => _merchantId;

        /// <summary>Rows of the current page (tests and tools).</summary>
        public IReadOnlyList<TradeRow> Entries => _entries;

        /// <summary>Result of the last action (German), or empty.</summary>
        public string LastMessage => _message != null ? _message.text : string.Empty;

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            if (IsOpen && (_merchants.Revision != _merchantRevision || _inventory.Revision != _inventoryRevision))
            {
                Rebuild();
            }
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            Act(index, false);
        }

        /// <inheritdoc />
        public override void Secondary(int index)
        {
            Act(index, true);
        }

        /// <inheritdoc />
        public override void Tab(int delta)
        {
            SelectPage((TradePage)((((int)_page + delta) % PageCount + PageCount) % PageCount));
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            if (_closeRequested == null)
            {
                return BackOutcome.Close;
            }

            _closeRequested();
            return BackOutcome.Handled;
        }

        /// <inheritdoc />
        public override void FocusChanged(int previous, int current)
        {
            base.FocusChanged(previous, current);
            if (_window.EnsureVisible(current))
            {
                ApplyWindow();
            }

            ShowDetails();
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            _merchantId = args as string ?? string.Empty;
            MerchantDefinition merchant = null;
            foreach (MerchantDefinition candidate in _merchants.Merchants)
            {
                if (candidate.Id == _merchantId)
                {
                    merchant = candidate;
                }
            }

            UiElementUtility.SetText(_title, merchant != null ? merchant.DisplayName : _merchantId);
            UiElementUtility.SetText(_message, string.Empty);
            _list.Focus.FocusFirst();
            SelectPage(TradePage.Buy);
            base.OnOpen(args);
        }

        /// <summary>Shows a page (also used by tests and tools).</summary>
        /// <param name="page">Page.</param>
        public void SelectPage(TradePage page)
        {
            _page = page;
            for (int i = 0; i < PageCount; i++)
            {
                if (_tabs[i] != null)
                {
                    _tabs[i].EnableInClassList("is-selected", i == (int)page);
                }
            }

            UiElementUtility.SetText(_hintConfirm, UiTexts.Get(page == TradePage.Buy ? "hint-buy" : page == TradePage.Sell ? "hint-sell" : "hint-buy-back"));
            UiElementUtility.SetText(_hintSecondary, UiTexts.Get(page == TradePage.Buy ? "hint-buy-all" : "hint-sell-all"));
            UiElementUtility.SetDisplayed(_hintSecondary != null ? _hintSecondary.parent : null, page != TradePage.Buyback);
            _window.Reset();
            _list.Focus.FocusFirst();
            Rebuild();
            Activate(_list, _entries.Count > 0 ? 0 : -1);
        }

        private void Act(int index, bool all)
        {
            if (index < 0 || index >= _entries.Count)
            {
                return;
            }

            TradeRow row = _entries[index];
            bool ok;
            string reason;
            int gold = _inventory.GetCurrency(PlayerId, CurrencyIds.Gold);
            switch (_page)
            {
                case TradePage.Buy:
                {
                    int count = all ? Math.Max(1, Math.Min(row.Count, row.Price > 0 ? gold / row.Price : row.Count)) : 1;
                    ok = _merchants.TryBuy(_merchantId, row.OfferIndex, count, out reason);
                    if (ok)
                    {
                        reason = UiTexts.Format("fmt-trade-bought", row.Name, count.ToString(), (count * row.Price).ToString());
                    }

                    break;
                }

                case TradePage.Sell:
                {
                    int count = all ? row.Count : 1;
                    ok = _merchants.TrySell(_merchantId, row.InstanceId, count, out reason);
                    if (ok)
                    {
                        reason = UiTexts.Format("fmt-trade-sold", row.Name, count.ToString(), (count * row.Price).ToString());
                    }

                    break;
                }

                default:
                    ok = _merchants.TryBuyBack(_merchantId, row.BuybackIndex, out reason);
                    if (ok)
                    {
                        reason = UiTexts.Format("fmt-trade-bought-back", row.Name);
                    }

                    break;
            }

            UiElementUtility.SetText(_message, reason);
            if (_message != null)
            {
                _message.EnableInClassList("is-failed", !ok);
            }

            Rebuild();
        }

        private void Rebuild()
        {
            _merchantRevision = _merchants.Revision;
            _inventoryRevision = _inventory.Revision;
            int previous = _list.Focus.HasFocus ? _list.Focus.Current : 0;
            TradeModel.Collect(_merchants, _inventory, _merchantId, _page, _entries);

            _list.Clear();
            _rows.Clear();
            for (int i = 0; i < _entries.Count; i++)
            {
                TradeRow entry = _entries[i];
                _rowAsset.CloneTree(_rows);
                VisualElement row = _rows[_rows.childCount - 1];
                UiElementUtility.SetText(row.Q<Label>("quest-row-title"), entry.Name);
                UiElementUtility.SetText(row.Q<Label>("quest-row-info"), entry.Info);
                UiElementUtility.SetText(row.Q<Label>("quest-row-badge"), UiTexts.Format("fmt-trade-price", entry.Price.ToString()));
                row.EnableInClassList("is-finished", !entry.Affordable);
                _list.Add(row);
            }

            _window.SetCount(_entries.Count);
            if (_entries.Count > 0)
            {
                _list.Focus.Restore(Math.Min(previous, _entries.Count - 1));
                _window.EnsureVisible(_list.Focus.Current);
            }

            UiElementUtility.SetText(_gold, UiTexts.Format("fmt-trade-gold", _inventory.GetCurrency(PlayerId, CurrencyIds.Gold).ToString(),
                _merchants.Gold(_merchantId).ToString()));
            UiElementUtility.SetText(_empty, UiTexts.Get(_page == TradePage.Buy ? "trade-empty-buy" : _page == TradePage.Sell ? "trade-empty-sell" : "trade-empty-buyback"));
            UiElementUtility.SetDisplayed(_empty, _entries.Count == 0);
            UiElementUtility.SetDisplayed(_details, _entries.Count > 0);
            _list.RefreshFocus(IsOpen);
            ApplyWindow();
            ShowDetails();
        }

        private void ApplyWindow()
        {
            for (int i = 0; i < _list.Count; i++)
            {
                UiElementUtility.SetDisplayed(_list[i], _window.IsVisible(i));
            }

            if (_moreUp != null)
            {
                _moreUp.EnableInClassList("is-off", !_window.HasMoreAbove);
            }

            if (_moreDown != null)
            {
                _moreDown.EnableInClassList("is-off", !_window.HasMoreBelow);
            }
        }

        private void ShowDetails()
        {
            int index = _list.Focus.HasFocus ? _list.Focus.Current : -1;
            if (index < 0 || index >= _entries.Count)
            {
                return;
            }

            TradeRow entry = _entries[index];
            UiElementUtility.SetText(_detailTitle, entry.Name);
            UiElementUtility.SetText(_detailMeta, UiTexts.Format("fmt-trade-meta", entry.Category, entry.ItemLevel.ToString(), entry.Count.ToString()));
            UiElementUtility.SetText(_detailPrice, UiTexts.Format(_page == TradePage.Buyback ? "fmt-trade-price" : "fmt-trade-price-each", entry.Price.ToString()));
            UiElementUtility.SetText(_detailNote, UiTexts.Get(_page == TradePage.Buy ? "trade-note-buy" : _page == TradePage.Sell ? "trade-note-sell" : "trade-note-buyback"));
        }
    }
}
