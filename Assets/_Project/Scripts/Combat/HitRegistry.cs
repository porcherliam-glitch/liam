using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// "Already hit" set of one swing (architecture 11.4): every target is hit at most once per attack, the attacker never
    /// hits itself and never its own side (<see cref="CombatTeams.CanDamage"/>). Targets are compared by reference (the
    /// root combatant object), never by instance ids. Pure logic, allocation-free.
    /// </summary>
    public sealed class HitRegistry
    {
        private readonly object[] _hit;
        private object _attacker;
        private CombatTeam _attackerTeam;
        private int _count;

        /// <summary>Creates the registry.</summary>
        /// <param name="capacity">Most targets per swing (further targets are ignored).</param>
        public HitRegistry(int capacity = 16)
        {
            _hit = new object[Math.Max(1, capacity)];
        }

        /// <summary>True between <see cref="BeginSwing"/> and <see cref="EndSwing"/>.</summary>
        public bool IsOpen { get; private set; }

        /// <summary>Number of targets hit in the current or last swing.</summary>
        public int HitCount => _count;

        /// <summary>Starts a swing: forgets all targets of the previous one.</summary>
        /// <param name="attacker">The attacking combatant (never hit by its own swing).</param>
        /// <param name="attackerTeam">Its team.</param>
        public void BeginSwing(object attacker, CombatTeam attackerTeam)
        {
            Array.Clear(_hit, 0, _hit.Length);
            _count = 0;
            _attacker = attacker;
            _attackerTeam = attackerTeam;
            IsOpen = true;
        }

        /// <summary>
        /// Registers a target of the running swing. False if no swing is open, the target is the attacker, on the same side,
        /// was already hit in this swing, or the registry is full.
        /// </summary>
        /// <param name="target">Root combatant of the touched hurtbox.</param>
        /// <param name="targetTeam">Its team.</param>
        public bool TryRegister(object target, CombatTeam targetTeam)
        {
            if (!IsOpen || target == null || ReferenceEquals(target, _attacker) || !CombatTeams.CanDamage(_attackerTeam, targetTeam))
            {
                return false;
            }

            if (WasHit(target) || _count >= _hit.Length)
            {
                return false;
            }

            _hit[_count++] = target;
            return true;
        }

        /// <summary>True if <paramref name="target"/> was hit in the current swing.</summary>
        /// <param name="target">Root combatant.</param>
        public bool WasHit(object target)
        {
            for (int i = 0; i < _count; i++)
            {
                if (ReferenceEquals(_hit[i], target))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Ends the swing (the list stays readable until the next swing).</summary>
        public void EndSwing()
        {
            IsOpen = false;
            _attacker = null;
        }
    }
}
