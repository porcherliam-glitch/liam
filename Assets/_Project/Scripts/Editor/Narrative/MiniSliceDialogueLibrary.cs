using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.NPC;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// NPCs and dialogues of the mini slice quests (GDD 02, 11.1, 11.2, 11.7, dialogue rules of 12): Hedda (prologue s20 and s70),
    /// Hollmann (offers and takes back "Die Wölfe vom Nordhang"), Corvin (offers "Die vergessene Gruft" and takes the seal stone)
    /// and Hauptmann Dorn (turn-in of the crypt without Corvin). Each NPC has one hub dialogue that branches on the quest state;
    /// the quest objective "Rede mit" counts at the start of the conversation, so the branches already see the next stage.
    /// The villagers (Tobold, Wenna, Lina, Pim, Ulf, Hannes and Liese Brenner) have short talks that react to the quests and
    /// point to later content (mill, letter); the grey figure speaks once by itself at the rift.
    /// </summary>
    public static class MiniSliceDialogueLibrary
    {
        /// <summary>Dialogue of Hedda.</summary>
        public const string HeddaDialogue = "dlg.eichental.hedda";

        /// <summary>Dialogue of Hollmann.</summary>
        public const string HollmannDialogue = "dlg.eichental.hollmann";

        /// <summary>Dialogue of Corvin.</summary>
        public const string CorvinDialogue = "dlg.eichental.corvin";

        /// <summary>Dialogue of Dorn.</summary>
        public const string DornDialogue = "dlg.eichental.dorn";

        /// <summary>Tobold Kern, smith (GDD 02 11, NPC table).</summary>
        public const string Tobold = "npc.eichental.schmied_tobold";

        /// <summary>Wenna Holt, baker.</summary>
        public const string Wenna = "npc.eichental.baeckerin_wenna";

        /// <summary>Lina, the younger sister of the player character.</summary>
        public const string Lina = "npc.eichental.lina";

        /// <summary>The grey figure ("Der Graue Wanderer"; the player does not know the name).</summary>
        public const string GreyFigure = "npc.main.graue_gestalt";

        /// <summary>Pim Hollmann, 8 years, Aether fever.</summary>
        public const string Pim = "npc.eichental.pim_hollmann";

        /// <summary>Ulf Krugmann, innkeeper of "Zum Krummen Kessel".</summary>
        public const string Ulf = "npc.eichental.wirt_ulf";

        /// <summary>Hannes Brenner, miller.</summary>
        public const string Brenner = "npc.eichental.mueller_brenner";

        /// <summary>Liese Brenner, the miller's daughter.</summary>
        public const string Liese = "npc.eichental.liese_brenner";

        /// <summary>The NPCs (asset data).</summary>
        public static NpcSpec[] CreateNpcs()
        {
            return new[]
            {
                new NpcSpec(Q.Hedda, "Hedda Eichholz", "Dorfvorsteherin", true, HeddaDialogue, 5, 1f, true, 20, string.Empty),
                new NpcSpec(Q.Hollmann, "Ansgar Hollmann", "Schafbauer", true, HollmannDialogue, 3, 1f, false, 0, string.Empty),
                new NpcSpec(Q.Corvin, "Corvin Ascher", "Gelehrter des Aether-Konvents", true, CorvinDialogue, 6, 1.2f, false, 0, string.Empty),
                new NpcSpec(Q.Dorn, "Veit Dorn", "Hauptmann der Silberwacht", true, DornDialogue, 10, 1f, true, 0, string.Empty),
                new NpcSpec(Tobold, "Tobold Kern", "Schmied", true, Dialogue(Tobold), 4, 1f, false, 10, string.Empty),
                new NpcSpec(Wenna, "Wenna Holt", "Bäckerin", true, Dialogue(Wenna), 1, 1f, false, 10, string.Empty),
                new NpcSpec(Lina, "Lina", "Deine Schwester", true, Dialogue(Lina), 1, 1f, true, 50, string.Empty),
                new NpcSpec(GreyFigure, "Der Graue Wanderer", "Gestalt im grauen Mantel", false, Dialogue(GreyFigure), 0, 1f, true, 0, string.Empty),
                new NpcSpec(Pim, "Pim Hollmann", "Hollmanns Sohn", true, Dialogue(Pim), 1, 1f, true, 0, string.Empty),
                new NpcSpec(Ulf, "Ulf Krugmann", "Wirt", true, Dialogue(Ulf), 3, 1.3f, false, 0, string.Empty),
                new NpcSpec(Brenner, "Hannes Brenner", "Müller", true, Dialogue(Brenner), 3, 1f, false, 0, string.Empty),
                new NpcSpec(Liese, "Liese Brenner", "Müllerstochter", true, Dialogue(Liese), 2, 1f, false, 0, string.Empty)
            };
        }

        /// <summary>The dialogues.</summary>
        public static DialogueSpec[] CreateDialogues()
        {
            return new[] { Hedda(), Hollmann(), Corvin(), Dorn(), ToboldTalk(), WennaTalk(), LinaTalk(), GreyFigureTalk(), PimTalk(), UlfTalk(), BrennerTalk(),
                LieseTalk() };
        }

        /// <summary>Dialogue id of a villager: <c>npc.eichental.schmied_tobold</c> → <c>dlg.eichental.schmied_tobold</c>.</summary>
        /// <param name="npcId">NPC id.</param>
        public static string Dialogue(string npcId)
        {
            return "dlg.eichental." + npcId.Substring(npcId.LastIndexOf('.') + 1);
        }

        /// <summary>
        /// True if the NPC can be talked to at this marker. Not while trapped in the prologue (Tobold under the beam, Wenna in the
        /// burning house): a person outranks objects when "Interagieren" chooses its target, so talking would block the rescue.
        /// Never the grey figure: it speaks once by itself at the rift and vanishes (GDD 02 11.1).
        /// </summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="stage">Stage of the marker (layout "stage").</param>
        public static bool TalkableAt(string npcId, string stage)
        {
            return npcId != GreyFigure && !((npcId == Tobold || npcId == Wenna) && stage == "s25");
        }

        private static DialogueSpec Hedda()
        {
            return new DialogueSpecBuilder(HeddaDialogue)
                .Title("Hedda Eichholz")
                .Mode(DialogueMode.Full)
                .Speaker(Q.Hedda)
                .Start("n010")
                .Nodes(
                    new BranchNode("n010", "n100")
                        .When(new AllOf(new QuestStageReached(Q.Prologue, "s70"), new Not(new FlagIs(Q.FlagHeddaReport, 1))), "n400")
                        .When(new QuestStatusIs(Q.Prologue, QuestStatus.Completed), "n500")
                        .When(new QuestStageReached(Q.Prologue, "s40"), "n300")
                        .When(new QuestStageReached(Q.Prologue, "s25"), "n200"),
                    new LineNode("n100", "Du lebst! Komm her, schnell, weg von den Flammen!").EndWith("weiter"),
                    new LineNode("n200", "Den Göttern sei Dank, du lebst. Lina … ich habe sie im Licht verschwinden sehen. Es tut mir so leid.")
                        .Staging(DialogueEmotion.Sad, DialogueCameraHint.Close).To("n210"),
                    new LineNode("n210", "Tobold liegt unter einem Balken bei der Schmiede, und Wennas Bäckerei brennt lichterloh. Hilf ihnen, wenn du kannst.")
                        .To("n220"),
                    new LineNode("n220", "Ich sammle alle, die noch laufen können, am Dorfrand. Beeil dich!").EndWith("dorfrand"),
                    new LineNode("n300", "Geh, folge der Gestalt. Ich bringe die Leute nach Lindenhain. Pass auf dich auf.").EndWith("weiter"),
                    new LineNode("n400", "Du bist zurück! Was ist am Riss passiert?").To("n405"),
                    new ChoiceNode("n405")
                        .Add(new DialogueOption("a", "Die graue Gestalt hat auf mich gewartet.", "n410"))
                        .Add(new DialogueOption("b", "Lina ist fort. Ich werde sie finden.", "n420")),
                    new LineNode("n410", "Gewartet? Dann wusste sie, dass du kommst … Das gefällt mir nicht.").To("n420"),
                    new LineNode("n420", "Lindenhain nimmt uns auf. Hier, mein Notgroschen. Und hör dich um – Hollmann und der Gelehrte im Gasthaus brauchen Hilfe.")
                        .Do(new SetFlag(Q.FlagHeddaReport, 1)).EndWith("abschluss"),
                    new LineNode("n500", "Wir bauen wieder auf, Stein für Stein. Hollmann oben am Hof und der Gelehrte im Gasthaus suchen noch Hilfe.")
                        .Variant(new FlagIs(Q.FlagWennaSaved, 1), "Wenna backt schon wieder, stell dir vor. Hollmann oben am Hof und der Gelehrte im Gasthaus suchen noch Hilfe.")
                        .EndWith("weiter"))
                .Build();
        }

        private static DialogueSpec Hollmann()
        {
            return new DialogueSpecBuilder(HollmannDialogue)
                .Title("Ansgar Hollmann")
                .Mode(DialogueMode.Full)
                .Speaker(Q.Hollmann)
                .Start("n010")
                .Nodes(
                    new BranchNode("n010", "n100")
                        .When(new QuestStatusIs(Q.Wolves, QuestStatus.Completed), "n400")
                        .When(new QuestStatusIs(Q.Wolves, QuestStatus.Active), "n300")
                        .When(new QuestStatusIs(Q.Prologue, QuestStatus.Completed), "n200"),
                    new LineNode("n100", "Eichental brennt, und meine Schafe stehen allein auf der Weide. Ich muss zu ihnen.").EndWith("weiter"),
                    new LineNode("n200", "Du bist einer von den Leuten aus Eichental, oder? Dann kennst du Not. Ich hab auch welche.").To("n210"),
                    new LineNode("n210", "Jede Nacht fehlt ein Schaf. Erst Wolle, dann Flocke, gestern Grete. Gerissen, oben auf der Weide.")
                        .Staging(DialogueEmotion.Sad, DialogueCameraHint.Auto).To("n220"),
                    new ChoiceNode("n220")
                        .Add(new DialogueOption("a", "Ich sehe mir die Weide an.", "n230"))
                        .Add(new DialogueOption("b", "Später vielleicht.", "n290")),
                    new ActionNode("n230", new StartQuest(Q.Wolves)).To("n240"),
                    new LineNode("n240", "Danke. Die obere Weide liegt hinter der Scheune, nach Norden hin. Sieh dir die Spuren an – die sind seltsam.")
                        .EndWith("angenommen"),
                    new LineNode("n290", "Na gut. Aber lang halten meine Schafe das nicht mehr aus.").EndWith("vertagt"),
                    new LineNode("n300", "Die Spuren führen zum Nordhang, sagst du? Pass auf dich auf da oben.").EndWith("weiter"),
                    new LineNode("n400", "Keine Risse mehr letzte Nacht. Ich danke dir.")
                        .Variant(new FlagIs(Q.FlagWolvesOutcome, 2), "Das Leuchten ist weg, sagst du? Dann sind es wieder nur Wölfe. Damit komme ich klar. Danke.")
                        .Variant(new FlagIs(Q.FlagWolvesOutcome, 3), "Du hast das Ding mitgenommen? Hoffentlich weißt du, was du tust. Die Wölfe heulen lauter als je zuvor.")
                        .To("n410"),
                    new LineNode("n410", "Nur Pim … mein Junge hat Fieber, seit derselben Nacht. Die Kräuterfrau im Westen soll sich auskennen.")
                        .Staging(DialogueEmotion.Sad, DialogueCameraHint.Close).EndWith("abschluss"))
                .Build();
        }

        private static DialogueSpec Corvin()
        {
            var hasStone = new HasItem(Q.SealStoneItem);
            return new DialogueSpecBuilder(CorvinDialogue)
                .Title("Corvin Ascher")
                .Mode(DialogueMode.Full)
                .Speaker(Q.Corvin)
                .Start("n010")
                .Nodes(
                    new BranchNode("n010", "n100")
                        .When(new AllOf(new QuestStageReached(Q.Crypt, "s70_genommen"), new QuestStatusIs(Q.Crypt, QuestStatus.Active), hasStone), "n500")
                        .When(new QuestStatusIs(Q.Crypt, QuestStatus.Completed), "n600")
                        .When(new QuestStatusIs(Q.Crypt, QuestStatus.Active), "n300")
                        .When(new QuestStatusIs(Q.Prologue, QuestStatus.Completed), "n200"),
                    new LineNode("n100", "Ein Riss, keine zwei Meilen von hier! Verzeiht, ich habe zu tun.").EndWith("weiter"),
                    new LineNode("n200", "Corvin Ascher, Aether-Konvent. Seit dem Riss summt es in der Senke unter dem Rabenfels.").To("n210"),
                    new LineNode("n210", "Dort liegt eine Gruft der Eichenritter. Die Inschriften sprechen von einem Siegelstein, der die Toten in ihrem Eid hält.")
                        .To("n220"),
                    new ChoiceNode("n220")
                        .Add(new DialogueOption("a", "Ich hole Euch den Siegelstein.", "n230"))
                        .Add(new DialogueOption("b", "Klingt nach Ärger. Später.", "n290")),
                    new ActionNode("n230", new StartQuest(Q.Crypt)).To("n240"),
                    new LineNode("n240", "Ausgezeichnet! Die Senke liegt nördlich des Dorfes, unter dem Rabenfels. Bringt mir den Stein – unversehrt.")
                        .EndWith("angenommen"),
                    new LineNode("n290", "Wie Ihr wollt. Der Stein läuft nicht weg … hoffe ich.").EndWith("vertagt"),
                    new LineNode("n300", "Die Gruft liegt unter dem Rabenfels. Achtet auf die Inschriften – die Eichenritter liebten Rätsel.").EndWith("weiter"),
                    new LineNode("n500", "Ihr habt ihn? Den Siegelstein der Eichenritter?").To("n510"),
                    new ChoiceNode("n510")
                        .Add(new DialogueOption("a", "Hier ist er.", "n520"))
                        .Add(new DialogueOption("b", "Ich behalte ihn vorerst.", "n590")),
                    new ActionNode("n520", new RemoveItem(Q.SealStoneItem), new SetFlag(Q.FlagSealStone, 1)).To("n530"),
                    new LineNode("n530", "Unglaublich … er ist warm. Hier, Euer Lohn. Der Konvent wird von Euch hören.").EndWith("abgegeben"),
                    new LineNode("n590", "Überlegt es Euch nicht zu lange. So ein Stein gehört in kundige Hände.").EndWith("vertagt"),
                    new LineNode("n600", "Der Stein verrät mir mehr, als ich zu hoffen wagte.")
                        .Variant(new FlagIs(Q.FlagSealStone, 2), "Ihr habt ihn liegen lassen? Bedauerlich. Eure Beschreibung der Reliefs ist trotzdem etwas wert.")
                        .Variant(new FlagIs(Q.FlagSealStone, 3), "Ihr tragt den Stein noch bei Euch, nicht wahr? Ich spüre es.")
                        .EndWith("weiter"))
                .Build();
        }

        private static DialogueSpec Dorn()
        {
            return new DialogueSpecBuilder(DornDialogue)
                .Title("Hauptmann Veit Dorn")
                .Mode(DialogueMode.Full)
                .Speaker(Q.Dorn)
                .Start("n010")
                .Nodes(
                    new BranchNode("n010", "n100")
                        .When(new AllOf(new QuestStatusIs(Q.Crypt, QuestStatus.Completed), new FlagIs(Q.FlagSealStone, 2)), "n200"),
                    new LineNode("n100", "Die Silberwacht hält die Straße, solange es geht. Bleibt in der Nähe des Dorfes.").EndWith("weiter"),
                    new LineNode("n200", "Ihr habt die Gruft versiegelt gelassen. Die Eichenritter hätten es nicht anders gewollt. Danke.")
                        .EndWith("weiter"))
                .Build();
        }

        // ---- Villagers (short talks; GDD 01 4.1.3 and GDD 02 11, NPC table) ------------------------------------------

        private static Condition InLindenhain()
        {
            return new AnyOf(new QuestStageReached(Q.Prologue, "s40"), new QuestStatusIs(Q.Prologue, QuestStatus.Completed));
        }

        private static DialogueSpec ToboldTalk()
        {
            // Talkable only once rescued (TalkableAt): at the village edge (s30) and in Lindenhain.
            return Short(Tobold, "Tobold Kern",
                new BranchNode("n010", "n100").When(InLindenhain(), "n200"),
                new LineNode("n100", "Du hast mich unter dem Balken hervorgeholt. Das vergess ich dir nicht.").To("n110"),
                new LineNode("n110", "Edwin, mein Junge, ist mit den Ersten nach Lindenhain. Wenigstens er ist in Sicherheit.").EndWith("weiter"),
                new LineNode("n200", "Die Esse hier ist klein, aber sie brennt. Was brauchst du?").To("n205"),
                new ChoiceNode("n205")
                    .Add(new DialogueOption("a", "Zeig mir deine Waren.", "n230"))
                    .Add(new DialogueOption("b", "Wie geht es dir?", "n210"))
                    .Add(new DialogueOption("c", "Bis später.", "n290")),
                new LineNode("n210", "Eichental bauen wir wieder auf. Stein für Stein, wie Hedda sagt.").To("n205"),
                // GDD 04 8.2: Tobold runs the smithy of Lindenhain (weaponsmith); "Handeln" opens the trade screen.
                new LineNode("n230", "Schwerter, Schilde, ein paar Plattenteile. Alles ehrliches Eisen.").EndWith("handeln", DialogueFollowUp.Trade),
                new LineNode("n290", "Pass auf dich auf da draußen.").EndWith("weiter"));
        }

        private static DialogueSpec WennaTalk()
        {
            return Short(Wenna, "Wenna Holt",
                new BranchNode("n010", "n100").When(InLindenhain(), "n200"),
                new LineNode("n100", "Ich dachte, ich verbrenne da drin … Danke. Danke!").Staging(DialogueEmotion.Sad, DialogueCameraHint.Auto).To("n110"),
                new LineNode("n110", "Meine Bäckerei ist weg. Dreißig Jahre Teig, und jetzt nur noch Asche.").EndWith("weiter"),
                new LineNode("n200", "In Lindenhain gibt es einen Ofen, aber kein Mehl. Die Mühle am Mühlbach mahlt nicht mehr.").To("n210"),
                new LineNode("n210", "Sobald wieder Mehl kommt, backe ich. Das erste Brot ist für dich.").EndWith("weiter"));
        }

        private static DialogueSpec LinaTalk()
        {
            return Short(Lina, "Lina",
                new LineNode("n010", "(Lina schwebt reglos im Licht des Risses. Ihre Lippen formen deinen Namen, aber kein Laut erreicht dich.)")
                    .Staging(DialogueEmotion.Sad, DialogueCameraHint.Close).EndWith("weiter"));
        }

        private static DialogueSpec GreyFigureTalk()
        {
            // GDD 02 11.1, twist: the figure waits for the player and vanishes before the player can ask. Started by the prologue
            // (s50 done) instead of the scene cs.prolog.aether_beruehrung; the figure itself cannot be talked to (TalkableAt).
            return new DialogueSpecBuilder(Dialogue(GreyFigure))
                .Title("Gestalt im grauen Mantel")
                .Mode(DialogueMode.Full)
                .Speaker(GreyFigure)
                .Start("n010")
                .Nodes(
                    new LineNode("n010", "Du bist es also.").Staging(DialogueEmotion.Neutral, DialogueCameraHint.Close).To("n020"),
                    new LineNode("n020", "(Die Gestalt mustert dich, als würde sie Maß nehmen. Ein Windstoß aus dem Riss – und sie ist fort.)").EndWith("weiter"))
                .Build();
        }

        private static DialogueSpec PimTalk()
        {
            return Short(Pim, "Pim Hollmann",
                new BranchNode("n010", "n100")
                    .When(new QuestStatusIs(Q.Wolves, QuestStatus.Completed), "n300")
                    .When(new QuestStatusIs(Q.Wolves, QuestStatus.Active), "n200"),
                new LineNode("n100", "Bist du ein Ritter? … Nein? Papa sagt, nachts kommen Wölfe. Mir ist so heiß, und alles leuchtet ein bisschen.")
                    .EndWith("weiter"),
                new LineNode("n200", "Hast du die Wölfe gesehen? Papa sagt, sie haben leuchtende Augen. Wie in meinen Fieberträumen.").EndWith("weiter"),
                new LineNode("n300", "Papa ist nicht mehr so traurig. Nur mein Kopf ist immer noch heiß.")
                    .Variant(new FlagIs(Q.FlagPup, 1), "Papa sagt, du hast einen Welpen gerettet! Darf ich ihn mal sehen? Mein Kopf ist immer noch heiß.")
                    .EndWith("weiter"));
        }

        private static DialogueSpec UlfTalk()
        {
            // GDD 01 9: the innkeeper hands out rumours (example rumour for quest 7 from GDD 01, "Beispiel-Gerücht").
            var wolvesOpen = new Not(new AnyOf(new QuestStatusIs(Q.Wolves, QuestStatus.Active), new QuestStatusIs(Q.Wolves, QuestStatus.Completed)));
            var cryptOpen = new Not(new AnyOf(new QuestStatusIs(Q.Crypt, QuestStatus.Active), new QuestStatusIs(Q.Crypt, QuestStatus.Completed)));
            return Short(Ulf, "Ulf Krugmann",
                new LineNode("n010", "Willkommen im Krummen Kessel. Viel ist nicht los – nur Flüchtlinge und Gerüchte.").To("n100"),
                new ChoiceNode("n100")
                    .Add(new DialogueOption("a", "Was hört man so?", "n200"))
                    .Add(new DialogueOption("b", "Ein Bier, bitte.", "n300"))
                    .Add(new DialogueOption("d", "Was verkaufst du?", "n400"))
                    .Add(new DialogueOption("c", "Mach's gut.", "n900")),
                new BranchNode("n200", "n230")
                    .When(new AllOf(new QuestStatusIs(Q.Prologue, QuestStatus.Completed), wolvesOpen), "n210")
                    .When(new AllOf(new QuestStatusIs(Q.Prologue, QuestStatus.Completed), cryptOpen), "n220"),
                new LineNode("n210", "Hollmann flucht über Wölfe am Nordhang. Jede Nacht ein Schaf weniger, sagt er. Sein Hof liegt im Nordwesten.").To("n100"),
                new LineNode("n220", "Seit dem Riss summt es in der Senke unter dem Rabenfels. Der Gelehrte da hinten will unbedingt hin.").To("n100"),
                new LineNode("n230", "Die Mühle steht still. Banditen sitzen am Wehr, heißt es. Brenner ist außer sich.").To("n100"),
                new LineNode("n300", "Bier ist aus. Seit dem Riss trinken alle doppelt. Wasser hab ich noch, das ist umsonst.").To("n100"),
                // GDD 04 8.2: general goods of Lindenhain (healing potions, light armour).
                new LineNode("n400", "Heiltränke, Lederzeug, warme Sachen. Viel ist es nicht, aber es hält.").EndWith("handeln", DialogueFollowUp.Trade),
                new LineNode("n900", "Komm wieder, wenn du was hörst.").EndWith("weiter"));
        }

        private static DialogueSpec BrennerTalk()
        {
            return Short(Brenner, "Hannes Brenner",
                new LineNode("n010", "Siehst du das Rad? Es steht still. Banditen haben das Wehr besetzt und lassen kaum noch Wasser durch.").To("n020"),
                new LineNode("n020", "Ohne Wasser kein Mehl, ohne Mehl kein Brot. Und das halbe Tal hat schon Hunger.").EndWith("weiter"));
        }

        private static DialogueSpec LieseTalk()
        {
            return Short(Liese, "Liese Brenner",
                new LineNode("n010", "Kommst du aus Lindenhain? Hat jemand … einen Brief für mich abgegeben?").To("n100"),
                new ChoiceNode("n100")
                    .Add(new DialogueOption("a", "Nein, tut mir leid.", "n110"))
                    .Add(new DialogueOption("b", "Von wem denn?", "n120")),
                new LineNode("n110", "Dachte ich mir. Er hat wohl Wichtigeres zu tun.").Staging(DialogueEmotion.Sad, DialogueCameraHint.Auto).EndWith("weiter"),
                new LineNode("n120", "Ach … von niemandem. Vergiss es einfach.").EndWith("weiter"));
        }

        private static DialogueSpec Short(string npcId, string title, params DialogueNode[] nodes)
        {
            return new DialogueSpecBuilder(Dialogue(npcId))
                .Title(title)
                .Mode(DialogueMode.Short)
                .Speaker(npcId)
                .Start("n010")
                .Nodes(nodes)
                .Build();
        }
    }
}
