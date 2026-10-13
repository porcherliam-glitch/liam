using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Utilities;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Default <see cref="ICombatService"/>: pure C# service, created by <see cref="CombatInstaller"/>, ticked by the central
    /// TickRunner (combat state memory, protections). Publishes <see cref="DamageDealt"/> for every hit that dealt damage and
    /// <see cref="CombatStateChanged"/> when the player enters or leaves combat (<see cref="CombatStateTracker"/>).
    /// </summary>
    public sealed class CombatService : ICombatService, ITickable, IDisposable
    {
        private readonly IEventBus _eventBus;
        private readonly CombatStateTracker _tracker = new CombatStateTracker();
        private readonly List<Combatant> _combatants = new List<Combatant>(32);
        private readonly List<Combatant> _protected = new List<Combatant>(2);
        private readonly List<float> _protectedRemaining = new List<float>(2);

        /// <summary>Creates the service.</summary>
        /// <param name="eventBus">Global event bus.</param>
        /// <param name="calculator">Damage formula; null = GDD defaults.</param>
        /// <param name="random">Random source; null = seeded from the clock.</param>
        /// <param name="feedback">Hit feel table; null = GDD defaults.</param>
        public CombatService(IEventBus eventBus, DamageCalculator calculator = null, IRandom random = null, HitFeedbackTable feedback = null)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            Calculator = calculator ?? new DamageCalculator();
            Random = random ?? new Pcg32Random((ulong)DateTime.UtcNow.Ticks);
            Feedback = feedback ?? new HitFeedbackTable();
            _tracker.Changed += OnCombatStateChanged;
        }

        /// <inheritdoc />
        public DamageCalculator Calculator { get; }

        /// <inheritdoc />
        public IRandom Random { get; }

        /// <inheritdoc />
        public HitFeedbackTable Feedback { get; }

        /// <inheritdoc />
        public bool InCombat => _tracker.InCombat;

        /// <inheritdoc />
        public IReadOnlyList<Combatant> Combatants => _combatants;

        /// <inheritdoc />
        public event Action<HitReport> HitLanded;

        /// <inheritdoc />
        public void Register(Combatant combatant)
        {
            if (combatant != null && !_combatants.Contains(combatant))
            {
                _combatants.Add(combatant);
            }
        }

        /// <inheritdoc />
        public void Unregister(Combatant combatant)
        {
            _combatants.Remove(combatant);
            int index = _protected.IndexOf(combatant);
            if (index >= 0)
            {
                _protected.RemoveAt(index);
                _protectedRemaining.RemoveAt(index);
            }
        }

        /// <inheritdoc />
        public void ReportEngagement(object agent, bool engaged)
        {
            _tracker.SetEngaged(agent, engaged);
        }

        /// <inheritdoc />
        public void ReportHit(in HitReport report)
        {
            Combatant attacker = report.Attacker;
            Combatant target = report.Target;
            if (attacker != null && target != null)
            {
                ReportHitValues(attacker.CombatantId, attacker.Team, target.CombatantId, target.Team, report.Damage, report.DealtDamage,
                    report.DamageType, report.IsCritical, report.Zone, report.Defense);
            }

            Action<HitReport> landed = HitLanded;
            if (landed != null)
            {
                landed(report);
            }
        }

        /// <summary>
        /// The global part of <see cref="ReportHit"/> with plain values (testable without scene objects): publishes
        /// <see cref="DamageDealt"/> if damage was dealt and keeps the player in combat for 5 s after a hit between the player
        /// and an enemy (dodged hits count, ignored ones not).
        /// </summary>
        /// <param name="attackerId">Id of the attacker.</param>
        /// <param name="attackerTeam">Team of the attacker.</param>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="targetTeam">Team of the target.</param>
        /// <param name="damage">Damage of the hit.</param>
        /// <param name="dealtDamage">True if health was removed.</param>
        /// <param name="damageType">Main damage type.</param>
        /// <param name="critical">Critical hit.</param>
        /// <param name="zone">Hit zone.</param>
        /// <param name="defense">How the target met the hit.</param>
        public void ReportHitValues(string attackerId, CombatTeam attackerTeam, string targetId, CombatTeam targetTeam, int damage, bool dealtDamage,
            DamageType damageType, bool critical, HitZone zone, DefenseOutcome defense)
        {
            if (dealtDamage)
            {
                var dealt = new DamageDealt(attackerId, targetId, damage, damageType, critical, zone);
                _eventBus.Publish(in dealt);
            }

            bool playerInvolved = (attackerTeam == CombatTeam.Player && targetTeam == CombatTeam.Enemy) ||
                                  (attackerTeam == CombatTeam.Enemy && targetTeam == CombatTeam.Player);
            if (playerInvolved && defense != DefenseOutcome.Ignored)
            {
                _tracker.NotifyDamageExchange();
            }
        }

        /// <inheritdoc />
        public void ProtectFromAttacks(Combatant target, float seconds)
        {
            if (target == null || !(seconds > 0f))
            {
                return;
            }

            int index = _protected.IndexOf(target);
            if (index >= 0)
            {
                _protectedRemaining[index] = Math.Max(_protectedRemaining[index], seconds);
                return;
            }

            _protected.Add(target);
            _protectedRemaining.Add(seconds);
        }

        /// <inheritdoc />
        public bool IsProtectedFromAttacks(Combatant target)
        {
            return target != null && _protected.Contains(target);
        }

        /// <inheritdoc />
        public void ResetCombatState()
        {
            _tracker.Reset();
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            _tracker.Tick(deltaTime);
            for (int i = _protected.Count - 1; i >= 0; i--)
            {
                _protectedRemaining[i] -= deltaTime;
                if (_protectedRemaining[i] <= 0f)
                {
                    _protected.RemoveAt(i);
                    _protectedRemaining.RemoveAt(i);
                }
            }
        }

        /// <inheritdoc />
        public void Dispose()
        {
            _tracker.Changed -= OnCombatStateChanged;
            _combatants.Clear();
        }

        private void OnCombatStateChanged(bool inCombat)
        {
            var changed = new CombatStateChanged(inCombat);
            _eventBus.Publish(in changed);
        }
    }
}
