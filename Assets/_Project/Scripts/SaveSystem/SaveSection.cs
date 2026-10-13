namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// One section of a <see cref="SaveSnapshot"/>: save key and DTO (null = empty section), or the raw JSON
    /// (<c>Newtonsoft.Json.Linq.JToken</c>) of a section kept from the loaded save (<see cref="SaveSnapshot.AddRaw"/>).
    /// </summary>
    public readonly struct SaveSection
    {
        /// <summary>Save key (<see cref="ISaveable.SaveKey"/>).</summary>
        public readonly string Key;

        /// <summary>DTO, raw JSON (<c>JToken</c>) or null.</summary>
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
