using Aetherfall.Events;

namespace Aetherfall.SaveSystem
{
    /// <summary>Text ids of <see cref="SaveKind"/> as stored in the header (<c>"kind": "quick"</c>) and slot name prefixes.</summary>
    public static class SaveKindIds
    {
        /// <summary>Text id of a kind.</summary>
        /// <param name="kind">Kind of save.</param>
        public static string ToId(SaveKind kind)
        {
            switch (kind)
            {
                case SaveKind.Auto: return "auto";
                case SaveKind.Quick: return "quick";
                case SaveKind.Milestone: return "milestone";
                default: return "manual";
            }
        }

        /// <summary>Parses a text id.</summary>
        /// <param name="id">Text id.</param>
        /// <param name="kind">Parsed kind (Manual if unknown).</param>
        /// <returns>True if the id is known.</returns>
        public static bool TryParse(string id, out SaveKind kind)
        {
            switch (id)
            {
                case "manual":
                    kind = SaveKind.Manual;
                    return true;
                case "auto":
                    kind = SaveKind.Auto;
                    return true;
                case "quick":
                    kind = SaveKind.Quick;
                    return true;
                case "milestone":
                    kind = SaveKind.Milestone;
                    return true;
                default:
                    kind = SaveKind.Manual;
                    return false;
            }
        }

        /// <summary>Prefix of slot names of a kind: <c>manual_</c>, <c>auto_</c>, <c>quick_</c>, <c>milestone_</c>.</summary>
        /// <param name="kind">Kind of save.</param>
        public static string SlotPrefix(SaveKind kind)
        {
            return ToId(kind) + "_";
        }
    }
}
