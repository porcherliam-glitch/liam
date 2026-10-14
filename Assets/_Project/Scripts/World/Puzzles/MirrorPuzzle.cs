using System;
using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Light puzzle with rotatable mirrors (GDD 01 6.7 "Spiegel und Licht", GDD 02 11.7 "die drei Spiegel"): every mirror has
    /// four positions and turns clockwise one step per use; the puzzle is solved as soon as the Aether beam from the source
    /// reaches the target over the mirrors (<see cref="MirrorBeamTracer"/>). Solved stays solved and locks the mirrors
    /// (the seal glows, the door opens). Wrong positions cost nothing (GDD: "keine Strafe"). Pure logic.
    /// </summary>
    public sealed class MirrorPuzzle
    {
        private readonly PlanarPoint _source;
        private readonly GridDirection _sourceDirection;
        private readonly PlanarPoint _target;
        private readonly string[] _ids;
        private readonly PlanarPoint[] _positions;
        private readonly GridDirection[] _directions;
        private readonly float _minX;
        private readonly float _maxX;
        private readonly float _minZ;
        private readonly float _maxZ;

        /// <summary>Creates the puzzle in its start position.</summary>
        /// <param name="source">Beam source.</param>
        /// <param name="sourceDirection">Direction of the source.</param>
        /// <param name="target">Target (seal).</param>
        /// <param name="mirrors">Mirrors (unique ids).</param>
        /// <param name="minX">Room bounds west (beam end); NaN = none.</param>
        /// <param name="maxX">Room bounds east.</param>
        /// <param name="minZ">Room bounds south.</param>
        /// <param name="maxZ">Room bounds north.</param>
        /// <exception cref="ArgumentException">No mirrors or duplicate ids.</exception>
        public MirrorPuzzle(PlanarPoint source, GridDirection sourceDirection, PlanarPoint target, IReadOnlyList<MirrorSetup> mirrors,
            float minX = float.NaN, float maxX = float.NaN, float minZ = float.NaN, float maxZ = float.NaN)
        {
            if (mirrors == null || mirrors.Count == 0)
            {
                throw new ArgumentException("A light puzzle needs at least one mirror.", nameof(mirrors));
            }

            _source = source;
            _sourceDirection = sourceDirection;
            _target = target;
            _minX = minX;
            _maxX = maxX;
            _minZ = minZ;
            _maxZ = maxZ;
            _ids = new string[mirrors.Count];
            _positions = new PlanarPoint[mirrors.Count];
            _directions = new GridDirection[mirrors.Count];
            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < mirrors.Count; i++)
            {
                if (string.IsNullOrEmpty(mirrors[i].Id) || !seen.Add(mirrors[i].Id))
                {
                    throw new ArgumentException("Mirror " + (i + 1) + " has an empty or duplicate id.", nameof(mirrors));
                }

                _ids[i] = mirrors[i].Id;
                _positions[i] = mirrors[i].Position;
                _directions[i] = mirrors[i].Start;
            }

            Trace = ComputeTrace();
            IsSolved = Trace.HitTarget;
            MostMirrorsHit = Trace.MirrorsHit.Count;
        }

        /// <summary>Number of mirrors.</summary>
        public int MirrorCount => _ids.Length;

        /// <summary>True once the beam reached the target (stays true).</summary>
        public bool IsSolved { get; private set; }

        /// <summary>The current beam path.</summary>
        public BeamTrace Trace { get; private set; }

        /// <summary>Most mirrors the beam has passed since the start or the last <see cref="Restore"/>.</summary>
        public int MostMirrorsHit { get; private set; }

        /// <summary>
        /// True if the last <see cref="Rotate"/> was progress for the hint timer (GDD 02 11.7: hint after 120 s without
        /// progress): the beam now passes more mirrors than ever before, or the puzzle is solved. Turning a mirror outside the
        /// beam, or turning one away and back, is no progress.
        /// </summary>
        public bool LastTurnMadeProgress { get; private set; }

        /// <summary>Raised after a mirror turned or the state was restored (beam visuals).</summary>
        public event Action Changed;

        /// <summary>Id of mirror <paramref name="index"/>.</summary>
        /// <param name="index">Index.</param>
        public string IdAt(int index)
        {
            return _ids[index];
        }

        /// <summary>True if the id belongs to a mirror of the puzzle.</summary>
        /// <param name="mirrorId">Mirror id.</param>
        public bool Contains(string mirrorId)
        {
            return IndexOf(mirrorId) >= 0;
        }

        /// <summary>Current direction of a mirror.</summary>
        /// <param name="mirrorId">Mirror id.</param>
        /// <exception cref="ArgumentException">Unknown mirror.</exception>
        public GridDirection DirectionOf(string mirrorId)
        {
            int index = IndexOf(mirrorId);
            if (index < 0)
            {
                throw new ArgumentException("Unknown mirror '" + mirrorId + "'.", nameof(mirrorId));
            }

            return _directions[index];
        }

        /// <summary>Turns a mirror one step clockwise (refused once the puzzle is solved).</summary>
        /// <param name="mirrorId">Mirror id.</param>
        /// <returns>True if the mirror turned.</returns>
        public bool Rotate(string mirrorId)
        {
            LastTurnMadeProgress = false;
            int index = IndexOf(mirrorId);
            if (index < 0 || IsSolved)
            {
                return false;
            }

            _directions[index] = GridDirections.Clockwise(_directions[index]);
            Refresh();
            int hit = Trace.MirrorsHit.Count;
            LastTurnMadeProgress = IsSolved || hit > MostMirrorsHit;
            MostMirrorsHit = Math.Max(MostMirrorsHit, hit);
            return true;
        }

        /// <summary>
        /// Restores saved directions (unknown ids and invalid values are ignored) and the solved flag. A solved puzzle keeps
        /// its mirrors as saved.
        /// </summary>
        /// <param name="directions">Direction per mirror id.</param>
        /// <param name="solved">True if the puzzle was solved.</param>
        public void Restore(IReadOnlyDictionary<string, GridDirection> directions, bool solved)
        {
            if (directions != null)
            {
                for (int i = 0; i < _ids.Length; i++)
                {
                    if (directions.TryGetValue(_ids[i], out GridDirection direction) && GridDirections.IsDefined(direction))
                    {
                        _directions[i] = direction;
                    }
                }
            }

            Trace = ComputeTrace();
            IsSolved = solved || Trace.HitTarget;
            MostMirrorsHit = Trace.MirrorsHit.Count;
            LastTurnMadeProgress = false;
            RaiseChanged();
        }

        /// <summary>The mirrors with their current directions (for tracing elsewhere, e.g. the preview).</summary>
        public List<BeamMirror> CurrentMirrors()
        {
            var list = new List<BeamMirror>(_ids.Length);
            for (int i = 0; i < _ids.Length; i++)
            {
                list.Add(new BeamMirror(_ids[i], _positions[i], _directions[i]));
            }

            return list;
        }

        private void Refresh()
        {
            Trace = ComputeTrace();
            if (Trace.HitTarget)
            {
                IsSolved = true;
            }

            RaiseChanged();
        }

        private BeamTrace ComputeTrace()
        {
            return MirrorBeamTracer.Trace(_source, _sourceDirection, CurrentMirrors(), _target, true, _minX, _maxX, _minZ, _maxZ);
        }

        private int IndexOf(string mirrorId)
        {
            return string.IsNullOrEmpty(mirrorId) ? -1 : Array.IndexOf(_ids, mirrorId);
        }

        private void RaiseChanged()
        {
            Action changed = Changed;
            if (changed != null)
            {
                changed();
            }
        }
    }
}
