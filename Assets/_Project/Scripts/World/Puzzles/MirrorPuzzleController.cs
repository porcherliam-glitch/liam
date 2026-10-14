using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Scene adapter of a <see cref="MirrorPuzzle"/> (GDD 02 11.7 "puzzle.eichental.gruft_spiegel": Spiegel 1 → Ost,
    /// Spiegel 2 → Nord, Spiegel 3 → West): builds the logic from the positions of source, target and mirrors, follows their
    /// turns, draws the beam (<see cref="AetherBeamView"/>), lights the seal when the beam reaches it, stores the puzzle as
    /// solved, locks the mirrors and publishes <c>PuzzleSolved</c> (the seal door opens). Wrong positions cost nothing. After
    /// 120 s in the room without progress the soot marks of the old beam path light up.
    /// </summary>
    /// <remarks>
    /// GameObject: "Raetsel Spiegel" in the mirror hall with a <see cref="PlayerPresenceZone"/>. Mirror directions are saved by the
    /// mirrors themselves, the solved state under the puzzle id.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class MirrorPuzzleController : WorldStateBehaviour
    {
        [Tooltip("Rätsel-ID, z. B. puzzle.eichental.gruft_spiegel.")]
        [SerializeField] private string puzzleId = "puzzle.neu";

        [Tooltip("Lichtquelle (Spalt). Position = Strahlanfang.")]
        [SerializeField] private Transform source = null;

        [Tooltip("Richtung, in die die Quelle leuchtet.")]
        [SerializeField] private GridDirection sourceDirection = GridDirection.North;

        [Tooltip("Ziel (Siegel an der Tür).")]
        [SerializeField] private Transform target = null;

        [Tooltip("Die drehbaren Spiegel des Rätsels.")]
        [SerializeField] private List<RotatableMirror> mirrors = new List<RotatableMirror>();

        [Tooltip("Raumgrenzen (min x, min z, max x, max z) – hier endet ein Strahl, der nichts trifft.")]
        [SerializeField] private Vector4 roomBounds = new Vector4(-9f, 38f, 9f, 56f);

        [Tooltip("Strahl-Darstellung.")]
        [SerializeField] private AetherBeamView beam = null;

        [Tooltip("Leuchtendes Siegel (an, sobald gelöst).")]
        [SerializeField] private GameObject sealGlow = null;

        [Tooltip("Hinweis nach so vielen Sekunden ohne Fortschritt (GDD 01, 6.7: 120). 0 = nie.")]
        [Min(0f)] [SerializeField] private float hintAfterSeconds = 120f;

        [Tooltip("Fairness-Hinweise (Rußspuren), die dann aufleuchten.")]
        [SerializeField] private List<HintHighlight> hints = new List<HintHighlight>();

        [Tooltip("Zone des Raums (Hinweis-Zähler läuft nur darin). Leer = immer.")]
        [SerializeField] private PlayerPresenceZone room = null;

        private readonly List<Vector3> _beamPoints = new List<Vector3>();
        private MirrorPuzzle _puzzle;
        private PuzzleHintTimer _hint;
        private float _beamY;
        private bool _mirrorsSubscribed;

        /// <summary>Puzzle id.</summary>
        public string PuzzleId => puzzleId ?? string.Empty;

        /// <summary>The logic (null with an invalid setup).</summary>
        public MirrorPuzzle Logic => _puzzle;

        /// <summary>True once solved.</summary>
        public bool IsSolved => _puzzle != null && _puzzle.IsSolved;

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
            if (_puzzle != null && id == PuzzleId && !_puzzle.IsSolved && Store.GetState(PuzzleId) == WorldObjectStates.Done)
            {
                ApplyStoredState();
            }
        }

        /// <inheritdoc />
        protected override void OnEnable()
        {
            base.OnEnable();
            if (_puzzle == null || _mirrorsSubscribed)
            {
                return;
            }

            for (int i = 0; i < mirrors.Count; i++)
            {
                mirrors[i].Rotated += OnMirrorRotated;
            }

            _mirrorsSubscribed = true;
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            if (!_mirrorsSubscribed)
            {
                return;
            }

            for (int i = 0; i < mirrors.Count; i++)
            {
                mirrors[i].Rotated -= OnMirrorRotated;
            }

            _mirrorsSubscribed = false;
        }

        private void Awake()
        {
            if (source == null || target == null || mirrors.Count == 0 || mirrors.Contains(null))
            {
                Log.Error(LogCategory.World, "MirrorPuzzleController '" + PuzzleId + "': source, target and mirrors must be set.");
                enabled = false;
                return;
            }

            var setups = new List<MirrorSetup>(mirrors.Count);
            for (int i = 0; i < mirrors.Count; i++)
            {
                Vector3 p = mirrors[i].transform.position;
                setups.Add(new MirrorSetup(mirrors[i].ObjectId, new PlanarPoint(p.x, p.z), mirrors[i].StartDirection));
            }

            Vector3 s = source.position;
            Vector3 t = target.position;
            _beamY = s.y;
            _puzzle = new MirrorPuzzle(new PlanarPoint(s.x, s.z), sourceDirection, new PlanarPoint(t.x, t.z), setups, roomBounds.x, roomBounds.z,
                roomBounds.y, roomBounds.w);
            _hint = new PuzzleHintTimer(hintAfterSeconds);
            if (sealGlow != null)
            {
                sealGlow.SetActive(false);
            }

            DrawBeam();
        }

        private void Update()
        {
            if (_puzzle == null || _puzzle.IsSolved)
            {
                return;
            }

            if (_hint.Tick(Time.deltaTime, room == null || room.IsPlayerInside))
            {
                SetHints(true);
                Log.Info(LogCategory.World, "Puzzle '" + PuzzleId + "': hint shown after " + hintAfterSeconds + " s without progress.");
            }
        }

        private void OnMirrorRotated(RotatableMirror mirror)
        {
            if (_puzzle == null)
            {
                return;
            }

            if (!_puzzle.Rotate(mirror.ObjectId))
            {
                return;
            }

            DrawBeam();
            if (_puzzle.IsSolved)
            {
                Solve();
                return;
            }

            // Progress = the beam now passes more mirrors than ever before; turning a mirror outside the beam keeps the
            // 120 s running (GDD 02 11.7: hint after 120 s without progress).
            if (_puzzle.LastTurnMadeProgress)
            {
                _hint.NotifyProgress();
                SetHints(false);
            }
        }

        private void Solve()
        {
            _hint.Stop();
            SetHints(false);
            LockMirrors(true);
            if (sealGlow != null)
            {
                sealGlow.SetActive(true);
            }

            if (IsReady)
            {
                Store.SetState(PuzzleId, WorldObjectStates.Done);
            }

            if (EventBus != null)
            {
                var solved = new PuzzleSolved(PuzzleId);
                EventBus.Publish(in solved);
            }

            Log.Info(LogCategory.World, "Puzzle '" + PuzzleId + "' solved: the beam reaches the seal.");
        }

        private void ApplyStoredState()
        {
            if (_puzzle == null)
            {
                return;
            }

            var directions = new Dictionary<string, GridDirection>();
            for (int i = 0; i < mirrors.Count; i++)
            {
                RotatableMirror mirror = mirrors[i];
                directions[mirror.ObjectId] = RotatableMirror.StoredDirection(Store, mirror.ObjectId, mirror.StartDirection);
            }

            bool solved = Store.GetState(PuzzleId) == WorldObjectStates.Done;
            _puzzle.Restore(directions, solved);
            LockMirrors(_puzzle.IsSolved);
            if (sealGlow != null)
            {
                sealGlow.SetActive(_puzzle.IsSolved);
            }

            if (_puzzle.IsSolved)
            {
                _hint.Stop();
                if (!solved)
                {
                    // Saved mirror directions solve it (e.g. an older save): store and announce it once.
                    Solve();
                }
            }
            else
            {
                // An older save in which the puzzle is not solved yet: the hint counts again even after solving it before.
                _hint.Restart();
            }

            SetHints(false);
            DrawBeam();
        }

        private void DrawBeam()
        {
            if (beam == null || _puzzle == null)
            {
                return;
            }

            _beamPoints.Clear();
            IReadOnlyList<PlanarPoint> path = _puzzle.Trace.Path;
            for (int i = 0; i < path.Count; i++)
            {
                _beamPoints.Add(new Vector3(path[i].X, _beamY, path[i].Z));
            }

            beam.SetPath(_beamPoints);
        }

        private void LockMirrors(bool locked)
        {
            for (int i = 0; i < mirrors.Count; i++)
            {
                mirrors[i].SetLocked(locked);
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
    }
}
