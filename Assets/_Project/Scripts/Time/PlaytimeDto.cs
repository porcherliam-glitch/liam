using System.ComponentModel;
using Newtonsoft.Json;
using UnityEngine.Scripting;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// Save section <c>time</c> (architecture 9.2, load order 10): active playtime and the game clock. DTO: public fields
    /// allowed. The clock fields are additive (old saves without them start on day 1 at 10:00 with 48 min per day).
    /// </summary>
    [Preserve]
    public sealed class PlaytimeDto
    {
        /// <summary>Active playtime in seconds.</summary>
        public double PlaytimeSeconds;

        /// <summary>Total game minutes of the clock (day 1, 0:00 = 0); default = start of a new game (day 1, 10:00).</summary>
        [DefaultValue(GameCalendar.StartMinutes)]
        [JsonProperty(DefaultValueHandling = DefaultValueHandling.IgnoreAndPopulate)]
        public double TotalGameMinutes = GameCalendar.StartMinutes;

        /// <summary>Real seconds per game day (options 24–96 min).</summary>
        [DefaultValue(GameCalendar.DefaultRealSecondsPerDay)]
        [JsonProperty(DefaultValueHandling = DefaultValueHandling.IgnoreAndPopulate)]
        public float RealSecondsPerGameDay = GameCalendar.DefaultRealSecondsPerDay;
    }
}
