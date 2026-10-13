namespace Aetherfall.SaveSystem
{
    /// <summary>One section of a <see cref="SaveSnapshot"/>: save key and DTO (null = empty section).</summary>
    public readonly struct SaveSection
    {
        /// <summary>Save key (<see cref="ISaveable.SaveKey"/>).</summary>
        public readonly string Key;

        /// <summary>DTO or null.</summary>
        public readonly object Data;

        /// <summary>Creates a section.</summary>
        /// <param name="key">Save key.</param>
        /// <param name="data">DTO or null.</param>
        public SaveSection(string key, object data)
        {
            Key = key;
            Data = data;
        }
    }
}
