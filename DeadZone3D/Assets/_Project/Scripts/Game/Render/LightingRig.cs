using DeadZone.Core.Data;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Sun/moon, ambient light, fog and the player's flashlight, driven by the raid's time of day.</summary>
    public sealed class LightingRig
    {
        public readonly Light sun, flashlight, playerFill, muzzle;
        private readonly Transform _root;
        private float _muzzleT;
        private Color _fog = new Color(0.25f, 0.28f, 0.3f);
        private float _fogBase = 0.012f;
        /// <summary>Fog multiplier (the menu camera is far away and uses less fog).</summary>
        public float fogScale = 1f;
        /// <summary>
        /// Sky colours for the SkyDome, set by Apply. The horizon is exactly the fog colour, so fogged geometry in the
        /// distance blends into the sky. skyGlow is the warm band of dusk and dawn above the horizon (black otherwise).
        /// </summary>
        public Color skyHorizon, skyZenith, skyGlow;
        /// <summary>0 = night, 1 = full day (the sun disc, the moon and the stars fade with it).</summary>
        public float daylight;

        public LightingRig(Transform parent)
        {
            _root = new GameObject("Lighting").transform;
            _root.SetParent(parent, false);
            sun = new GameObject("Sun").AddComponent<Light>();
            sun.transform.SetParent(_root, false);
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.85f;
            sun.transform.rotation = Quaternion.Euler(52f, -35f, 0);
            flashlight = new GameObject("Flashlight").AddComponent<Light>();
            flashlight.transform.SetParent(_root, false);
            flashlight.type = LightType.Spot;
            flashlight.spotAngle = 58f;
            flashlight.innerSpotAngle = 30f;
            flashlight.range = 34f;
            flashlight.intensity = 30f;
            flashlight.color = new Color(1f, 0.96f, 0.86f);
            flashlight.shadows = LightShadows.Soft;
            playerFill = new GameObject("PlayerFill").AddComponent<Light>();
            playerFill.transform.SetParent(_root, false);
            playerFill.type = LightType.Point;
            playerFill.range = 7f;
            playerFill.color = new Color(0.75f, 0.82f, 1f);
            playerFill.shadows = LightShadows.None;
            muzzle = new GameObject("Muzzle").AddComponent<Light>();
            muzzle.transform.SetParent(_root, false);
            muzzle.type = LightType.Point;
            muzzle.range = 10f;
            muzzle.color = new Color(1f, 0.8f, 0.45f);
            muzzle.enabled = false;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
        }

        public void SetMap(MapDef map)
        {
            var c = Mats.Hex(map?.palette?.fog, new Color(0.3f, 0.32f, 0.34f, 0.3f));
            _fog = new Color(c.r, c.g, c.b);
            _fogBase = 0.006f + c.a * 0.02f;
        }

        public void SetQuality(string quality)
        {
            sun.shadows = quality == "low" ? LightShadows.None : LightShadows.Soft;
            flashlight.shadows = quality == "high" ? LightShadows.Soft : LightShadows.None;
        }

        /// <param name="darkness">0 = bright day, ~0.85 = night (from the simulation).</param>
        public void Apply(float darkness, float hour)
        {
            float day = Mathf.Clamp01(1f - darkness / 0.85f);
            bool dusk = hour > 15f && hour < 21f;
            Color sunCol = Color.Lerp(new Color(0.55f, 0.62f, 0.85f), dusk ? new Color(1f, 0.72f, 0.5f) : new Color(1f, 0.95f, 0.86f), day);
            sun.color = sunCol;
            sun.intensity = Mathf.Lerp(0.13f, 1.25f, day * day);
            float sunAngle = Mathf.Lerp(18f, 55f, day);
            // hours before 16:00 count as the next day, so the light (and the moon opposite it) never jumps at midnight;
            // no raid shows 15:00-17:00, where the cut lies
            float h = hour < 16f ? hour + 24f : hour;
            sun.transform.rotation = Quaternion.Euler(sunAngle, -35f + (h - 12f) * 6f, 0);
            Color amb = Color.Lerp(new Color(0.08f, 0.095f, 0.14f), new Color(0.42f, 0.45f, 0.5f), day);
            RenderSettings.ambientLight = amb;
            RenderSettings.reflectionIntensity = Mathf.Lerp(0.05f, 1f, day);
            RenderSettings.fogColor = Color.Lerp(new Color(0.015f, 0.02f, 0.03f), _fog, day * 0.9f + 0.1f);
            RenderSettings.fogDensity = _fogBase * (1f + darkness * 1.2f) * fogScale;
            playerFill.intensity = Mathf.Lerp(2.0f, 0.0f, day);
            // sky: by day the zenith is a deeper, bluer shade of the map's fog, at night blue-black
            daylight = day;
            skyHorizon = RenderSettings.fogColor;
            var zenithDay = new Color(_fog.r * 0.6f + 0.02f, _fog.g * 0.6f + 0.05f, _fog.b * 0.6f + 0.13f);
            skyZenith = Color.Lerp(new Color(0.006f, 0.01f, 0.028f), zenithDay, day);
            // dusk and dawn glow: strongest halfway between day and night, reddish in the morning, orange in the evening
            float tw = Mathf.Clamp01(1f - Mathf.Abs(day - 0.45f) / 0.4f);
            float twilight = tw * tw * (3f - 2f * tw) * 0.5f;
            var glow = hour < 12f ? new Color(0.5f, 0.27f, 0.22f) : new Color(0.6f, 0.27f, 0.09f);
            skyGlow = new Color(glow.r * twilight, glow.g * twilight, glow.b * twilight);
        }

        public void SetCameraBackground(Camera cam) { cam.backgroundColor = RenderSettings.fogColor; }

        public void Flashlight(bool on, Vector3 pos, float yawDeg)
        {
            flashlight.enabled = on;
            flashlight.transform.position = pos;
            flashlight.transform.rotation = Quaternion.Euler(9f, yawDeg, 0);
            playerFill.transform.position = pos + Vector3.up * 1.5f;
        }

        /// <summary>
        /// First person: the beam follows the view (pitch included). The fill light hangs a little above and behind the
        /// head: well below ceilings (no bright spot following the player) and not right next to the view model.
        /// </summary>
        public void Flashlight(bool on, Vector3 pos, Quaternion rotation, Vector3 head)
        {
            flashlight.enabled = on;
            flashlight.transform.position = pos;
            flashlight.transform.rotation = rotation;
            var fwd = rotation * Vector3.forward;
            fwd.y = 0f;
            fwd = fwd.sqrMagnitude > 1e-4f ? fwd.normalized : Vector3.forward;
            playerFill.transform.position = head + Vector3.up * 0.35f - fwd * 0.7f;
        }

        public void MuzzleFlash(Vector3 pos, float strength)
        {
            muzzle.transform.position = pos;
            muzzle.intensity = 12f * strength;
            muzzle.enabled = true;
            _muzzleT = 0.05f;
        }

        public void Update(float dt)
        {
            if (_muzzleT > 0) { _muzzleT -= dt; if (_muzzleT <= 0) muzzle.enabled = false; }
        }

        public void SetActive(bool on) { _root.gameObject.SetActive(on); }
    }
}
