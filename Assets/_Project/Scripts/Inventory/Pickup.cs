using Aetherfall.Core;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Loot lying in the world (architecture 11.6 "Pickup-Komponente", layer Pickup): one drop (item stack, equipment or gold)
    /// that the player picks up with the Interact action in range (<see cref="IInteractable"/>) or automatically
    /// (<see cref="TryAutoCollect"/>, GDD 04 5.9: gold within 5 m, materials within 3 m by default). Pooled by
    /// <see cref="LootWorldSpawner"/>, which also sets it up; a beam in the rarity colour comes from <see cref="LootBeamPool"/>.
    /// </summary>
    /// <remarks>
    /// Common and uncommon items vanish after 10 minutes of real time (GDD 04 5.9); rare and better stay until the scene is
    /// unloaded. Not saved yet: loot in the world is cleared when a save is loaded (TODO world step, architecture 9.7).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class Pickup : MonoBehaviour, IInteractable
    {
        /// <summary>Lifetime of common and uncommon loot in seconds of real time (GDD 04 5.9: 10 min).</summary>
        public const float CommonLifetimeSeconds = 600f;

        private LootWorldSpawner _owner;
        private ILootService _loot;
        private LootDrop _drop;
        private string _sourceId = string.Empty;
        private string _objectId = string.Empty;
        private string _prompt = string.Empty;
        private float _expiresAt = float.PositiveInfinity;
        private bool _active;

        /// <summary>The drop this pickup holds.</summary>
        public LootDrop Drop => _drop;

        /// <summary>True while the pickup lies in the world.</summary>
        public bool IsActive => _active;

        /// <summary>Index of its beam in the beam pool (−1 = none).</summary>
        public int BeamIndex { get; set; } = -1;

        /// <inheritdoc />
        public string InteractionObjectId => _objectId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.PickUp;

        /// <inheritdoc />
        public string InteractionPrompt => _prompt;

        /// <inheritdoc />
        public int InteractionPriority => 0;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <summary>Sets the pickup up (called by the spawner).</summary>
        /// <param name="owner">Spawner that pools it.</param>
        /// <param name="loot">Loot service that collects it.</param>
        /// <param name="drop">Drop.</param>
        /// <param name="sourceId">Source for <c>ItemPickedUp</c>.</param>
        /// <param name="objectId">Runtime id (<c>rt.&lt;16 hex&gt;</c>).</param>
        /// <param name="title">German name shown in the prompt, e.g. "Wolfsfell x2" or "23 Gold".</param>
        /// <param name="expires">True for common and uncommon loot (10 min lifetime).</param>
        public void Setup(LootWorldSpawner owner, ILootService loot, in LootDrop drop, string sourceId, string objectId, string title, bool expires)
        {
            _owner = owner;
            _loot = loot;
            _drop = drop;
            _sourceId = sourceId ?? string.Empty;
            _objectId = objectId ?? string.Empty;
            _prompt = "Aufheben: " + title;
            _expiresAt = expires ? Time.unscaledTime + CommonLifetimeSeconds : float.PositiveInfinity;
            _active = true;
        }

        /// <summary>Marks the pickup as gone (back in the pool).</summary>
        public void Deactivate()
        {
            _active = false;
            _drop = default;
            _loot = null;
        }

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return _active && _loot != null;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            return Collect();
        }

        /// <summary>
        /// Collects the pickup if the automatic pickup rules allow it at this distance (called by the player's loot collector
        /// a few times per second).
        /// </summary>
        /// <param name="playerPosition">Position of the player.</param>
        /// <param name="inCombat">True while the player is in combat.</param>
        /// <returns>True if it was collected.</returns>
        public bool TryAutoCollect(Vector3 playerPosition, bool inCombat)
        {
            if (!_active || _loot == null)
            {
                return false;
            }

            float distance = Vector3.Distance(playerPosition, transform.position);
            return _loot.ShouldAutoCollect(_drop, distance, inCombat) && Collect();
        }

        private bool Collect()
        {
            if (!_active || _loot == null || !_loot.TryCollect(_drop, _sourceId))
            {
                return false;
            }

            if (_owner != null)
            {
                _owner.Release(this);
            }
            else
            {
                Deactivate();
                gameObject.SetActive(false);
            }

            return true;
        }

        private void Update()
        {
            if (_active && Time.unscaledTime >= _expiresAt)
            {
                if (_owner != null)
                {
                    _owner.Release(this);
                }
                else
                {
                    Deactivate();
                    gameObject.SetActive(false);
                }
            }
        }
    }
}
