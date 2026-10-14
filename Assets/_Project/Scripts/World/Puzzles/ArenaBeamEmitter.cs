using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Aether beam of the boss arena (GDD 02 11.7: "Ab Phase 2 kann der Spieler den Aether-Strahl mit einem Spiegel auf den
    /// Ritter lenken – er ist dann 5 s betaeubt"): from the given boss phase on, the crack shines onto the arena mirror; the
    /// mirror sends the beam in its direction until it hits a wall, a pillar or an enemy. This component only draws the beam;
    /// the boss checks the hit itself (it reads the same mirror pivot), so World needs no reference to AI.
    /// </summary>
    /// <remarks>GameObject: "Aetherstrahl Arena" with an <see cref="AetherBeamView"/> (child or same object).</remarks>
    [DisallowMultipleComponent]
    public sealed class ArenaBeamEmitter : WorldStateBehaviour
    {
        [Tooltip("Boss-ID, z. B. boss.eichental.wachender_ritter.")]
        [SerializeField] private string bossId = string.Empty;

        [Tooltip("Ab dieser Bossphase leuchtet der Strahl.")]
        [Range(1, 5)] [SerializeField] private int fromPhase = 2;

        [Tooltip("Lichtquelle (Spalt in der Wand). Position = Strahlanfang.")]
        [SerializeField] private Transform source = null;

        [Tooltip("Der drehbare Spiegel der Arena (wird vom Spalt immer getroffen).")]
        [SerializeField] private RotatableMirror mirror = null;

        [Tooltip("Strahl-Darstellung.")]
        [SerializeField] private AetherBeamView beam = null;

        [Tooltip("Layer, an denen der Strahl endet (Umgebung 11, Gegner 7).")]
        [SerializeField] private LayerMask blockingLayers = (1 << 11) | (1 << 7);

        [Tooltip("Maximale Länge hinter dem Spiegel (Meter).")]
        [Range(5f, 80f)] [SerializeField] private float maxDistance = 40f;

        private readonly List<Vector3> _points = new List<Vector3>(3);
        private bool _active;

        /// <summary>True while the beam shines.</summary>
        public bool IsActive => _active;

        /// <summary>Points of the drawn beam (source, mirror, end).</summary>
        public IReadOnlyList<Vector3> Points => _points;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            SetActive(false);
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            SetActive(false);
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (EventBus == null)
            {
                return;
            }

            EventBus.Subscribe<BossPhaseChanged>(OnPhaseChanged);
            EventBus.Subscribe<BossEncounterEnded>(OnEncounterEnded);
            EventBus.Subscribe<BossDefeated>(OnBossDefeated);
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (EventBus == null)
            {
                return;
            }

            EventBus.Unsubscribe<BossPhaseChanged>(OnPhaseChanged);
            EventBus.Unsubscribe<BossEncounterEnded>(OnEncounterEnded);
            EventBus.Unsubscribe<BossDefeated>(OnBossDefeated);
        }

        private void Awake()
        {
            if (beam != null)
            {
                beam.SetVisible(false);
            }
        }

        private void LateUpdate()
        {
            if (_active)
            {
                Draw();
            }
        }

        private void OnPhaseChanged(BossPhaseChanged evt)
        {
            if (evt.BossId == bossId && evt.Phase >= fromPhase)
            {
                SetActive(true);
            }
        }

        private void OnEncounterEnded(BossEncounterEnded evt)
        {
            if (evt.BossId == bossId)
            {
                SetActive(false);
            }
        }

        private void OnBossDefeated(BossDefeated evt)
        {
            if (evt.BossId == bossId)
            {
                SetActive(false);
            }
        }

        private void SetActive(bool active)
        {
            if (active && (source == null || mirror == null))
            {
                Log.Warning(LogCategory.World, "ArenaBeamEmitter '" + name + "': source and mirror must be set.");
                active = false;
            }

            if (active != _active)
            {
                Log.Info(LogCategory.World, "Arena beam of '" + bossId + "' " + (active ? "on" : "off") + ".");
            }

            _active = active;
            if (beam != null)
            {
                beam.SetVisible(active);
            }

            if (active)
            {
                Draw();
            }
        }

        private void Draw()
        {
            Vector3 start = source.position;
            Transform pivot = mirror.Pivot;
            Vector3 bounce = new Vector3(pivot.position.x, start.y, pivot.position.z);
            _points.Clear();
            _points.Add(start);
            _points.Add(bounce);
            Vector3 toSource = start - bounce;
            GridDirection heading = mirror.Direction;
            var direction = new Vector3(GridDirections.StepX(heading), 0f, GridDirections.StepZ(heading));
            bool blockedByMirror = Vector3.Dot(direction, new Vector3(toSource.x, 0f, toSource.z).normalized) > 0.7f;
            if (!blockedByMirror)
            {
                Vector3 origin = bounce + direction * 0.3f;
                float length = Physics.Raycast(origin, direction, out RaycastHit hit, maxDistance, blockingLayers, QueryTriggerInteraction.Ignore)
                    ? hit.distance + 0.3f
                    : maxDistance;
                _points.Add(bounce + direction * length);
            }

            if (beam != null)
            {
                beam.SetPath(_points);
            }
        }
    }
}
