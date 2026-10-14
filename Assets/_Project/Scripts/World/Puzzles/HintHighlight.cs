using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Makes a fairness hint stand out (inscription, soot marks; GDD 01 6.7: hint after 120 s without progress): switches a
    /// glow object on and pulses its scale slightly. The puzzle controllers call <see cref="SetHighlighted"/>.
    /// </summary>
    /// <remarks>GameObject: the hint object; <see cref="glow"/> is a child with an emissive (Aether turquoise) material, off at start.</remarks>
    [DisallowMultipleComponent]
    public sealed class HintHighlight : MonoBehaviour
    {
        [Tooltip("Leuchtendes Kind-Objekt (aus, solange kein Hinweis gezeigt wird).")]
        [SerializeField] private GameObject glow = null;

        [Tooltip("Puls der Leuchte in Hz (GDD 05, 3.4: Aether pulsiert mit 0,5 Hz).")]
        [Range(0f, 3f)] [SerializeField] private float pulseHertz = 0.5f;

        private Vector3 _glowScale = Vector3.one;
        private bool _highlighted;

        /// <summary>True while highlighted.</summary>
        public bool IsHighlighted => _highlighted;

        /// <summary>Switches the highlight on or off.</summary>
        /// <param name="highlighted">True to highlight.</param>
        public void SetHighlighted(bool highlighted)
        {
            _highlighted = highlighted;
            if (glow != null)
            {
                glow.SetActive(highlighted);
            }
        }

        private void Awake()
        {
            if (glow != null)
            {
                _glowScale = glow.transform.localScale;
                glow.SetActive(false);
            }
        }

        private void Update()
        {
            if (!_highlighted || glow == null || !(pulseHertz > 0f))
            {
                return;
            }

            float pulse = 1f + 0.06f * Mathf.Sin(Time.time * pulseHertz * 2f * Mathf.PI);
            glow.transform.localScale = new Vector3(_glowScale.x * pulse, _glowScale.y, _glowScale.z * pulse);
        }
    }
}
