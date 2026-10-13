using System;
using System.Collections.Generic;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Decides whether the player is "in combat" (GDD 05 5.2): at least one enemy is engaged with the player (AI state
    /// "Kaempfen"), or the player dealt or took damage within the last 5 s. Raises <see cref="Changed"/> on every switch; the
    /// combat service turns that into the global event <c>CombatStateChanged</c>. Pure logic.
    /// </summary>
    public sealed class CombatStateTracker
    {
        private readonly float _damageMemory;
        private readonly List<object> _engaged = new List<object>(8);
        private float _timeSinceDamage = float.PositiveInfinity;

        /// <summary>Creates the tracker.</summary>
        /// <param name="damageMemorySeconds">How long a damage exchange keeps the player in combat (GDD 05 5.2: 5 s).</param>
        public CombatStateTracker(float damageMemorySeconds = 5f)
        {
            _damageMemory = Math.Max(0f, damageMemorySeconds);
        }

        /// <summary>True while in combat.</summary>
        public bool InCombat { get; private set; }

        /// <summary>Number of engaged enemies.</summary>
        public int EngagedCount => _engaged.Count;

        /// <summary>Raised when <see cref="InCombat"/> changes; the argument is the new value.</summary>
        public event Action<bool> Changed;

        /// <summary>An enemy starts or stops fighting the player.</summary>
        /// <param name="agent">The enemy (compared by reference).</param>
        /// <param name="engaged">True while it fights.</param>
        public void SetEngaged(object agent, bool engaged)
        {
            if (agent == null)
            {
                return;
            }

            int index = _engaged.IndexOf(agent);
            if (engaged && index < 0)
            {
                _engaged.Add(agent);
            }
            else if (!engaged && index >= 0)
            {
                _engaged.RemoveAt(index);
            }

            Evaluate();
        }

        /// <summary>The player dealt or took damage.</summary>
        public void NotifyDamageExchange()
        {
            _timeSinceDamage = 0f;
            Evaluate();
        }

        /// <summary>Advances the damage memory.</summary>
        /// <param name="deltaTime">Seconds.</param>
        public void Tick(float deltaTime)
        {
            if (deltaTime > 0f && !float.IsPositiveInfinity(_timeSinceDamage))
            {
                _timeSinceDamage += deltaTime;
            }

            Evaluate();
        }

        /// <summary>Forgets everything (player respawn, main menu); raises <see cref="Changed"/> if it was in combat.</summary>
        public void Reset()
        {
            _engaged.Clear();
            _timeSinceDamage = float.PositiveInfinity;
            Evaluate();
        }

        private void Evaluate()
        {
            bool inCombat = _engaged.Count > 0 || _timeSinceDamage <= _damageMemory;
            if (inCombat == InCombat)
            {
                return;
            }

            InCombat = inCombat;
            Action<bool> changed = Changed;
            if (changed != null)
            {
                changed(inCombat);
            }
        }
    }
}
