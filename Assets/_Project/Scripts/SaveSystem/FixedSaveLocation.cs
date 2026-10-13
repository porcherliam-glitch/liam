namespace Aetherfall.SaveSystem
{
    /// <summary><see cref="ISaveLocation"/> with a fixed folder (tests, tools).</summary>
    public sealed class FixedSaveLocation : ISaveLocation
    {
        /// <summary>Creates the location.</summary>
        /// <param name="rootDirectory">Absolute folder.</param>
        public FixedSaveLocation(string rootDirectory)
        {
            RootDirectory = rootDirectory;
        }

        /// <inheritdoc />
        public string RootDirectory { get; }
    }
}
