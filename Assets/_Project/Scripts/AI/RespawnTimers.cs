using System;
using System.Collections.Generic;

namespace Aetherfall.AI
{
    /// <summary>
    /// Respawn timers of a group of enemies (pure logic of <see cref="EnemySpawner"/>): each dead enemy counts up and is due
    /// once its time is over; a living enemy resets its timer.
    /// </summary>
    public sealed class RespawnTimers
    {
        private readonly List<float> _deadFor = new List<float>();

        /// <summary>Number of tracked enemies.</summary>
        public int Count => _deadFor.Count;

        /// <summary>Makes room for this many enemies (new entries start at 0).</summary>
        /// <param name="count">Number of enemies.</param>
        public void EnsureCount(int count)
        {
            while (_deadFor.Count < count)
            {
                _deadFor.Add(0f);
            }
        }

        /// <summary>Resets all timers (everybody respawned).</summary>
        public void Clear()
        {
            for (int i = 0; i < _deadFor.Count; i++)
            {
                _deadFor[i] = 0f;
            }
        }

        /// <summary>Advances the timer of one enemy.</summary>
        /// <param name="index">Enemy index.</param>
        /// <param name="dead">True while the enemy is dead.</param>
        /// <param name="deltaTime">Frame time in seconds.</param>
        /// <param name="respawnSeconds">Respawn delay in seconds.</param>
        /// <returns>True if the enemy should respawn now (its timer starts over).</returns>
        public bool Advance(int index, bool dead, float deltaTime, float respawnSeconds)
        {
            EnsureCount(index + 1);
            if (!dead)
            {
                _deadFor[index] = 0f;
                return false;
            }

            _deadFor[index] += Math.Max(0f, deltaTime);
            if (_deadFor[index] < respawnSeconds)
            {
                return false;
            }

            _deadFor[index] = 0f;
            return true;
        }
    }
}
