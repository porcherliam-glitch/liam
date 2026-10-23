using System.Collections.Generic;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// The script of a cutscene (S58), the single source the generator bakes into a Timeline: shots one after another (each a
    /// static camera or a move from one pose to another), cues over the picture (subtitles, caption cards, the veil) and props that
    /// are visible for a while (a light). Pure data; <see cref="CutsceneScriptRules"/> checks it.
    /// </summary>
    public sealed class CutsceneScript
    {
        /// <summary>Creates a script.</summary>
        /// <param name="id">Cutscene id (cs.…).</param>
        /// <param name="duration">Length in seconds.</param>
        public CutsceneScript(string id, double duration)
        {
            Id = id ?? string.Empty;
            Duration = duration;
        }

        /// <summary>Cutscene id.</summary>
        public string Id { get; }

        /// <summary>Length in seconds.</summary>
        public double Duration { get; }

        /// <summary>Shots in order of time.</summary>
        public List<CutsceneShot> Shots { get; } = new List<CutsceneShot>();

        /// <summary>Cues over the picture.</summary>
        public List<CutsceneCue> Cues { get; } = new List<CutsceneCue>();

        /// <summary>Props that are visible for a while.</summary>
        public List<CutsceneActivation> Activations { get; } = new List<CutsceneActivation>();
    }

    /// <summary>
    /// One shot: from <see cref="Start"/> to <see cref="End"/> the camera holds <see cref="From"/>, or moves to <see cref="To"/>
    /// between <see cref="MoveStart"/> and <see cref="MoveEnd"/>. A black shot only shows the veil; its camera already holds the
    /// pose of the next shot.
    /// </summary>
    public sealed class CutsceneShot
    {
        /// <summary>Creates a shot.</summary>
        /// <param name="name">Name (German, also the camera name).</param>
        /// <param name="start">Start in seconds.</param>
        /// <param name="end">End in seconds.</param>
        /// <param name="from">Pose at the start.</param>
        /// <param name="to">Pose at the end of the move, or null for a static shot.</param>
        /// <param name="moveStart">Start of the move.</param>
        /// <param name="moveEnd">End of the move.</param>
        /// <param name="black">True for a black shot.</param>
        public CutsceneShot(string name, double start, double end, CinePose from, CinePose? to = null, double moveStart = 0d, double moveEnd = 0d,
            bool black = false)
        {
            Name = name ?? string.Empty;
            Start = start;
            End = end;
            From = from;
            To = to;
            MoveStart = to.HasValue ? moveStart : start;
            MoveEnd = to.HasValue ? moveEnd : start;
            Black = black;
        }

        /// <summary>Name.</summary>
        public string Name { get; }

        /// <summary>Start in seconds.</summary>
        public double Start { get; }

        /// <summary>End in seconds.</summary>
        public double End { get; }

        /// <summary>Pose at the start.</summary>
        public CinePose From { get; }

        /// <summary>Pose at the end of the move (null: static).</summary>
        public CinePose? To { get; }

        /// <summary>Start of the move.</summary>
        public double MoveStart { get; }

        /// <summary>End of the move.</summary>
        public double MoveEnd { get; }

        /// <summary>True for a black shot.</summary>
        public bool Black { get; }

        /// <summary>The pose at a moment of the shot (linear move between the two poses).</summary>
        /// <param name="time">Seconds into the cutscene.</param>
        public CinePose PoseAt(double time)
        {
            if (!To.HasValue || MoveEnd <= MoveStart || time <= MoveStart)
            {
                return From;
            }

            CinePose to = To.Value;
            if (time >= MoveEnd)
            {
                return to;
            }

            double t = (time - MoveStart) / (MoveEnd - MoveStart);
            return new CinePose(CinePoint.Lerp(From.Position, to.Position, t), CinePoint.Lerp(From.LookAt, to.LookAt, t),
                From.FieldOfView + (to.FieldOfView - From.FieldOfView) * t, From.Dutch + (to.Dutch - From.Dutch) * t);
        }
    }

    /// <summary>A prop of the scene that is visible while the cutscene is between two times (a light over Lina).</summary>
    public sealed class CutsceneActivation
    {
        /// <summary>Creates an activation.</summary>
        /// <param name="targetKey">Key of the prop (the generator builds it).</param>
        /// <param name="start">Visible from.</param>
        /// <param name="end">Visible until.</param>
        public CutsceneActivation(string targetKey, double start, double end)
        {
            TargetKey = targetKey ?? string.Empty;
            Start = start;
            End = end;
        }

        /// <summary>Key of the prop.</summary>
        public string TargetKey { get; }

        /// <summary>Visible from.</summary>
        public double Start { get; }

        /// <summary>Visible until.</summary>
        public double End { get; }
    }
}
