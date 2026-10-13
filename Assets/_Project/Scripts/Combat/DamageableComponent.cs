using Aetherfall.Core;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Scene adapter of <see cref="Health"/> (§9.8, architecture 11.4): one component for the player, enemies, companions
    /// and destructible objects. With a <see cref="CharacterStatsComponent"/> the maximum health follows
    /// <see cref="StatId.MaxHealth"/>; without one it uses the fixed value from the inspector.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the root of the target (the test ground menu adds it to "Player"). Hurtboxes reference this
    /// component later. Ticks the health once per frame (timed invulnerability, regeneration).</para>
    /// <para>The health is created on first access, so other components may use it in their own <c>Awake</c>.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class DamageableComponent : MonoBehaviour, IDamageable
    {
        [Tooltip("Werte der Figur (optional). Gesetzt: maximale LP aus dem Wert MaxHealth (GDD 03, 10.3). Leer: fester Wert unten.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Maximale LP ohne Werte-Komponente (Kisten, Fässer, einfache Gegner).")]
        [Min(1f)] [SerializeField] private float maxHealth = 100f;

        [Tooltip("LP regenerieren außerhalb des Kampfes: 1 % pro Sekunde nach 8 s ohne Schaden (GDD 03, 10.3). Aus für Objekte und Gegner.")]
        [SerializeField] private bool regenerate = true;

        [Tooltip("ID des Ziels für Protokoll und Ereignisse, z. B. „player“ oder die UniqueId eines Gegners.")]
        [SerializeField] private string ownerId = "";

        private Health _health;

        /// <summary>The health logic (created on first access).</summary>
        public Health Health
        {
            get
            {
                EnsureCreated();
                return _health;
            }
        }

        /// <inheritdoc />
        public bool IsAlive => Health.IsAlive;

        /// <inheritdoc />
        public bool IsInvulnerable => Health.IsInvulnerable;

        /// <inheritdoc />
        public DamageOutcome ApplyDamage(in DamageInfo damage)
        {
            return Health.ApplyDamage(damage);
        }

        /// <inheritdoc />
        public float Heal(float amount)
        {
            return Health.Heal(amount);
        }

        private void Awake()
        {
            EnsureCreated();
        }

        private void OnEnable()
        {
            Health.Died += OnDied;
        }

        private void OnDisable()
        {
            if (_health != null)
            {
                _health.Died -= OnDied;
            }
        }

        private void Update()
        {
            _health.Tick(Time.deltaTime);
        }

        private void OnDied(DamageInfo killingDamage)
        {
            Log.Info(LogCategory.Combat, "'" + name + "' died (last damage from '" + killingDamage.SourceId + "').");
        }

        private void EnsureCreated()
        {
            if (_health != null)
            {
                return;
            }

            ResourcePoolSettings settings = regenerate ? ResourcePoolSettings.Health : ResourcePoolSettings.None;
            ResourcePool pool = stats != null
                ? new ResourcePool(stats.Stats, StatId.MaxHealth, settings)
                : new ResourcePool(maxHealth, settings);
            string id = string.IsNullOrEmpty(ownerId) ? name : ownerId;
            _health = new Health(pool, id);
        }
    }
}
