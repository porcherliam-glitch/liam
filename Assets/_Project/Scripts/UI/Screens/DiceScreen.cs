using System;
using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Minigames;
using Aetherfall.UI.Framework;
using Aetherfall.Utilities;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>Parts of a dice evening at the table.</summary>
    public enum DiceMode
    {
        /// <summary>Choosing the stake.</summary>
        Stake = 0,

        /// <summary>A game runs.</summary>
        Playing = 1,

        /// <summary>The game is over: another round or stand up.</summary>
        Done = 2
    }

    /// <summary>
    /// The dice game "Krähenwurf" against an NPC (Dice.uxml, GDD 04 10.3): choose a stake (◄ ►), then five dice; pick scoring
    /// dice (A / Enter / click) and either set them aside and roll on, or set them aside and bank. The opponent plays its turn
    /// step by step with a short pause. Winning pays twice the stake; standing up during a game forfeits it. B / Esc stands up.
    /// </summary>
    /// <remarks>
    /// Opened by <see cref="UiStateDirector.OpenMenu"/> with the opponent's name as argument (after a conversation that ended
    /// with "Würfeln"). Items: dice 0–4, then the two actions; left/right move along a row or change the stake.
    /// </remarks>
    public sealed class DiceScreen : MenuScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.dice";

        /// <summary>Seconds between two steps of the opponent.</summary>
        public const float OpponentStepSeconds = 0.9f;

        private const int FirstAction = CrowThrowGame.DiceCount;
        private const string PlayerId = InventoryOwners.Player;
        private static readonly int[] Stakes = { 10, 25, 50, 100, 250, 500 };

        private readonly IInventoryService _inventory;
        private readonly Action _closeRequested;
        private readonly IRandom _random;
        private readonly MenuItemList _list;
        private readonly Button[] _dice = new Button[CrowThrowGame.DiceCount];
        private readonly Button[] _actions = new Button[2];
        private readonly bool[] _picked = new bool[CrowThrowGame.DiceCount];
        private readonly List<int> _selection = new List<int>(CrowThrowGame.DiceCount);
        private readonly List<int> _faces = new List<int>(CrowThrowGame.DiceCount);
        private readonly Label _title;
        private readonly Label _scores;
        private readonly Label _turn;
        private readonly Label _event;
        private CrowThrowGame _game;
        private DiceMode _mode;
        private int _stakeIndex;
        private string _opponent = string.Empty;
        private string _message = string.Empty;
        private bool _messageFailed;
        private float _opponentTimer;

        /// <summary>Builds the screen from Dice.uxml.</summary>
        /// <param name="root">Instantiated Dice.uxml.</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="inventory">Inventory (the player's gold).</param>
        /// <param name="random">Dice; null: a generator seeded from the clock.</param>
        /// <param name="closeRequested">Called for B / Esc (the director pops <c>Menu</c>); null: the screen closes itself.</param>
        public DiceScreen(VisualElement root, IGlyphService glyphs, IInventoryService inventory, IRandom random, Action closeRequested)
            : base(Id, root, glyphs)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _random = random ?? new Pcg32Random((ulong)DateTime.UtcNow.Ticks);
            _closeRequested = closeRequested;

            _title = root.Q<Label>("dice-title");
            _scores = root.Q<Label>("dice-scores");
            _turn = root.Q<Label>("dice-turn");
            _event = root.Q<Label>("dice-event");
            _dice[0] = root.Q<Button>("dice-die-0");
            _dice[1] = root.Q<Button>("dice-die-1");
            _dice[2] = root.Q<Button>("dice-die-2");
            _dice[3] = root.Q<Button>("dice-die-3");
            _dice[4] = root.Q<Button>("dice-die-4");
            _actions[0] = root.Q<Button>("dice-action-0");
            _actions[1] = root.Q<Button>("dice-action-1");
            _list = CreateList("dice");
            for (int i = 0; i < _dice.Length; i++)
            {
                _list.Add(_dice[i]);
            }

            for (int i = 0; i < _actions.Length; i++)
            {
                _list.Add(_actions[i]);
            }

            BindGlyphs();
        }

        /// <summary>Part of the evening shown.</summary>
        public DiceMode Mode => _mode;

        /// <summary>The running game (null before the first start).</summary>
        public CrowThrowGame Game => _game;

        /// <summary>Stake of the current game in gold.</summary>
        public int Stake => Stakes[_stakeIndex];

        /// <summary>Last message (German), or empty.</summary>
        public string LastMessage => _event != null ? _event.text : string.Empty;

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            if (!IsOpen || _mode != DiceMode.Playing || _game.Current != CrowThrowGame.Opponent)
            {
                return;
            }

            _opponentTimer += unscaledDeltaTime;
            if (_opponentTimer < OpponentStepSeconds)
            {
                return;
            }

            _opponentTimer = 0f;
            StepOpponent();
        }

        /// <summary>One step of the opponent now (tests and tools; the screen does it on its own every <see cref="OpponentStepSeconds"/>).</summary>
        /// <returns>False if it is not the opponent's turn.</returns>
        public bool StepOpponent()
        {
            if (_mode != DiceMode.Playing)
            {
                return false;
            }

            CrowThrowPhase before = _game.Phase;
            int turnPoints = _game.TurnPoints;
            int score = _game.Score(CrowThrowGame.Opponent);
            if (!_game.StepOpponent())
            {
                return false;
            }

            if (before == CrowThrowPhase.Choose)
            {
                SetMessage(UiTexts.Format("fmt-dice-opponent-aside", _opponent, _game.TurnPoints - turnPoints), false);
            }
            else if (_game.Score(CrowThrowGame.Opponent) > score)
            {
                SetMessage(UiTexts.Format("fmt-dice-opponent-banked", _opponent, _game.Score(CrowThrowGame.Opponent) - score), false);
            }
            else if (_game.Current == CrowThrowGame.Player)
            {
                SetMessage(UiTexts.Format("fmt-dice-opponent-bust", _opponent, turnPoints), false);
            }

            AfterMove();
            return true;
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            if (index >= 0 && index < FirstAction)
            {
                TogglePick(index);
            }
            else if (index == FirstAction)
            {
                PrimaryAction();
            }
            else if (index == FirstAction + 1)
            {
                SecondaryAction();
            }
        }

        /// <inheritdoc />
        public override bool TryAdjust(int index, int delta)
        {
            if (index == FirstAction && _mode == DiceMode.Stake)
            {
                _stakeIndex = Math.Max(0, Math.Min(Stakes.Length - 1, _stakeIndex + delta));
                Refresh();
                return true;
            }

            // Dice and actions are rows on the screen: left/right move along them.
            int first = index < FirstAction ? 0 : FirstAction;
            int last = index < FirstAction ? FirstAction - 1 : FirstAction + 1;
            for (int target = index + delta; target >= first && target <= last; target += delta)
            {
                if (_list.Focus.IsEnabled(target))
                {
                    _list.Focus.SetCurrent(target);
                    FocusChanged(index, target);
                    return true;
                }
            }

            return true;
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

        /// <summary>Picks or unpicks a die of the last roll (tests and tools use it like a click).</summary>
        /// <param name="die">Die index 0–4.</param>
        public void TogglePick(int die)
        {
            if (!CanPick(die))
            {
                return;
            }

            _picked[die] = !_picked[die];
            Picked(_selection);
            _faces.Clear();
            for (int i = 0; i < _selection.Count; i++)
            {
                _faces.Add(_game.Faces[_selection[i]]);
            }

            int points = CrowThrowScoring.Score(_faces);
            if (_selection.Count == 0)
            {
                SetMessage(string.Empty, false);
            }
            else
            {
                SetMessage(points > 0 ? UiTexts.Format("fmt-dice-selection", points) : UiTexts.Get("dice-pick-invalid"), points <= 0);
            }

            Refresh();
        }

        /// <summary>The first action: change the stake, roll, set aside and roll on, or play another round.</summary>
        public void PrimaryAction()
        {
            switch (_mode)
            {
                case DiceMode.Stake:
                    _stakeIndex = (_stakeIndex + 1) % Stakes.Length;
                    Refresh();
                    break;
                case DiceMode.Playing:
                    if (!IsPlayersTurn)
                    {
                        return;
                    }

                    if (_game.Phase == CrowThrowPhase.AwaitRoll)
                    {
                        _game.Roll();
                        SetMessage(_game.LastEvent, false);
                        AfterMove();
                    }
                    else if (SetAside())
                    {
                        _game.Roll();
                        SetMessage(_game.LastEvent, false);
                        AfterMove();
                    }

                    break;
                default:
                    _mode = DiceMode.Stake;
                    SetMessage(UiTexts.Get("dice-stake-note"), false);
                    Refresh();
                    _list.Focus.SetCurrent(FirstAction + 1);
                    FocusChanged(-1, FirstAction + 1);
                    break;
            }
        }

        /// <summary>The second action: start the game, set aside and bank, or stand up.</summary>
        public void SecondaryAction()
        {
            switch (_mode)
            {
                case DiceMode.Stake:
                    StartGame();
                    break;
                case DiceMode.Playing:
                    if (IsPlayersTurn && _game.Phase == CrowThrowPhase.Choose && SetAside())
                    {
                        _game.Bank();
                        SetMessage(_game.LastEvent, false);
                        AfterMove();
                    }

                    break;
                default:
                    Back(false);
                    break;
            }
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            _opponent = args as string;
            if (string.IsNullOrEmpty(_opponent))
            {
                _opponent = UiTexts.Get("dice-opponent");
            }

            _mode = DiceMode.Stake;
            _game = null;
            Array.Clear(_picked, 0, _picked.Length);
            _stakeIndex = Math.Min(_stakeIndex, Stakes.Length - 1);
            SetMessage(UiTexts.Get("dice-stake-note"), false);
            UiElementUtility.SetText(_title, UiTexts.Format("fmt-dice-title", _opponent));
            Refresh();
            Activate(_list, FirstAction + 1);
            base.OnOpen(args);
        }

        private bool IsPlayersTurn => _game != null && _game.Current == CrowThrowGame.Player && _game.Phase != CrowThrowPhase.Finished;

        private void StartGame()
        {
            int gold = _inventory.GetCurrency(PlayerId, CurrencyIds.Gold);
            if (gold < Stake || !_inventory.TryChangeCurrency(PlayerId, CurrencyIds.Gold, -Stake, "minigame.dice.stake"))
            {
                SetMessage(UiTexts.Get("dice-no-gold"), true);
                Refresh();
                return;
            }

            _game = new CrowThrowGame(_random);
            _mode = DiceMode.Playing;
            _opponentTimer = 0f;
            Array.Clear(_picked, 0, _picked.Length);
            SetMessage(string.Empty, false);
            Refresh();
            _list.Focus.SetCurrent(FirstAction);
            FocusChanged(-1, FirstAction);
        }

        private bool SetAside()
        {
            Picked(_selection);
            if (_selection.Count == 0)
            {
                SetMessage(UiTexts.Get("dice-pick"), true);
                Refresh();
                return false;
            }

            if (!_game.TrySetAside(_selection, out string reason))
            {
                SetMessage(reason, true);
                Refresh();
                return false;
            }

            Array.Clear(_picked, 0, _picked.Length);
            return true;
        }

        private void AfterMove()
        {
            Array.Clear(_picked, 0, _picked.Length);
            _opponentTimer = 0f;
            if (_game.Phase == CrowThrowPhase.Finished)
            {
                _mode = DiceMode.Done;
                if (_game.Winner == CrowThrowGame.Player)
                {
                    _inventory.TryChangeCurrency(PlayerId, CurrencyIds.Gold, Stake * 2, "minigame.dice.win");
                    SetMessage(UiTexts.Format("fmt-dice-won", Stake * 2), false);
                }
                else
                {
                    SetMessage(UiTexts.Format("fmt-dice-lost", _opponent), true);
                }
            }

            Refresh();
            int focus = _list.Focus.HasFocus ? _list.Focus.Current : -1;
            if (focus < 0 || !_list.Focus.IsEnabled(focus))
            {
                _list.Focus.FocusFirst();
            }

            if (IsPlayersTurn && _game.Phase == CrowThrowPhase.Choose)
            {
                // After a roll the player picks dice: focus the first free die.
                for (int i = 0; i < FirstAction; i++)
                {
                    if (_list.Focus.IsEnabled(i))
                    {
                        _list.Focus.SetCurrent(i);
                        break;
                    }
                }
            }
            else if (_mode == DiceMode.Done)
            {
                _list.Focus.SetCurrent(FirstAction);
            }

            _list.RefreshFocus(IsOpen);
        }

        private bool CanPick(int die)
        {
            return _mode == DiceMode.Playing && IsPlayersTurn && _game.Phase == CrowThrowPhase.Choose && die >= 0 && die < FirstAction && !_game.IsAside(die);
        }

        private void Picked(List<int> result)
        {
            result.Clear();
            for (int i = 0; i < _picked.Length; i++)
            {
                if (_picked[i])
                {
                    result.Add(i);
                }
            }
        }

        private void SetMessage(string text, bool failed)
        {
            _message = text ?? string.Empty;
            _messageFailed = failed;
        }

        private void Refresh()
        {
            int gold = _inventory.GetCurrency(PlayerId, CurrencyIds.Gold);
            bool playing = _mode == DiceMode.Playing;
            if (_mode == DiceMode.Stake)
            {
                UiElementUtility.SetText(_scores, UiTexts.Format("fmt-dice-gold", gold));
                UiElementUtility.SetText(_turn, string.Empty);
            }
            else
            {
                UiElementUtility.SetText(_scores, UiTexts.Format("fmt-dice-scores", _game.Score(CrowThrowGame.Player), _opponent,
                    _game.Score(CrowThrowGame.Opponent), CrowThrowGame.Target));
                UiElementUtility.SetText(_turn, !playing ? UiTexts.Format("fmt-dice-gold", gold)
                    : _game.Current == CrowThrowGame.Player ? UiTexts.Format("fmt-dice-turn-player", _game.TurnPoints)
                    : UiTexts.Format("fmt-dice-turn-opponent", _opponent, _game.TurnPoints));
            }

            for (int i = 0; i < _dice.Length; i++)
            {
                int face = _game != null ? _game.Faces[i] : 0;
                UiElementUtility.SetText(_dice[i], face > 0 ? face.ToString() : "?");
                if (_dice[i] != null)
                {
                    _dice[i].EnableInClassList("is-picked", _picked[i]);
                    _dice[i].EnableInClassList("is-aside", _game != null && playing && _game.IsAside(i));
                }

                _list.SetEnabled(i, CanPick(i));
            }

            switch (_mode)
            {
                case DiceMode.Stake:
                    UiElementUtility.SetText(_actions[0], UiTexts.Format("fmt-dice-stake", Stake));
                    UiElementUtility.SetText(_actions[1], UiTexts.Get("dice-start"));
                    _list.SetEnabled(FirstAction, true);
                    _list.SetEnabled(FirstAction + 1, gold >= Stake);
                    break;
                case DiceMode.Playing:
                    bool choose = IsPlayersTurn && _game.Phase == CrowThrowPhase.Choose;
                    UiElementUtility.SetText(_actions[0], UiTexts.Get(choose ? "dice-roll-on" : "dice-roll"));
                    UiElementUtility.SetText(_actions[1], UiTexts.Get("dice-bank"));
                    _list.SetEnabled(FirstAction, IsPlayersTurn);
                    _list.SetEnabled(FirstAction + 1, choose);
                    break;
                default:
                    UiElementUtility.SetText(_actions[0], UiTexts.Get("dice-again"));
                    UiElementUtility.SetText(_actions[1], UiTexts.Get("dice-stand-up"));
                    _list.SetEnabled(FirstAction, true);
                    _list.SetEnabled(FirstAction + 1, true);
                    break;
            }

            UiElementUtility.SetText(_event, _message);
            if (_event != null)
            {
                _event.EnableInClassList("is-failed", _messageFailed);
            }

            _list.RefreshFocus(IsOpen);
        }
    }
}
