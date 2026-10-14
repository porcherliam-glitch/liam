using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Scene adapter of a <see cref="SequencePuzzle"/> (GDD 02 11.7 "puzzle.eichental.gruft_grabplatten": Eiche → Krone →
    /// Schild): listens to its <see cref="PuzzleSwitch"/>es, lets pressed slabs stay down while the order is right, makes them
    /// spring back on a wrong slab and publishes <c>PuzzleFailed</c> (the arrow trap shoots), and on the last right slab
    /// stores the puzzle as solved, locks the slabs and publishes <c>PuzzleSolved</c> (the gate opens, the quest goes on).
    /// After 120 s in the room without progress the fairness hint lights up (<see cref="HintHighlight"/>).
    /// </summary>
    /// <remarks>
    /// GameObject: "Raetsel Grabplatten" in the room, with a <see cref="PlayerPresenceZone"/> covering the room (hint timer).
    /// The switches are listed in the order of the solution. The solved state is saved under the puzzle id
    /// (<see cref="IWorldObjectStateStore"/>); a started attempt is not saved (the slabs are up again after loading).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class SequencePuzzleController : WorldStateBehaviour
    {
        [Tooltip("Rätsel-ID, z. B. puzzle.eichental.gruft_grabplatten (Ereignisse PuzzleSolved/PuzzleFailed, Spielstand).")]
        [SerializeField] private string puzzleId = "puzzle.neu";

        [Tooltip("Die Schalter in der Reihenfolge der LÖSUNG (nicht der Lage im Raum).")]
        [SerializeField] private List<PuzzleSwitch> steps = new List<PuzzleSwitch>();

        [Tooltip("Sekunden, bis die Platten nach einem Fehlversuch zurückspringen (der Spieler sieht sie erst einsinken).")]
        [Range(0f, 3f)] [SerializeField] private float springBackDelay = 0.6f;

        [Tooltip("Hinweis nach so vielen Sekunden ohne Fortschritt (GDD 01, 6.7: 120). 0 = nie.")]
        [Min(0f)] [SerializeField] private float hintAfterSeconds = 120f;

        [Tooltip("Fairness-Hinweise, die dann aufleuchten (z. B. die Inschrift am Tor).")]
        [SerializeField] private List<HintHighlight> hints = new List<HintHighlight>();

        [Tooltip("Zone des Raums: Der Hinweis-Zähler läuft nur, solange der Spieler darin ist. Leer = immer.")]
        [SerializeField] private PlayerPresenceZone room = null;

        private SequencePuzzle _puzzle;
        private PuzzleHintTimer _hint;
        private float _springBackTimer = -1f;
        private bool _switchesSubscribed;

        /// <summary>Puzzle id.</summary>
        public string PuzzleId => puzzleId ?? string.Empty;

        /// <summary>True once solved.</summary>
        public bool IsSolved => _puzzle != null && _puzzle.IsSolved;

        /// <summary>The logic (null before Awake or with an invalid setup).</summary>
        public SequencePuzzle Logic => _puzzle;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            ApplyStoredState();
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            ApplyStoredState();
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            // A quest action or debug command solved the puzzle from outside.
            if (_puzzle != null && id == PuzzleId && !_puzzle.IsSolved && Store.GetState(PuzzleId) == WorldObjectStates.Done)
            {
                ApplyStoredState();
            }
        }

        /// <inheritdoc />
        protected override void OnEnable()
        {
            base.OnEnable();
            if (_puzzle == null || _switchesSubscribed)
            {
                return;
            }

            for (int i = 0; i < steps.Count; i++)
            {
                if (steps[i] != null)
                {
                    steps[i].Used += OnSwitchUsed;
                }
            }

            _switchesSubscribed = true;
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            if (!_switchesSubscribed)
            {
                return;
            }

            for (int i = 0; i < steps.Count; i++)
            {
                if (steps[i] != null)
                {
                    steps[i].Used -= OnSwitchUsed;
                }
            }

            _switchesSubscribed = false;
        }

        private void Awake()
        {
            var ids = new List<string>(steps.Count);
            for (int i = 0; i < steps.Count; i++)
            {
                if (steps[i] == null)
                {
                    Log.Error(LogCategory.World, "SequencePuzzleController '" + PuzzleId + "': step " + (i + 1) + " is empty.");
                    enabled = false;
                    return;
                }

                ids.Add(steps[i].ObjectId);
            }

            if (ids.Count == 0)
            {
                Log.Error(LogCategory.World, "SequencePuzzleController '" + PuzzleId + "' has no steps.");
                enabled = false;
                return;
            }

            _puzzle = new SequencePuzzle(ids);
            _hint = new PuzzleHintTimer(hintAfterSeconds);
        }

        private void Update()
        {
            if (_puzzle == null)
            {
                return;
            }

            if (_springBackTimer >= 0f)
            {
                _springBackTimer -= Time.deltaTime;
                if (_springBackTimer < 0f)
                {
                    RefreshSwitches(false);
                }
            }

            bool near = room == null || room.IsPlayerInside;
            if (_hint.Tick(Time.deltaTime, near))
            {
                SetHints(true);
                Log.Info(LogCategory.World, "Puzzle '" + PuzzleId + "': hint shown after " + hintAfterSeconds + " s without progress.");
            }
        }

        private void OnSwitchUsed(PuzzleSwitch used)
        {
            if (_puzzle == null || _springBackTimer >= 0f)
            {
                return;
            }

            SequenceStepResult result = _puzzle.Press(used.ObjectId);
            switch (result)
            {
                case SequenceStepResult.Progressed:
                    _hint.NotifyProgress();
                    SetHints(false);
                    break;
                case SequenceStepResult.Solved:
                    Solve();
                    break;
                case SequenceStepResult.Failed:
                    // The wrong slab sinks too; all spring back after a moment (GDD 02 11.7: "Platten springen zurueck").
                    _springBackTimer = springBackDelay;
                    for (int i = 0; i < steps.Count; i++)
                    {
                        steps[i].SetLocked(true);
                    }

                    Publish(new PuzzleFailed(PuzzleId, used.ObjectId));
                    Log.Info(LogCategory.World, "Puzzle '" + PuzzleId + "': wrong step '" + used.ObjectId + "' (attempt " + _puzzle.FailedAttempts + ").");
                    break;
            }
        }

        private void Solve()
        {
            _hint.Stop();
            SetHints(false);
            RefreshSwitches(false);
            if (IsReady)
            {
                Store.SetState(PuzzleId, WorldObjectStates.Done);
            }

            Publish(new PuzzleSolved(PuzzleId));
            Log.Info(LogCategory.World, "Puzzle '" + PuzzleId + "' solved.");
        }

        private void ApplyStoredState()
        {
            if (_puzzle == null)
            {
                return;
            }

            bool solved = Store.GetState(PuzzleId) == WorldObjectStates.Done;
            _puzzle.Restore(solved);
            _springBackTimer = -1f;
            if (solved)
            {
                _hint.Stop();
            }
            else
            {
                _hint.NotifyProgress();
            }

            SetHints(false);
            RefreshSwitches(true);
        }

        private void RefreshSwitches(bool instant)
        {
            for (int i = 0; i < steps.Count; i++)
            {
                PuzzleSwitch step = steps[i];
                step.SetPressed(_puzzle.IsPressed(step.ObjectId), instant);
                step.SetLocked(_puzzle.IsSolved);
            }
        }

        private void SetHints(bool on)
        {
            for (int i = 0; i < hints.Count; i++)
            {
                if (hints[i] != null)
                {
                    hints[i].SetHighlighted(on);
                }
            }
        }

        private void Publish<T>(T evt) where T : struct, IGameEvent
        {
            if (EventBus != null)
            {
                EventBus.Publish(in evt);
            }
        }
    }
}
