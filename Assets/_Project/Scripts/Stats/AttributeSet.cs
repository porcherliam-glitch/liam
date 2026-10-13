namespace Aetherfall.Stats
{
    /// <summary>
    /// Values of the six main attributes at one moment (GDD 03 10.2), e.g. for the attacker snapshot of a hit.
    /// Plain values, no reference to the collection.
    /// </summary>
    public readonly struct AttributeSet
    {
        /// <summary>Strength.</summary>
        public readonly float Strength;

        /// <summary>Dexterity.</summary>
        public readonly float Dexterity;

        /// <summary>Intelligence.</summary>
        public readonly float Intelligence;

        /// <summary>Wisdom.</summary>
        public readonly float Wisdom;

        /// <summary>Constitution.</summary>
        public readonly float Constitution;

        /// <summary>Charisma.</summary>
        public readonly float Charisma;

        /// <summary>Creates the set.</summary>
        /// <param name="strength">Strength.</param>
        /// <param name="dexterity">Dexterity.</param>
        /// <param name="intelligence">Intelligence.</param>
        /// <param name="wisdom">Wisdom.</param>
        /// <param name="constitution">Constitution.</param>
        /// <param name="charisma">Charisma.</param>
        public AttributeSet(float strength, float dexterity, float intelligence, float wisdom, float constitution, float charisma)
        {
            Strength = strength;
            Dexterity = dexterity;
            Intelligence = intelligence;
            Wisdom = wisdom;
            Constitution = constitution;
            Charisma = charisma;
        }

        /// <summary>All attributes at the neutral value 10 (effective points 0).</summary>
        public static AttributeSet Neutral => new AttributeSet(10f, 10f, 10f, 10f, 10f, 10f);

        /// <summary>Reads the current attributes from a stat reader.</summary>
        /// <param name="stats">Stats of a character.</param>
        public static AttributeSet From(IStatReader stats)
        {
            return new AttributeSet(stats.Get(StatId.Strength), stats.Get(StatId.Dexterity), stats.Get(StatId.Intelligence),
                stats.Get(StatId.Wisdom), stats.Get(StatId.Constitution), stats.Get(StatId.Charisma));
        }

        /// <summary>Value of one attribute; 0 for other stats.</summary>
        /// <param name="attribute">Attribute id.</param>
        public float Get(StatId attribute)
        {
            switch (attribute)
            {
                case StatId.Strength: return Strength;
                case StatId.Dexterity: return Dexterity;
                case StatId.Intelligence: return Intelligence;
                case StatId.Wisdom: return Wisdom;
                case StatId.Constitution: return Constitution;
                case StatId.Charisma: return Charisma;
                default: return 0f;
            }
        }
    }
}
