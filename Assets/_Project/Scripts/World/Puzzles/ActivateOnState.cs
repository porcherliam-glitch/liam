using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Switches objects on while another object has a state (GDD 02 11.7: the skeletons of the great hall wake up when the gate
    /// opens, i.e. when the grave-slab puzzle is solved). Works after loading as well: the targets follow the saved state.
    /// </summary>
    /// <remarks>GameObject: an always active object next to the targets (not a parent of them, it would switch itself off).</remarks>
    [DisallowMultipleComponent]
    public sealed class ActivateOnState : WorldStateBehaviour
    {
        [Tooltip("ID, deren Zustand geprüft wird, z. B. puzzle.eichental.gruft_grabplatten.")]
        [SerializeField] private string watchedId = string.Empty;

        [Tooltip("Zustand, bei dem die Ziele aktiv sind (1 = gelöst/erledigt).")]
        [SerializeField] private int activeState = WorldObjectStates.Done;

        [Tooltip("Objekte, die nur bei diesem Zustand aktiv sind (z. B. Spawner-Gruppe der Halle).")]
        [SerializeField] private List<GameObject> targets = new List<GameObject>();

        [Tooltip("Ziele bis zum Start der Dienste ausblenden (verhindert, dass Gegner kurz sichtbar sind).")]
        [SerializeField] private bool hideUntilReady = true;

        /// <summary>Watched id.</summary>
        public string WatchedId => watchedId ?? string.Empty;

        /// <summary>True while the targets are active.</summary>
        public bool IsActive => IsReady && Store.GetState(WatchedId) == activeState;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            Apply();
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id == WatchedId)
            {
                Apply();
            }
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            Apply();
        }

        private void Awake()
        {
            if (hideUntilReady)
            {
                SetTargets(false);
            }
        }

        private void Apply()
        {
            SetTargets(IsActive);
        }

        private void SetTargets(bool active)
        {
            for (int i = 0; i < targets.Count; i++)
            {
                GameObject target = targets[i];
                if (target != null && target != gameObject && target.activeSelf != active)
                {
                    target.SetActive(active);
                }
            }
        }
    }
}
