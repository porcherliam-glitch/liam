using System;
using Aetherfall.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace Aetherfall.World
{
    /// <summary>
    /// The day and night of one scene (S35), wired by the generator: outdoors it moves the sun (the moon at night), sets ambient,
    /// fog, sky and reflections, dims and brightens the fires and lights the windows; indoors (the crypt) it only dims the daylight
    /// that falls in at the exits. Registers with the <see cref="IDayNightService"/>, which calls <see cref="Apply"/>.
    /// </summary>
    /// <remarks>
    /// The render settings and the sky are written only while the rig's scene is the active scene (a scene loads before it becomes
    /// active). The sky is a runtime copy of the generated sky material; no material asset is ever written.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class DayNightSceneRig : MonoBehaviour, IDayNightEnvironment
    {
        private static readonly int SkyTintId = Shader.PropertyToID("_SkyTint");
        private static readonly int GroundColorId = Shader.PropertyToID("_GroundColor");
        private static readonly int ExposureId = Shader.PropertyToID("_Exposure");
        private static readonly int AtmosphereId = Shader.PropertyToID("_AtmosphereThickness");
        private static readonly int SunSizeId = Shader.PropertyToID("_SunSize");
        private static readonly Color NightDaylightColour = new Color(0.561f, 0.651f, 0.851f);

        [Header("Allgemein")]
        [Tooltip("Tageslauf der Region (erzeugt aus der Layout-Datei).")]
        [SerializeField] private DayNightProfile profile = null;

        [Tooltip("Draußen: Sonne, Himmel, Feuer, Fenster. Drinnen: nur das Tageslicht an den Ausgängen.")]
        [SerializeField] private DayNightMode mode = DayNightMode.Outdoor;

        [Tooltip("Lichtwert für die Schleich-KI drinnen (1 = wie am Tag).")]
        [Range(0f, 1f)] [SerializeField] private float indoorLightFactor = 1f;

        [Header("Draußen")]
        [Tooltip("Hauptlicht (Sonne bei Tag, Mond bei Nacht).")]
        [SerializeField] private Light sun = null;

        [Tooltip("Himmel-Material als Vorlage (zur Laufzeit wird eine Kopie verändert).")]
        [SerializeField] private Material skyboxTemplate = null;

        [Tooltip("Feuer und Lampen, die der Tageszeit folgen.")]
        [SerializeField] private Light[] localLights = new Light[0];

        [Tooltip("Häuser mit Fenstern.")]
        [SerializeField] private WindowLights[] windows = new WindowLights[0];

        [Tooltip("Dunkles Fenster-Material.")]
        [SerializeField] private Material windowDark = null;

        [Tooltip("Leuchtendes Fenster-Material.")]
        [SerializeField] private Material windowLit = null;

        [Header("Drinnen")]
        [Tooltip("Lichter, durch die Tageslicht hereinfällt (Ausgänge).")]
        [SerializeField] private Light[] daylightLights = new Light[0];

        [Tooltip("Flächen mit Tageslicht-Material (Ausgangsöffnungen).")]
        [SerializeField] private Renderer[] daylightRenderers = new Renderer[0];

        [Tooltip("Tageslicht-Material der Öffnungen.")]
        [SerializeField] private Material daylightDay = null;

        [Tooltip("Nachtlicht-Material der Öffnungen.")]
        [SerializeField] private Material daylightNight = null;

        private float[] _localBase = new float[0];
        private float[] _daylightBase = new float[0];
        private Color[] _daylightColour = new Color[0];
        private Material _sky;
        private IDayNightService _service;
        private bool _registered;
        private int _shownDaylightMaterial = -1;

        /// <inheritdoc />
        public DayNightProfile Profile => profile;

        /// <inheritdoc />
        public DayNightMode Mode => mode;

        /// <inheritdoc />
        public float IndoorLightFactor => indoorLightFactor;

        /// <inheritdoc />
        public bool IsInActiveScene => gameObject.scene == SceneManager.GetActiveScene();

        /// <summary>The last shown moment (tests, tour).</summary>
        public DayNightSample LastSample { get; private set; }

        /// <summary>True after the first <see cref="Apply"/>.</summary>
        public bool HasApplied { get; private set; }

        /// <summary>The houses with windows (tour).</summary>
        public WindowLights[] Windows => windows;

        /// <summary>The main light (tour).</summary>
        public Light Sun => sun;

        /// <inheritdoc />
        public void Apply(in DayNightSample sample)
        {
            LastSample = sample;
            HasApplied = true;
            if (mode == DayNightMode.Indoor)
            {
                ApplyIndoor(sample);
                return;
            }

            ApplyOutdoor(sample);
        }

        private void Awake()
        {
            _localBase = Bases(localLights);
            _daylightBase = Bases(daylightLights);
            _daylightColour = new Color[daylightLights.Length];
            for (int i = 0; i < daylightLights.Length; i++)
            {
                _daylightColour[i] = daylightLights[i] != null ? daylightLights[i].color : Color.white;
            }

            if (mode == DayNightMode.Outdoor && skyboxTemplate != null)
            {
                _sky = new Material(skyboxTemplate) { name = skyboxTemplate.name + " (Tageszeit)" };
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _service = await Services.WaitForAsync<IDayNightService>(destroyCancellationToken);
                if (profile == null)
                {
                    Log.Warning(LogCategory.World, "DayNightSceneRig '" + name + "': no day cycle profile, the light stays as generated.");
                    return;
                }

                _service.RegisterEnvironment(this);
                _registered = true;
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "DayNightSceneRig '" + name + "' could not register with the day-and-night service.");
            }
        }

        private void OnDestroy()
        {
            if (_registered && _service != null)
            {
                _service.UnregisterEnvironment(this);
            }

            _registered = false;
            if (_sky != null)
            {
                if (RenderSettings.skybox == _sky)
                {
                    RenderSettings.skybox = skyboxTemplate;
                }

                Destroy(_sky);
                _sky = null;
            }
        }

        private void ApplyOutdoor(in DayNightSample sample)
        {
            if (sun != null)
            {
                // Same orientation as the generator: Euler(height, compass direction + 180°).
                sun.transform.rotation = Quaternion.Euler(sample.MainLightElevation, sample.MainLightAzimuth + 180f, 0f);
                sun.color = sample.MainLightColor;
                sun.intensity = sample.MainLightIntensity;
                sun.shadowStrength = sample.ShadowStrength;
                LightShadows shadows = sample.MainLightIntensity < 0.02f ? LightShadows.None : LightShadows.Soft;
                if (sun.shadows != shadows)
                {
                    sun.shadows = shadows;
                }
            }

            for (int i = 0; i < localLights.Length; i++)
            {
                if (localLights[i] != null)
                {
                    localLights[i].intensity = _localBase[i] * sample.LocalLightScale;
                }
            }

            for (int i = 0; i < windows.Length; i++)
            {
                if (windows[i] != null)
                {
                    windows[i].Apply(sample.Hour, windowDark, windowLit);
                }
            }

            if (!IsInActiveScene)
            {
                return;
            }

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = sample.AmbientSky;
            RenderSettings.ambientEquatorColor = sample.AmbientEquator;
            RenderSettings.ambientGroundColor = sample.AmbientGround;
            RenderSettings.fogColor = sample.FogColor;
            RenderSettings.fogDensity = sample.FogDensity;
            RenderSettings.reflectionIntensity = sample.Reflection;
            if (sun != null)
            {
                RenderSettings.sun = sun;
            }

            if (_sky != null)
            {
                _sky.SetColor(SkyTintId, sample.SkyTint);
                _sky.SetColor(GroundColorId, sample.SkyGround);
                _sky.SetFloat(ExposureId, sample.SkyExposure);
                _sky.SetFloat(AtmosphereId, sample.Atmosphere);
                _sky.SetFloat(SunSizeId, sample.SunSize);
                if (RenderSettings.skybox != _sky)
                {
                    RenderSettings.skybox = _sky;
                }
            }
        }

        private void ApplyIndoor(in DayNightSample sample)
        {
            // Daylight at the exits: full by day, a faint blue at night.
            float daylight = sample.Daylight;
            for (int i = 0; i < daylightLights.Length; i++)
            {
                Light light = daylightLights[i];
                if (light == null)
                {
                    continue;
                }

                light.intensity = _daylightBase[i] * Mathf.Lerp(0.12f, 1f, daylight);
                light.color = Color.Lerp(NightDaylightColour, _daylightColour[i], daylight);
            }

            int wanted = daylight >= 0.5f ? 1 : 0;
            if (wanted == _shownDaylightMaterial || daylightDay == null || daylightNight == null)
            {
                return;
            }

            _shownDaylightMaterial = wanted;
            Material material = wanted == 1 ? daylightDay : daylightNight;
            for (int i = 0; i < daylightRenderers.Length; i++)
            {
                if (daylightRenderers[i] != null)
                {
                    daylightRenderers[i].sharedMaterial = material;
                }
            }
        }

        private static float[] Bases(Light[] lights)
        {
            var result = new float[lights.Length];
            for (int i = 0; i < lights.Length; i++)
            {
                result[i] = lights[i] != null ? lights[i].intensity : 0f;
            }

            return result;
        }
    }
}
