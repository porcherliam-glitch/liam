using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// A harvest node (S30, GDD 04 6.10): a herb in the world that the player gathers with the interaction button (E / A). It gives
    /// 1–3 pieces through <see cref="IGatheringService"/>, then disappears and grows back after its respawn time in game days –
    /// never in view: only when the player is at least 50 m away, or when the scene is loaded. Some plants bloom only at certain
    /// hours (Nachtschattenblüte 22–4 Uhr); outside them the closed bud stands there without a prompt. The harvest time is kept in
    /// the world object store (save section <c>worldobjects</c>), so it survives saving and loading.
    /// </summary>
    /// <remarks>
    /// GameObject: built by the Eichental generator from the layout list <c>harvestNodes</c>, with the children "Aussehen" (ripe)
    /// and, for plants with a time of day, "Knospe" (waiting). Registers its id in the world marker registry while it is ripe, so a
    /// quest can point the compass at it.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class HarvestNode : WorldStateBehaviour, IInteractable
    {
        private const int Priority = 6;

        [Tooltip("Objekt-ID des Sammelpunkts (obj.…), Schlüssel im Speicherstand.")]
        [SerializeField] private string nodeId = string.Empty;

        [Tooltip("Item, das der Sammelpunkt gibt (item.herb.…).")]
        [SerializeField] private string itemId = string.Empty;

        [Tooltip("Name in der Anzeige „Sammeln: …“.")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Nach so vielen Spieltagen wächst die Pflanze nach (1 Spieltag = 48 Minuten).")]
        [Min(0.01f)] [SerializeField] private float respawnDays = 1f;

        [Tooltip("Kleinster Ertrag je Ernte.")]
        [Min(1)] [SerializeField] private int minYield = 1;

        [Tooltip("Größter Ertrag je Ernte.")]
        [Min(1)] [SerializeField] private int maxYield = 3;

        [Tooltip("Sammelbar ab dieser Stunde (gleich wie „bis“ = immer).")]
        [Range(0f, 24f)] [SerializeField] private float activeFrom = 0f;

        [Tooltip("Sammelbar bis zu dieser Stunde (ausschließlich, über Mitternacht erlaubt).")]
        [Range(0f, 24f)] [SerializeField] private float activeTo = 0f;

        [Tooltip("Aussehen, solange die Pflanze reif und sammelbar ist.")]
        [SerializeField] private GameObject ripeVisual = null;

        [Tooltip("Aussehen außerhalb der Tageszeit (geschlossene Knospe); leer bei Pflanzen ohne Tageszeit.")]
        [SerializeField] private GameObject waitingVisual = null;

        private readonly WorldMarkerHandle _marker = new WorldMarkerHandle();
        private IGameTimeSource _time;
        private IGatheringService _gathering;
        private IPlayerLocator _players;
        private string _prompt;
        private bool _warned;

        /// <summary>Node id.</summary>
        public string NodeId => nodeId ?? string.Empty;

        /// <summary>Item the node gives.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>True while harvested (waiting to grow back).</summary>
        public bool IsHarvested => IsReady && HarvestRules.TryDecodeHarvested(Store.GetState(NodeId), out _);

        /// <summary>True inside the time of day of the plant.</summary>
        public bool IsActiveNow => _time == null || HarvestRules.IsActiveAt(DayNightMath.HourOfDay(_time.TotalGameMinutes), activeFrom, activeTo);

        /// <summary>True if the player can gather it now.</summary>
        public bool IsHarvestable => IsReady && !IsHarvested && IsActiveNow;

        /// <inheritdoc />
        public string InteractionObjectId => NodeId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Gather;

        /// <inheritdoc />
        public string InteractionPrompt => _prompt ?? (_prompt = "Sammeln: " + displayName);

        /// <inheritdoc />
        public int InteractionPriority => Priority;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position + Vector3.up * 0.4f;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return IsHarvestable && _gathering != null && isActiveAndEnabled && !context.InCombat;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            int given = _gathering.Harvest(NodeId, ItemId, minYield, maxYield);
            if (given <= 0)
            {
                return false;
            }

            Store.SetState(NodeId, HarvestRules.EncodeHarvested(_time != null ? _time.TotalGameMinutes : 0d));
            Log.Info(LogCategory.World, "Harvested '" + NodeId + "': " + given + " × " + ItemId + ".");
            return true;
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            IServiceLocator locator = Services.Locator;
            if (locator != null)
            {
                locator.TryGet(out _time);
                locator.TryGet(out _gathering);
                locator.TryGet(out _players);
                _marker.Connect(locator);
            }

            if ((_time == null || _gathering == null) && !_warned)
            {
                _warned = true;
                Log.Warning(LogCategory.World, "HarvestNode '" + NodeId + "': no " + (_gathering == null ? "IGatheringService (GatheringInstaller missing in the BootConfig)" :
                                                   "IGameTimeSource") + " - it cannot be gathered or grow back.");
            }

            Refresh(true);
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            // A load: the scene was not in view, a due plant grows back at once.
            Refresh(true);
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id == NodeId)
            {
                Apply();
            }
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Subscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
            }
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Unsubscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
            }
        }

        /// <inheritdoc />
        protected override void OnEnable()
        {
            base.OnEnable();
            if (IsReady)
            {
                Apply();
            }
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            _marker.Hide();
        }

        private void OnTimeOfDayChanged(TimeOfDayChanged evt)
        {
            Refresh(false);
        }

        private void Refresh(bool unseen)
        {
            if (!IsReady)
            {
                return;
            }

            if (_time != null && HarvestRules.TryDecodeHarvested(Store.GetState(NodeId), out double harvestedAt) &&
                HarvestRules.IsRespawnDue(harvestedAt, _time.TotalGameMinutes, HarvestRules.RespawnMinutes(respawnDays)) &&
                HarvestRules.MayRegrow(unseen || _players == null || _players.Current == null, DistanceToPlayer()))
            {
                // Grows back. On scene start this runs before the base class subscribes to StateChanged, so apply the look below too.
                Store.SetState(NodeId, WorldObjectStates.Initial);
            }

            Apply();
        }

        private float DistanceToPlayer()
        {
            IPlayerAnchor player = _players != null ? _players.Current : null;
            if (player == null)
            {
                return float.MaxValue;
            }

            Vector3 offset = player.Position - transform.position;
            offset.y = 0f;
            return offset.magnitude;
        }

        private void Apply()
        {
            HarvestVisual visual = HarvestRules.Visual(IsHarvested, IsActiveNow);
            if (ripeVisual != null && ripeVisual.activeSelf != (visual == HarvestVisual.Ripe))
            {
                ripeVisual.SetActive(visual == HarvestVisual.Ripe);
            }

            if (waitingVisual != null && waitingVisual.activeSelf != (visual == HarvestVisual.Waiting))
            {
                waitingVisual.SetActive(visual == HarvestVisual.Waiting);
            }

            if (visual == HarvestVisual.Hidden || !isActiveAndEnabled)
            {
                _marker.Hide();
            }
            else
            {
                _marker.Show(NodeId, transform);
            }
        }
    }
}
