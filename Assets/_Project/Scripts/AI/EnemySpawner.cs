using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Group of enemies of a test arena with a "respawn all" command (debug overlay button) and an optional automatic respawn
    /// (each dead enemy comes back at its anchor after <c>respawnSeconds</c>, so quests like "3 Woelfe besiegen" never run out
    /// of enemies; GDD 03 12.7: respawned enemies give full XP). TODO (world step): real spawners with save state
    /// (architecture 9.7 "SpawnerState"), respawn rules per region and region levels.
    /// </summary>
    /// <remarks>GameObject: "Arena" in the test ground; the list is filled by the test ground menu.</remarks>
    [DisallowMultipleComponent]
    public sealed class EnemySpawner : MonoBehaviour
    {
        [Tooltip("Gegner dieser Gruppe (EnemyController in der Szene).")]
        [SerializeField] private List<EnemyController> enemies = new List<EnemyController>();

        [Tooltip("Ein besiegter Gegner kehrt nach so vielen Sekunden an seinen Platz zurück. 0 = nie (nur über die Schaltfläche im Kampf-Overlay).")]
        [Min(0f)] [SerializeField] private float respawnSeconds = 0f;

        private readonly RespawnTimers _timers = new RespawnTimers();

        /// <summary>Enemies of the group.</summary>
        public IReadOnlyList<EnemyController> Enemies => enemies;

        /// <summary>Number of living, active enemies.</summary>
        public int AliveCount
        {
            get
            {
                int count = 0;
                for (int i = 0; i < enemies.Count; i++)
                {
                    EnemyController enemy = enemies[i];
                    if (enemy != null && enemy.isActiveAndEnabled && enemy.Combatant != null && enemy.Combatant.IsAlive)
                    {
                        count++;
                    }
                }

                return count;
            }
        }

        /// <summary>Seconds after which a dead enemy comes back (0 = never).</summary>
        public float RespawnSeconds => respawnSeconds;

        /// <summary>Respawns every enemy of the group at its anchor (also living ones).</summary>
        public void RespawnAll()
        {
            for (int i = 0; i < enemies.Count; i++)
            {
                if (enemies[i] != null)
                {
                    enemies[i].ResetToAnchor();
                }
            }

            _timers.Clear();
        }

        private void Update()
        {
            if (respawnSeconds <= 0f)
            {
                return;
            }

            _timers.EnsureCount(enemies.Count);
            float deltaTime = Time.deltaTime;
            for (int i = 0; i < enemies.Count; i++)
            {
                EnemyController enemy = enemies[i];
                bool dead = enemy != null && enemy.Combatant != null && !enemy.Combatant.IsAlive;
                if (_timers.Advance(i, dead, deltaTime, respawnSeconds))
                {
                    enemy.ResetToAnchor();
                }
            }
        }
    }
}
