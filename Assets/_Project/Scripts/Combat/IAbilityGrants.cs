namespace Aetherfall.Combat
{
    /// <summary>
    /// Abilities a character knows without learning them (GDD 03 11.1: the class choice unlocks the core of the class; until the
    /// skill tree exists, also the first spell of each school of the mage). Implemented by the class service, read by the
    /// player's ability caster.
    /// </summary>
    public interface IAbilityGrants
    {
        /// <summary>True if the running game grants the ability without learning it.</summary>
        /// <param name="abilityId">Ability id.</param>
        bool Grants(string abilityId);
    }
}
