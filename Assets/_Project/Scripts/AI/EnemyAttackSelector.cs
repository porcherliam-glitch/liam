using System;
using Aetherfall.Utilities;

namespace Aetherfall.AI
{
    /// <summary>
    /// Chooses the next attack of an enemy by weight among the attacks that are off cooldown, preferring those whose range
    /// fits the current distance (otherwise the enemy closes in for any ready attack), and runs the cooldowns.
    /// </summary>
    public sealed class EnemyAttackSelector
    {
        private readonly EnemyAttackOption[] _options;
        private readonly float[] _cooldowns;
        private readonly IRandom _random;

        /// <summary>Creates the selector.</summary>
        /// <param name="options">Attacks of the enemy (validated, not empty).</param>
        /// <param name="random">Random source.</param>
        public EnemyAttackSelector(EnemyAttackOption[] options, IRandom random)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _cooldowns = new float[options.Length];
        }

        /// <summary>Seconds of cooldown left for the attack at the index.</summary>
        /// <param name="index">Index into the attacks.</param>
        public float CooldownOf(int index)
        {
            return index >= 0 && index < _cooldowns.Length ? Math.Max(0f, _cooldowns[index]) : 0f;
        }

        /// <summary>Counts the cooldowns down.</summary>
        /// <param name="deltaTime">Local time.</param>
        public void Tick(float deltaTime)
        {
            for (int i = 0; i < _cooldowns.Length; i++)
            {
                if (_cooldowns[i] > 0f)
                {
                    _cooldowns[i] -= deltaTime;
                }
            }
        }

        /// <summary>Starts the cooldown of an attack after it was used.</summary>
        /// <param name="index">Index into the attacks.</param>
        public void StartCooldown(int index)
        {
            if (index >= 0 && index < _cooldowns.Length)
            {
                _cooldowns[index] = _options[index].Cooldown;
            }
        }

        /// <summary>Clears all cooldowns (respawn).</summary>
        public void Reset()
        {
            Array.Clear(_cooldowns, 0, _cooldowns.Length);
        }

        /// <summary>Chooses an attack for the distance to the target.</summary>
        /// <param name="distance">Distance to the target in metres.</param>
        /// <returns>Index of the attack, or -1 if every attack is on cooldown.</returns>
        public int Choose(float distance)
        {
            float inRangeWeight = 0f;
            float readyWeight = 0f;
            for (int i = 0; i < _options.Length; i++)
            {
                if (_cooldowns[i] > 0f)
                {
                    continue;
                }

                readyWeight += Math.Max(0f, _options[i].Weight);
                if (_options[i].InRange(distance))
                {
                    inRangeWeight += Math.Max(0f, _options[i].Weight);
                }
            }

            bool preferInRange = inRangeWeight > 0f;
            float total = preferInRange ? inRangeWeight : readyWeight;
            if (!(total > 0f))
            {
                return -1;
            }

            float roll = _random.NextFloat() * total;
            int last = -1;
            for (int i = 0; i < _options.Length; i++)
            {
                if (_cooldowns[i] > 0f || (preferInRange && !_options[i].InRange(distance)))
                {
                    continue;
                }

                last = i;
                roll -= Math.Max(0f, _options[i].Weight);
                if (roll < 0f)
                {
                    return i;
                }
            }

            return last;
        }
    }
}
