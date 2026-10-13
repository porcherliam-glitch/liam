using UnityEngine.Scripting;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// Save section <c>time</c> (architecture 9.2, load order 10). DTO: public fields allowed. The game clock adds
    /// <c>totalGameMinutes</c> and <c>realSecondsPerGameDay</c> later (additive, no migration needed).
    /// </summary>
    [Preserve]
    public sealed class PlaytimeDto
    {
        /// <summary>Active playtime in seconds.</summary>
        public double PlaytimeSeconds;
    }
}
