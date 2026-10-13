namespace Aetherfall.Combat
{
    /// <summary>
    /// Block values of a shield or weapon (GDD 03 4.7): covered angle, damage reduction physical/elemental and stability
    /// (lowers the stamina cost of blocked hits). Immutable value type.
    /// </summary>
    public readonly struct BlockSpec
    {
        /// <summary>Covered angle in degrees, centred on the facing (wooden shield 150°).</summary>
        public readonly float Angle;

        /// <summary>Reduction of physical damage, 0–1.</summary>
        public readonly float PhysicalReduction;

        /// <summary>Reduction of elemental damage, 0–1.</summary>
        public readonly float ElementalReduction;

        /// <summary>Stability, 0–1: stamina cost per blocked hit = stamina damage × (1 − stability).</summary>
        public readonly float Stability;

        /// <summary>Creates the values.</summary>
        /// <param name="angle">Covered angle.</param>
        /// <param name="physicalReduction">Physical reduction.</param>
        /// <param name="elementalReduction">Elemental reduction.</param>
        /// <param name="stability">Stability.</param>
        public BlockSpec(float angle, float physicalReduction, float elementalReduction, float stability)
        {
            Angle = angle;
            PhysicalReduction = physicalReduction;
            ElementalReduction = elementalReduction;
            Stability = stability;
        }

        /// <summary>Wooden shield (GDD 03 4.7): 150°, 80 % / 20 %, stability 40 %.</summary>
        public static BlockSpec WoodenShield => new BlockSpec(150f, 0.8f, 0.2f, 0.4f);

        /// <summary>One-handed weapon without shield (GDD 03 4.7): 120°, 60 % / 0 %, stability 10 %.</summary>
        public static BlockSpec OneHandedWeapon => new BlockSpec(120f, 0.6f, 0f, 0.1f);

        /// <summary>True if an attack from <paramref name="bearing"/> degrees (0 = straight ahead) is inside the angle.</summary>
        /// <param name="bearing">Signed angle between the defender's facing and the attacker.</param>
        public bool Covers(float bearing)
        {
            float half = Angle * 0.5f;
            return bearing >= -half && bearing <= half;
        }
    }
}
