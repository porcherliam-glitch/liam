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
    /// The effect templates (ParticleAlpha, ParticleAdd, LitCutout) are configured in code here, the way URP's material
    /// inspector would set them, because materials made from script skip its validation.
    /// </summary>
    public static class Mats
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static Material _lit, _emissive, _unlit, _particleAlpha, _particleAdd, _litCutout;
        private static bool _init, _fxInit;

        internal static bool Urp => GraphicsSettings.currentRenderPipeline != null;

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

        private static void SetTexture(Material m, Texture tex)
        {
            if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
            if (m.HasProperty("_MainTex")) m.SetTexture("_MainTex", tex);
        }

        /// <param name="tex">
        /// Optional detail texture from ProceduralTextures, multiplied with the colour. The colour is brightened by
        /// 1/ProceduralTextures.Mean, so the surface keeps its average brightness and only gains detail.
        /// </param>
        public static Material Lit(Color c, float smoothness = 0.15f, float metallic = 0f, Texture2D tex = null)
        {
            string key = "L" + ColorUtility.ToHtmlStringRGBA(c) + smoothness.ToString("0.00", CultureInfo.InvariantCulture) + metallic.ToString("0.0", CultureInfo.InvariantCulture) + (tex != null ? tex.name : "");
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            Init();
            m = new Material(_lit) { name = key };
            SetColor(m, tex != null ? Shade(c, 1f / ProceduralTextures.Mean) : c);
            if (tex != null) SetTexture(m, tex);
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
            var e = emission * intensity;
            if (!Urp) { float mx = e.maxColorComponent; if (mx > 1f) e /= mx; } // no tonemapping: avoid clamping to white
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", e);
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

        // ------------------------------------------------------------------ effects (particles and decals)
        /// <summary>Soft particles fade out within this many metres in front of walls and the ground they cut into.</summary>
        private const float SoftFadeFar = 0.15f;
        /// <summary>Camera fading (metres): sprites right in front of the lens fade out instead of covering the screen.</summary>
        private const float CameraFadeNear = 0.03f, CameraFadeFar = 0.25f;

        /// <summary>The transparent particle templates exist: Particle returns soft sprites, not the opaque fallback.</summary>
        public static bool HasParticles { get { InitFx(); return _particleAlpha != null && _particleAdd != null; } }

        /// <summary>The alpha-clipped template exists: LitCutout returns cut-out decals, not opaque squares.</summary>
        public static bool HasCutout { get { InitFx(); return _litCutout != null; } }

        private static void InitFx()
        {
            if (_fxInit) return;
            _fxInit = true;
            _particleAlpha = Template("DZMaterials/ParticleAlpha");
            _particleAdd = Template("DZMaterials/ParticleAdd");
            _litCutout = Template("DZMaterials/LitCutout");
#if UNITY_EDITOR
            // the editor has every shader: until the setup saved the templates, configure them in code
            if (_particleAlpha == null) _particleAlpha = NewParticleTemplate(false);
            if (_particleAdd == null) _particleAdd = NewParticleTemplate(true);
            if (_litCutout == null) _litCutout = NewCutoutTemplate();
#endif
            if (_particleAlpha == null || _particleAdd == null || _litCutout == null)
                Debug.LogWarning("[DZ] Effekt-Materialien fehlen – Rauch, Funken und Blutflecken werden einfach dargestellt. Abhilfe: Menü Dead Zone → Projekt einrichten.");
        }

        /// <summary>The active URP asset renders the camera depth texture, which soft particles need.</summary>
        public static bool DepthTextureOn
        {
            get
            {
#if DZ_URP
                var urp = GraphicsSettings.currentRenderPipeline as UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;
                return urp != null && urp.supportsCameraDepthTexture;
#else
                return false;
#endif
            }
        }

        /// <summary>Shader of the particle templates for the active pipeline, or null.</summary>
        public static Shader ParticleShader(bool additive)
        {
            if (Urp) return Shader.Find("Universal Render Pipeline/Particles/Unlit");
            var s = Shader.Find("Particles/Standard Unlit");
            if (s == null) s = Shader.Find(additive ? "Legacy Shaders/Particles/Additive" : "Legacy Shaders/Particles/Alpha Blended");
            return s;
        }

        /// <summary>New particle template for the active pipeline, or null when its shader is missing (used by the setup).</summary>
        public static Material NewParticleTemplate(bool additive)
        {
            var s = ParticleShader(additive);
            if (s == null) return null;
            var m = new Material(s) { name = additive ? "ParticleAdd" : "ParticleAlpha" };
            ConfigureParticle(m, additive);
            return m;
        }

        /// <summary>New alpha-clipped lit template, or null when the lit shader is missing (used by the setup).</summary>
        public static Material NewCutoutTemplate()
        {
            var s = Shader.Find(Urp ? "Universal Render Pipeline/Lit" : "Standard");
            if (s == null) return null;
            var m = new Material(s) { name = "LitCutout" };
            ConfigureCutout(m);
            return m;
        }

        /// <summary>
        /// Transparent, two-sided, unlit particle material with alpha or additive blending and camera fading; soft particles
        /// only while the pipeline renders the depth texture. URP Particles/Unlit and the built-in Standard Particles share
        /// most property names; properties a shader does not have are skipped.
        /// </summary>
        public static void ConfigureParticle(Material m, bool additive)
        {
            var dst = additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha;
            SetFloat(m, "_Surface", 1f);                // URP: transparent
            SetFloat(m, "_Blend", additive ? 2f : 0f);  // URP: alpha / additive
            SetFloat(m, "_Mode", additive ? 4f : 2f);   // built-in Standard Particles: additive / fade
            SetFloat(m, "_AlphaClip", 0f);
            SetFloat(m, "_AlphaToMask", 0f);
            SetFloat(m, "_BlendModePreserveSpecular", 0f);
            SetFloat(m, "_SrcBlend", (float)BlendMode.SrcAlpha);
            SetFloat(m, "_DstBlend", (float)dst);
            SetFloat(m, "_SrcBlendAlpha", (float)BlendMode.One);
            SetFloat(m, "_DstBlendAlpha", (float)dst);
            SetFloat(m, "_BlendOp", (float)BlendOp.Add);
            SetFloat(m, "_ZWrite", 0f);
            SetFloat(m, "_Cull", (float)CullMode.Off);  // the sprites turn to the camera: no side may vanish
            SetFloat(m, "_ColorMode", 0f);              // texture times colour
            m.SetOverrideTag("RenderType", "Transparent");
            if (m.HasProperty("_Surface")) m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            if (m.HasProperty("_Mode")) m.EnableKeyword("_ALPHABLEND_ON");
            foreach (var k in new[] { "_ALPHATEST_ON", "_ALPHAPREMULTIPLY_ON", "_ALPHAMODULATE_ON", "_COLOROVERLAY_ON", "_COLORCOLOR_ON", "_COLORADDSUBDIFF_ON", "_FLIPBOOKBLENDING_ON", "_DISTORTION_ON", "_EMISSION", "_NORMALMAP" })
                m.DisableKeyword(k);
            SetFloat(m, "_CameraFadingEnabled", 1f);
            SetFloat(m, "_CameraNearFadeDistance", CameraFadeNear);
            SetFloat(m, "_CameraFarFadeDistance", CameraFadeFar);
            if (m.HasProperty("_CameraFadeParams")) m.SetVector("_CameraFadeParams", new Vector4(CameraFadeNear, 1f / (CameraFadeFar - CameraFadeNear), 0f, 0f));
            SetSoftParticles(m, DepthTextureOn);
            m.renderQueue = (int)RenderQueue.Transparent;
            m.SetShaderPassEnabled("DepthOnly", false);
            m.SetShaderPassEnabled("ShadowCaster", false);
        }

        /// <summary>Soft particles fade where a sprite cuts into geometry; they need the camera depth texture.</summary>
        private static void SetSoftParticles(Material m, bool on)
        {
            on &= m.HasProperty("_SoftParticlesEnabled");
            SetFloat(m, "_SoftParticlesEnabled", on ? 1f : 0f);
            SetFloat(m, "_SoftParticlesNearFadeDistance", 0f);
            SetFloat(m, "_SoftParticlesFarFadeDistance", SoftFadeFar);
            if (m.HasProperty("_SoftParticleFadeParams")) m.SetVector("_SoftParticleFadeParams", on ? new Vector4(0f, 1f / SoftFadeFar, 0f, 0f) : Vector4.zero);
            SetKeyword(m, "_SOFTPARTICLES_ON", on);
            // one keyword switches on both the camera fading and the soft particles
            SetKeyword(m, "_FADING_ON", on || m.HasProperty("_CameraFadingEnabled"));
        }

        /// <summary>Opaque lit material with alpha clipping at 0.5 (decals with ragged edges), set like URP's inspector does.</summary>
        public static void ConfigureCutout(Material m)
        {
            SetFloat(m, "_Surface", 0f);
            SetFloat(m, "_Blend", 0f);
            SetFloat(m, "_Mode", 1f);         // built-in Standard: cutout
            SetFloat(m, "_AlphaClip", 1f);
            SetFloat(m, "_Cutoff", 0.5f);
            SetFloat(m, "_AlphaToMask", 1f);  // URP sets it together with alpha clipping (only acts with MSAA)
            SetFloat(m, "_SrcBlend", (float)BlendMode.One);
            SetFloat(m, "_DstBlend", (float)BlendMode.Zero);
            SetFloat(m, "_SrcBlendAlpha", (float)BlendMode.One);
            SetFloat(m, "_DstBlendAlpha", (float)BlendMode.Zero);
            SetFloat(m, "_ZWrite", 1f);
            m.SetOverrideTag("RenderType", "TransparentCutout");
            m.EnableKeyword("_ALPHATEST_ON");
            foreach (var k in new[] { "_SURFACE_TYPE_TRANSPARENT", "_ALPHAPREMULTIPLY_ON", "_ALPHABLEND_ON", "_EMISSION" }) m.DisableKeyword(k);
            m.renderQueue = (int)RenderQueue.AlphaTest;
            m.SetShaderPassEnabled("DepthOnly", true);
            m.SetShaderPassEnabled("ShadowCaster", true);
        }

        /// <summary>
        /// Transparent unlit sprite material: tex (white, shape in alpha) tinted by tint, alpha-blended or additive. Colours
        /// above 1 glow in URP (HDR). Without the templates it falls back to the old opaque materials (HasParticles is false).
        /// </summary>
        public static Material Particle(Color tint, bool additive, Texture2D tex)
        {
            string key = "P" + (additive ? "A" : "B") + Key(tint) + (tex != null ? tex.name : "");
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            InitFx();
            var template = additive ? _particleAdd : _particleAlpha;
            if (template == null) m = additive ? Emissive(tint, tint, 2f) : Lit(tint, 0f);
            else
            {
                m = new Material(template) { name = key };
                m.SetColor(TintProperty(m, out float scale), tint * scale);
                if (tex != null) m.SetTexture(TextureProperty(m), tex);
                // the template was made with the depth texture on; another quality level may not render it
                if (m.IsKeywordEnabled("_SOFTPARTICLES_ON") && !DepthTextureOn) SetSoftParticles(m, false);
            }
            Cache[key] = m;
            return m;
        }

        /// <summary>Lit material clipped at alpha 0.5 for decals; without the template an opaque Lit (square decals as before).</summary>
        public static Material LitCutout(Color c, Texture2D tex, float smoothness = 0.3f)
        {
            string key = "C" + Key(c) + smoothness.ToString("0.00", CultureInfo.InvariantCulture) + (tex != null ? tex.name : "");
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            InitFx();
            if (_litCutout == null) m = Lit(c, smoothness);
            else
            {
                m = new Material(_litCutout) { name = key };
                SetColor(m, c);
                if (tex != null) SetTexture(m, tex);
                if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
                if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
                if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
            }
            Cache[key] = m;
            return m;
        }

        /// <summary>Colour property of a particle or cutout material (for MaterialPropertyBlocks) and the factor its shader expects.</summary>
        public static string TintProperty(Material m, out float scale)
        {
            scale = 1f;
            if (m.HasProperty("_BaseColor")) return "_BaseColor";
            if (m.HasProperty("_TintColor")) { scale = 0.5f; return "_TintColor"; } // legacy particle shaders double the colour
            return "_Color";
        }

        public static string TextureProperty(Material m) => m.HasProperty("_BaseMap") ? "_BaseMap" : "_MainTex";

        /// <summary>Cache key of a colour; keeps HDR values apart (ColorUtility clamps them to 1).</summary>
        private static string Key(Color c) => string.Format(CultureInfo.InvariantCulture, "{0:0.###},{1:0.###},{2:0.###},{3:0.###}", c.r, c.g, c.b, c.a);

        private static void SetFloat(Material m, string name, float v) { if (m.HasProperty(name)) m.SetFloat(name, v); }

        private static void SetKeyword(Material m, string keyword, bool on) { if (on) m.EnableKeyword(keyword); else m.DisableKeyword(keyword); }

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
