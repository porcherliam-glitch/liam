using System.Collections.Generic;

namespace Aetherfall.Data
{
    /// <summary>
    /// Access to all content definitions by id (architecture 5.2). Registered by <see cref="ContentInstaller"/> (boot step 7).
    /// </summary>
    public interface IContentDatabase
    {
        /// <summary>Returns a definition; throws with the id in the message if it is missing or of another type.</summary>
        /// <typeparam name="T">Definition type.</typeparam>
        /// <param name="id">Content id.</param>
        T Get<T>(string id) where T : GameDefinition;

        /// <summary>Finds a definition. An unknown id or a different type returns false and logs a warning with the id.</summary>
        /// <typeparam name="T">Definition type.</typeparam>
        /// <param name="id">Content id.</param>
        /// <param name="definition">Definition or null.</param>
        bool TryGet<T>(string id, out T definition) where T : GameDefinition;

        /// <summary>All definitions of a type (and its subtypes) in registration order.</summary>
        /// <typeparam name="T">Definition type.</typeparam>
        IReadOnlyList<T> GetAll<T>() where T : GameDefinition;

        /// <summary>True if a definition with this id exists (no warning).</summary>
        /// <param name="id">Content id.</param>
        bool Exists(string id);
    }
}
