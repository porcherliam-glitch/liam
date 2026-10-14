using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Generic one-time interaction that writes a state (GDD 02 11.7): open the cage of the grave robber (the hidden door
    /// follows), take the seal stone (s60), pick up the blade fragment of the beaten knight. Available only while all
    /// <see cref="requirements"/> hold (e.g. "boss beaten", "quest gate open" from a condition gate) and the state is not
    /// reached yet. Shows and hides child objects by state (cage bars, the stone on the altar, Fenn's words). The interactor
    /// publishes <c>Interacted(id, verb)</c> for the quest objectives "Interagiere"; items are given by quest actions or the
    /// state actions of Aetherfall.World.Gameplay.
    /// </summary>
    /// <remarks>GameObject: always active (it hides children only), trigger collider on the layer Interactable.</remarks>
    [DisallowMultipleComponent]
    public sealed class StateInteractable : WorldStateBehaviour, IInteractable
    {
        [Tooltip("Stabile ID, z. B. obj.eichental.gruft_kaefig.")]
        [SerializeField] private string objectId = "obj.neu";

        [Tooltip("Hinweistext, z. B. „Befreie den Grabräuber“.")]
        [SerializeField] private string prompt = "Benutzen";

        [Tooltip("Verb für das Ereignis Interacted: open, use, pickup, talk, read.")]
        [SerializeField] private string verb = InteractionVerbs.Use;

        [Tooltip("Zustand nach der Interaktion (1 = erledigt).")]
        [SerializeField] private int doneState = WorldObjectStates.Done;

        [Tooltip("Alle Bedingungen müssen erfüllt sein, sonst ist keine Interaktion möglich.")]
        [SerializeField] private List<StateRequirement> requirements = new List<StateRequirement>();

        [Tooltip("Sichtbar, solange die Interaktion noch nicht passiert ist (z. B. Gitterstäbe, Stein auf dem Altar).")]
        [SerializeField] private List<GameObject> visibleBefore = new List<GameObject>();

        [Tooltip("Sichtbar nach der Interaktion (z. B. Fenns Worte).")]
        [SerializeField] private List<GameObject> visibleAfter = new List<GameObject>();

        [Tooltip("An = „Sichtbar vorher“ erscheint erst, wenn die Bedingungen erfüllt sind (Beute des Bosses).")]
        [SerializeField] private bool hiddenUntilAvailable = false;

        [Tooltip("Sekunden, nach denen „Sichtbar nachher“ wieder verschwindet (0 = bleibt).")]
        [Min(0f)] [SerializeField] private float hideAfterSeconds = 0f;

        [Tooltip("Priorität unter mehreren Objekten in Reichweite (Truhe 10, Schalter 5).")]
        [SerializeField] private int priority = 8;

        private float _afterTimer = -1f;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>True once the interaction happened (in this save).</summary>
        public bool IsDone => IsReady && Store.GetState(ObjectId) == doneState;

        /// <summary>True if all requirements hold.</summary>
        public bool RequirementsMet
        {
            get
            {
                if (!IsReady)
                {
                    return false;
                }

                for (int i = 0; i < requirements.Count; i++)
                {
                    if (requirements[i] != null && !requirements[i].IsMet(Store))
                    {
                        return false;
                    }
                }

                return true;
            }
        }

        /// <summary>Raised after the interaction (state written).</summary>
        public event Action<StateInteractable> Done;

        /// <inheritdoc />
        public string InteractionObjectId => ObjectId;

        /// <inheritdoc />
        public string InteractionVerb => string.IsNullOrEmpty(verb) ? InteractionVerbs.Use : verb;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => priority;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return IsReady && isActiveAndEnabled && !IsDone && RequirementsMet;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            Store.SetState(ObjectId, doneState);
            _afterTimer = hideAfterSeconds > 0f ? hideAfterSeconds : -1f;
            Log.Info(LogCategory.World, "'" + ObjectId + "' used by '" + context.InteractorId + "'.");
            Action<StateInteractable> done = Done;
            if (done != null)
            {
                done(this);
            }

            return true;
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            Refresh(false);
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id == ObjectId)
            {
                Refresh(true);
                return;
            }

            for (int i = 0; i < requirements.Count; i++)
            {
                if (requirements[i] != null && requirements[i].ObjectId == id)
                {
                    Refresh(true);
                    return;
                }
            }
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            _afterTimer = -1f;
            Refresh(false);
        }

        private void Update()
        {
            if (_afterTimer < 0f)
            {
                return;
            }

            _afterTimer -= Time.deltaTime;
            if (_afterTimer < 0f)
            {
                SetAll(visibleAfter, false);
            }
        }

        private void Refresh(bool live)
        {
            bool done = IsDone;
            bool showBefore = !done && (!hiddenUntilAvailable || RequirementsMet);
            SetAll(visibleBefore, showBefore);
            // After loading, a timed message (Fenn's words) is not shown again.
            SetAll(visibleAfter, done && (live || hideAfterSeconds <= 0f));
        }

        private static void SetAll(List<GameObject> objects, bool active)
        {
            for (int i = 0; i < objects.Count; i++)
            {
                if (objects[i] != null && objects[i].activeSelf != active)
                {
                    objects[i].SetActive(active);
                }
            }
        }
    }
}
