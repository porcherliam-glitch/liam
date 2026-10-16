using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// The windows of one house (S35): they glow warm in the evening and early in the morning (<see cref="WindowLightRules"/>). The
    /// scene rig calls <see cref="Apply"/>; the window slots of the renderers swap between the dark and the lit material by
    /// reference, only when the state changes (no material is written).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class WindowLights : MonoBehaviour
    {
        [Tooltip("Renderer mit Fenstern (ihre Fenster-Materialien werden getauscht).")]
        [SerializeField] private Renderer[] renderers = new Renderer[0];

        [Tooltip("Abends an, Stunde (19,75 = 19:45).")]
        [Range(0f, 24f)] [SerializeField] private float eveningFrom = 19.75f;

        [Tooltip("Abends aus, Stunde (24 = Mitternacht).")]
        [Range(0f, 30f)] [SerializeField] private float closeHour = 22f;

        [Tooltip("Morgens an, Stunde.")]
        [Range(0f, 24f)] [SerializeField] private float morningFrom = 5f;

        [Tooltip("Morgens aus, Stunde.")]
        [Range(0f, 24f)] [SerializeField] private float morningUntil = 6.5f;

        private bool _shown;
        private bool _lit;

        /// <summary>True while the windows glow (tests, tour).</summary>
        public bool IsLit => _shown && _lit;

        /// <summary>Shows the windows for an hour.</summary>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="dark">Dark window material.</param>
        /// <param name="lit">Glowing window material.</param>
        public void Apply(double hour, Material dark, Material lit)
        {
            bool on = WindowLightRules.IsLit(hour, eveningFrom, closeHour, morningFrom, morningUntil);
            if (_shown && on == _lit)
            {
                return;
            }

            _shown = true;
            _lit = on;
            if (dark == null || lit == null)
            {
                return;
            }

            Material from = on ? dark : lit;
            Material to = on ? lit : dark;
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer r = renderers[i];
                if (r == null)
                {
                    continue;
                }

                Material[] slots = r.sharedMaterials;
                bool changed = false;
                for (int s = 0; s < slots.Length; s++)
                {
                    if (slots[s] == from)
                    {
                        slots[s] = to;
                        changed = true;
                    }
                }

                if (changed)
                {
                    r.sharedMaterials = slots;
                }
            }
        }
    }
}
