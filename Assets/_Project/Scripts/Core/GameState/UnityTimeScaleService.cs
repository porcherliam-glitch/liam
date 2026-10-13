using System;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Unity adapter of <see cref="ITimeScaleService"/>: the only class that writes <c>Time.timeScale</c>.
    /// Pauses the audio listener while the time scale is 0 (architecture 4.4: UI sources use
    /// <c>ignoreListenerPause</c>; music ducking follows with the AudioManager).
    /// </summary>
    /// <remarks>
    /// After <see cref="Dispose"/> (shutdown or failed boot) the service ignores further <see cref="SetTimeScale"/> calls with a
    /// warning, so a stale reference (e.g. a debug tool that still holds the old services) cannot pause the game again.
    /// </remarks>
    public sealed class UnityTimeScaleService : ITimeScaleService, IDisposable
    {
        private const float MaxTimeScale = 100f;

        private bool _disposed;

        /// <inheritdoc />
        public float TimeScale => Time.timeScale;

        /// <inheritdoc />
        public void SetTimeScale(float timeScale)
        {
            if (_disposed)
            {
                Log.Warning(LogCategory.GameState, "SetTimeScale(" + timeScale + ") ignored: the time scale service was already shut down. " +
                                                   "Something still uses the services of a finished or failed boot.");
                return;
            }

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
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Time.timeScale = 1f;
            AudioListener.pause = false;
        }
    }
}
