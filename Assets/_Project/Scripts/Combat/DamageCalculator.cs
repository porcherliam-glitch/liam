using System;
using Aetherfall.Events;
using Aetherfall.Stats;
using Aetherfall.Utilities;

namespace Aetherfall.Combat
{
    /// <summary>
    /// The central damage formula (§9.7, GDD 03 8.2, architecture 11.4) as pure C#: no scene, no MonoBehaviour, all
    /// randomness through <see cref="IRandom"/>. One call computes damage, poise damage and status build-up of a hit.
    /// </summary>
    /// <remarks>
    /// <para>Pipeline per damage share (steps 1–11), then the sum (step 12):</para>
    /// <list type="number">
    /// <item>Raw value: base × attack multiplier.</item>
    /// <item>Attribute scaling: × (1 + 0.025 × Σ wᵢ × E(Attributeᵢ)).</item>
    /// <item>Additive bonuses: × (1 + Σ b).</item>
    /// <item>Hit zone: body 1.0, limb 0.9, head 1.5 (ranged 1.75), weak point 2.0.</item>
    /// <item>Critical: × critical damage if the roll is below the critical chance (one roll per hit; +5 percentage points if the primary type is stab).</item>
    /// <item>Level difference: × clamp(1 + 0.03 × (L_attacker − L_defender); 0.70; 1.15).</item>
    /// <item>Resistance/weakness: × (1 − Res), Res clamped to −1.0 … 0.75 (player side) or 0.9 (enemies); immunity = 0.</item>
    /// <item>Armor (physical only): reduction = R_eff ÷ (R_eff + 10 × L_attacker), at most 85 %; R_eff = armor × (1 − penetration) × (0.8 for blunt).</item>
    /// <item>Block: × (1 − block reduction, physical or elemental); perfect parry = 0.</item>
    /// <item>Defender multipliers: × Π (1 + vₖ), at least 0.1.</item>
    /// <item>Difficulty: × G, only if the defender is player side.</item>
    /// <item>Result: sum, rounded half away from zero, at least 1 – 0 only for immunity or a perfect parry.</item>
    /// </list>
    /// <para>Interpretations (Vorschlag, documented in the guide 04): resistance penetration is subtracted from positive
    /// resistances; the poise factor of a mixed packet is the share-weighted mean of the type factors.</para>
    /// </remarks>
    public sealed class DamageCalculator
    {
        private readonly DamageBalancing _balancing;

        /// <summary>Creates the calculator.</summary>
        /// <param name="balancing">Constants; null = <see cref="DamageBalancing.CreateDefault"/>.</param>
        /// <exception cref="ArgumentException">A balancing value is out of range.</exception>
        public DamageCalculator(DamageBalancing balancing = null)
        {
            _balancing = balancing ?? DamageBalancing.CreateDefault();
            string problem = _balancing.Validate();
            if (problem.Length > 0)
            {
                throw new ArgumentException("Invalid damage balancing: " + problem, nameof(balancing));
            }
        }

        /// <summary>The constants in use.</summary>
        public DamageBalancing Balancing => _balancing;

        /// <summary>Computes one hit. Allocation-free; deterministic for the same request and random sequence.</summary>
        /// <param name="request">Attacker, defender, base packet and attack properties.</param>
        /// <param name="random">Source of the critical roll (exactly one value per hit unless no roll is needed).</param>
        /// <exception cref="ArgumentNullException"><paramref name="random"/> is null.</exception>
        public DamageResult Calculate(in DamageRequest request, IRandom random)
        {
            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            DamageBalancing b = _balancing;
            AttackerSnapshot attacker = request.Attacker;
            DefenderSnapshot defender = request.Defender;
            DamagePacket packet = request.Base;
            HitFlags flags = ZoneFlags(request.Zone);

            // Step 9 (perfect parry): no damage, no poise damage, no status build-up.
            if (defender.Block == BlockState.PerfectParry)
            {
                return new DamageResult(0, 0f, 0f, StatusBuildup.None, flags | HitFlags.Parried, 0f);
            }

            bool blocking = defender.Block == BlockState.Blocking;
            if (blocking)
            {
                flags |= HitFlags.Blocked;
            }

            float attackerLevel = Math.Max(1f, attacker.Level);
            float defenderLevel = Math.Max(1f, defender.Level);

            // Factors that are the same for every share.
            float attackMultiplier = Math.Max(0f, request.AttackMultiplier);
            float scaling = Math.Max(0f, StatFormulas.AttackScaling(request.Scaling.WeightedEffectivePoints(attacker.Attributes)));
            float bonus = Math.Max(0f, 1f + attacker.DamageBonus);
            float zone = b.ZoneMultiplier(request.Zone, request.IsRanged);
            bool critical = RollCritical(request, packet, random);
            float criticalFactor = critical ? Clamp(attacker.CritDamage, 1f, b.CritDamageCap) : 1f;
            if (critical)
            {
                flags |= HitFlags.Critical;
            }

            float levelFactor = Clamp(1f + b.LevelFactorPerLevel * (attackerLevel - defenderLevel), b.LevelFactorMin, b.LevelFactorMax);
            float defenderFactor = Math.Max(b.MinimumIncomingDamageMultiplier, defender.IncomingDamageMultiplier);
            float difficulty = defender.IsPlayerSide ? Math.Max(0f, request.EnemyDamageFactor) : 1f;
            float resistanceMax = defender.IsPlayerSide ? b.PlayerResistanceMax : b.EnemyResistanceMax;
            float common = attackMultiplier * scaling * bonus * zone * criticalFactor * levelFactor;

            double total = 0.0;
            int damagingShares = 0;
            int immuneShares = 0;
            for (int i = 0; i < DamageTypes.Count; i++)
            {
                var type = (DamageType)i;
                float amount = packet.Get(type);
                if (!(amount > 0f))
                {
                    continue;
                }

                damagingShares++;
                if (defender.Resistances.IsImmune(type))
                {
                    immuneShares++;
                    flags |= HitFlags.Immune;
                    continue;
                }

                // Steps 1-6.
                double value = (double)amount * common;

                // Step 7: resistance / weakness.
                float resistance = defender.Resistances.Get(type);
                if (resistance > 0f)
                {
                    resistance = Math.Max(0f, resistance - Math.Max(0f, attacker.ResistancePenetration));
                }

                resistance = Clamp(resistance, b.ResistanceMin, resistanceMax);
                if (resistance < 0f)
                {
                    flags |= HitFlags.Weakness;
                }
                else if (resistance > 0f)
                {
                    flags |= HitFlags.Resisted;
                }

                value *= 1.0 - resistance;

                // Step 8: armor with diminishing returns, physical damage only.
                bool physical = DamageTypes.IsPhysical(type);
                if (physical)
                {
                    value *= 1.0 - ArmorReduction(defender.Armor, attacker.ArmorPenetration, type == DamageType.Blunt, attackerLevel);
                }

                // Step 9: block.
                if (blocking)
                {
                    float reduction = physical ? defender.BlockPhysicalReduction : defender.BlockElementalReduction;
                    value *= 1.0 - Clamp(reduction, 0f, 1f);
                }

                // Steps 10 and 11.
                value *= defenderFactor * difficulty;
                total += value;
            }

            float rawDamage = (float)total;
            int damage;
            if (damagingShares == 0 || immuneShares == damagingShares)
            {
                damage = 0; // nothing to deal, or everything hit an immunity: no minimum damage
            }
            else
            {
                damage = Math.Max(b.MinimumDamage, (int)Math.Round(total, MidpointRounding.AwayFromZero));
            }

            float poise = blocking ? 0f : PoiseDamage(request, packet);
            float blockStamina = blocking ? Math.Max(0f, request.StaminaDamage) * (1f - Clamp(defender.BlockStability, 0f, 1f)) : 0f;
            StatusBuildup buildup = request.Buildup;
            if (defender.IsPlayerSide)
            {
                buildup = buildup.Scaled(request.EnemyStatusBuildupFactor);
            }

            return new DamageResult(damage, rawDamage, poise, buildup, flags, blockStamina);
        }

        /// <summary>
        /// Armor reduction of GDD 03 8.2 step 8: <c>R_eff ÷ (R_eff + K × L_attacker)</c>, at most <see cref="DamageBalancing.ArmorReductionCap"/>.
        /// </summary>
        /// <param name="armor">Armor of the defender.</param>
        /// <param name="penetration">Armor penetration of the attacker (fraction).</param>
        /// <param name="blunt">True for blunt damage (armor counts 80 %).</param>
        /// <param name="attackerLevel">Level of the attacker (at least 1).</param>
        public float ArmorReduction(float armor, float penetration, bool blunt, float attackerLevel)
        {
            float effective = Math.Max(0f, armor) * (1f - Clamp(penetration, 0f, 1f)) * (blunt ? _balancing.BluntArmorFactor : 1f);
            if (!(effective > 0f))
            {
                return 0f;
            }

            if (float.IsPositiveInfinity(effective))
            {
                return _balancing.ArmorReductionCap;
            }

            float reduction = effective / (effective + _balancing.ArmorConstant * Math.Max(1f, attackerLevel));
            return Math.Min(reduction, _balancing.ArmorReductionCap);
        }

        /// <summary>Level difference factor of step 6.</summary>
        /// <param name="attackerLevel">Attacker level.</param>
        /// <param name="defenderLevel">Defender level.</param>
        public float LevelFactor(float attackerLevel, float defenderLevel)
        {
            return Clamp(1f + _balancing.LevelFactorPerLevel * (attackerLevel - defenderLevel), _balancing.LevelFactorMin, _balancing.LevelFactorMax);
        }

        private bool RollCritical(in DamageRequest request, in DamagePacket packet, IRandom random)
        {
            if (request.ForceCritical)
            {
                return true;
            }

            if (request.SuppressCritical || packet.IsEmpty)
            {
                return false;
            }

            float chance = request.Attacker.CritChance;
            if (packet.PrimaryType == DamageType.Stab)
            {
                chance += _balancing.StabCritChanceBonus;
            }

            chance = Clamp(chance, 0f, _balancing.CritChanceCap);
            return random.NextFloat() < chance;
        }

        private float PoiseDamage(in DamageRequest request, in DamagePacket packet)
        {
            float weaponPoise = Math.Max(0f, request.WeaponPoise);
            float total = packet.Total;
            if (!(weaponPoise > 0f) || !(total > 0f))
            {
                return 0f;
            }

            float typeFactor;
            if (request.IsExplosion)
            {
                typeFactor = _balancing.PoiseFactorExplosion;
            }
            else
            {
                typeFactor = 0f;
                for (int i = 0; i < DamageTypes.Count; i++)
                {
                    var type = (DamageType)i;
                    typeFactor += packet.Get(type) / total * _balancing.PoiseFactor(type);
                }
            }

            float resistance = Clamp(request.Defender.PoiseResistance, 0f, 1f);
            return weaponPoise * Math.Max(0f, request.PoiseMultiplier) * typeFactor * (1f - resistance);
        }

        private static HitFlags ZoneFlags(HitZone zone)
        {
            switch (zone)
            {
                case HitZone.Head: return HitFlags.Head;
                case HitZone.WeakPoint: return HitFlags.WeakPoint;
                default: return HitFlags.None;
            }
        }

        private static float Clamp(float value, float min, float max)
        {
            if (value < min)
            {
                return min;
            }

            return value > max ? max : value;
        }
    }
}
