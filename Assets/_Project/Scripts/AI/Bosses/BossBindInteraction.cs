using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// "Fesseln" (GDD 02 11.6, end of the Grimmbart fight): while the beaten boss kneels (5 s at 10 % health), the player can
    /// bind him with the interaction key - he stays alive. Attacking on kills him instead.
    /// </summary>
    /// <remarks>
    /// GameObject: a child of the boss with a trigger collider on the interaction layer; the player's interactor finds it.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class BossBindInteraction : MonoBehaviour, IInteractable
    {
        [Tooltip("Boss.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Text der Taste.")]
        [SerializeField] private string prompt = "Fesseln";

        /// <inheritdoc />
        public string InteractionObjectId => boss != null ? boss.BossId : string.Empty;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Use;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => 20;

        /// <inheritdoc />
        public Vector3 InteractionPosition => boss != null ? boss.transform.position + Vector3.up * 1.2f : transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            // In the middle of the fight: the kneeling boss is the only thing that may be used while in combat.
            return isActiveAndEnabled && boss != null && boss.IsYielding;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            return CanInteract(context) && boss.Bind();
        }

        private void Awake()
        {
            if (boss == null)
            {
                boss = GetComponentInParent<BossController>();
            }
        }
    }
}
