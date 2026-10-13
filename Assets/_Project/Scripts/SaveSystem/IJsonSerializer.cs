using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// JSON facade for all assemblies (architecture 3.3: "Nur SaveSystem referenziert Newtonsoft. Alle anderen nutzen die
    /// Fassade IJsonSerializer"), e.g. options in <c>settings.json</c>. Same rules as save data: DTO types only
    /// (<see cref="SaveDtoValidator"/>), no type names.
    /// </summary>
    public interface IJsonSerializer
    {
        /// <summary>Serializes a DTO.</summary>
        /// <param name="value">DTO instance.</param>
        /// <param name="indented">True for readable output.</param>
        /// <exception cref="ArgumentException">The type is not a valid DTO.</exception>
        string Serialize(object value, bool indented);

        /// <summary>Deserializes JSON into a DTO type.</summary>
        /// <param name="json">JSON text.</param>
        /// <param name="type">DTO type.</param>
        /// <exception cref="ArgumentException">The type is not a valid DTO.</exception>
        object Deserialize(string json, Type type);

        /// <summary>Deserializes JSON into a DTO type.</summary>
        /// <typeparam name="T">DTO type.</typeparam>
        /// <param name="json">JSON text.</param>
        T Deserialize<T>(string json) where T : class;
    }
}
