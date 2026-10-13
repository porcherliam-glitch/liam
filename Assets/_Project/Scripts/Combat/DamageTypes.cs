using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>Helpers for <see cref="DamageType"/>.</summary>
    public static class DamageTypes
    {
        /// <summary>Number of damage types (array size).</summary>
        public const int Count = 9;

        /// <summary>True for slash, stab and blunt: only these are reduced by armor (GDD 03 8.2 step 8).</summary>
        /// <param name="type">Damage type.</param>
        public static bool IsPhysical(DamageType type)
        {
            return type == DamageType.Slash || type == DamageType.Stab || type == DamageType.Blunt;
        }

        /// <summary>The resistance stat of a damage type (<see cref="StatId.ResistSlash"/> …).</summary>
        /// <param name="type">Damage type.</param>
        public static StatId ResistanceStat(DamageType type)
        {
            return (StatId)((int)StatId.ResistSlash + (int)type);
        }
    }
}
