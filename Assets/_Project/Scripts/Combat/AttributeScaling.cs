using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Attribute weights of a weapon type (GDD 03 5.1 "Skalierung"), e.g. one-handed sword strength 0.6 · dexterity 0.4.
    /// The weapon damage is scaled by <c>1 + 0.025 × Σ wᵢ × E(Attributeᵢ)</c> (8.2 step 2). Spells use no weights: the
    /// attribute is already part of the spell power.
    /// </summary>
    public readonly struct AttributeScaling
    {
        /// <summary>Weight of strength.</summary>
        public readonly float Strength;

        /// <summary>Weight of dexterity.</summary>
        public readonly float Dexterity;

        /// <summary>Weight of intelligence.</summary>
        public readonly float Intelligence;

        /// <summary>Weight of wisdom.</summary>
        public readonly float Wisdom;

        /// <summary>Weight of constitution.</summary>
        public readonly float Constitution;

        /// <summary>Weight of charisma.</summary>
        public readonly float Charisma;

        /// <summary>Creates weights.</summary>
        /// <param name="strength">Weight of strength.</param>
        /// <param name="dexterity">Weight of dexterity.</param>
        /// <param name="intelligence">Weight of intelligence.</param>
        /// <param name="wisdom">Weight of wisdom.</param>
        /// <param name="constitution">Weight of constitution.</param>
        /// <param name="charisma">Weight of charisma.</param>
        public AttributeScaling(float strength, float dexterity, float intelligence = 0f, float wisdom = 0f, float constitution = 0f, float charisma = 0f)
        {
            Strength = strength;
            Dexterity = dexterity;
            Intelligence = intelligence;
            Wisdom = wisdom;
            Constitution = constitution;
            Charisma = charisma;
        }

        /// <summary>No scaling (spells, enemies, environment damage).</summary>
        public static AttributeScaling None => default;

        /// <summary>One-handed sword (GDD 03 5.1): strength 0.6 · dexterity 0.4.</summary>
        public static AttributeScaling OneHandedSword => new AttributeScaling(0.6f, 0.4f);

        /// <summary>Bow (GDD 03 5.1): dexterity 1.0.</summary>
        public static AttributeScaling Bow => new AttributeScaling(0f, 1f);

        /// <summary>Σ wᵢ × E(Attributeᵢ) for the given attributes (effective points with soft cap, GDD 03 10.1).</summary>
        /// <param name="attributes">Attributes of the attacker.</param>
        public float WeightedEffectivePoints(in AttributeSet attributes)
        {
            float sum = 0f;
            sum += Weighted(Strength, attributes.Strength);
            sum += Weighted(Dexterity, attributes.Dexterity);
            sum += Weighted(Intelligence, attributes.Intelligence);
            sum += Weighted(Wisdom, attributes.Wisdom);
            sum += Weighted(Constitution, attributes.Constitution);
            sum += Weighted(Charisma, attributes.Charisma);
            return sum;
        }

        private static float Weighted(float weight, float attribute)
        {
            return weight != 0f ? weight * StatFormulas.EffectivePoints(attribute) : 0f;
        }
    }
}
