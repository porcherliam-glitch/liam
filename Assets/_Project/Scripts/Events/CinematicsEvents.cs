// Global events of cutscenes (architecture 4.3, S58). Several event structs of one area may share a file (architecture 15.2,
// rule 18). Sender: the cutscene service of Aetherfall.Cinematics.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>A cutscene started (the game is in the Cutscene state). Receivers: audio, telemetry, check runs.</summary>
    public readonly struct CutsceneStarted : IGameEvent
    {
        /// <summary>Cutscene id (cs.…).</summary>
        public readonly string CutsceneId;

        /// <summary>Who asked for it (quest, debug).</summary>
        public readonly string SourceId;

        /// <summary>Creates the event.</summary>
        /// <param name="cutsceneId">Cutscene id.</param>
        /// <param name="sourceId">Who asked for it.</param>
        public CutsceneStarted(string cutsceneId, string sourceId)
        {
            CutsceneId = cutsceneId ?? string.Empty;
            SourceId = sourceId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CutsceneStarted(" + CutsceneId + ", " + SourceId + ")";
        }
    }

    /// <summary>A cutscene ended or was skipped (or never played: cutscenes off, no recording). Receivers: quests, audio.</summary>
    public readonly struct CutsceneFinished : IGameEvent
    {
        /// <summary>Cutscene id (cs.…).</summary>
        public readonly string CutsceneId;

        /// <summary>True if it was skipped or did not play.</summary>
        public readonly bool Skipped;

        /// <summary>Creates the event.</summary>
        /// <param name="cutsceneId">Cutscene id.</param>
        /// <param name="skipped">True if skipped.</param>
        public CutsceneFinished(string cutsceneId, bool skipped)
        {
            CutsceneId = cutsceneId ?? string.Empty;
            Skipped = skipped;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CutsceneFinished(" + CutsceneId + (Skipped ? ", skipped" : string.Empty) + ")";
        }
    }
}
