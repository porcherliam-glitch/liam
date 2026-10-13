using UnityEngine;

namespace Aetherfall.Data
{
    /// <summary>
    /// Base of all content definitions (architecture 5.1): a ScriptableObject with a stable string id (architecture 6.1,
    /// e.g. <c>item.weapon.einhandschwert_eisen</c>) and a production status. Definitions describe what something is and are
    /// read-only at run time; the run-time state (instances) references them by id only (architecture 5.4, P5).
    /// </summary>
    /// <remarks>
    /// <para>Registered in the <see cref="IContentDatabase"/> through a <see cref="ContentCatalog"/> (for now; later all
    /// definitions with the Addressables label <c>content.def</c>, architecture 5.2).</para>
    /// <para>Rules: no write access at run time (a changed asset would stay changed in the editor), heavy assets only via
    /// AssetReference, references to other content only by id (<see cref="IdRefAttribute"/>), variants through data
    /// components instead of subclasses (P4).</para>
    /// </remarks>
    public abstract class GameDefinition : ScriptableObject
    {
        [Tooltip("Stabile ID (Architektur 6.1): klein, a–z, 0–9, _ und Punkte, z. B. item.weapon.einhandschwert_eisen. Ab Status „Fertig“ nie mehr ändern.")]
        [SerializeField] private string id = string.Empty;

        [Tooltip("Arbeitsstand: Idee, Entwurf, Fertig, Getestet, Abgenommen. Ab „Fertig“ ist die ID eingefroren.")]
        [SerializeField] private ContentStatus status = ContentStatus.Draft;

        /// <summary>Stable id (never changes after <see cref="ContentStatus.Done"/>).</summary>
        public string Id => id ?? string.Empty;

        /// <summary>Production status.</summary>
        public ContentStatus Status => status;

        /// <summary>True from status <see cref="ContentStatus.Done"/> on: the id is frozen (architecture 6.5).</summary>
        public bool IsIdFrozen => status >= ContentStatus.Done;
    }
}
