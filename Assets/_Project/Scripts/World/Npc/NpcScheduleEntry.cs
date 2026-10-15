using System;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// One block of an NPC daily routine (GDD 01 7.1): from <see cref="FromHour"/> to <see cref="ToHour"/> the NPC is at
    /// <see cref="Position"/> doing <see cref="Activity"/> ("Arbeit", "Mittag", "Taverne", "Schlaf" …). Windows over
    /// midnight (21–5) are allowed.
    /// </summary>
    [Serializable]
    public sealed class NpcScheduleEntry
    {
        [Tooltip("Beginn (Stunde 0–24, mit Bruchteil: 7,5 = 7:30).")]
        [Range(0f, 24f)] [SerializeField] private float fromHour = 7f;

        [Tooltip("Ende (Stunde 0–24, exklusiv). Kleiner als der Beginn = über Mitternacht.")]
        [Range(0f, 24f)] [SerializeField] private float toHour = 18f;

        [Tooltip("Ort in der Welt (die Höhe kommt vom Boden).")]
        [SerializeField] private Vector3 position = Vector3.zero;

        [Tooltip("Blickrichtung am Ort (Grad).")]
        [SerializeField] private float yaw = 0f;

        [Tooltip("Tätigkeit (deutsch, für Debug und Questlog-Hinweise), z. B. „Arbeit bei der Herde“.")]
        [SerializeField] private string activity = string.Empty;

        /// <summary>Creates an empty entry (inspector).</summary>
        public NpcScheduleEntry()
        {
        }

        /// <summary>Creates an entry (generator).</summary>
        /// <param name="fromHour">Start hour.</param>
        /// <param name="toHour">End hour (exclusive).</param>
        /// <param name="position">Place (height ignored).</param>
        /// <param name="yaw">Facing at the place.</param>
        /// <param name="activity">Activity text.</param>
        public NpcScheduleEntry(float fromHour, float toHour, Vector3 position, float yaw, string activity)
        {
            this.fromHour = fromHour;
            this.toHour = toHour;
            this.position = position;
            this.yaw = yaw;
            this.activity = activity ?? string.Empty;
        }

        /// <summary>Start hour.</summary>
        public float FromHour => fromHour;

        /// <summary>End hour (exclusive).</summary>
        public float ToHour => toHour;

        /// <summary>Place.</summary>
        public Vector3 Position => position;

        /// <summary>Facing at the place.</summary>
        public float Yaw => yaw;

        /// <summary>Activity text.</summary>
        public string Activity => activity ?? string.Empty;
    }
}
