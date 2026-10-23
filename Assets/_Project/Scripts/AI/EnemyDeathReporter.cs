using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Adapter that turns the death of an enemy into the global event <see cref="EnemyKilled"/> (architecture 4.3 #12 and
    /// 11.4: "Der EnemyKilled-Adapter (EnemyDeathReporter) liegt in AI"): listens to the health of its
    /// <see cref="Combatant"/> and sends type, variant, unique id, killer, region, loot table (empty for now), level and
    /// position.
    /// </summary>
    /// <remarks>GameObject: the enemy root. TODO (world step): region id from the world system instead of the field.</remarks>
    [DisallowMultipleComponent]
    public sealed class EnemyDeathReporter : MonoBehaviour
    {
        [Tooltip("Kampf-Wurzel des Gegners. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Gegnertyp (Typ-ID, Variante, Stufe, Loot-Tabelle).")]
        [SerializeField] private EnemyTypeDefinition definition = null;

        [Tooltip("Regions-ID (leer, bis es das Welt-System gibt).")]
        [SerializeField] private string regionId = "";

        private readonly WorldMarkerHandle _typeMarker = new WorldMarkerHandle();
        private readonly WorldMarkerHandle _uniqueMarker = new WorldMarkerHandle();
        private IEventBus _eventBus;
        private bool _subscribed;

        private void Awake()
        {
            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
                _typeMarker.Connect(Services.Locator);
                _uniqueMarker.Connect(Services.Locator);

                // After the boot every Awake has run: the combatant has its unique id and its health now.
                Subscribe();
                ShowMarkers();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "EnemyDeathReporter could not resolve IEventBus.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
            ShowMarkers();
        }

        private void OnDisable()
        {
            HideMarkers();
            Health health = combatant != null ? combatant.Health : null;
            if (health != null && _subscribed)
            {
                health.Died -= OnDied;
                health.Revived -= OnRevived;
                _subscribed = false;
            }
        }

        private void Subscribe()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null && !_subscribed && isActiveAndEnabled)
            {
                health.Died += OnDied;
                health.Revived += OnRevived;
                _subscribed = true;
            }
        }

        private void ShowMarkers()
        {
            // Compass and map find the living enemy: under its type, and under its unique id, which "Töte bestimmten" matches
            // for named enemies such as boss.eichental.glutfang or boss.eichental.rissbrut_prolog (EnemyKilled.UniqueId).
            Health health = combatant != null ? combatant.Health : null;
            if (!isActiveAndEnabled || (health != null && health.IsDead))
            {
                return;
            }

            string type = TypeId;
            string unique = combatant != null ? combatant.CombatantId : string.Empty;
            _typeMarker.Show(type, transform);
            _uniqueMarker.Show(unique != type ? unique : string.Empty, transform);
        }

        private void HideMarkers()
        {
            _typeMarker.Hide();
            _uniqueMarker.Hide();
        }

        private void OnRevived()
        {
            // A respawn enables the enemy while it is still dead and revives it afterwards (EnemyController.ResetToAnchor).
            ShowMarkers();
        }

        private string TypeId => definition != null ? definition.EnemyTypeId : combatant != null ? combatant.TypeId : string.Empty;

        private void OnDied(DamageInfo killingDamage)
        {
            HideMarkers();
            string type = TypeId;
            string variant = definition != null ? definition.VariantId : string.Empty;
            string loot = definition != null ? definition.LootTableId : string.Empty;
            int level = definition != null ? definition.Level : combatant.Level;
            var killed = new EnemyKilled(type, variant, combatant.CombatantId, killingDamage.SourceId, regionId, loot, level, transform.position);
            Log.Info(LogCategory.AI, "Enemy '" + combatant.CombatantId + "' killed by '" + killingDamage.SourceId + "'.");
            if (_eventBus != null)
            {
                _eventBus.Publish(in killed);
            }
        }
    }
}
