namespace Aetherfall.Stats
{
    /// <summary>Read access to final stat values (used by <see cref="StatFormula"/>s and by snapshots for the damage calculation).</summary>
    public interface IStatReader
    {
        /// <summary>Final value of a stat (base value, modifiers, caps).</summary>
        /// <param name="id">Stat.</param>
        float Get(StatId id);
    }
}
