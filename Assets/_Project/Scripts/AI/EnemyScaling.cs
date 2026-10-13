using System;

namespace Aetherfall.AI
{
    /// <summary>
    /// Enemy values by level (GDD 03 10.6 and 4.9), rounded half away from zero like the GDD examples:
    /// health <c>LP_Typ × V × (1 + 0.15 × (L − 1))</c>, damage <c>S_Typ × V × (1 + 0.12 × (L − 1))</c>, armor
    /// <c>R_Typ × (1 + 0.12 × (L − 1))</c>, poise <c>H_Typ × V × (1 + 0.025 × (L − 1))</c>. Example grey wolf level 8:
    /// 144 health, bite 46, armor 28, poise 35. Pure logic.
    /// </summary>
    public static class EnemyScaling
    {
        /// <summary>Maximum health.</summary>
        /// <param name="baseHealth">LP_Typ.</param>
        /// <param name="variantFactor">V_LP (Normal 1, Elite 2, Champion 4).</param>
        /// <param name="level">Level.</param>
        public static float Health(float baseHealth, float variantFactor, int level)
        {
            return Round((double)baseHealth * variantFactor * (1.0 + 0.15 * (Math.Max(1, level) - 1)));
        }

        /// <summary>Damage per attack.</summary>
        /// <param name="baseDamage">S_Typ.</param>
        /// <param name="variantFactor">V_Schaden (Normal 1, Elite 1.3, Champion 1.5).</param>
        /// <param name="level">Level.</param>
        public static float Damage(float baseDamage, float variantFactor, int level)
        {
            return Round((double)baseDamage * variantFactor * (1.0 + 0.12 * (Math.Max(1, level) - 1)));
        }

        /// <summary>Armor.</summary>
        /// <param name="baseArmor">R_Typ.</param>
        /// <param name="level">Level.</param>
        public static float Armor(float baseArmor, int level)
        {
            return Round(baseArmor * (1.0 + 0.12 * (Math.Max(1, level) - 1)));
        }

        /// <summary>Maximum poise.</summary>
        /// <param name="basePoise">H_Typ.</param>
        /// <param name="variantFactor">V (Normal 1, Elite 1.5, Champion 2).</param>
        /// <param name="level">Level.</param>
        public static float Poise(float basePoise, float variantFactor, int level)
        {
            return Round((double)basePoise * variantFactor * (1.0 + 0.025 * (Math.Max(1, level) - 1)));
        }

        private static float Round(double value)
        {
            // 1e-9 guards against binary representation (143.4999999 for 143.5).
            return (float)Math.Round(value + 1e-9, MidpointRounding.AwayFromZero);
        }
    }
}
