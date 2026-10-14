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

        /// <summary>The NPCs (asset data).</summary>
        public static NpcSpec[] CreateNpcs()
        {
            return new[]
            {
                new NpcSpec(Q.Hedda, "Hedda Eichholz", "Dorfvorsteherin", true, HeddaDialogue, 5, 1f, true, 20, string.Empty),
                new NpcSpec(Q.Hollmann, "Ansgar Hollmann", "Schafbauer", true, HollmannDialogue, 3, 1f, false, 0, string.Empty),
                new NpcSpec(Q.Corvin, "Corvin Ascher", "Gelehrter des Aether-Konvents", true, CorvinDialogue, 6, 1.2f, false, 0, string.Empty),
                new NpcSpec(Q.Dorn, "Veit Dorn", "Hauptmann der Silberwacht", true, DornDialogue, 10, 1f, true, 0, string.Empty)
            };
        }

        /// <summary>The dialogues.</summary>
        public static DialogueSpec[] CreateDialogues()
        {
            return new[] { Hedda(), Hollmann(), Corvin(), Dorn() };
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
    }
}
