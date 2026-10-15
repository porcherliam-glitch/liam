using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Phase 2 "Steinbruch" (GDD 02 11.6): Grimmbart kicks the oil barrels of the arena over - their oil spills into puddles
    /// that a fire hit (fire pot, fire arrow, fire spell) turns into an explosion. The kicks follow one after the other.
    /// </summary>
    /// <remarks>GameObject: the boss root next to <see cref="BossController"/>; the barrels belong to the arena.</remarks>
    [DisallowMultipleComponent]
    public sealed class BossBarrelKick : MonoBehaviour
    {
        [Tooltip("Boss. Leer = BossController am selben GameObject.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Ölfässer der Arena.")]
        [SerializeField] private List<ExplosiveObject> barrels = new List<ExplosiveObject>();

        [Tooltip("In dieser Phase tritt er die Fässer um.")]
        [Range(2, 5)] [SerializeField] private int phase = 2;

        [Tooltip("Abstand zwischen zwei Tritten (Sekunden).")]
        [Range(0f, 3f)] [SerializeField] private float interval = 0.6f;

        private float _timer = -1f;
        private int _next;
        private bool _subscribed;

        /// <summary>Number of barrels kicked over.</summary>
        public int Kicked { get; private set; }

        private void Awake()
        {
            if (boss == null)
            {
                TryGetComponent(out boss);
            }
        }

        private void OnEnable()
        {
            if (boss != null && !_subscribed)
            {
                boss.PhaseStarted += OnPhaseStarted;
                _subscribed = true;
            }
        }

        private void OnDisable()
        {
            if (boss != null && _subscribed)
            {
                boss.PhaseStarted -= OnPhaseStarted;
                _subscribed = false;
            }
        }

        private void OnPhaseStarted(int started)
        {
            if (started == phase)
            {
                _next = 0;
                _timer = interval;
            }
        }

        private void Update()
        {
            if (_timer < 0f)
            {
                return;
            }

            _timer -= Time.deltaTime;
            if (_timer > 0f)
            {
                return;
            }

            while (_next < barrels.Count)
            {
                ExplosiveObject barrel = barrels[_next++];
                if (barrel != null && barrel.isActiveAndEnabled && !barrel.IsBroken && !barrel.HasDetonated)
                {
                    barrel.Break();
                    Kicked++;
                    Log.Info(LogCategory.AI, "Grimmbart kicks over '" + barrel.name + "'.");
                    _timer = interval;
                    return;
                }
            }

            _timer = -1f;
        }
    }
}
