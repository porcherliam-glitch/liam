using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Quest object of a blockout scene (GDD 02 11.1, 11.2): fallen beam, clue, straw target, dead post rider, Aether splinter,
    /// wolf pup. Holds the object id (the quest counts it, groups with a wildcard such as <c>obj.eichental.strohziel_*</c>), the
    /// quest and the location, and offers an interaction while <see cref="InteractableWhile"/> holds (e.g. only during the quest
    /// stage it belongs to): <see cref="QuestObjectAction.Use"/> and <see cref="QuestObjectAction.PickUp"/> report the verb to
    /// the quest (<c>Interacted</c> through the player's interactor), <see cref="QuestObjectAction.Inspect"/> also publishes
    /// <c>ClueInspected</c> with the object id.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the object root (with a trigger child on the layer Interactable), created by "Aetherfall > Eichental
    /// erstellen" from the layout file and the mini slice table. A one-time object stores "done" in the world object state
    /// (section <c>worldobjects</c>), so it stays used after loading; <see cref="hideWhenUsed"/> then hides its visuals (the
    /// splinter is broken out, the pup taken along). Two markers may share one object id (the splinter: "zerschlagen" and
    /// "herausbrechen"): using one uses both.</para>
    /// <para>Without interaction (<see cref="QuestObjectAction.None"/>) it is only a marker, as before the quest data existed.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class QuestObjectMarker : WorldStateBehaviour, IInteractable
    {
        [Tooltip("Objekt-ID, z. B. obj.eichental.balken_tobold oder clue.eichental.weide_schaf.")]
        [SerializeField] private string objectId = "obj.region.name";

        [Tooltip("ID, die die Quest zählt (z. B. clue.eichental.verbrannte_runen für zwei Runen-Stellen). Leer = wie die Objekt-ID.")]
        [SerializeField] private string groupId = string.Empty;

        [Tooltip("Quest-ID, z. B. quest.main.asche_ueber_eichental.")]
        [SerializeField] private string questId = string.Empty;

        [Tooltip("Orts-ID.")]
        [SerializeField] private string locationId = string.Empty;

        [Header("Interaktion")]
        [Tooltip("Was der Spieler tun kann: nichts (nur Markierung), benutzen, untersuchen (Hinweis) oder aufheben.")]
        [SerializeField] private QuestObjectAction action = QuestObjectAction.None;

        [Tooltip("Hinweistext, z. B. „Tobold befreien“.")]
        [SerializeField] private string prompt = string.Empty;

        [Tooltip("Nur einmal benutzbar (der Zustand wird gespeichert).")]
        [SerializeField] private bool singleUse = true;

        [Tooltip("Nach der Benutzung die Kind-Objekte (Aussehen) ausblenden, z. B. der herausgebrochene Splitter.")]
        [SerializeField] private bool hideWhenUsed = false;

        [Tooltip("Benutzbar, solange diese Bedingung gilt (z. B. nur in der passenden Quest-Stufe). Leer = immer.")]
        [SerializeReference] private Condition interactableWhile;

        private IConditionWatcher _watcher;
        private int _watchId;
        private bool _allowed = true;
        private Action<bool> _onAllowedChanged;

        /// <summary>Object id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Id the quest counts (falls back to the object id).</summary>
        public string GroupId => string.IsNullOrEmpty(groupId) ? ObjectId : groupId;

        /// <summary>Quest id.</summary>
        public string QuestId => questId ?? string.Empty;

        /// <summary>Location id.</summary>
        public string LocationId => locationId ?? string.Empty;

        /// <summary>What the player can do.</summary>
        public QuestObjectAction Action => action;

        /// <summary>Condition for the interaction (null = always).</summary>
        public Condition InteractableWhile => interactableWhile;

        /// <summary>True after a one-time object was used (saved).</summary>
        public bool IsUsed => singleUse && IsReady && Store.GetState(ObjectId) == WorldObjectStates.Done;

        /// <summary>True while the condition allows the interaction (also before the boot).</summary>
        public bool IsAllowed => _allowed;

        /// <inheritdoc />
        public string InteractionObjectId => ObjectId;

        /// <inheritdoc />
        public string InteractionVerb => action == QuestObjectAction.PickUp ? InteractionVerbs.PickUp :
            action == QuestObjectAction.Inspect ? InteractionVerbs.Read : InteractionVerbs.Use;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => 8;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position + Vector3.up * 0.8f;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return action != QuestObjectAction.None && isActiveAndEnabled && _allowed && !context.InCombat && !IsUsed;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            if (singleUse && IsReady)
            {
                Store.SetState(ObjectId, WorldObjectStates.Done);
            }

            if (action == QuestObjectAction.Inspect && EventBus != null)
            {
                var inspected = new ClueInspected(ObjectId);
                EventBus.Publish(in inspected);
            }

            Log.Info(LogCategory.World, "Quest object '" + ObjectId + "': " + InteractionVerb + " (" + prompt + ").");
            return true;
        }

        /// <inheritdoc />
        protected override string MarkerId => ObjectId;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            ApplyUsedState();
            WatchCondition();
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id == ObjectId)
            {
                ApplyUsedState();
            }
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            ApplyUsedState();
        }

        /// <inheritdoc />
        protected override void OnEnable()
        {
            base.OnEnable();
            WatchCondition();
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            if (_watchId > 0 && _watcher != null)
            {
                _watcher.Unwatch(_watchId);
                _watchId = 0;
            }
        }

        private void Awake()
        {
            _onAllowedChanged = allowed => _allowed = allowed;
        }

        private void WatchCondition()
        {
            if (interactableWhile == null || _watchId > 0 || !IsReady || !isActiveAndEnabled)
            {
                return;
            }

            IServiceLocator services = Services.Locator;
            if (services == null || !services.TryGet(out _watcher))
            {
                return;
            }

            var ctx = ConditionContext.ForPlayer(services, "quest-object:" + ObjectId);
            _watchId = _watcher.Watch(interactableWhile, ctx, _onAllowedChanged);
            _allowed = _watcher.IsMet(_watchId);
        }

        private void ApplyUsedState()
        {
            if (!hideWhenUsed)
            {
                return;
            }

            bool visible = !IsUsed;
            for (int i = 0; i < transform.childCount; i++)
            {
                GameObject child = transform.GetChild(i).gameObject;
                if (child.activeSelf != visible)
                {
                    child.SetActive(visible);
                }
            }
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.96f, 0.82f, 0.42f);
            Gizmos.DrawWireCube(transform.position + Vector3.up * 0.5f, new Vector3(0.8f, 1f, 0.8f));
        }
    }

    /// <summary>What the player can do with a <see cref="QuestObjectMarker"/>.</summary>
    public enum QuestObjectAction
    {
        /// <summary>Nothing: only a marker.</summary>
        None = 0,

        /// <summary>Use (free Tobold, test a target, search a body, smash the splinter).</summary>
        Use = 1,

        /// <summary>Inspect a clue (publishes ClueInspected).</summary>
        Inspect = 2,

        /// <summary>Pick up (break the splinter out, take the pup).</summary>
        PickUp = 3
    }
}
