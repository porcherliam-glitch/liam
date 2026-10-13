using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.SaveSystem
{
    /// <summary>Character part of the save header (GDD 05 5.5 preview: "Liara · Level 14 · Krieger/Magier").</summary>
    [Preserve]
    public sealed class SaveHeaderCharacter
    {
        /// <summary>Character name.</summary>
        public string Name = string.Empty;

        /// <summary>Character level.</summary>
        public int Level = 1;

        /// <summary>Class ids, e.g. <c>class.krieger</c>.</summary>
        public List<string> Classes = new List<string>();
    }
}
