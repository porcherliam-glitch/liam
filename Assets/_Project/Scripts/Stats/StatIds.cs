using System;

namespace Aetherfall.Stats
{
    /// <summary>Helpers for <see cref="StatId"/>: the list of all ids, the array capacity and group checks.</summary>
    public static class StatIds
    {
        /// <summary>Size of arrays indexed by <c>(int)StatId</c>; larger than the highest enum value.</summary>
        public const int Capacity = 64;

        /// <summary>All defined stats except <see cref="StatId.None"/>, in enum order (read-only by convention).</summary>
        public static readonly StatId[] All = CreateAll();

        /// <summary>The six main attributes in GDD order.</summary>
        public static readonly StatId[] Attributes =
        {
            StatId.Strength, StatId.Dexterity, StatId.Intelligence, StatId.Wisdom, StatId.Constitution, StatId.Charisma
        };

        /// <summary>True for the six main attributes (Strength to Charisma).</summary>
        /// <param name="id">Stat to check.</param>
        public static bool IsAttribute(StatId id)
        {
            return id >= StatId.Strength && id <= StatId.Charisma;
        }

        /// <summary>True for the nine resistance stats (<see cref="StatId.ResistSlash"/> to <see cref="StatId.ResistAether"/>).</summary>
        /// <param name="id">Stat to check.</param>
        public static bool IsResistance(StatId id)
        {
            return id >= StatId.ResistSlash && id <= StatId.ResistAether;
        }

        /// <summary>True if <paramref name="id"/> is a defined value other than <see cref="StatId.None"/>.</summary>
        /// <param name="id">Stat to check.</param>
        public static bool IsValid(StatId id)
        {
            int index = (int)id;
            return index > 0 && index < Capacity && Enum.IsDefined(typeof(StatId), id);
        }

        private static StatId[] CreateAll()
        {
            Array values = Enum.GetValues(typeof(StatId));
            var result = new StatId[values.Length - 1];
            int count = 0;
            foreach (StatId id in values)
            {
                if (id != StatId.None)
                {
                    result[count++] = id;
                }
            }

            return result;
        }
    }
}
