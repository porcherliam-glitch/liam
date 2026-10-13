using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Colour feedback on the body renderers (placeholder for VFX, GDD 03 4.11): a short flash on hits and a steady tint for
    /// states such as the enemy telegraph or a stun. Uses a <see cref="MaterialPropertyBlock"/> (no material copies).
    /// </summary>
    /// <remarks>GameObject: the fighter root; the renderers are assigned by the test ground menu.</remarks>
    [DisallowMultipleComponent]
    public sealed class HitFlash : MonoBehaviour
    {
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        [Tooltip("Renderer, die aufblitzen bzw. eingefärbt werden (Körper, Kopf).")]
        [SerializeField] private Renderer[] renderers = new Renderer[0];

        [Tooltip("Dauer des Treffer-Blitzes in Sekunden.")]
        [Range(0.02f, 0.5f)] [SerializeField] private float flashSeconds = 0.12f;

        private MaterialPropertyBlock _block;
        private Color[] _baseColors;
        private Color _flashColor = Color.white;
        private float _flashRemaining;
        private Color _tint = Color.white;
        private float _tintStrength;
        private bool _dirty;

        /// <summary>Flashes in <paramref name="color"/> for the flash duration.</summary>
        /// <param name="color">Flash colour.</param>
        public void Flash(Color color)
        {
            _flashColor = color;
            _flashRemaining = flashSeconds;
            _dirty = true;
        }

        /// <summary>Sets a steady tint (telegraph, stun); strength 0 removes it.</summary>
        /// <param name="color">Tint colour.</param>
        /// <param name="strength">Blend 0–1.</param>
        public void SetTint(Color color, float strength)
        {
            float clamped = Mathf.Clamp01(strength);
            if (clamped == _tintStrength && color == _tint)
            {
                return;
            }

            _tint = color;
            _tintStrength = clamped;
            _dirty = true;
        }

        private void Awake()
        {
            _block = new MaterialPropertyBlock();
            _baseColors = new Color[renderers.Length];
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer target = renderers[i];
                Material material = target != null ? target.sharedMaterial : null;
                if (material == null)
                {
                    _baseColors[i] = Color.white;
                }
                else if (material.HasProperty(BaseColorId))
                {
                    _baseColors[i] = material.GetColor(BaseColorId);
                }
                else
                {
                    _baseColors[i] = material.HasProperty(ColorId) ? material.GetColor(ColorId) : Color.white;
                }
            }
        }

        private void Update()
        {
            if (_flashRemaining > 0f)
            {
                _flashRemaining = Mathf.Max(0f, _flashRemaining - Time.deltaTime);
                _dirty = true;
            }

            if (!_dirty)
            {
                return;
            }

            _dirty = _flashRemaining > 0f;
            float flash = flashSeconds > 0f ? _flashRemaining / flashSeconds : 0f;
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer target = renderers[i];
                if (target == null)
                {
                    continue;
                }

                Color color = Color.Lerp(_baseColors[i], _tint, _tintStrength);
                color = Color.Lerp(color, _flashColor, flash);
                target.GetPropertyBlock(_block);
                _block.SetColor(BaseColorId, color);
                _block.SetColor(ColorId, color);
                target.SetPropertyBlock(_block);
            }
        }
    }
}
