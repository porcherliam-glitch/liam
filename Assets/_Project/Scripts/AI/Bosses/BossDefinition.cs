using System.Collections.Generic;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// A boss as data (GDD 03 9.6; GDD 02 11.7 "Der Wachende Ritter"): id, name and title for the health bar, the enemy type it
    /// builds on (health, damage, armor, poise, resistances, level, loot table, speeds – here the champion variant of the
    /// skeleton warrior), the phase thresholds, adds per phase, the tower-shield guard, the attacks per phase and the timings
    /// of awakening, phase change, parry opening and Aether-beam stun. Lives in <c>Assets/_Project/Data/Enemies/</c>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Gegner/Boss", fileName = "Boss", order = 21)]
    public sealed class BossDefinition : ScriptableObject, IContentIdProvider
    {
        [Header("Identität")]
        [Tooltip("Boss-ID, z. B. boss.eichental.wachender_ritter (Quest „Töte Bestimmten“, „besiegt bleibt besiegt“).")]
        [SerializeField] private string bossId = "boss.neu";

        [Tooltip("Name auf dem Lebensbalken.")]
        [SerializeField] private string displayName = "Boss";

        [Tooltip("Titelzeile unter dem Namen.")]
        [SerializeField] private string title = string.Empty;

        [Tooltip("Gegnertyp mit den Grundwerten (Champion-Variante).")]
        [SerializeField] private EnemyTypeDefinition baseType = null;

        [Tooltip("Musik-ID des Kampfes (für das spätere Audio-System), z. B. mus.boss_gruft.")]
        [SerializeField] private string musicId = string.Empty;

        [Header("Phasen (GDD 03, 9.6)")]
        [Tooltip("LP-Anteil, ab dem eine Phase beginnt (Phase 1 zuerst): 1,0 und 0,5.")]
        [SerializeField] private List<float> phaseThresholds = new List<float> { 1f, 0.5f };

        [Tooltip("Gerufene Helfer zu Beginn jeder Phase (Phase 1 zuerst): 0 und 2.")]
        [SerializeField] private List<int> addsPerPhase = new List<int> { 0, 2 };

        [Tooltip("Sekunden des Phasenwechsels (unverwundbar, höchstens 3).")]
        [Range(0f, 3f)] [SerializeField] private float transitionSeconds = 2.5f;

        [Tooltip("Sekunden, die der Boss zum Aufstehen braucht.")]
        [Range(0f, 5f)] [SerializeField] private float awakenSeconds = 1.5f;

        [Header("Haltung")]
        [Tooltip("Schildwinkel der Turmschild-Haltung in Grad.")]
        [Range(30f, 220f)] [SerializeField] private float guardAngle = 170f;

        [Tooltip("Abwehr beim Blocken (1 = 100 %, GDD 02, 11.7: frontal 100 % Block).")]
        [Range(0f, 1f)] [SerializeField] private float guardReduction = 1f;

        [Tooltip("So lange ist die Deckung nach einem parierten Schildstoß offen (Sekunden).")]
        [Range(0.2f, 5f)] [SerializeField] private float parryOpenSeconds = 1.5f;

        [Tooltip("Pause nach jedem Angriff (Sekunden).")]
        [Range(0f, 3f)] [SerializeField] private float recoverSeconds = 0.8f;

        [Header("Aether-Strahl (Phase 2)")]
        [Tooltip("Ab dieser Phase betäubt der Strahl.")]
        [Range(1, 5)] [SerializeField] private int beamFromPhase = 2;

        [Tooltip("Betäubung durch den Strahl (Sekunden, GDD: 5).")]
        [Range(0.5f, 10f)] [SerializeField] private float beamStunSeconds = 5f;

        [Tooltip("Wartezeit nach einer Strahl-Betäubung (Sekunden).")]
        [Range(0f, 30f)] [SerializeField] private float beamCooldownSeconds = 8f;

        [Header("Aufgeben")]
        [Tooltip("Bei diesem Lebensanteil kniet der Boss und lässt sich fesseln (GDD 02, 11.6: 0,1); 0 = nie.")]
        [Range(0f, 0.45f)] [SerializeField] private float yieldFraction = 0f;

        [Tooltip("So lange kniet er, bevor er weiterkämpft (Sekunden).")]
        [Range(1f, 15f)] [SerializeField] private float yieldSeconds = 5f;

        [Header("Angriffe")]
        [SerializeField] private List<BossAttackEntry> attacks = new List<BossAttackEntry>();

        /// <summary>Boss id.</summary>
        public string BossId => bossId ?? string.Empty;

        /// <inheritdoc />
        public string ContentId => BossId;

        /// <summary>Display name.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <summary>Title line.</summary>
        public string Title => title ?? string.Empty;

        /// <summary>Enemy type with the base values.</summary>
        public EnemyTypeDefinition BaseType => baseType;

        /// <summary>Music id.</summary>
        public string MusicId => musicId ?? string.Empty;

        /// <summary>Guard angle in degrees.</summary>
        public float GuardAngle => guardAngle;

        /// <summary>Damage reduction while blocking.</summary>
        public float GuardReduction => guardReduction;

        /// <summary>Number of phases.</summary>
        public int PhaseCount => phaseThresholds.Count;

        /// <summary>Health share at which each phase begins (phase 1 = 1.0, then falling).</summary>
        public IReadOnlyList<float> PhaseThresholds => phaseThresholds;

        /// <summary>Helpers called at the start of each phase.</summary>
        public IReadOnlyList<int> AddsPerPhase => addsPerPhase;

        /// <summary>The attacks.</summary>
        public IReadOnlyList<BossAttackEntry> Attacks => attacks;

        /// <summary>Behaviour values for the brain; null (and an error text) if something is missing.</summary>
        /// <param name="problem">Error text, empty on success.</param>
        public BossBrainSettings CreateBrainSettings(out string problem)
        {
            if (baseType == null)
            {
                problem = "Boss '" + BossId + "': the field 'Base Type' is empty.";
                return null;
            }

            var options = new List<BossAttackOption>(attacks.Count);
            for (int i = 0; i < attacks.Count; i++)
            {
                BossAttackOption option = attacks[i] != null ? attacks[i].CreateOption() : null;
                if (option != null)
                {
                    options.Add(option);
                }
            }

            BossBrainSettings defaults = new BossBrainSettings();
            var settings = new BossBrainSettings
            {
                Attacks = options.ToArray(),
                PhaseThresholds = phaseThresholds.ToArray(),
                AddsPerPhase = addsPerPhase.ToArray(),
                AwakenSeconds = awakenSeconds,
                TransitionSeconds = transitionSeconds,
                ParryOpenSeconds = parryOpenSeconds,
                BeamStunSeconds = beamStunSeconds,
                BeamCooldownSeconds = beamCooldownSeconds,
                BeamFromPhase = beamFromPhase,
                RecoverSeconds = recoverSeconds,
                YieldFraction = yieldFraction,
                YieldSeconds = yieldSeconds,
                WalkSpeed = defaults.WalkSpeed,
                RunSpeed = defaults.RunSpeed,
                RunDistance = defaults.RunDistance
            };
            problem = settings.Validate();
            if (problem.Length > 0)
            {
                problem = "Boss '" + BossId + "': " + problem;
                return null;
            }

            return settings;
        }
    }
}
