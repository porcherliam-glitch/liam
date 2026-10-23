using System;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// One key of the day cycle of a region (S35): the look at one hour — sun colour and strength, the three ambient colours,
    /// fog, sky, reflections and how bright the fires burn. Between keys the values are blended linearly (over midnight too).
    /// Written by the generator from the <c>dayCycle</c> block of the layout file.
    /// </summary>
    [Serializable]
    public sealed class DayNightKey
    {
        [Tooltip("Uhrzeit in Stunden, z. B. 18,1667 für 18:10.")]
        [Range(0f, 24f)] [SerializeField] private float hour;

        [Tooltip("Farbe der Sonne.")]
        [SerializeField] private Color sunColor = Color.white;

        [Tooltip("Stärke der Sonne (wird bei tiefer Sonne zusätzlich abgeblendet).")]
        [Min(0f)] [SerializeField] private float sunIntensity = 1f;

        [Tooltip("Umgebungslicht von oben (Himmel).")]
        [SerializeField] private Color ambientSky = Color.gray;

        [Tooltip("Umgebungslicht vom Horizont.")]
        [SerializeField] private Color ambientEquator = Color.gray;

        [Tooltip("Umgebungslicht von unten (Boden).")]
        [SerializeField] private Color ambientGround = Color.gray;

        [Tooltip("Nebelfarbe.")]
        [SerializeField] private Color fogColor = Color.gray;

        [Tooltip("Nebeldichte (exponentiell, 0–0,05).")]
        [Range(0f, 0.05f)] [SerializeField] private float fogDensity = 0.002f;

        [Tooltip("Farbe des Himmels.")]
        [SerializeField] private Color skyTint = Color.gray;

        [Tooltip("Helligkeit des Himmels.")]
        [Min(0f)] [SerializeField] private float skyExposure = 1f;

        [Tooltip("Dicke der Atmosphäre (Streuung).")]
        [Min(0f)] [SerializeField] private float atmosphere = 1f;

        [Tooltip("Größe der Sonnen- bzw. Mondscheibe.")]
        [Range(0f, 1f)] [SerializeField] private float sunSize = 0.04f;

        [Tooltip("Stärke der Himmelsspiegelung (Wasser, glänzende Flächen).")]
        [Range(0f, 1f)] [SerializeField] private float reflection = 1f;

        [Tooltip("Faktor für Feuer und andere Lichter, die der Tageszeit folgen (tags schwächer, nachts voll).")]
        [Min(0f)] [SerializeField] private float localLights = 1f;

        /// <summary>Creates an empty key (serialization).</summary>
        public DayNightKey()
        {
        }

        /// <summary>Creates a key.</summary>
        /// <param name="hour">Hour of the day (0 to below 24).</param>
        /// <param name="sunColor">Sun colour.</param>
        /// <param name="sunIntensity">Sun strength.</param>
        /// <param name="ambientSky">Ambient from above.</param>
        /// <param name="ambientEquator">Ambient from the horizon.</param>
        /// <param name="ambientGround">Ambient from below.</param>
        /// <param name="fogColor">Fog colour.</param>
        /// <param name="fogDensity">Fog density.</param>
        /// <param name="skyTint">Sky colour.</param>
        /// <param name="skyExposure">Sky brightness.</param>
        /// <param name="atmosphere">Atmosphere thickness.</param>
        /// <param name="sunSize">Sun disc size.</param>
        /// <param name="reflection">Reflection strength.</param>
        /// <param name="localLights">Factor of fires and lamps.</param>
        public DayNightKey(float hour, Color sunColor, float sunIntensity, Color ambientSky, Color ambientEquator, Color ambientGround,
            Color fogColor, float fogDensity, Color skyTint, float skyExposure, float atmosphere, float sunSize, float reflection, float localLights)
        {
            this.hour = hour;
            this.sunColor = sunColor;
            this.sunIntensity = sunIntensity;
            this.ambientSky = ambientSky;
            this.ambientEquator = ambientEquator;
            this.ambientGround = ambientGround;
            this.fogColor = fogColor;
            this.fogDensity = fogDensity;
            this.skyTint = skyTint;
            this.skyExposure = skyExposure;
            this.atmosphere = atmosphere;
            this.sunSize = sunSize;
            this.reflection = reflection;
            this.localLights = localLights;
        }

        /// <summary>Hour of the day.</summary>
        public float Hour => hour;

        /// <summary>Sun colour.</summary>
        public Color SunColor => sunColor;

        /// <summary>Sun strength.</summary>
        public float SunIntensity => sunIntensity;

        /// <summary>Ambient from above.</summary>
        public Color AmbientSky => ambientSky;

        /// <summary>Ambient from the horizon.</summary>
        public Color AmbientEquator => ambientEquator;

        /// <summary>Ambient from below.</summary>
        public Color AmbientGround => ambientGround;

        /// <summary>Fog colour.</summary>
        public Color FogColor => fogColor;

        /// <summary>Fog density.</summary>
        public float FogDensity => fogDensity;

        /// <summary>Sky colour.</summary>
        public Color SkyTint => skyTint;

        /// <summary>Sky brightness.</summary>
        public float SkyExposure => skyExposure;

        /// <summary>Atmosphere thickness.</summary>
        public float Atmosphere => atmosphere;

        /// <summary>Sun disc size.</summary>
        public float SunSize => sunSize;

        /// <summary>Reflection strength.</summary>
        public float Reflection => reflection;

        /// <summary>Factor of fires and lamps.</summary>
        public float LocalLights => localLights;
    }
}
