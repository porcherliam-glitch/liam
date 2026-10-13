namespace Aetherfall.Combat
{
    /// <summary>Shape of the overlap query of a hitbox. Stored in attack assets: never renumber.</summary>
    public enum HitboxShape
    {
        /// <summary>Oriented box (Physics.OverlapBoxNonAlloc).</summary>
        Box = 0,

        /// <summary>Sphere (Physics.OverlapSphereNonAlloc).</summary>
        Sphere = 1
    }
}
