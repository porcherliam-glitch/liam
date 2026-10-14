using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// "Besiegt bleibt besiegt" (GDD 03 9.6, architecture 9.7): hides an object whose id is stored as done when the scene starts
    /// or a save is loaded – the beaten boss does not come back. During play nothing happens (the boss falls with its death
    /// animation and stays lying). When a load restores "not beaten", the target is switched off and on again, so the boss
    /// resets itself (its <c>OnEnable</c> puts it back to the start pose with full health).
    /// </summary>
    /// <remarks>GameObject: an always active object next to the boss (not its parent). The state is written by
    /// <see cref="WorldObjectStateService"/> on <c>BossDefeated</c>.</remarks>
    [DisallowMultipleComponent]
    public sealed class DefeatedObjectGate : WorldStateBehaviour
    {
        [Tooltip("ID des Bosses oder Objekts, z. B. boss.eichental.wachender_ritter.")]
        [SerializeField] private string objectId = string.Empty;

        [Tooltip("Objekt, das nach dem Sieg nicht mehr erscheint (Boss-Wurzel).")]
        [SerializeField] private GameObject target = null;

        [Tooltip("Beim Laden eines Spielstands „nicht besiegt“: Ziel einmal aus- und einschalten (setzt den Boss zurück).")]
        [SerializeField] private bool resetOnRestore = true;

        /// <summary>Watched id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>True if the object is stored as done (beaten).</summary>
        public bool IsDefeated => IsReady && Store.GetState(ObjectId) == WorldObjectStates.Done;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            Apply(false);
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            Apply(resetOnRestore);
        }

        private void Apply(bool reset)
        {
            if (target == null || target == gameObject)
            {
                return;
            }

            if (IsDefeated)
            {
                target.SetActive(false);
                return;
            }

            if (reset && target.activeSelf)
            {
                target.SetActive(false);
            }

            target.SetActive(true);
        }
    }
}
