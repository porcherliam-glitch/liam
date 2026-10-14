using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.NPC;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The example dialogue "Verhandlung mit dem Banditenanfuehrer am Muehlbach" (GDD 02, 12.10) built exactly like its node table:
    /// all 28 nodes n010-n990, the three checks (persuade 12 with +2 if Wenna was saved, intimidate 14 with +4 knife at the
    /// throat and the level advantage, lie 12 with -5 after a noticed lie), the bribe of 80 gold, the topic "thema.grimmbart" and
    /// the exits abzug, vertrieben, muehlenwache, abmachung, kampf, attentat and vertagt. Plus Harrik as NPC data and the flags
    /// the dialogue reads and writes. Shows how a designer's table becomes dialogue data; the same structure is entered in the
    /// inspector of a <c>DialogueDefinition</c> asset (guide 10 describes a generator for it).
    /// </summary>
    /// <remarks>
    /// Stand-ins for systems that do not exist yet: <see cref="RecordEffect"/> for "NPC+(group, Lindenhain)" (moving NPCs) and
    /// "uebrige Banditen fliehen" (world reaction), <see cref="SwitchOn"/> for "Quest 6 (Grimmbart) aktiv/abgeschlossen"
    /// (<c>QuestStatusIs</c> needs the quest service). The nodes n120, n220 and n320 are only reached in the dice mode
    /// ("nur Wuerfelmodus"): with deterministic checks the option is greyed instead.
    /// </remarks>
    public static class MuehlbachDialogueFixture
    {
        /// <summary>Dialogue id.</summary>
        public const string DialogueId = "dlg.eichental.harrik_verhandlung";

        /// <summary>Quest 4 "Banditen am Muehlbach".</summary>
        public const string QuestId = "quest.side.eichental.banditen_am_muehlbach";

        /// <summary>Harrik "der Lange".</summary>
        public const string Harrik = "npc.eichental.banditenfuehrer_harrik";

        /// <summary>The bandit group.</summary>
        public const string Group = "group.banditen_muehlbach";

        /// <summary>Topic unlocked in n050.</summary>
        public const string TopicGrimmbart = "thema.grimmbart";

        /// <summary>Local flag of the quest: the player sneaked up and holds a knife at Harrik's throat (s20 o2).</summary>
        public const string FlagKnife = QuestId + ".lokal.messer_an_kehle";

        /// <summary>Outcome: 1 killed, 2 driven away, 3 left as refugees, 4 mill guard, 5 handed over.</summary>
        public const string FlagOutcome = "flag.eichental.muehlbach_ausgang";

        /// <summary>Harrik was spared.</summary>
        public const string FlagSpared = "flag.eichental.harrik_verschont";

        /// <summary>Harrik: 0 free, 1 dead, 2 in custody.</summary>
        public const string FlagStatus = "flag.eichental.harrik_status";

        /// <summary>Harrik was lied to.</summary>
        public const string FlagLied = "flag.eichental.harrik_belogen";

        /// <summary>Harrik noticed a lie (lie checks with him -5).</summary>
        public const string FlagLieNoticed = "flag.eichental.harrik_luege_bemerkt";

        /// <summary>Grimmbart's weakness (war horn) is known.</summary>
        public const string FlagWeakness = "flag.eichental.grimmbart_schwaeche_bekannt";

        /// <summary>Wenna was saved in the prologue (persuade +2).</summary>
        public const string FlagWennaSaved = "flag.eichental.wenna_gerettet";

        /// <summary>Stand-in switch: the bounty quest Grimmbart is active.</summary>
        public const string SwitchGrimmbartActive = "quest.bounty.eichental.grimmbart aktiv";

        /// <summary>Stand-in switch: the bounty quest Grimmbart is completed.</summary>
        public const string SwitchGrimmbartDone = "quest.bounty.eichental.grimmbart abgeschlossen";

        /// <summary>Level of Harrik (quest 4 is recommended for level 4).</summary>
        public const int HarrikLevel = 4;

        /// <summary>Exits that advance the quest stage s30_verhandlung (GDD 02, 11.4).</summary>
        public static readonly string[] QuestExits = { "abzug", "vertrieben", "muehlenwache", "abmachung", "kampf", "attentat" };

        /// <summary>Harrik as NPC data: role "Banditenanfuehrer" until he says his name in n030.</summary>
        public static NpcSpec HarrikNpc()
        {
            return new NpcSpec(Harrik, "Harrik", "Banditenanführer", false, DialogueId, HarrikLevel, 1f, false, 0, Group);
        }

        /// <summary>The flags of the dialogue.</summary>
        public static FlagRegistry Flags()
        {
            return FlagRegistry.FromSpecs(
                FlagSpec.Bool(FlagKnife),
                FlagSpec.Enum(FlagOutcome, "unbekannt", "getötet", "vertrieben", "abgezogen", "Mühlenwache", "ausgeliefert"),
                FlagSpec.Bool(FlagSpared),
                FlagSpec.Enum(FlagStatus, "frei", "tot", "in Haft"),
                FlagSpec.Bool(FlagLied),
                FlagSpec.Bool(FlagLieNoticed),
                FlagSpec.Bool(FlagWeakness),
                FlagSpec.Bool(FlagWennaSaved));
        }

        /// <summary>Builds the dialogue (GDD 02, 12.10).</summary>
        public static DialogueSpec Build()
        {
            return new DialogueSpecBuilder(DialogueId)
                .Title("Verhandlung mit Harrik am Mühlbach")
                .Mode(DialogueMode.Full)
                .Speaker(Harrik)
                .Start("n010")
                .Quest(QuestId, QuestExits)
                .Nodes(
                    new BranchNode("n010", "n020").When(new FlagIs(FlagKnife, 1), "n015"),
                    new LineNode("n015", "Leise Schritte für jemanden mit so viel Eisen am Leib. Gut. Dann reden wir eben so.")
                        .Staging(DialogueEmotion.Whispering, DialogueCameraHint.Close).To("n030"),
                    new LineNode("n020", "Noch ein Schritt, und meine Jungs spicken dich mit Bolzen. Wer schickt dich – Brenner oder die Silberwacht?")
                        .Staging(DialogueEmotion.Angry, DialogueCameraHint.Opening).To("n025"),
                    new ChoiceNode("n025")
                        .Add(new DialogueOption("a", "Der Müller. Er will seine Mühle zurück.", "n030"))
                        .Add(new DialogueOption("b", "Niemand. Ich will nur reden.", "n030"))
                        .Add(new DialogueOption("c", "Ich bin hier, um euch zu erledigen.", "n900")),
                    new LineNode("n030", "Seine Mühle. Ich hab sein Mehl zehn Jahre lang gefahren, drüben nach Eichental. Ich bin Harrik. Und Eichental gibt's nicht mehr.")
                        .Do(new RevealName(Harrik)).To("n040"),
                    new ChoiceNode("n040", true)
                        .Add(new DialogueOption("a", "Ihr seid alle aus Eichental?", "n050").OnlyOnce())
                        .Add(new DialogueOption("b", "Lindenhain nimmt Flüchtlinge auf. Ihr müsst nicht stehlen.", "n100"))
                        .Add(new DialogueOption("c", "Zieht ab, oder ich hole mir eure Köpfe. Einen nach dem anderen.", "n200"))
                        .Add(new DialogueOption("d", "Die Silberwacht rückt morgen mit dreißig Mann an.", "n300"))
                        .Add(new DialogueOption("e", "Nehmt das Gold und verschwindet.", "n400"))
                        .Add(new DialogueOption("f", "Wem zahlt ihr eigentlich Tribut?", "n500")
                            .VisibleWhen(new AnyOf(new TopicKnown(TopicGrimmbart), new FlagIs(FlagWeakness, 1), new SwitchOn(SwitchGrimmbartActive))))
                        .Add(new DialogueOption("g", "Dann regeln wir das mit Stahl.", "n900"))
                        .Add(new DialogueOption("h", "Du drückst die Klinge tiefer.", "n910").VisibleWhen(new FlagIs(FlagKnife, 1)).CannotBeUndone())
                        .Add(new DialogueOption("i", "Ich komme wieder.", "n990")),
                    new LineNode("n050", "Die Hälfte von uns. Hast du gesehen, was von unseren Häusern übrig ist? Asche. Und Grimmbart will trotzdem seinen Anteil.")
                        .Staging(DialogueEmotion.Sad, DialogueCameraHint.Auto).Do(new UnlockTopic(TopicGrimmbart)).To("n040"),
                    new CheckNode("n100", SkillCheckType.Persuade, CheckDifficulty.EasyPlus, "n110", "n120")
                        .Modifier(new FlagIs(FlagWennaSaved, 1), 2, "Die Bäckerin braucht Hände"),
                    new LineNode("n110", "Brot statt Beute … Und wenn sie uns in Lindenhain aufknüpfen?").To("n115"),
                    new ChoiceNode("n115")
                        .Add(new DialogueOption("a", "Ich bürge bei Hedda für euch.", "n130"))
                        .Add(new DialogueOption("b", "Bewacht die Mühle für Brenner. Gegen Mehl.", "n140")),
                    new LineNode("n120", "Schöne Worte. Davon wird keiner satt.").To("n040"),
                    new ActionNode("n130",
                            new SetFlag(FlagOutcome, 3),
                            new SetFlag(FlagSpared, 1),
                            new SetFlag(FlagStatus, 0),
                            new RecordEffect("NPC+(" + Group + ", loc.eichental.lindenhain)"))
                        .To("n135"),
                    new LineNode("n135", "Wenn du gelogen hast, Rissgeborener, finden wir dich.").EndWith("abzug"),
                    new LineNode("n140", "Wächter statt Wegelagerer. Klingt fast ehrlich. Red mit Brenner.").EndWith("muehlenwache"),
                    new CheckNode("n200", SkillCheckType.Intimidate, CheckDifficulty.Medium, "n210", "n220")
                        .Modifier(new FlagIs(FlagKnife, 1), 4, "Klinge an der Kehle")
                        .WithLevelAdvantage(),
                    new LineNode("n210", "Schon gut. Wir ziehen weiter. Aber merk dir mein Gesicht.")
                        .Staging(DialogueEmotion.Angry, DialogueCameraHint.Auto)
                        .Do(new SetFlag(FlagOutcome, 2), new SetFlag(FlagSpared, 1), new SetFlag(FlagStatus, 0))
                        .EndWith("vertrieben"),
                    new LineNode("n220", "Große Worte für jemanden, der allein gekommen ist.").To("n900"),
                    new CheckNode("n300", SkillCheckType.Lie, CheckDifficulty.EasyPlus, "n310", "n320")
                        .Modifier(new FlagIs(FlagLieNoticed, 1), -5, "Harrik hat eine Lüge bemerkt"),
                    new LineNode("n310", "Dreißig? … Packt zusammen! Wir gehen.")
                        .Do(new SetFlag(FlagOutcome, 2), new SetFlag(FlagSpared, 1), new SetFlag(FlagStatus, 0), new SetFlag(FlagLied, 1))
                        .EndWith("vertrieben"),
                    new LineNode("n320", "Die Silberwacht hat keine dreißig Mann im ganzen Tal.").Do(new SetFlag(FlagLieNoticed, 1)).To("n040"),
                    new ActionNode("n400", new Bribe(80)).To("n410"),
                    new LineNode("n410", "Gold aus Eichental riecht nach Rauch. Ich nehm's trotzdem.")
                        .Do(new SetFlag(FlagOutcome, 3), new SetFlag(FlagSpared, 1), new SetFlag(FlagStatus, 0))
                        .EndWith("abzug"),
                    new LineNode("n500", "Grimmbart. Hockt im alten Steinbruch. Ohne sein Kriegshorn ist er nur ein fetter Kerl mit Hammer.")
                        .Do(new SetFlag(FlagWeakness, 1)).To("n510"),
                    new ChoiceNode("n510")
                        .Add(new DialogueOption("a", "Ich kümmere mich um Grimmbart. Dafür lasst ihr die Mühle in Ruhe.", "n520")
                            .VisibleWhen(new Not(new SwitchOn(SwitchGrimmbartDone))))
                        .Add(new DialogueOption("b", "Gut zu wissen.", "n040")),
                    new LineNode("n520", "Bring mir seinen Bart, und wir reden über die Mühle.").EndWith("abmachung"),
                    new ActionNode("n900", new StartCombat(Group)).EndWith("kampf", DialogueFollowUp.Combat),
                    new ActionNode("n910",
                            new KillNpc(Harrik),
                            new SetFlag(FlagStatus, 1),
                            new SetFlag(FlagOutcome, 1),
                            new RecordEffect("Übrige Banditen fliehen beim Fund der Leiche"))
                        .EndWith("attentat"),
                    new EndNode("n990", "vertagt"))
                .Build();
        }
    }
}
