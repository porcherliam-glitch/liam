using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Input of <see cref="DamageCalculator.Calculate"/> (architecture 11.4, GDD 03 8.2): attacker and defender snapshots,
    /// the base packet and the properties of the attack. Create it with <see cref="Create"/>, which sets all factors to
    /// their neutral value 1, then set what the attack needs.
    /// </summary>
    public struct DamageRequest
    {
        /// <summary>Attacker values at the moment of the hit.</summary>
        public AttackerSnapshot Attacker { get; set; }

        /// <summary>Defender values at the moment of the hit.</summary>
        public DefenderSnapshot Defender { get; set; }

        /// <summary>Base damage per type: weapon damage W (step 1) or the reference value of an ability.</summary>
        public DamagePacket Base { get; set; }

        /// <summary>
        /// M_Angriff for weapon attacks (light 1.0, combo finisher 1.2, heavy 1.5/1.9/2.3, sprint 1.3, jump 1.2, plunge
        /// 1.6/2.5, counter 3.0) or the coefficient of an ability (architecture 11.4 calls it AbilityMultiplier). Step 1.
        /// </summary>
        public float AttackMultiplier { get; set; }

        /// <summary>Attribute weights of the weapon (step 2); <see cref="AttributeScaling.None"/> for spells and enemies.</summary>
        public AttributeScaling Scaling { get; set; }

        /// <summary>Hit zone (step 4).</summary>
        public HitZone Zone { get; set; }

        /// <summary>True for ranged hits and projectiles (head × 1.75 instead of × 1.5).</summary>
        public bool IsRanged { get; set; }

        /// <summary>True for explosions (poise factor 1.5).</summary>
        public bool IsExplosion { get; set; }

        /// <summary>Guaranteed critical hit without roll (sneak attack, GDD 03 4.6).</summary>
        public bool ForceCritical { get; set; }

        /// <summary>No critical roll at all (counter attack: "kein zusaetzlicher Krit-Wurf", GDD 03 4.8).</summary>
        public bool SuppressCritical { get; set; }

        /// <summary>Poise value of the weapon H_Waffe (GDD 03 4.9 / 5.1, one-handed sword 10).</summary>
        public float WeaponPoise { get; set; }

        /// <summary>M_Angriff for poise (light 1.0, combo finisher 1.5, heavy 1.5, charged 2.0/2.5 …; GDD 03 4.9).</summary>
        public float PoiseMultiplier { get; set; }

        /// <summary>Stamina damage of the attack against a block (GDD 03 4.7).</summary>
        public float StaminaDamage { get; set; }

        /// <summary>Status build-up carried by the attack (GDD 03 7.1).</summary>
        public StatusBuildup Buildup { get; set; }

        /// <summary>Difficulty factor G on damage, applied only if the defender is player side (step 11; Normal 1.0, Hard 1.35).</summary>
        public float EnemyDamageFactor { get; set; }

        /// <summary>Difficulty factor on status build-up against the player (GDD 03 9.7; Normal 1.0).</summary>
        public float EnemyStatusBuildupFactor { get; set; }

        /// <summary>Creates a request with neutral factors (attack, poise and difficulty factors 1).</summary>
        /// <param name="attacker">Attacker snapshot.</param>
        /// <param name="defender">Defender snapshot.</param>
        /// <param name="basePacket">Base damage per type.</param>
        public static DamageRequest Create(in AttackerSnapshot attacker, in DefenderSnapshot defender, in DamagePacket basePacket)
        {
            return new DamageRequest
            {
                Attacker = attacker,
                Defender = defender,
                Base = basePacket,
                AttackMultiplier = 1f,
                PoiseMultiplier = 1f,
                EnemyDamageFactor = 1f,
                EnemyStatusBuildupFactor = 1f
            };
        }
    }
}
