using System.Globalization;
using Aetherfall.Skills;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Texts of the skill page of the journal (GDD 03 11, GDD 05 1.3): one row per node (name; branch, type and rank; state)
    /// and the details of the focused node (effect, cost, why it is locked, slot on the ability bar). Pure C#, German texts.
    /// </summary>
    public static class SkillPageModel
    {
        /// <summary>CSS class of a row: learned, can be learned, locked.</summary>
        /// <param name="rank">Learned rank.</param>
        /// <param name="check">Result of the learn check.</param>
        public static string StateClass(int rank, SkillCheck check)
        {
            if (check == SkillCheck.Ok)
            {
                return "is-available";
            }

            return rank > 0 ? "is-learned" : "is-locked";
        }

        /// <summary>Name of a node type.</summary>
        /// <param name="kind">Type.</param>
        public static string KindName(SkillNodeKind kind)
        {
            switch (kind)
            {
                case SkillNodeKind.Core:
                    return "Kern";
                case SkillNodeKind.Active:
                    return "Fähigkeit";
                case SkillNodeKind.Upgrade:
                    return "Verbesserung";
                case SkillNodeKind.Key:
                    return "Schlüssel";
                default:
                    return "Passiv";
            }
        }

        /// <summary>Second line of a row: "Waffenmeister · Passiv · Rang 1/3".</summary>
        /// <param name="tree">Tree.</param>
        /// <param name="node">Node.</param>
        /// <param name="rank">Learned rank.</param>
        public static string RowInfo(SkillTree tree, SkillNode node, int rank)
        {
            if (node.Kind == SkillNodeKind.Core)
            {
                return "Kern der Klasse · Rang " + rank.ToString(CultureInfo.InvariantCulture) + "/" + node.MaxRank.ToString(CultureInfo.InvariantCulture);
            }

            string branch = tree != null && node.Branch >= 0 && node.Branch < tree.BranchNames.Length ? tree.BranchNames[node.Branch] : string.Empty;
            string stage = node.Branch > 0 ? " " + Roman(node.Tier) : string.Empty;
            return branch + stage + " · " + KindName(node.Kind) + " · Rang " + rank.ToString(CultureInfo.InvariantCulture) + "/" +
                   node.MaxRank.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>Badge of a row: "Gelernt", "Lernbar (1)", "Punkt fehlt" or "Gesperrt".</summary>
        /// <param name="node">Node.</param>
        /// <param name="rank">Learned rank.</param>
        /// <param name="check">Learn check.</param>
        public static string Badge(SkillNode node, int rank, SkillCheck check)
        {
            if (check == SkillCheck.Ok)
            {
                return "Lernbar (" + node.Cost.ToString(CultureInfo.InvariantCulture) + ")";
            }

            if (rank >= node.MaxRank)
            {
                return "Gelernt";
            }

            if (check == SkillCheck.NotEnoughPoints)
            {
                return "Punkt fehlt";
            }

            return rank > 0 ? "Rang " + rank.ToString(CultureInfo.InvariantCulture) : "Gesperrt";
        }

        /// <summary>Meta line of the details: "Fähigkeit · Kosten 1 Punkt · Stufe II (3 Punkte im Ast)".</summary>
        /// <param name="tree">Tree.</param>
        /// <param name="node">Node.</param>
        public static string Meta(SkillTree tree, SkillNode node)
        {
            string cost = node.Cost == 0 ? "frei" : node.Cost == 1 ? "1 Punkt je Rang" : node.Cost.ToString(CultureInfo.InvariantCulture) + " Punkte je Rang";
            string text = KindName(node.Kind) + " · " + cost;
            if (node.Branch > 0)
            {
                int needed = SkillTreeState.TierPoints(node.Tier);
                text += " · Stufe " + Roman(node.Tier) + (needed > 0 ? " (" + needed.ToString(CultureInfo.InvariantCulture) + " Punkte im Ast)" : string.Empty);
            }

            return text;
        }

        /// <summary>Why a node cannot be learned, or what learning it means (German).</summary>
        /// <param name="tree">Tree.</param>
        /// <param name="node">Node.</param>
        /// <param name="check">Learn check.</param>
        /// <param name="canRefund">True if the last rank can still be taken back.</param>
        public static string StateText(SkillTree tree, SkillNode node, SkillCheck check, bool canRefund)
        {
            string text;
            switch (check)
            {
                case SkillCheck.Ok:
                    text = "Kann gelernt werden.";
                    break;
                case SkillCheck.MaxRank:
                    text = node.Kind == SkillNodeKind.Core ? "Kern der Klasse – von Anfang an gelernt." : "Voll gelernt.";
                    break;
                case SkillCheck.NotEnoughPoints:
                    text = "Zu wenige Skillpunkte (je Stufe gibt es einen).";
                    break;
                case SkillCheck.LevelTooLow:
                    text = "Erst ab Stufe " + node.MinLevel.ToString(CultureInfo.InvariantCulture) + ".";
                    break;
                case SkillCheck.TierLocked:
                    text = "Erst mit " + SkillTreeState.TierPoints(node.Tier).ToString(CultureInfo.InvariantCulture) + " Punkten in den unteren Stufen dieses Asts.";
                    break;
                case SkillCheck.NeedsRequirement:
                    text = "Braucht zuerst: " + RequirementNames(tree, node) + ".";
                    break;
                case SkillCheck.ForkTaken:
                    SkillNode partner = tree != null ? tree.Find(node.ForkWith) : null;
                    text = "Gabelung: Du hast schon „" + (partner != null ? partner.DisplayName : node.ForkWith) + "“ gewählt.";
                    break;
                case SkillCheck.NeedsCore:
                    text = "Braucht den Kern der Klasse.";
                    break;
                default:
                    text = string.Empty;
                    break;
            }

            return canRefund ? text + " Zurücknehmen geht, solange die Seite offen ist." : text;
        }

        /// <summary>Slot of an ability on the bar: "Auf Leiste 1, Platz 2" or "Nicht auf der Leiste".</summary>
        /// <param name="slot">Slot 0–7, or −1.</param>
        public static string BarText(int slot)
        {
            if (slot < 0)
            {
                return "Nicht auf der Fähigkeitenleiste (LT/RT bzw. Z/C legt sie darauf).";
            }

            int bar = slot / 4 + 1;
            int place = slot % 4 + 1;
            return "Auf Leiste " + bar.ToString(CultureInfo.InvariantCulture) + ", Platz " + place.ToString(CultureInfo.InvariantCulture) +
                   " (LT/RT bzw. Z/C verschiebt).";
        }

        /// <summary>"Freie Skillpunkte: 2 · Stufe 4".</summary>
        /// <param name="points">Free points.</param>
        /// <param name="level">Level.</param>
        public static string PointsText(int points, int level)
        {
            return "Freie Skillpunkte: " + points.ToString(CultureInfo.InvariantCulture) + " · Stufe " + level.ToString(CultureInfo.InvariantCulture) +
                   " (je Stufe 1 Punkt)";
        }

        private static string RequirementNames(SkillTree tree, SkillNode node)
        {
            string[] requires = node.Requires;
            string names = string.Empty;
            for (int i = 0; i < requires.Length; i++)
            {
                SkillNode required = tree != null ? tree.Find(requires[i]) : null;
                names += (i > 0 ? ", " : string.Empty) + (required != null ? required.DisplayName : requires[i]);
            }

            return names;
        }

        private static string Roman(int tier)
        {
            switch (tier)
            {
                case 2:
                    return "II";
                case 3:
                    return "III";
                case 4:
                    return "IV";
                case 5:
                    return "V";
                default:
                    return "I";
            }
        }
    }
}
