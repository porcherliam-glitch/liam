using UnityEngine;

namespace Aetherfall.Data
{
    /// <summary>
    /// Marks a string field that holds the id of other content (architecture 5.4), e.g. <c>[IdRef("item.")]</c>. The picker
    /// with search (Editor.Core) and the validator rule "id does not exist" use it.
    /// </summary>
    /// <remarks>TODO (editor tools step): property drawer with search popup and the validator check (architecture 6.4).</remarks>
    public sealed class IdRefAttribute : PropertyAttribute
    {
        /// <summary>Creates the attribute.</summary>
        /// <param name="prefix">Id prefix the picker filters by, e.g. <c>item.</c> or <c>loot.</c>.</param>
        /// <param name="allowSceneObjects">True if scene object ids (<c>obj.</c>, <c>loc.</c>) are allowed too.</param>
        public IdRefAttribute(string prefix, bool allowSceneObjects = false)
        {
            Prefix = prefix ?? string.Empty;
            AllowSceneObjects = allowSceneObjects;
        }

        /// <summary>Id prefix of the allowed content.</summary>
        public string Prefix { get; }

        /// <summary>True if scene object ids are allowed.</summary>
        public bool AllowSceneObjects { get; }
    }
}
