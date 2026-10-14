using System;

namespace Aetherfall.World.Gameplay
{
    /// <summary>Damage of environment traps as a share of the maximum health (GDD 02 11.7: arrow trap 10 %). Pure logic.</summary>
    public static class TrapDamage
    {
        /// <summary>Damage of one shot: <paramref name="fraction"/> of <paramref name="maxHealth"/>, at least 1, never negative.</summary>
        /// <param name="maxHealth">Maximum health of the target.</param>
        /// <param name="fraction">Share from 0 to 1.</param>
        /// <returns>Damage in health points.</returns>
        public static float Amount(float maxHealth, float fraction)
        {
            if (!(maxHealth > 0f) || !(fraction > 0f))
            {
                return 0f;
            }

            return Math.Max(1f, maxHealth * Math.Min(1f, fraction));
        }
    }
}
