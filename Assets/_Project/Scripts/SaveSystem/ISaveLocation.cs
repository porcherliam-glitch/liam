namespace Aetherfall.SaveSystem
{
    /// <summary>Where the saves live (architecture 9.9). <see cref="UnitySaveLocation"/> is the platform adapter.</summary>
    public interface ISaveLocation
    {
        /// <summary>Absolute folder that contains the character folders.</summary>
        string RootDirectory { get; }
    }
}
