using System;
using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.Stats;

namespace Aetherfall.Classes
{
    /// <summary>
    /// One starting class as plain data (GDD 03 11.2): id, name, motto and description for the class choice, the six start
    /// attributes (sum 66), the starting kit and the abilities it knows from the start.
    /// </summary>
    public sealed class ClassSpec
    {
        /// <summary>Order of the attributes in <see cref="Attributes"/>: Str, Dex, Int, Wis, Con, Cha (GDD 03 11.2 table).</summary>
        public static readonly StatId[] AttributeOrder =
        {
            StatId.Strength, StatId.Dexterity, StatId.Intelligence, StatId.Wisdom, StatId.Constitution, StatId.Charisma
        };

        /// <summary>Creates the spec.</summary>
        /// <param name="id">Class id, e.g. <c>class.krieger</c>.</param>
        /// <param name="name">Display name.</param>
        /// <param name="motto">One sentence of the class fantasy.</param>
        /// <param name="description">What the class plays like (German, for the class choice).</param>
        /// <param name="attributes">Start attributes in <see cref="AttributeOrder"/>.</param>
        /// <param name="kit">Starting kit.</param>
        /// <param name="startAbilities">Ability ids the class knows from the start (null = none).</param>
        public ClassSpec(string id, string name, string motto, string description, float[] attributes, StartingKit kit,
            IEnumerable<string> startAbilities = null)
        {
            Id = id ?? string.Empty;
            Name = name ?? string.Empty;
            Motto = motto ?? string.Empty;
            Description = description ?? string.Empty;
            Attributes = new float[AttributeOrder.Length];
            for (int i = 0; i < Attributes.Length; i++)
            {
                Attributes[i] = attributes != null && i < attributes.Length ? Math.Max(1f, attributes[i]) : 10f;
            }

            Kit = kit ?? StartingKit.Empty;
            var abilities = new List<string>();
            if (startAbilities != null)
            {
                foreach (string ability in startAbilities)
                {
                    if (!string.IsNullOrEmpty(ability) && !abilities.Contains(ability))
                    {
                        abilities.Add(ability);
                    }
                }
            }

            StartAbilities = abilities;
        }

        /// <summary>Class id.</summary>
        public string Id { get; }

        /// <summary>Display name.</summary>
        public string Name { get; }

        /// <summary>Motto.</summary>
        public string Motto { get; }

        /// <summary>Description.</summary>
        public string Description { get; }

        /// <summary>Start attributes in <see cref="AttributeOrder"/>.</summary>
        public float[] Attributes { get; }

        /// <summary>Starting kit.</summary>
        public StartingKit Kit { get; }

        /// <summary>Abilities the class knows from the start (GDD 03 11.1; the mage: the first spell of each school).</summary>
        public IReadOnlyList<string> StartAbilities { get; }

        /// <summary>Start value of one attribute (10 for non-attributes).</summary>
        /// <param name="stat">Attribute.</param>
        public float Attribute(StatId stat)
        {
            int index = Array.IndexOf(AttributeOrder, stat);
            return index >= 0 ? Attributes[index] : 10f;
        }
    }
}
