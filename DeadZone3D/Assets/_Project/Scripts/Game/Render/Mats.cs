using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>
    /// Material factory. Works with URP (Lit/Unlit) and, as a fallback, the built-in pipeline (Standard).
    /// Builds use the template materials under Resources/DZMaterials (created by Dead Zone > Projekt einrichten) so the
    /// shaders and the emission variant are included; in the editor Shader.Find is enough.
    /// </summary>
    public static class Mats
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static Material _lit, _emissive, _unlit;
        private static bool _init;

        private static bool Urp => GraphicsSettings.currentRenderPipeline != null;

        private static void Init()
        {
            if (_init) return;
            _init = true;
            _lit = Template("DZMaterials/Lit");
            _emissive = Template("DZMaterials/Emissive");
            _unlit = Template("DZMaterials/Unlit");
            if (_lit == null) _lit = new Material(FindShader(Urp ? "Universal Render Pipeline/Lit" : "Standard"));
            if (_emissive == null)
            {
                _emissive = new Material(_lit);
                _emissive.EnableKeyword("_EMISSION");
            }
            if (_unlit == null) _unlit = new Material(FindShader(Urp ? "Universal Render Pipeline/Unlit" : "Unlit/Color"));
        }

        /// <summary>Loads a template material, ignoring it when it was made for the other render pipeline (would render magenta).</summary>
        private static Material Template(string path)
        {
            var m = Resources.Load<Material>(path);
            if (m == null || m.shader == null) return null;
            bool urpShader = m.shader.name.StartsWith("Universal Render Pipeline");
            return urpShader == Urp ? m : null;
        }

        private static Shader FindShader(string name)
        {
            var s = Shader.Find(name);
            if (s == null) s = Shader.Find("Universal Render Pipeline/Lit");
            if (s == null) s = Shader.Find("Standard");
            if (s == null) s = Shader.Find("Hidden/InternalErrorShader");
            return s;
        }

        private static void SetColor(Material m, Color c)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        }

        public static Material Lit(Color c, float smoothness = 0.15f, float metallic = 0f)
        {
            string key = "L" + ColorUtility.ToHtmlStringRGBA(c) + smoothness.ToString("0.00", CultureInfo.InvariantCulture) + metallic.ToString("0.0", CultureInfo.InvariantCulture);
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            Init();
            m = new Material(_lit) { name = key };
            SetColor(m, c);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            m.DisableKeyword("_EMISSION");
            Cache[key] = m;
            return m;
        }

        public static Material Emissive(Color c, Color emission, float intensity = 1f)
        {
            string key = "E" + ColorUtility.ToHtmlStringRGBA(c) + ColorUtility.ToHtmlStringRGB(emission) + intensity.ToString("0.0", CultureInfo.InvariantCulture);
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            Init();
            m = new Material(_emissive) { name = key };
            SetColor(m, c);
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", emission * intensity);
            Cache[key] = m;
            return m;
        }

        public static Material Unlit(Color c)
        {
            string key = "U" + ColorUtility.ToHtmlStringRGBA(c);
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            Init();
            m = new Material(_unlit) { name = key };
            SetColor(m, c);
            Cache[key] = m;
            return m;
        }

        /// <summary>Parses "#rgb", "#rrggbb" and "rgba(r,g,b,a)" colours of the HTML version.</summary>
        public static Color Hex(string s, Color fallback = default)
        {
            if (string.IsNullOrEmpty(s)) return fallback;
            s = s.Trim();
            if (s.StartsWith("rgba(") || s.StartsWith("rgb("))
            {
                var parts = s.Substring(s.IndexOf('(') + 1).TrimEnd(')').Split(',');
                if (parts.Length >= 3 && float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var r)
                    && float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var g)
                    && float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var b))
                {
                    float a = 1f;
                    if (parts.Length > 3) float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out a);
                    return new Color(r / 255f, g / 255f, b / 255f, a);
                }
                return fallback;
            }
            if (s.Length == 4 && s[0] == '#') s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
            return ColorUtility.TryParseHtmlString(s, out var c) ? c : fallback;
        }

        public static Color Shade(Color c, float f) => new Color(Mathf.Clamp01(c.r * f), Mathf.Clamp01(c.g * f), Mathf.Clamp01(c.b * f), c.a);
    }
}
