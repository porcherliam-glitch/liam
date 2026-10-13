using System;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Unity adapter of <see cref="ITimeScaleService"/>: the only class that writes <c>Time.timeScale</c>.
    /// Pauses the audio listener while the time scale is 0 (architecture 4.4: UI sources use
    /// <c>ignoreListenerPause</c>; music ducking follows with the AudioManager).
    /// </summary>
    public sealed class UnityTimeScaleService : ITimeScaleService, IDisposable
    {
        private const float MaxTimeScale = 100f;

        /// <inheritdoc />
        public float TimeScale => Time.timeScale;

        /// <inheritdoc />
        public void SetTimeScale(float timeScale)
        {
            if (float.IsNaN(timeScale) || timeScale < 0f || timeScale > MaxTimeScale)
            {
                Log.Error(LogCategory.GameState, "Invalid time scale " + timeScale + " rejected (allowed: 0 to " + MaxTimeScale + ").");
                return;
            }

            Time.timeScale = timeScale;
            AudioListener.pause = timeScale <= 0f;
        }

        /// <summary>Restores normal speed and unpauses audio when the services shut down.</summary>
        public void Dispose()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
        }
    }
}
