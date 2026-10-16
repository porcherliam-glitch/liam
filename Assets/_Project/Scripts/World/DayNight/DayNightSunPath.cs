using System;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Path of the sun and the moon of a region (S35): sunrise and sunset, height at noon and how deep the sun sinks at night,
    /// the compass directions of rise and set, and the moon that takes over as the main light at night (its colour, strength,
    /// how dim it is at new moon, its shadows and lowest height). Written by the generator from the layout file.
    /// </summary>
    [Serializable]
    public sealed class DayNightSunPath
    {
        [Tooltip("Sonnenaufgang in Stunden (5,5 = 05:30).")]
        [Range(0f, 24f)] [SerializeField] private float sunriseHour = 5.5f;

        [Tooltip("Sonnenuntergang in Stunden (20,5 = 20:30).")]
        [Range(0f, 24f)] [SerializeField] private float sunsetHour = 20.5f;

        [Tooltip("Höhe der Sonne am Mittag in Grad.")]
        [Range(1f, 90f)] [SerializeField] private float noonElevation = 52f;

        [Tooltip("Wie tief die Sonne um Mitternacht unter dem Horizont steht, in Grad.")]
        [Range(1f, 90f)] [SerializeField] private float nightDepth = 40f;

        [Tooltip("Richtung des Sonnenaufgangs in Grad (90 = Osten).")]
        [Range(0f, 360f)] [SerializeField] private float riseAzimuth = 90f;

        [Tooltip("Richtung des Sonnenuntergangs in Grad (270 = Westen).")]
        [Range(0f, 360f)] [SerializeField] private float setAzimuth = 270f;

        [Tooltip("Farbe des Mondlichts (kein Aether-Türkis).")]
        [SerializeField] private Color moonColor = new Color(0.616f, 0.706f, 0.91f);

        [Tooltip("Stärke des Mondlichts bei Vollmond.")]
        [Min(0f)] [SerializeField] private float moonIntensity = 0.22f;

        [Tooltip("Anteil des Mondlichts bei Neumond (0–1).")]
        [Range(0f, 1f)] [SerializeField] private float newMoonFactor = 0.25f;

        [Tooltip("Schattenstärke des Mondlichts (0–1).")]
        [Range(0f, 1f)] [SerializeField] private float moonShadowStrength = 0.55f;

        [Tooltip("Niedrigste Höhe des Mondes in Grad.")]
        [Range(1f, 89f)] [SerializeField] private float moonMinElevation = 12f;

        /// <summary>Creates the default path of Eichental (serialization, tests).</summary>
        public DayNightSunPath()
        {
        }

        /// <summary>Creates a path.</summary>
        /// <param name="sunriseHour">Sunrise in hours.</param>
        /// <param name="sunsetHour">Sunset in hours.</param>
        /// <param name="noonElevation">Height at noon in degrees.</param>
        /// <param name="nightDepth">Depth at midnight in degrees.</param>
        /// <param name="riseAzimuth">Direction of the sunrise in degrees.</param>
        /// <param name="setAzimuth">Direction of the sunset in degrees.</param>
        /// <param name="moonColor">Moon light colour.</param>
        /// <param name="moonIntensity">Moon light strength at full moon.</param>
        /// <param name="newMoonFactor">Share at new moon.</param>
        /// <param name="moonShadowStrength">Moon shadow strength.</param>
        /// <param name="moonMinElevation">Lowest moon height in degrees.</param>
        public DayNightSunPath(float sunriseHour, float sunsetHour, float noonElevation, float nightDepth, float riseAzimuth, float setAzimuth,
            Color moonColor, float moonIntensity, float newMoonFactor, float moonShadowStrength, float moonMinElevation)
        {
            this.sunriseHour = sunriseHour;
            this.sunsetHour = sunsetHour;
            this.noonElevation = noonElevation;
            this.nightDepth = nightDepth;
            this.riseAzimuth = riseAzimuth;
            this.setAzimuth = setAzimuth;
            this.moonColor = moonColor;
            this.moonIntensity = moonIntensity;
            this.newMoonFactor = newMoonFactor;
            this.moonShadowStrength = moonShadowStrength;
            this.moonMinElevation = moonMinElevation;
        }

        /// <summary>Sunrise in hours.</summary>
        public float SunriseHour => sunriseHour;

        /// <summary>Sunset in hours.</summary>
        public float SunsetHour => sunsetHour;

        /// <summary>Height at noon in degrees.</summary>
        public float NoonElevation => noonElevation;

        /// <summary>Depth at midnight in degrees.</summary>
        public float NightDepth => nightDepth;

        /// <summary>Direction of the sunrise in degrees.</summary>
        public float RiseAzimuth => riseAzimuth;

        /// <summary>Direction of the sunset in degrees.</summary>
        public float SetAzimuth => setAzimuth;

        /// <summary>Moon light colour.</summary>
        public Color MoonColor => moonColor;

        /// <summary>Moon light strength at full moon.</summary>
        public float MoonIntensity => moonIntensity;

        /// <summary>Share of the moon light at new moon.</summary>
        public float NewMoonFactor => newMoonFactor;

        /// <summary>Moon shadow strength.</summary>
        public float MoonShadowStrength => moonShadowStrength;

        /// <summary>Lowest moon height in degrees.</summary>
        public float MoonMinElevation => moonMinElevation;
    }
}
