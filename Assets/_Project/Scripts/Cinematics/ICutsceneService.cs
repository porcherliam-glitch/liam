using System;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Cutscenes (S58, architecture 4.4 state Cutscene): plays a recorded sequence of the loaded scene, switches the game to the
    /// Cutscene state while it runs (HUD hidden, clock stopped, saving refused, only "hold to skip" reacts) and back afterwards.
    /// Requests wait until a fitting moment (playing, not in combat, the scene's player registered). Registered by the
    /// Cinematics installer; scene players register themselves.
    /// </summary>
    public interface ICutsceneService
    {
        /// <summary>Raised when a cutscene starts or ends.</summary>
        event Action Changed;

        /// <summary>True while a cutscene plays.</summary>
        bool IsPlaying { get; }

        /// <summary>True while a request waits.</summary>
        bool IsPending { get; }

        /// <summary>Id of the cutscene that plays, or empty.</summary>
        string CurrentId { get; }

        /// <summary>Seconds into the playing cutscene.</summary>
        double CurrentTime { get; }

        /// <summary>Length of the playing cutscene in seconds.</summary>
        double CurrentDuration { get; }

        /// <summary>True while the playing cutscene may be skipped.</summary>
        bool CanSkip { get; }

        /// <summary>What the screen shows over the picture.</summary>
        CutsceneOverlay Overlay { get; }

        /// <summary>Counts up whenever <see cref="Overlay"/> changes.</summary>
        int OverlayRevision { get; }

        /// <summary>Asks for a cutscene (returns at once; it starts when the game allows it).</summary>
        /// <param name="cutsceneId">Cutscene id (cs.…).</param>
        /// <param name="sourceId">Who asked (quest, debug).</param>
        /// <returns>False if the request was refused (cutscenes off, queue full).</returns>
        bool Request(string cutsceneId, string sourceId);

        /// <summary>Skips the playing cutscene (hold to skip, death, check runs).</summary>
        /// <param name="reason">Why (log).</param>
        /// <returns>False if nothing plays or it cannot be skipped.</returns>
        bool Skip(string reason);

        /// <summary>A scene offers a recorded cutscene.</summary>
        /// <param name="player">Player of the scene.</param>
        void Register(ICutscenePlayer player);

        /// <summary>A scene goes away.</summary>
        /// <param name="player">Player of the scene.</param>
        void Unregister(ICutscenePlayer player);
    }

    /// <summary>A recorded cutscene of a scene (the Timeline player; a fake in tests).</summary>
    public interface ICutscenePlayer
    {
        /// <summary>Cutscene id.</summary>
        string CutsceneId { get; }

        /// <summary>Seconds played.</summary>
        double Time { get; }

        /// <summary>Length in seconds.</summary>
        double Duration { get; }

        /// <summary>Starts from the beginning; reports overlay and end to the host.</summary>
        /// <param name="host">The service.</param>
        void Play(ICutscenePlaybackHost host);

        /// <summary>Stops at once (skip).</summary>
        void Stop();
    }

    /// <summary>What a playing cutscene reports back to the service.</summary>
    public interface ICutscenePlaybackHost
    {
        /// <summary>The overlay at the current moment.</summary>
        /// <param name="overlay">Subtitle, caption and veil.</param>
        void SetOverlay(in CutsceneOverlay overlay);

        /// <summary>The cutscene reached its end (or was stopped).</summary>
        /// <param name="player">The player.</param>
        void Finished(ICutscenePlayer player);
    }
}
