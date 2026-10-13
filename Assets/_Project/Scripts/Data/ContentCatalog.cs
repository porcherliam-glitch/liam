using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Data
{
    /// <summary>
    /// List of definitions that the <see cref="ContentInstaller"/> registers in the <see cref="IContentDatabase"/>. Stand-in
    /// until the content is loaded through Addressables (architecture 5.2, label <c>content.def</c>); the test ground menu
    /// fills <c>Assets/_Project/Data/ContentCatalog.asset</c> with all item, affix and loot table definitions.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Daten/Inhaltskatalog", fileName = "ContentCatalog", order = 1)]
    public sealed class ContentCatalog : ScriptableObject
    {
        [Tooltip("Alle Definitionen, die beim Start registriert werden (Items, Affixe, Loot-Tabellen …). Reihenfolge egal, IDs müssen eindeutig sein.")]
        [SerializeField] private List<GameDefinition> definitions = new List<GameDefinition>();

        /// <summary>The definitions (entries may be null: empty inspector slots, deleted assets).</summary>
        public IReadOnlyList<GameDefinition> Definitions => definitions;
    }
}
