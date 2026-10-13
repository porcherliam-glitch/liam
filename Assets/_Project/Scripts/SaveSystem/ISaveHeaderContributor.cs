namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Fills fields of the save header (architecture 9.3): the save system knows no other system and collects the preview
    /// data through this interface – playtime (GameTime), level and classes (Progression), region and place (World).
    /// Register it with <see cref="ISaveManager.RegisterHeaderContributor"/>.
    /// </summary>
    public interface ISaveHeaderContributor
    {
        /// <summary>Main thread, while the snapshot is taken: write the own fields into <paramref name="header"/>.</summary>
        /// <param name="header">Header of the save being written.</param>
        void Contribute(SaveHeader header);
    }
}
