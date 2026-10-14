using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.Minigames
{
    /// <summary>Phase of a "Krähenwurf" game.</summary>
    public enum CrowThrowPhase
    {
        /// <summary>The player whose turn it is must roll.</summary>
        AwaitRoll = 0,

        /// <summary>Dice are on the table: set scoring dice aside, then roll on or bank.</summary>
        Choose = 1,

        /// <summary>Someone reached the target.</summary>
        Finished = 2
    }

    /// <summary>
    /// One game of "Krähenwurf" (GDD 04 10.3) between the player (seat 0) and an opponent (seat 1): roll five dice, set at least
    /// one scoring die aside after every roll, then roll the rest again or bank the points of the turn. A roll without points
    /// loses the turn's points. If all five dice scored, all five may be rolled again. First to <see cref="Target"/> wins.
    /// Pure logic; the opponent's choices come from <see cref="OpponentWantsToBank"/>.
    /// </summary>
    public sealed class CrowThrowGame
    {
        /// <summary>Points to win.</summary>
        public const int Target = 2000;

        /// <summary>Exit id of a dialogue ending that starts a game (with <c>DialogueFollowUp.Minigame</c>).</summary>
        public const string DialogueExitId = "minigame.wuerfeln";

        /// <summary>Number of dice.</summary>
        public const int DiceCount = 5;

        /// <summary>Seat of the player.</summary>
        public const int Player = 0;

        /// <summary>Seat of the opponent.</summary>
        public const int Opponent = 1;

        private readonly IRandom _random;
        private readonly int[] _faces = new int[DiceCount];
        private readonly bool[] _aside = new bool[DiceCount];
        private readonly int[] _scores = new int[2];
        private readonly List<int> _free = new List<int>(DiceCount);

        /// <summary>Creates a game; the player begins.</summary>
        /// <param name="random">Dice.</param>
        public CrowThrowGame(IRandom random)
        {
            _random = random ?? throw new ArgumentNullException(nameof(random));
            Phase = CrowThrowPhase.AwaitRoll;
            Winner = -1;
        }

        /// <summary>Current phase.</summary>
        public CrowThrowPhase Phase { get; private set; }

        /// <summary>Seat whose turn it is (0 player, 1 opponent).</summary>
        public int Current { get; private set; }

        /// <summary>Points collected in the current turn (lost by a roll without points).</summary>
        public int TurnPoints { get; private set; }

        /// <summary>Winner seat, or −1.</summary>
        public int Winner { get; private set; }

        /// <summary>Faces of the five dice (the last roll; dice set aside keep their face).</summary>
        public IReadOnlyList<int> Faces => _faces;

        /// <summary>Last event in German for the screen ("Kein Punkt – die Runde ist verloren.").</summary>
        public string LastEvent { get; private set; } = string.Empty;

        /// <summary>Banked points of a seat.</summary>
        /// <param name="seat">0 player, 1 opponent.</param>
        public int Score(int seat)
        {
            return _scores[seat];
        }

        /// <summary>True if a die is set aside in this turn.</summary>
        /// <param name="die">Die index 0–4.</param>
        public bool IsAside(int die)
        {
            return _aside[die];
        }

        /// <summary>Rolls every die that is not set aside (all five when all are aside). A roll without points ends the turn.</summary>
        /// <returns>False if it is not time to roll.</returns>
        public bool Roll()
        {
            if (Phase != CrowThrowPhase.AwaitRoll)
            {
                return false;
            }

            if (Array.TrueForAll(_aside, aside => aside))
            {
                Array.Clear(_aside, 0, DiceCount);
            }

            _free.Clear();
            for (int i = 0; i < DiceCount; i++)
            {
                if (!_aside[i])
                {
                    _faces[i] = _random.Range(1, 7);
                    _free.Add(_faces[i]);
                }
            }

            if (!CrowThrowScoring.HasScore(_free))
            {
                LastEvent = "Kein Punkt – " + TurnPoints + " Punkte der Runde sind verloren.";
                TurnPoints = 0;
                NextTurn();
                return true;
            }

            LastEvent = string.Empty;
            Phase = CrowThrowPhase.Choose;
            return true;
        }

        /// <summary>
        /// Sets dice of the last roll aside (indices 0–4, none already aside). Every selected die must score; the points go to the
        /// turn. Then the player rolls on (<see cref="Roll"/>) or banks (<see cref="Bank"/>).
        /// </summary>
        /// <param name="dice">Die indices.</param>
        /// <param name="reason">German reason if the selection is not allowed.</param>
        public bool TrySetAside(IReadOnlyList<int> dice, out string reason)
        {
            if (Phase != CrowThrowPhase.Choose)
            {
                reason = "Erst würfeln.";
                return false;
            }

            var faces = new List<int>(DiceCount);
            var seen = new bool[DiceCount];
            for (int i = 0; dice != null && i < dice.Count; i++)
            {
                int die = dice[i];
                if (die < 0 || die >= DiceCount || _aside[die] || seen[die])
                {
                    reason = "Dieser Würfel liegt schon beiseite.";
                    return false;
                }

                seen[die] = true;
                faces.Add(_faces[die]);
            }

            int points = CrowThrowScoring.Score(faces);
            if (points <= 0)
            {
                reason = faces.Count == 0 ? "Lege mindestens einen Punktewürfel beiseite." : "Nur Würfel, die Punkte bringen: Einsen, Fünfen, Drillinge oder die Straße.";
                return false;
            }

            for (int i = 0; i < dice.Count; i++)
            {
                _aside[dice[i]] = true;
            }

            TurnPoints += points;
            Phase = CrowThrowPhase.AwaitRoll;
            reason = string.Empty;
            return true;
        }

        /// <summary>Banks the turn's points (after setting dice aside). Reaching the target ends the game.</summary>
        /// <returns>False if nothing can be banked now.</returns>
        public bool Bank()
        {
            if (Phase != CrowThrowPhase.AwaitRoll || TurnPoints <= 0)
            {
                return false;
            }

            _scores[Current] += TurnPoints;
            LastEvent = (Current == Player ? "Du sicherst " : "Der Gegner sichert ") + TurnPoints + " Punkte.";
            TurnPoints = 0;
            if (_scores[Current] >= Target)
            {
                Winner = Current;
                Phase = CrowThrowPhase.Finished;
                return true;
            }

            NextTurn();
            return true;
        }

        /// <summary>
        /// The opponent's choice after setting dice aside: bank with 350 points or more, with 250 when only one or two dice are
        /// left, or as soon as banking wins; otherwise roll on.
        /// </summary>
        public bool OpponentWantsToBank()
        {
            int free = 0;
            for (int i = 0; i < DiceCount; i++)
            {
                free += _aside[i] ? 0 : 1;
            }

            if (free == 0)
            {
                return _scores[Current] + TurnPoints >= Target;
            }

            return _scores[Current] + TurnPoints >= Target || TurnPoints >= 350 || (free <= 2 && TurnPoints >= 250);
        }

        /// <summary>
        /// One visible step of the opponent's turn: roll, then set the best dice aside, then bank or roll on
        /// (<see cref="OpponentWantsToBank"/>). The screen calls it with a pause between the steps.
        /// </summary>
        /// <returns>False if it is not the opponent's turn or the game is over.</returns>
        public bool StepOpponent()
        {
            if (Current != Opponent || Phase == CrowThrowPhase.Finished)
            {
                return false;
            }

            if (Phase == CrowThrowPhase.Choose)
            {
                var best = new List<int>(DiceCount);
                BestSelection(best);
                return TrySetAside(best, out _);
            }

            return TurnPoints > 0 && OpponentWantsToBank() ? Bank() : Roll();
        }

        /// <summary>The best scoring selection of the free dice of the last roll (indices 0–4), for the opponent and hints.</summary>
        /// <param name="dice">Receives the die indices.</param>
        /// <returns>Points of the selection.</returns>
        public int BestSelection(List<int> dice)
        {
            dice.Clear();
            var freeIndices = new List<int>(DiceCount);
            _free.Clear();
            for (int i = 0; i < DiceCount; i++)
            {
                if (!_aside[i])
                {
                    freeIndices.Add(i);
                    _free.Add(_faces[i]);
                }
            }

            var picked = new List<int>(DiceCount);
            int points = CrowThrowScoring.Best(_free, picked);
            for (int i = 0; i < picked.Count; i++)
            {
                dice.Add(freeIndices[picked[i]]);
            }

            return points;
        }

        private void NextTurn()
        {
            Current = 1 - Current;
            Array.Clear(_aside, 0, DiceCount);
            Phase = CrowThrowPhase.AwaitRoll;
        }
    }
}
