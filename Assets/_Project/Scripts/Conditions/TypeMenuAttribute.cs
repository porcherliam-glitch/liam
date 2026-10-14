using System;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// German menu path of a <c>[SerializeReference]</c> type in the type picker of the inspector (architecture 7.4), e.g.
    /// <c>[TypeMenu("Welt/Flag setzen")]</c> or <c>[TypeMenu("Ziele/Toete Gegner")]</c>. Slashes build sub menus. Types
    /// without the attribute appear under "Sonstige" with their class name.
    /// </summary>
    /// <remarks>
    /// Deviation from architecture 3.3: the table puts <c>TypeMenuAttribute</c> into <c>Aetherfall.Core</c>. Core is not
    /// part of this step, so the attribute lives in <c>Aetherfall.Conditions</c> (the lowest assembly with
    /// <c>[SerializeReference]</c> base types). Moving it later is safe: attributes are not serialized.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public sealed class TypeMenuAttribute : Attribute
    {
        /// <summary>Creates the attribute.</summary>
        /// <param name="path">Menu path with slashes, German, e.g. <c>Logik/UND (alle)</c>.</param>
        /// <param name="order">Sort order inside its sub menu (smaller first, then alphabetical).</param>
        public TypeMenuAttribute(string path, int order = 0)
        {
            Path = path ?? string.Empty;
            Order = order;
        }

        /// <summary>Menu path.</summary>
        public string Path { get; }

        /// <summary>Sort order inside the sub menu.</summary>
        public int Order { get; }

        /// <summary>Last segment of the path (the entry name), e.g. <c>Flag setzen</c>.</summary>
        public string DisplayName
        {
            get
            {
                int slash = Path.LastIndexOf('/');
                return slash >= 0 ? Path.Substring(slash + 1) : Path;
            }
        }
    }
}
