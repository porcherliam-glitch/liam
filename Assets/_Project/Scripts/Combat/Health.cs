using System;
using System.Collections.Generic;
using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Health of one target as pure logic (architecture 11.4 "Damageable/Health"): damage, healing, death exactly once,
    /// invulnerability (i-frames, finisher, cutscene), regeneration outside of combat, and the local events
    /// <see cref="Damaged"/>, <see cref="Healed"/>, <see cref="Died"/>, <see cref="Revived"/>.
    /// </summary>
    /// <remarks>
    /// <para>The value lives in a <see cref="ResourcePool"/> (max fixed or from <see cref="StatId.MaxHealth"/>). Damage
    /// restarts the regeneration delay (GDD 03 10.3: 1 % per second after 8 s without damage, none in combat).</para>
    /// <para>Global events (<c>EnemyKilled</c>, <c>PlayerDied</c>, <c>ObjectDestroyed</c>) are sent by adapters that
    /// listen to <see cref="Died"/>, not by this class (architecture 11.4).</para>
    /// <para>Pure C#, allocation-free per hit, main thread only.</para>
    /// </remarks>
    public sealed class Health : IDamageable
    {
        private readonly ResourcePool _pool;
        private readonly List<string> _invulnerabilitySources = new List<string>(2);
        private float _timedInvulnerability;
        private bool _dead;
        private bool _inCombat;

        /// <summary>Creates health with a fixed maximum, starting full.</summary>
        /// <param name="maxHealth">Maximum health.</param>
        /// <param name="settings">Regeneration rules (e.g. <see cref="ResourcePoolSettings.Health"/> or <see cref="ResourcePoolSettings.None"/>).</param>
        /// <param name="ownerId">Id of the owner for logs and death info.</param>
        public Health(float maxHealth, in ResourcePoolSettings settings, string ownerId = "")
            : this(new ResourcePool(maxHealth, settings), ownerId)
        {
        }

        /// <summary>Creates health on an existing pool (e.g. bound to <see cref="StatId.MaxHealth"/>).</summary>
        /// <param name="pool">Pool holding the health value.</param>
        /// <param name="ownerId">Id of the owner for logs and death info.</param>
        public Health(ResourcePool pool, string ownerId = "")
        {
            _pool = pool ?? throw new ArgumentNullException(nameof(pool));
            OwnerId = ownerId ?? string.Empty;
            _dead = !(_pool.Current > 0f);
        }

        /// <summary>Raised after damage was applied (not for ignored damage).</summary>
        public event Action<DamageTaken> Damaged;

        /// <summary>Raised after healing restored health; the argument is the restored amount.</summary>
        public event Action<float> Healed;

        /// <summary>Raised exactly once when the health reaches 0; the argument is the damage that killed (empty for <see cref="Kill"/>).</summary>
        public event Action<DamageInfo> Died;

        /// <summary>Raised when a dead target is revived.</summary>
        public event Action Revived;

        /// <summary>Id of the owner (enemy unique id, <c>player</c> …).</summary>
        public string OwnerId { get; }

        /// <summary>The pool with the health value (read it for UI; change health only through this class).</summary>
        public ResourcePool Pool => _pool;

        /// <summary>Current health.</summary>
        public float Current => _pool.Current;

        /// <summary>Maximum health.</summary>
        public float Max => _pool.Max;

        /// <summary>Current health relative to the maximum (0–1).</summary>
        public float Normalized => _pool.Normalized;

        /// <inheritdoc />
        public bool IsAlive => !_dead;

        /// <summary>True after the health reached 0 (until <see cref="Revive"/>).</summary>
        public bool IsDead => _dead;

        /// <inheritdoc />
        public bool IsInvulnerable => _invulnerabilitySources.Count > 0 || _timedInvulnerability > 0f;

        /// <summary>
        /// Combat state for the regeneration (GDD 03 10.3: no health regeneration in combat). Set by the combat system.
        /// </summary>
        public bool InCombat
        {
            get => _inCombat;
            set
            {
                _inCombat = value;
                _pool.RegenMultiplier = value ? 0f : 1f;
            }
        }

        /// <inheritdoc />
        public DamageOutcome ApplyDamage(in DamageInfo damage)
        {
            if (_dead)
            {
                return new DamageOutcome(0f, 0f, false, DamageIgnoredReason.Dead);
            }

            if (IsInvulnerable)
            {
                return new DamageOutcome(0f, Current, false, DamageIgnoredReason.Invulnerable);
            }

            if (!(damage.Amount > 0f))
            {
                return new DamageOutcome(0f, Current, false, DamageIgnoredReason.NoDamage);
            }

            float before = _pool.Current;
            float applied = _pool.Spend(damage.Amount);
            float after = _pool.Current;
            Action<DamageTaken> damaged = Damaged;
            if (damaged != null)
            {
                damaged(new DamageTaken(damage, applied, before, after));
            }

            bool killed = false;
            if (!_dead && !(after > 0f))
            {
                // A Damaged handler may have healed or killed already; die only once.
                killed = Die(damage);
            }

            return new DamageOutcome(applied, _pool.Current, killed, DamageIgnoredReason.None);
        }

        /// <inheritdoc />
        public float Heal(float amount)
        {
            if (_dead || !(amount > 0f))
            {
                return 0f;
            }

            float restored = _pool.Restore(amount);
            if (restored > 0f)
            {
                Action<float> healed = Healed;
                if (healed != null)
                {
                    healed(restored);
                }
            }

            return restored;
        }

        /// <summary>Kills the target regardless of invulnerability (fall from more than 20 m, kill volumes, debug).</summary>
        /// <param name="sourceId">Id of the cause.</param>
        /// <returns>True if the target was alive.</returns>
        public bool Kill(string sourceId)
        {
            if (_dead)
            {
                return false;
            }

            _pool.Spend(_pool.Current);
            return Die(new DamageInfo(0f, sourceId));
        }

        /// <summary>Brings a dead target back with a share of its maximum health (respawn, checkpoint).</summary>
        /// <param name="healthFraction">Share of the maximum, 0–1 (at least enough for 1 health).</param>
        /// <returns>True if the target was dead.</returns>
        public bool Revive(float healthFraction = 1f)
        {
            if (!_dead)
            {
                return false;
            }

            float fraction = Math.Max(0f, Math.Min(1f, healthFraction));
            _pool.SetCurrent(Math.Max(Math.Min(1f, Max), Max * fraction));
            _dead = !(_pool.Current > 0f);
            if (!_dead)
            {
                Action revived = Revived;
                if (revived != null)
                {
                    revived();
                }
            }

            return !_dead;
        }

        /// <summary>
        /// Sets the health without gameplay rules (loading a save): clamped to 0..max; at 0 the target counts as dead,
        /// but no event is raised (architecture 9.1: <c>Load()</c> sends no gameplay events).
        /// </summary>
        /// <param name="value">Health value.</param>
        public void RestoreState(float value)
        {
            _pool.SetCurrent(value);
            _dead = !(_pool.Current > 0f);
            _timedInvulnerability = 0f;
        }

        /// <summary>Adds an invulnerability source (stays until <see cref="RemoveInvulnerability"/> with the same id).</summary>
        /// <param name="sourceId">Id such as <c>iframes</c>, <c>finisher</c>, <c>cutscene</c>, <c>cheat.god</c>.</param>
        public void AddInvulnerability(string sourceId)
        {
            string id = sourceId ?? string.Empty;
            if (!_invulnerabilitySources.Contains(id))
            {
                _invulnerabilitySources.Add(id);
            }
        }

        /// <summary>Removes an invulnerability source.</summary>
        /// <param name="sourceId">Id passed to <see cref="AddInvulnerability"/>.</param>
        /// <returns>True if it was present.</returns>
        public bool RemoveInvulnerability(string sourceId)
        {
            return _invulnerabilitySources.Remove(sourceId ?? string.Empty);
        }

        /// <summary>Makes the target invulnerable for a time (e.g. the i-frame window of a roll, GDD 03 3.2).</summary>
        /// <param name="seconds">Duration; extends a shorter running window, never shortens it.</param>
        public void SetInvulnerableFor(float seconds)
        {
            if (seconds > _timedInvulnerability)
            {
                _timedInvulnerability = seconds;
            }
        }

        /// <summary>Advances the timed invulnerability and the regeneration.</summary>
        /// <param name="deltaTime">Seconds since the last tick.</param>
        public void Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return;
            }

            if (_timedInvulnerability > 0f)
            {
                _timedInvulnerability = Math.Max(0f, _timedInvulnerability - deltaTime);
            }

            if (!_dead)
            {
                _pool.Tick(deltaTime);
            }
        }

        private bool Die(in DamageInfo killingDamage)
        {
            if (_dead)
            {
                return false;
            }

            _dead = true;
            Action<DamageInfo> died = Died;
            if (died != null)
            {
                died(killingDamage);
            }

            return true;
        }
    }
}
