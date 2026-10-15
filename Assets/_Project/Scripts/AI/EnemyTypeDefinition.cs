using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Enemy type as data (architecture 5.1 "EnemyTypeDefinition" in Aetherfall.AI; GDD 01 11, GDD 03 9 and 10.6): id and
    /// variant, level, base values (health, damage, armor, poise) with the level formulas, resistances, Aether-corrupted
    /// modifier (+25 % damage as Aether, crystal core as weak point), speeds, senses, behaviour (leash, flight, ring) and the
    /// attacks. Lives in <c>Assets/_Project/Data/Enemies/</c>.
    /// </summary>
    /// <remarks>
    /// Grey wolf (<c>enemy.wolf.grauwolf</c>, GDD 03 8.3/10.6): LP 70, bite 25, armor 15, poise 30, fire −0.5; level 8 →
    /// 144 LP, bite 46, armor 28, poise 35. Speeds, perception factor of wild animals (1.5) and attack timings are
    /// Vorschlaege of this step. TODO (content database step): <c>EnemyBrainDefinition</c> as own asset, variants as
    /// modifier packages, prefab reference, loot table.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Gegner/Gegnertyp", fileName = "EnemyType", order = 20)]
    public sealed class EnemyTypeDefinition : ScriptableObject, IContentIdProvider
    {
        [Header("Identität (GDD 01, 11)")]
        [Tooltip("Typ-ID, z. B. enemy.wolf.grauwolf.")]
        [SerializeField] private string enemyTypeId = "enemy.neu";

        [Tooltip("Varianten-ID: normal, elite, champion oder aether_verderbt.")]
        [SerializeField] private string variantId = "normal";

        [Tooltip("Anzeigename (Debug).")]
        [SerializeField] private string displayName = "Gegner";

        [Tooltip("Stufe, mit der dieser Gegner kämpft (fest je Gebiet, §20.4). Bei Elite +2 und Champion +3 schon eingerechnet (GDD 03, 9.7) – Beute und XP übernehmen sie unverändert.")]
        [Range(1, 80)] [SerializeField] private int level = 8;

        [Tooltip("Loot-Tabelle (vorerst leer, kommt mit dem Loot-System).")]
        [SerializeField] private string lootTableId = "";

        [Header("Grundwerte (GDD 03, 10.6)")]
        [Tooltip("LP_Typ (Grauwolf 70).")]
        [Min(1f)] [SerializeField] private float baseHealth = 70f;

        [Tooltip("Varianten-Faktor LP (Normal 1, Elite 2, Champion 4).")]
        [Min(0.1f)] [SerializeField] private float healthVariantFactor = 1f;

        [Tooltip("S_Typ: Schaden je Angriff (Grauwolf: Biss 25).")]
        [Min(0f)] [SerializeField] private float baseDamage = 25f;

        [Tooltip("Varianten-Faktor Schaden (Normal 1, Elite 1,3, Champion 1,5).")]
        [Min(0.1f)] [SerializeField] private float damageVariantFactor = 1f;

        [Tooltip("Schadensart der Angriffe (Biss: Stich).")]
        [SerializeField] private DamageType damageType = DamageType.Stab;

        [Tooltip("R_Typ: Rüstung (Grauwolf 15).")]
        [Min(0f)] [SerializeField] private float baseArmor = 15f;

        [Tooltip("H_Typ: Haltung (Grauwolf 30, GDD 03, 4.9).")]
        [Min(1f)] [SerializeField] private float basePoise = 30f;

        [Tooltip("Varianten-Faktor Haltung (Normal 1, Elite 1,5, Champion 2).")]
        [Min(0.1f)] [SerializeField] private float poiseVariantFactor = 1f;

        [Tooltip("Haltungswert der eigenen Angriffe gegen die Standfestigkeit des Spielers (Vorschlag Wolf: 12).")]
        [Min(0f)] [SerializeField] private float attackPoise = 12f;

        [Tooltip("Resistenzen und Schwächen (Grauwolf: Feuer −0,5).")]
        [SerializeField] private List<ResistanceEntry> resistances = new List<ResistanceEntry>();

        [Tooltip("Familie (GDD 03, 7.2): Tiere und Schwärme fliehen 2 s vor Brennen; Untote und Konstrukte sind immun gegen Gift und Blutung.")]
        [SerializeField] private EnemyKind kind = EnemyKind.Beast;

        [Tooltip("Statusresistenz (GDD 03, 7.1): Normal 0, Elite 50, Champion 100, Boss 200–400. Schwelle = 100 × (1 + Res/100).")]
        [Min(0f)] [SerializeField] private float statusResistance = 0f;

        [Header("Aether-verderbt (GDD 01, 11.2)")]
        [Tooltip("Zusätzlicher Schaden als Aether-Anteil (Aether-verderbt: 0,25 = +25 %).")]
        [Range(0f, 1f)] [SerializeField] private float aetherDamageShare = 0f;

        [Tooltip("Kristallkern als Schwachpunkt-Trefferzone (×2). Bricht er, ist der Gegner 3 s betäubt und verliert den Aether-Bonus.")]
        [SerializeField] private bool hasCrystalCore = false;

        [Tooltip("Der Kern bricht, wenn Treffer auf den Kern zusammen so viel Schaden machen (Anteil der max. LP, Vorschlag 0,25).")]
        [Range(0.05f, 1f)] [SerializeField] private float crystalCoreBreakFraction = 0.25f;

        [Header("Kampf")]
        [Tooltip("Kosten an Angriffs-Token (GDD 03, 9.3: Schwarm/Normal 1, Elite 2, Champion 3).")]
        [Range(1, 3)] [SerializeField] private int tokenCost = 1;

        [Tooltip("Haltungsverlust bei perfekter Parade, Anteil der max. Haltung (Normal 0,35).")]
        [Range(0f, 1f)] [SerializeField] private float parryPoiseLoss = 0.35f;

        [Tooltip("So lange ist der Gegner nach einer perfekten Parade offen, in Sekunden (1,2).")]
        [Range(0f, 3f)] [SerializeField] private float parryOpenSeconds = 1.2f;

        [Tooltip("Angriffe (3–4 bei Normalgegnern, GDD 03, 9.5).")]
        [SerializeField] private List<EnemyAttackEntry> attacks = new List<EnemyAttackEntry>();

        [Header("Bewegung (Vorschlag)")]
        [Tooltip("Gehen (Patrouille, Suche) in m/s.")]
        [Min(0.1f)] [SerializeField] private float walkSpeed = 1.8f;

        [Tooltip("Rennen (Annähern, Rückkehr, Flucht) in m/s. Wolf 6,0: langsamer als der sprintende Spieler (7,0).")]
        [Min(0.1f)] [SerializeField] private float runSpeed = 6f;

        [Tooltip("Umkreisen und Zurückweichen in m/s.")]
        [Min(0.1f)] [SerializeField] private float circleSpeed = 2.5f;

        [Tooltip("Drehrate in Grad pro Sekunde.")]
        [Min(10f)] [SerializeField] private float turnRate = 360f;

        [Header("Wahrnehmung (GDD 03, 9.2)")]
        [Tooltip("Halber Winkel des Hauptkegels (50° = 100° Kegel).")]
        [Range(5f, 90f)] [SerializeField] private float sightHalfAngle = 50f;

        [Tooltip("Reichweite des Hauptkegels bei Tag in Metern (22).")]
        [Min(1f)] [SerializeField] private float sightRange = 22f;

        [Tooltip("Halber Winkel des Randbereichs (80° = 160°), halbe Rate.")]
        [Range(5f, 180f)] [SerializeField] private float peripheralHalfAngle = 80f;

        [Tooltip("Reichweite des Randbereichs in Metern (10).")]
        [Min(0f)] [SerializeField] private float peripheralRange = 10f;

        [Tooltip("Nahbereich rundum in Metern (2,5): Laufen/Sprinten wird sofort bemerkt.")]
        [Min(0f)] [SerializeField] private float nearRadius = 2.5f;

        [Tooltip("Varianten-Faktor der Entdeckung (Normal 1,0 · Elite 1,2 · Wache 1,3 · Wildtier 1,5).")]
        [Range(0.1f, 3f)] [SerializeField] private float perceptionFactor = 1.5f;

        [Tooltip("Faktor auf alle Geräusch-Radien (1 = normal).")]
        [Range(0f, 3f)] [SerializeField] private float hearingFactor = 1f;

        [Header("Verhalten (GDD 03, 9.1–9.4)")]
        [Tooltip("Leash: Rückkehr ab dieser Entfernung vom Anker in Metern (40).")]
        [Min(5f)] [SerializeField] private float leashDistance = 40f;

        [Tooltip("Leash: Rückkehr nach so vielen Sekunden ohne Erreichbarkeit (8).")]
        [Min(1f)] [SerializeField] private float unreachableSeconds = 8f;

        [Tooltip("Flucht unter diesem LP-Anteil (Tiere 0,25; 0 = nie). Einmal je Leben, kurz.")]
        [Range(0f, 0.9f)] [SerializeField] private float fleeHealthFraction = 0.25f;

        [Tooltip("Dauer der Flucht in Sekunden, danach Kampf (gestellt) oder Rückkehr.")]
        [Min(0.5f)] [SerializeField] private float fleeSeconds = 3f;

        [Tooltip("Warte-Ring ohne Token: innerer Radius in Metern (4).")]
        [Min(1f)] [SerializeField] private float ringMin = 4f;

        [Tooltip("Warte-Ring ohne Token: äußerer Radius in Metern (7).")]
        [Min(1f)] [SerializeField] private float ringMax = 7f;

        /// <summary>Type id.</summary>
        public string EnemyTypeId => enemyTypeId;

        /// <summary>The type id as content id (quest validation knows <c>enemy.…</c> ids from these assets).</summary>
        public string ContentId => enemyTypeId ?? string.Empty;

        /// <summary>Variant id.</summary>
        public string VariantId => variantId;

        /// <summary>Display name.</summary>
        public string DisplayName => displayName;

        /// <summary>Level the enemy fights with (variant bonus included); also <c>EnemyKilled.EnemyLevel</c>.</summary>
        public int Level => level;

        /// <summary>Loot table id (empty for now).</summary>
        public string LootTableId => lootTableId;

        /// <summary>Main damage type of the attacks.</summary>
        public DamageType DamageType => damageType;

        /// <summary>Additional damage share as Aether (Aether-corrupted: 0.25).</summary>
        public float AetherDamageShare => aetherDamageShare;

        /// <summary>Family of the enemy (status reactions and immunities).</summary>
        public EnemyKind Kind => kind;

        /// <summary>Status resistance (threshold = 100 × (1 + Res/100)).</summary>
        public float StatusResistance => statusResistance;

        /// <summary>True for Aether-corrupted variants (immune to the corruption bar, hits add +5 corruption).</summary>
        public bool IsAetherCorrupted => aetherDamageShare > 0f || variantId == "aether_verderbt";

        /// <summary>Poise value of the own attacks.</summary>
        public float AttackPoise => attackPoise;

        /// <summary>True for Aether-corrupted enemies with a crystal core.</summary>
        public bool HasCrystalCore => hasCrystalCore;

        /// <summary>Damage on the core (share of max health) that breaks it.</summary>
        public float CrystalCoreBreakFraction => crystalCoreBreakFraction;

        /// <summary>Poise lost when parried.</summary>
        public float ParryPoiseLoss => parryPoiseLoss;

        /// <summary>Time open after being parried.</summary>
        public float ParryOpenSeconds => parryOpenSeconds;

        /// <summary>Turn rate in degrees per second.</summary>
        public float TurnRate => turnRate;

        /// <summary>Maximum health at the level (GDD 03 10.6).</summary>
        public float MaxHealth => EnemyScaling.Health(baseHealth, healthVariantFactor, level);

        /// <summary>Damage per attack at the level (GDD 03 10.6).</summary>
        public float Damage => EnemyScaling.Damage(baseDamage, damageVariantFactor, level);

        /// <summary>Armor at the level (GDD 03 10.6).</summary>
        public float Armor => EnemyScaling.Armor(baseArmor, level);

        /// <summary>Maximum poise at the level (GDD 03 4.9).</summary>
        public float MaxPoise => EnemyScaling.Poise(basePoise, poiseVariantFactor, level);

        /// <summary>Resistances as profile for the damage calculation.</summary>
        public ResistanceProfile CreateResistances()
        {
            var profile = default(ResistanceProfile);
            for (int i = 0; i < resistances.Count; i++)
            {
                ResistanceEntry entry = resistances[i];
                if (entry == null)
                {
                    continue;
                }

                profile = profile.With(entry.DamageType, entry.Value);
                if (entry.Immune)
                {
                    profile = profile.WithImmunity(entry.DamageType);
                }
            }

            return profile;
        }

        /// <summary>Behaviour values for the brain; null (and an error text) if no attack is set.</summary>
        /// <param name="guard">Guard instead of patrol.</param>
        /// <param name="problem">Error text, empty on success.</param>
        public EnemyBrainSettings CreateBrainSettings(bool guard, out string problem)
        {
            var options = new List<EnemyAttackOption>(attacks.Count);
            for (int i = 0; i < attacks.Count; i++)
            {
                EnemyAttackOption option = attacks[i] != null ? attacks[i].CreateOption() : null;
                if (option != null)
                {
                    options.Add(option);
                }
            }

            var settings = new EnemyBrainSettings
            {
                Perception = new PerceptionSettings(sightHalfAngle, sightRange, peripheralHalfAngle, peripheralRange, nearRadius, perceptionFactor,
                    hearingFactor),
                WalkSpeed = walkSpeed,
                RunSpeed = runSpeed,
                CircleSpeed = circleSpeed,
                RingMin = ringMin,
                RingMax = Mathf.Max(ringMin, ringMax),
                LeashDistance = leashDistance,
                UnreachableSeconds = unreachableSeconds,
                FleeHealthFraction = fleeHealthFraction,
                FleeSeconds = fleeSeconds,
                TokenCost = tokenCost,
                Guard = guard,
                Attacks = options.ToArray()
            };
            problem = settings.Validate();
            return problem.Length == 0 ? settings : null;
        }
    }
}
