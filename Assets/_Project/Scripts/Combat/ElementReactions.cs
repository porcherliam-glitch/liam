using System;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Numbers of the element reactions of GDD 03 6.6 as pure C#: the explosion of fire on oil (#2: 3 m, 150 % of the trigger
    /// with a level floor, fire + blunt, burning 60, poise 40, the oil burns 8 s), the chain explosion of a powder keg (#16:
    /// 5 m, poise 100), the fire area (burning 20 per second) and the oil puddle (15 s "Ölig"). Technik/02 calls this the
    /// <c>ElementReactionTable</c>; the scene parts are <see cref="ExplosiveObject"/> and <see cref="ElementArea"/>.
    /// </summary>
    public static class ElementReactions
    {
        /// <summary>Radius of an oil explosion in metres.</summary>
        public const float ExplosionRadius = 3f;

        /// <summary>Factor on the trigger damage.</summary>
        public const float ExplosionTriggerFactor = 1.5f;

        /// <summary>Floor of the explosion damage at level 1 (20 × (1 + 0.12 × (L − 1))).</summary>
        public const float ExplosionFloorLevel1 = 20f;

        /// <summary>Growth of the floor per level above 1.</summary>
        public const float ExplosionFloorPerLevel = 0.12f;

        /// <summary>Share of the explosion damage that is fire (the rest is blunt).</summary>
        public const float ExplosionFireShare = 0.6f;

        /// <summary>Burning build-up of an oil explosion.</summary>
        public const float ExplosionBurning = 60f;

        /// <summary>Stun build-up of an explosion (GDD 03 7.2 "Explosionen 30").</summary>
        public const float ExplosionStun = 30f;

        /// <summary>Poise damage of an oil explosion.</summary>
        public const float ExplosionPoise = 40f;

        /// <summary>Knockback of an oil explosion in metres.</summary>
        public const float ExplosionKnockback = 2f;

        /// <summary>The oil burns this long after the explosion.</summary>
        public const float OilBurnSeconds = 8f;

        /// <summary>Radius of a powder keg (#16).</summary>
        public const float KegRadius = 5f;

        /// <summary>Poise damage of a powder keg.</summary>
        public const float KegPoise = 100f;

        /// <summary>Knockback of a powder keg in metres.</summary>
        public const float KegKnockback = 3f;

        /// <summary>Burning build-up of a powder keg (like the explosive arrow, GDD 03 6.2).</summary>
        public const float KegBurning = 20f;

        /// <summary>Delay between one explosion and the next in a chain, in seconds.</summary>
        public const float ChainDelaySeconds = 0.15f;

        /// <summary>Burning build-up per second inside a fire area (GDD 03 7.2 "Feuerfläche 20 pro s").</summary>
        public const float FireAreaBuildupPerSecond = 20f;

        /// <summary>Radius of a spilled oil puddle.</summary>
        public const float OilPuddleRadius = 3f;

        /// <summary>How long a spilled puddle stays (Vorschlag).</summary>
        public const float OilPuddleSeconds = 60f;

        /// <summary>How long a target stays "Ölig" after touching oil.</summary>
        public const float OilySeconds = 15f;

        /// <summary>Damage of an explosion: 150 % of the trigger, at least the level floor (GDD 03 6.6 #2).</summary>
        /// <param name="triggerDamage">Damage of the hit that set it off.</param>
        /// <param name="attackerLevel">Level of the attacker who set it off.</param>
        public static float ExplosionDamage(float triggerDamage, int attackerLevel)
        {
            float floor = ExplosionFloorLevel1 * (1f + ExplosionFloorPerLevel * (Math.Max(1, attackerLevel) - 1));
            return Math.Max(Math.Max(0f, triggerDamage) * ExplosionTriggerFactor, floor);
        }

        /// <summary>The damage packet of an explosion: 60 % fire, 40 % blunt.</summary>
        /// <param name="damage">Total damage.</param>
        public static DamagePacket ExplosionPacket(float damage)
        {
            float total = Math.Max(0f, damage);
            return DamagePacket.Single(DamageType.Fire, total * ExplosionFireShare).With(DamageType.Blunt, total * (1f - ExplosionFireShare));
        }

        /// <summary>The attack of an oil explosion (#2).</summary>
        public static AttackSpec CreateOilExplosion()
        {
            return CreateExplosion("attack.reaktion.explosion", ExplosionKnockback, ExplosionBurning);
        }

        /// <summary>The attack of a powder keg (#16).</summary>
        public static AttackSpec CreateKegExplosion()
        {
            return CreateExplosion("attack.reaktion.kettenexplosion", KegKnockback, KegBurning);
        }

        private static AttackSpec CreateExplosion(string id, float knockback, float burning)
        {
            AttackSpec spec = AttackSpec.Create(id, 0.01f, 0.05f, 0.1f);
            spec.Kind = AttackKind.Heavy;
            spec.IsExplosion = true;
            spec.Unparryable = true;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.PoiseMultiplier = 1f;
            spec.KnockbackDistance = knockback;
            spec.MaxTurnDegrees = 0f;
            spec.Buildup = StatusBuildup.None.With(StatusEffectId.Burning, burning).With(StatusEffectId.Stun, ExplosionStun);
            return spec;
        }
    }
}
