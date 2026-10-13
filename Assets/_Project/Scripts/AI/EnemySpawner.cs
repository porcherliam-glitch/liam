using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Group of enemies of a test arena with a "respawn all" command (debug overlay button): brings dead or wandered enemies
    /// back to their anchors with full health. TODO (world step): real spawners with save state (architecture 9.7
    /// "SpawnerState"), respawn timers and region levels.
    /// </summary>
    /// <remarks>GameObject: "Arena" in the test ground; the list is filled by the test ground menu.</remarks>
    [DisallowMultipleComponent]
    public sealed class EnemySpawner : MonoBehaviour
    {
        [Tooltip("Gegner dieser Gruppe (EnemyController in der Szene).")]
        [SerializeField] private List<EnemyController> enemies = new List<EnemyController>();

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
        }
    }
}
