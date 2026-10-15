using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Lights up a clue, a trail mark or a hidden path while the player investigates nearby (<see cref="IInvestigatable"/>,
    /// GDD 02 5.1, GDD 05 3.2): shows the glow child, gold while investigating, Aether turquoise in Aether sight. A hidden
    /// path (<see cref="InvestigateKind.AetherOnly"/>) also shows its renderers only then. A clue with a
    /// <see cref="QuestObjectMarker"/> glows only while it can still be inspected (quest stage active, not done yet).
    /// </summary>
    /// <remarks>GameObject: the root of the clue or trail node, with a trigger collider on Interactable or TriggerVolume below.</remarks>
    [DisallowMultipleComponent]
    public sealed class InvestigateHighlight : MonoBehaviour, IInvestigatable
    {
        [Tooltip("Was es ist: Hinweis, Spur oder verborgener Weg (nur mit Aether-Sicht).")]
        [SerializeField] private InvestigateKind kind = InvestigateKind.Clue;

        [Tooltip("Kind-Objekt mit dem Leuchten (aus, solange nicht untersucht wird).")]
        [SerializeField] private GameObject glow = null;

        [Tooltip("Renderer des Leuchtens; bekommt je nach Modus das goldene oder das türkise Material.")]
        [SerializeField] private Renderer glowRenderer = null;

        [Tooltip("Material beim normalen Untersuchen (golden).")]
        [SerializeField] private Material investigateMaterial = null;

        [Tooltip("Material in der Aether-Sicht (türkis).")]
        [SerializeField] private Material aetherMaterial = null;

        [Tooltip("Quest-Objekt dieses Hinweises: leuchtet nur, solange es noch untersucht werden kann. Leer = immer.")]
        [SerializeField] private QuestObjectMarker clue = null;

        [Tooltip("Verborgener Weg: diese Renderer sind nur sichtbar, solange er gezeigt wird.")]
        [SerializeField] private Renderer[] hiddenRenderers = new Renderer[0];

        private bool _revealed;
        private bool _aether;

        /// <inheritdoc />
        public InvestigateKind InvestigateKind => kind;

        /// <inheritdoc />
        public Vector3 InvestigatePosition => transform.position;

        /// <inheritdoc />
        public bool IsWorthRevealing => isActiveAndEnabled && (clue == null || (clue.IsAllowed && !clue.IsUsed));

        /// <summary>True while it is lit up.</summary>
        public bool IsRevealed => _revealed;

        private void Awake()
        {
            Apply();
        }

        /// <inheritdoc />
        public void SetRevealed(bool revealed, bool aetherSight)
        {
            if (revealed == _revealed && aetherSight == _aether)
            {
                return;
            }

            _revealed = revealed;
            _aether = aetherSight;
            Apply();
        }

        private void Apply()
        {
            if (glow != null)
            {
                glow.SetActive(_revealed);
            }

            Material material = _aether ? aetherMaterial : investigateMaterial;
            if (glowRenderer != null && material != null)
            {
                glowRenderer.sharedMaterial = material;
            }

            foreach (Renderer hidden in hiddenRenderers)
            {
                if (hidden != null)
                {
                    hidden.enabled = _revealed;
                }
            }
        }
    }
}
