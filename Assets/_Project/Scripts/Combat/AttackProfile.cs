namespace Aetherfall.Combat
{
    /// <summary>
    /// What the owner of a hitbox contributes to its attacks: base damage packet (weapon damage W or enemy damage per type),
    /// attribute weights, poise value (GDD 03 8.2 steps 1–2, 4.9) and the status build-up of the weapon itself (fire affix
    /// 10 per hit, corrupted enemy +5 corruption; GDD 03 7.1). Immutable value type.
    /// </summary>
    public readonly struct AttackProfile
    {
        /// <summary>Base damage per type.</summary>
        public readonly DamagePacket Base;

        /// <summary>Attribute weights (none for enemies).</summary>
        public readonly AttributeScaling Scaling;

        /// <summary>Poise value of the weapon or the enemy attack (H_Waffe).</summary>
        public readonly float WeaponPoise;

        /// <summary>Status build-up of the weapon or enemy, added to the build-up of the attack.</summary>
        public readonly StatusBuildup Buildup;

        /// <summary>Creates the profile.</summary>
        /// <param name="basePacket">Base damage.</param>
        /// <param name="scaling">Attribute weights.</param>
        /// <param name="weaponPoise">Poise value.</param>
        public AttackProfile(in DamagePacket basePacket, in AttributeScaling scaling, float weaponPoise)
        {
            Base = basePacket;
            Scaling = scaling;
            WeaponPoise = weaponPoise;
            Buildup = StatusBuildup.None;
        }

        /// <summary>Creates the profile with a status build-up of the weapon or enemy.</summary>
        /// <param name="basePacket">Base damage.</param>
        /// <param name="scaling">Attribute weights.</param>
        /// <param name="weaponPoise">Poise value.</param>
        /// <param name="buildup">Status build-up per hit.</param>
        public AttackProfile(in DamagePacket basePacket, in AttributeScaling scaling, float weaponPoise, in StatusBuildup buildup)
        {
            Base = basePacket;
            Scaling = scaling;
            WeaponPoise = weaponPoise;
            Buildup = buildup;
        }
    }
}
