using System;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>One selectable type of the type picker: the type, its German menu path and its sort order.</summary>
    public readonly struct TypeMenuEntry
    {
        /// <summary>The type.</summary>
        public readonly Type Type;

        /// <summary>German menu path with slashes, e.g. <c>Welt/Flag setzen</c>.</summary>
        public readonly string Path;

        /// <summary>Sort order inside its sub menu.</summary>
        public readonly int Order;

        /// <summary>Creates the entry.</summary>
        /// <param name="type">Type.</param>
        /// <param name="path">Menu path.</param>
        /// <param name="order">Sort order.</param>
        public TypeMenuEntry(Type type, string path, int order)
        {
            Type = type;
            Path = path ?? string.Empty;
            Order = order;
        }

        /// <summary>Last segment of the path.</summary>
        public string DisplayName
        {
            get
            {
                int slash = Path.LastIndexOf('/');
                return slash >= 0 ? Path.Substring(slash + 1) : Path;
            }
        }

        /// <summary>Path of the sub menu (everything before the last slash), empty for the top level.</summary>
        public string Folder
        {
            get
            {
                int slash = Path.LastIndexOf('/');
                return slash >= 0 ? Path.Substring(0, slash) : string.Empty;
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Path + " (" + (Type != null ? Type.Name : "?") + ")";
        }
    }
}
