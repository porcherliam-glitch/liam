using System;
using System.Collections.Generic;
using UnityEditor.IMGUI.Controls;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Searchable dropdown with the German menu paths of <see cref="TypeMenuCatalog"/> (architecture 7.4: "Typauswahl mit
    /// Suche"). The first entry "(keine)" clears the field.
    /// </summary>
    public sealed class TypeMenuDropdown : AdvancedDropdown
    {
        /// <summary>Text of the entry that clears the field.</summary>
        public const string NoneLabel = "(keine)";

        private readonly string _title;
        private readonly IReadOnlyList<TypeMenuEntry> _entries;
        private readonly Action<Type> _onSelected;
        private readonly Dictionary<int, Type> _typesById = new Dictionary<int, Type>();

        /// <summary>Creates the dropdown.</summary>
        /// <param name="title">German header, e.g. <c>Bedingung waehlen</c>.</param>
        /// <param name="entries">Selectable types.</param>
        /// <param name="onSelected">Called with the chosen type, or null for "(keine)".</param>
        public TypeMenuDropdown(string title, IReadOnlyList<TypeMenuEntry> entries, Action<Type> onSelected) : base(new AdvancedDropdownState())
        {
            _title = title ?? string.Empty;
            _entries = entries ?? Array.Empty<TypeMenuEntry>();
            _onSelected = onSelected;
            minimumSize = new Vector2(260f, 320f);
        }

        /// <inheritdoc />
        protected override AdvancedDropdownItem BuildRoot()
        {
            _typesById.Clear();
            var root = new AdvancedDropdownItem(_title);
            var none = new AdvancedDropdownItem(NoneLabel) { id = 0 };
            root.AddChild(none);
            var folders = new Dictionary<string, AdvancedDropdownItem>(StringComparer.Ordinal);
            int nextId = 1;
            for (int i = 0; i < _entries.Count; i++)
            {
                TypeMenuEntry entry = _entries[i];
                AdvancedDropdownItem parent = GetFolder(root, folders, entry.Folder);
                var item = new AdvancedDropdownItem(entry.DisplayName) { id = nextId };
                _typesById[nextId] = entry.Type;
                nextId++;
                parent.AddChild(item);
            }

            return root;
        }

        /// <inheritdoc />
        protected override void ItemSelected(AdvancedDropdownItem item)
        {
            if (_onSelected == null || item == null)
            {
                return;
            }

            _onSelected(item.id != 0 && _typesById.TryGetValue(item.id, out Type type) ? type : null);
        }

        private static AdvancedDropdownItem GetFolder(AdvancedDropdownItem root, Dictionary<string, AdvancedDropdownItem> folders, string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return root;
            }

            if (folders.TryGetValue(path, out AdvancedDropdownItem folder))
            {
                return folder;
            }

            int slash = path.LastIndexOf('/');
            AdvancedDropdownItem parent = slash >= 0 ? GetFolder(root, folders, path.Substring(0, slash)) : root;
            folder = new AdvancedDropdownItem(slash >= 0 ? path.Substring(slash + 1) : path);
            parent.AddChild(folder);
            folders.Add(path, folder);
            return folder;
        }
    }
}
