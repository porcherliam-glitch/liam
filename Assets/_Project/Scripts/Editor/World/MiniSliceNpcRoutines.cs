using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.World;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Daily routines and barks of the village NPCs in the slice (GDD 01 7.1 and 7.4, task list S43/S44): templates "Bauer",
    /// "Händler", "Wache Tagschicht", "Wirt" with own deviations (Hollmann 7–18 at the herd, Dorn in the evening at the notice
    /// board, Ulf from 10 at the inn). Places are Eichental layout coordinates (x, z); the height comes from the ground. The
    /// lines between two places are chosen free of houses. The NPCs of the prologue (quest-bound) have no routine.
    /// </summary>
    public static class MiniSliceNpcRoutines
    {
        /// <summary>Daily routine of an NPC, or null if it stays where the layout puts it.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="home">Position of its layout marker (x, z) and facing.</param>
        public static List<NpcScheduleEntry> Schedule(string npcId, Vector3 home, float homeYaw)
        {
            switch (npcId)
            {
                case "npc.eichental.bauer_hollmann":
                    // GDD 01 7.1: Ansgar Hollmann, 7–18 bei der Herde.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(7, 18, -174, 130, 315, "Arbeit bei der Herde"),
                        Entry(18, 21, -152, 104, 200, "Feierabend am Hof"),
                        Entry(21, 7, -158, 102, 90, "Schlaf (zu Hause)")
                    };
                case "npc.eichental.wirt_ulf":
                    // Wirt: Schlaf bis 10, dann Taverne bis Mitternacht.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(10, 24, home.x, home.z, homeYaw, "Taverne"),
                        Entry(0, 10, -152, -6, 90, "Schlaf (Hinterzimmer)")
                    };
                case "npc.eichental.hauptmann_dorn":
                    // Wache Tagschicht; abends am Kopfgeldbrett.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(6, 18, home.x, home.z, homeYaw, "Dienst am Wachposten"),
                        Entry(18, 21, -147, -4, 90, "Aushänge am Kopfgeldbrett"),
                        Entry(21, 6, -179, -55, 45, "Schlaf (Wachposten)")
                    };
                case "npc.eichental.mueller_brenner":
                    // Handwerker: Mühle, Mittag und Abend im Gasthaus.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(7, 12, home.x, home.z, homeYaw, "Arbeit in der Mühle"),
                        Entry(12, 13, -149, -17, 90, "Mittag im Gasthaus"),
                        Entry(13, 18, home.x, home.z, homeYaw, "Arbeit in der Mühle"),
                        Entry(18, 21, -148, -14, 120, "Taverne"),
                        Entry(21, 7, -122, -122, 0, "Schlaf (Mühle)")
                    };
                case "npc.eichental.liese_brenner":
                    return new List<NpcScheduleEntry>
                    {
                        Entry(7, 12, home.x, home.z, homeYaw, "Hühner und Garten"),
                        Entry(12, 13, -124, -121, 270, "Mittag an der Mühle"),
                        Entry(13, 18, -134, -134, 180, "Wäsche am Bach"),
                        Entry(18, 21, -130, -120, 0, "Abend an der Mühle"),
                        Entry(21, 7, -124, -122, 0, "Schlaf (Mühle)")
                    };
                case "npc.eichental.dorfvorsteherin_hedda":
                    // Nach dem Prolog in Lindenhain: versorgt die Flüchtlinge.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(7, 12, home.x, home.z, homeYaw, "Flüchtlinge versorgen"),
                        Entry(12, 13, -149, -19, 60, "Mittag im Gasthaus"),
                        Entry(13, 18, -155, -50, 200, "Bei den Zelten"),
                        Entry(18, 21, -149, -19, 60, "Gasthaus"),
                        Entry(21, 7, -161, -51, 135, "Schlaf im Zelt")
                    };
                case "npc.eichental.schmied_tobold":
                    // Händler: Laden 8–18, abends Taverne.
                    return new List<NpcScheduleEntry>
                    {
                        Entry(8, 18, home.x, home.z, homeYaw, "Schmiede (Handel)"),
                        Entry(18, 21, -146, -16, 100, "Taverne"),
                        Entry(21, 8, -166, -42, 180, "Schlaf im Zelt")
                    };
                case "npc.eichental.baeckerin_wenna":
                    return new List<NpcScheduleEntry>
                    {
                        Entry(5, 14, home.x, home.z, homeYaw, "Backen"),
                        Entry(14, 18, -152, -46, 220, "Brot verteilen"),
                        Entry(18, 21, -151, -17, 80, "Gasthaus"),
                        Entry(21, 5, -149, -59, 180, "Schlaf im Zelt")
                    };
                default:
                    return null;
            }
        }

        /// <summary>Barks of an NPC (empty if it has none).</summary>
        /// <param name="npcId">NPC id.</param>
        public static List<NpcBarkLine> Barks(string npcId)
        {
            var lines = new List<NpcBarkLine>();
            switch (npcId)
            {
                case "npc.eichental.bauer_hollmann":
                    lines.Add(Line("Die Schafe sind unruhig, seit der Riss offen ist.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Bleib vom Nordhang weg, wenn die Sonne sinkt.", DayPhase.Day));
                    lines.Add(Line("Wieder ein Tag ohne Wolf. Gut so.", DayPhase.Evening));
                    lines.Add(Line("Pim hustet wieder. Sei leise.", DayPhase.Night));
                    break;
                case "npc.eichental.pim_hollmann":
                    lines.Add(Line("Ich bin nicht krank! Nur ein bisschen heiß."));
                    lines.Add(Line("Hast du schon mal einen Wolf von nahem gesehen?", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Ich kann nicht schlafen. Draußen leuchtet was.", DayPhase.Night));
                    break;
                case "npc.eichental.wirt_ulf":
                    lines.Add(Line("Komm rein, die Suppe ist warm. Meistens.", DayPhase.Day));
                    lines.Add(Line("Hier hört man mehr Gerüchte als Würfel klappern.", DayPhase.Day, DayPhase.Evening));
                    lines.Add(Line("Jetzt wird's voll. Such dir einen Platz, solange es geht.", DayPhase.Evening));
                    lines.Add(Line("Zu früh. Ab zehn schenk ich aus.", DayPhase.Morning, DayPhase.Night));
                    break;
                case "npc.eichental.gelehrter_corvin":
                    lines.Add(Line("Messrunen … verbrannt, aber lesbar. Faszinierend."));
                    lines.Add(Line("Die Senke unter dem Rabenfels summt. Hörst du es nicht?"));
                    lines.Add(Line("Bei Kerzenlicht lesen sich alte Karten besser.", DayPhase.Evening, DayPhase.Night));
                    break;
                case "npc.eichental.hauptmann_dorn":
                    lines.Add(Line("Halt dich an die Wege. Die Banditen werden frech.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Das Kopfgeld auf Grimmbart steht noch. Zweihundertfünfzig Gold.", DayPhase.Day, DayPhase.Evening));
                    lines.Add(Line("Neue Aushänge. Lies sie, bevor der Regen sie holt.", DayPhase.Evening));
                    lines.Add(Line("Die Nachtwache ist dünn. Bleib im Licht.", DayPhase.Night));
                    break;
                case "npc.eichental.mueller_brenner":
                    lines.Add(Line("Das Rad dreht sich, solange der Bach mitspielt.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Mehl gibt's erst wieder, wenn das Wehr frei ist.", DayPhase.Day));
                    lines.Add(Line("Ein Krug, dann ab ins Bett.", DayPhase.Evening));
                    break;
                case "npc.eichental.liese_brenner":
                    lines.Add(Line("Vater sagt, ich soll nicht allein zum Wehr."));
                    lines.Add(Line("Die Hühner legen nicht mehr, seit es gebrannt hat.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Das Wasser ist kalt. Aber die Wäsche wird sauber.", DayPhase.Day));
                    break;
                case "npc.eichental.dorfvorsteherin_hedda":
                    lines.Add(Line("Jeder hier braucht ein Dach. Wir schaffen das.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Eichental ist Asche. Aber wir sind noch da."));
                    lines.Add(Line("Schlaf, solange du kannst. Morgen wird wieder schwer.", DayPhase.Evening, DayPhase.Night));
                    break;
                case "npc.eichental.schmied_tobold":
                    lines.Add(Line("Eisen ist geduldig. Ich nicht.", DayPhase.Day));
                    lines.Add(Line("Mein Amboss hat das Feuer überlebt. Der Rest nicht."));
                    lines.Add(Line("Hammer weg, Krug her.", DayPhase.Evening));
                    break;
                case "npc.eichental.baeckerin_wenna":
                    lines.Add(Line("Ohne Mehl kein Brot. Ohne Brot keine Ruhe.", DayPhase.Morning, DayPhase.Day));
                    lines.Add(Line("Danke noch mal. Für alles."));
                    lines.Add(Line("Riechst du das? Fast wie früher.", DayPhase.Morning));
                    break;
            }

            return lines;
        }

        private static NpcScheduleEntry Entry(float from, float to, float x, float z, float yaw, string activity)
        {
            return new NpcScheduleEntry(from, to, new Vector3(x, 0f, z), yaw, activity);
        }

        private static NpcBarkLine Line(string text, params DayPhase[] phases)
        {
            return new NpcBarkLine(text, phases);
        }
    }
}
