using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>Result of <see cref="MirrorBeamTracer.Trace"/>: the path, the mirrors on it and whether it hit the target.</summary>
    public sealed class BeamTrace
    {
        private readonly List<PlanarPoint> _path = new List<PlanarPoint>();
        private readonly List<string> _mirrors = new List<string>();

        /// <summary>Points of the beam: source, every mirror it touched, end point.</summary>
        public IReadOnlyList<PlanarPoint> Path => _path;

        /// <summary>Ids of the mirrors the beam touched, in order.</summary>
        public IReadOnlyList<string> MirrorsHit => _mirrors;

        /// <summary>True if the beam reached the target.</summary>
        public bool HitTarget { get; private set; }

        /// <summary>Id of the mirror that sent the beam straight back (beam ends there), or empty.</summary>
        public string BlockedBy { get; private set; } = string.Empty;

        /// <summary>The last point of the beam.</summary>
        public PlanarPoint End => _path.Count > 0 ? _path[_path.Count - 1] : default;

        internal void AddPoint(PlanarPoint point)
        {
            _path.Add(point);
        }

        internal void AddMirror(string id)
        {
            _mirrors.Add(id);
        }

        internal void MarkHitTarget()
        {
            HitTarget = true;
        }

        internal void MarkBlocked(string mirrorId)
        {
            BlockedBy = mirrorId ?? string.Empty;
        }
    }
}
