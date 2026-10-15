namespace Aetherfall.Skills
{
    /// <summary>
    /// The ability bar of the player as the skill page sees it (GDD 03 11.8): which slot an ability sits in and moving it.
    /// Registered by <see cref="PlayerSkills"/> at <see cref="ISkillService.Loadout"/>.
    /// </summary>
    public interface ISkillLoadout
    {
        /// <summary>Slot 0–7 of the ability (0–3 bar 1, 4–7 bar 2), or −1 if it is not on the bar.</summary>
        /// <param name="abilityId">Ability id.</param>
        int SlotOf(string abilityId);

        /// <summary>Moves a learned ability to the next (or previous) slot; after slot 8 it leaves the bar, then starts at 1.</summary>
        /// <param name="abilityId">Ability id.</param>
        /// <param name="direction">+1 next, −1 previous.</param>
        /// <returns>False if the ability is not learned.</returns>
        bool MoveToNextSlot(string abilityId, int direction);
    }
}
