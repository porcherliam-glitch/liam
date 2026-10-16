using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Day and night (S35, GDD 01 6.1): the light of the scenes follows the game clock, and the stealth AI reads how bright it is
    /// where a target stands (GDD 03 9.2). Registered by the day-and-night installer; scenes register their
    /// <see cref="IDayNightEnvironment"/>.
    /// </summary>
    public interface IDayNightService
    {
        /// <summary>Hour of the day (fractional).</summary>
        double HourOfDay { get; }

        /// <summary>Day of the moon cycle (0 = full moon).</summary>
        int MoonDay { get; }

        /// <summary>Phase of the day.</summary>
        DayPhase Phase { get; }

        /// <summary>True between 21:00 and 5:00.</summary>
        bool IsNight { get; }

        /// <summary>Daylight 0 (night) … 1 (day) of the current scene's sun.</summary>
        float Daylight { get; }

        /// <summary>
        /// The light factor of GDD 03 9.2 where a target stands: by day 1.0, at dusk 0.7, at night 0.4, at night within 5 m of a
        /// lit fire or lamp 0.9; indoors the scene's constant; without a scene 1.0.
        /// </summary>
        /// <param name="position">Target position (chest).</param>
        float LightFactorAt(Vector3 position);

        /// <summary>A scene offers its light (rig in Start).</summary>
        /// <param name="environment">The scene's environment.</param>
        void RegisterEnvironment(IDayNightEnvironment environment);

        /// <summary>A scene goes away.</summary>
        /// <param name="environment">The scene's environment.</param>
        void UnregisterEnvironment(IDayNightEnvironment environment);
    }
}
