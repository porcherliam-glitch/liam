using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// The day cycle of a region (S35): the path of sun and moon and the keys of the look over the day. Generated from the
    /// <c>dayCycle</c> block of the region's layout file by the Eichental menu (and used by the crypt for its daylight openings);
    /// not edited by hand.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Welt/Tag-Nacht-Profil", fileName = "DN_Region", order = 30)]
    public sealed class DayNightProfile : ScriptableObject
    {
        [Tooltip("Bahn von Sonne und Mond.")]
        [SerializeField] private DayNightSunPath sunPath = new DayNightSunPath();

        [Tooltip("Schlüssel über den Tag, nach Uhrzeit aufsteigend.")]
        [SerializeField] private List<DayNightKey> keys = new List<DayNightKey>();

        /// <summary>Path of sun and moon.</summary>
        public DayNightSunPath SunPath => sunPath;

        /// <summary>Keys sorted by hour.</summary>
        public IReadOnlyList<DayNightKey> Keys => keys;

        /// <summary>Replaces path and keys (generator, tests); the keys are sorted by hour.</summary>
        /// <param name="path">Sun and moon path.</param>
        /// <param name="newKeys">Keys.</param>
        public void Configure(DayNightSunPath path, IEnumerable<DayNightKey> newKeys)
        {
            sunPath = path ?? new DayNightSunPath();
            keys = newKeys != null ? new List<DayNightKey>(newKeys) : new List<DayNightKey>();
            keys.Sort((a, b) => a.Hour.CompareTo(b.Hour));
        }

        /// <summary>The look at an hour of a day of the moon cycle.</summary>
        /// <param name="hour">Hour of the day (fractional).</param>
        /// <param name="moonDay">Day of the moon cycle (0 = full moon).</param>
        public DayNightSample Evaluate(double hour, int moonDay)
        {
            return DayNightMath.Evaluate(sunPath, keys, hour, moonDay);
        }
    }
}
