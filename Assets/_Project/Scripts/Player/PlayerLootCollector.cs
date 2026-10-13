using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Inventory;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Automatic pickup of loot around the player (GDD 04 5.9, option "Automatisch aufheben", default gold and materials):
    /// a few times per second it looks for <see cref="Pickup"/>s within the gold magnet radius (5 m) on the layer Pickup and
    /// lets each one decide with the rules of <see cref="AutoPickupRules"/> (radius, load, combat, mode).
    /// </summary>
    /// <remarks>GameObject: the player root. Only in game state Playing.</remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerLootCollector : MonoBehaviour
    {
        private const int MaxHits = 64;

        [Tooltip("Layer der Beute (Architektur 2.8: 16 „Pickup“).")]
        [SerializeField] private LayerMask pickupLayers = 0;

        [Tooltip("Prüfungen pro Sekunde.")]
        [Range(1f, 30f)] [SerializeField] private float queriesPerSecond = 5f;

        private readonly Collider[] _hits = new Collider[MaxHits];
        private IGameStateService _gameState;
        private ICombatService _combat;
        private float _nextQuery;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _combat);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerLootCollector could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_gameState == null || _gameState.Current != GameState.Playing || Time.time < _nextQuery)
            {
                return;
            }

            _nextQuery = Time.time + 1f / Mathf.Max(1f, queriesPerSecond);
            Vector3 position = transform.position;
            int count = Physics.OverlapSphereNonAlloc(position + Vector3.up * 0.5f, AutoPickupRules.GoldRadius, _hits, pickupLayers,
                QueryTriggerInteraction.Collide);
            bool inCombat = _combat != null && _combat.InCombat;
            for (int i = 0; i < count; i++)
            {
                if (_hits[i].TryGetComponent(out Pickup pickup))
                {
                    pickup.TryAutoCollect(position, inCombat);
                }

                _hits[i] = null;
            }
        }
    }
}
