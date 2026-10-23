using Aetherfall.Cinematics;

namespace Aetherfall.Tests.EditMode.Cinematics
{
    /// <summary>
    /// Scene player for tests: counts Play and Stop, keeps the host, and like the Timeline player reports "finished" again when it
    /// is stopped (the service must ignore that call after a skip). <see cref="Finish"/> simulates the natural end.
    /// </summary>
    internal sealed class FakeCutscenePlayer : ICutscenePlayer
    {
        public FakeCutscenePlayer(string cutsceneId, double duration = 26.5d)
        {
            CutsceneId = cutsceneId;
            Duration = duration;
        }

        public string CutsceneId { get; }

        public double Time { get; set; }

        public double Duration { get; set; }

        public int PlayCount { get; private set; }

        public int StopCount { get; private set; }

        public ICutscenePlaybackHost Host { get; private set; }

        public void Play(ICutscenePlaybackHost host)
        {
            PlayCount++;
            Host = host;
            Time = 0d;
        }

        public void Stop()
        {
            StopCount++;
            Host?.Finished(this);
        }

        public void Finish()
        {
            Time = Duration;
            Host?.Finished(this);
        }
    }
}
