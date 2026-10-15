using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Weakness of Glutfang (GDD 01 11.4, GDD 02 11.2: "Schwäche Kopftreffer mit dem Bogen"): an arrow or bolt in the head makes
    /// the boss stagger for a moment and interrupts its attack. A short rest prevents a stun lock.
    /// </summary>
    /// <remarks>GameObject: the enemy root next to <see cref="EnemyController"/>.</remarks>
    [DisallowMultipleComponent]
    public sealed class HeadshotStagger : MonoBehaviour
    {
        [Tooltip("Gegner. Leer = EnemyController am selben GameObject.")]
        [SerializeField] private EnemyController enemy = null;

        [Tooltip("So lange taumelt der Gegner nach einem Kopftreffer mit einem Geschoss (Sekunden).")]
        [Range(0.2f, 4f)] [SerializeField] private float staggerSeconds = 1.5f;

        [Tooltip("Pause, bevor ein weiterer Kopftreffer wieder wirkt (Sekunden).")]
        [Range(0f, 20f)] [SerializeField] private float restSeconds = 6f;

        private float _readyAt;

        /// <summary>Number of head hits that made the enemy stagger.</summary>
        public int StaggerCount { get; private set; }

        /// <summary>Raised when a head hit makes the enemy stagger.</summary>
        public event Action Staggered;

        private void Awake()
        {
            if (enemy == null)
            {
                TryGetComponent(out enemy);
            }
        }

        private void OnEnable()
        {
            if (enemy != null)
            {
                enemy.HitTaken += OnHitTaken;
            }
        }

        private void OnDisable()
        {
            if (enemy != null)
            {
                enemy.HitTaken -= OnHitTaken;
            }
        }

        private void OnHitTaken(HitReport report)
        {
            if (report.Killed || report.Zone != HitZone.Head || report.Attack == null || !report.Attack.IsProjectile || !report.DealtDamage)
            {
                return;
            }

            if (Time.time < _readyAt)
            {
                return;
            }

            _readyAt = Time.time + restSeconds;
            StaggerCount++;
            enemy.Stagger(staggerSeconds);
            Staggered?.Invoke();
            Log.Info(LogCategory.AI, "'" + name + "': head hit with a projectile, staggers " + staggerSeconds.ToString("0.0") + " s.");
        }
    }
}
