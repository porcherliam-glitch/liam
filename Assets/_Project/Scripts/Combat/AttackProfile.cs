namespace Aetherfall.Combat
{
    /// <summary>
    /// What the owner of a hitbox contributes to its attacks: base damage packet (weapon damage W or enemy damage per type),
    /// attribute weights and poise value (GDD 03 8.2 steps 1–2, 4.9). Immutable value type.
    /// </summary>
    public readonly struct AttackProfile
    {
        /// <summary>Base damage per type.</summary>
        public readonly DamagePacket Base;

        /// <summary>Attribute weights (none for enemies).</summary>
        public readonly AttributeScaling Scaling;

        /// <summary>Poise value of the weapon or the enemy attack (H_Waffe).</summary>
        public readonly float WeaponPoise;

        /// <summary>Creates the profile.</summary>
        /// <param name="basePacket">Base damage.</param>
        /// <param name="scaling">Attribute weights.</param>
        /// <param name="weaponPoise">Poise value.</param>
        public AttackProfile(in DamagePacket basePacket, in AttributeScaling scaling, float weaponPoise)
        {
            Base = basePacket;
            Scaling = scaling;
            WeaponPoise = weaponPoise;
        }
    }
}
