using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.NPC;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Small dialogues for the runner tests: one per node type, plus jumps, random, cycles.</summary>
    public static class TestDialogues
    {
        /// <summary>Test NPC "Ulf" (name known from the start).</summary>
        public const string Ulf = "npc.test.wirt_ulf";

        /// <summary>Test NPC "Fremder" (name unknown, role "Wanderer").</summary>
        public const string Stranger = "npc.test.fremder";

        /// <summary>Flag of the switch dialogue.</summary>
        public const string FlagFriend = "flag.test.freund";

        /// <summary>Flag written by actions.</summary>
        public const string FlagCounter = "flag.test.zaehler";

        /// <summary>Linear dialogue: line, choice (a: line, b: action + end, c: end), end exits.</summary>
        public const string Basic = "dlg.test.ulf_gruss";

        /// <summary>Dialogue with a condition switch and line variants.</summary>
        public const string Switch = "dlg.test.ulf_weiche";

        /// <summary>Dialogue with a random node.</summary>
        public const string Random = "dlg.test.ulf_zufall";

        /// <summary>Hub that jumps into <see cref="Topic"/> with return.</summary>
        public const string Hub = "dlg.test.ulf_hub";

        /// <summary>Topic dialogue reached by a jump.</summary>
        public const string Topic = "dlg.test.ulf_thema";

        /// <summary>Dialogue with an endless loop of switches (cycle protection).</summary>
        public const string Loop = "dlg.test.ulf_schleife";

        /// <summary>Short, cancelable dialogue with the stranger.</summary>
        public const string Short = "dlg.test.fremder_kurz";

        /// <summary>The test NPCs.</summary>
        public static NpcCatalog Npcs()
        {
            return NpcCatalog.FromSpecs(
                new NpcSpec(Ulf, "Ulf", "Wirt", true, Basic, 3, 1f, false, 0),
                new NpcSpec(Stranger, "Ansgar", "Wanderer", false, Short, 6, 1.5f, true, -20),
                MuehlbachDialogueFixture.HarrikNpc());
        }

        /// <summary>The test flags.</summary>
        public static FlagRegistry Flags()
        {
            FlagRegistry registry = MuehlbachDialogueFixture.Flags();
            registry.Add(FlagSpec.Bool(FlagFriend));
            registry.Add(FlagSpec.Counter(FlagCounter));
            return registry;
        }

        /// <summary>All test dialogues plus the Muehlbach example.</summary>
        public static DialogueSpec[] All()
        {
            return new[] { BuildBasic(), BuildSwitch(), BuildRandom(), BuildHub(), BuildTopic(), BuildLoop(), BuildShort(), MuehlbachDialogueFixture.Build() };
        }

        /// <summary>Creates an environment with all test dialogues.</summary>
        /// <param name="rules">Rules (null = deterministic).</param>
        public static DialogueTestEnvironment Environment(DialogueRules rules = null)
        {
            return new DialogueTestEnvironment(rules, Npcs(), Flags(), All());
        }

        /// <summary>Line → choice; a: line then back to the choice, b: actions then end "erledigt", c: end "tschuess".</summary>
        public static DialogueSpec BuildBasic()
        {
            return new DialogueSpecBuilder(Basic)
                .Speaker(Ulf)
                .Nodes(
                    new LineNode("n010", "Na, Rissgeborener? Was gibt's?").To("n020"),
                    new ChoiceNode("n020")
                        .Add(new DialogueOption("a", "Wie laufen die Geschäfte?", "n030").OnlyOnce())
                        .Add(new DialogueOption("b", "Ich brauche einen Gefallen.", "n040").Do(new AddToFlag(FlagCounter, 1)))
                        .Add(new DialogueOption("c", "Bis später.", "n990")),
                    new LineNode("n030", "Schlecht. Seit dem Riss trinkt keiner mehr.").To("n020"),
                    new ActionNode("n040", new AddToFlag(FlagCounter, 10), new RecordEffect("Gefallen")).EndWith("erledigt"),
                    new EndNode("n990", "tschuess"))
                .Build();
        }

        /// <summary>Switch on <see cref="FlagFriend"/> to a line with variants.</summary>
        public static DialogueSpec BuildSwitch()
        {
            return new DialogueSpecBuilder(Switch)
                .Speaker(Ulf)
                .Nodes(
                    new BranchNode("n010", "n030").When(new FlagIs(FlagFriend, 1), "n020"),
                    new LineNode("n020", "Mein Freund!").EndWith("freund"),
                    new LineNode("n030", "Was willst du?")
                        .Variant(new FlagIs(FlagCounter, FlagComparison.GreaterOrEqual, 5), "Du schon wieder.")
                        .EndWith("fremd"))
                .Build();
        }

        /// <summary>Random greeting with three weighted exits.</summary>
        public static DialogueSpec BuildRandom()
        {
            return new DialogueSpecBuilder(Random)
                .Speaker(Ulf)
                .Nodes(
                    new RandomNode("n010").Add(1, "n020").Add(2, "n030").Add(1, "n040"),
                    new LineNode("n020", "Morgen.").EndWith("a"),
                    new LineNode("n030", "Tag.").EndWith("b"),
                    new LineNode("n040", "Abend.").EndWith("c"))
                .Build();
        }

        /// <summary>Hub with a jump into the topic dialogue and return to the hub; the second option ends.</summary>
        public static DialogueSpec BuildHub()
        {
            return new DialogueSpecBuilder(Hub)
                .Speaker(Ulf)
                .Nodes(
                    new ChoiceNode("n010", true)
                        .Add(new DialogueOption("a", "Erzähl vom Riss.", "n020"))
                        .Add(new DialogueOption("b", "Und Grimmbart?", "n030"))
                        .Add(new DialogueOption("c", "Danke.", "n990")),
                    new JumpNode("n020", Topic, string.Empty).ReturnTo("n010"),
                    new JumpNode("n030", Topic, "n020"),
                    new EndNode("n990", "danke"))
                .Build();
        }

        /// <summary>Topic dialogue: n010 ends with "riss", n020 ends with "grimmbart".</summary>
        public static DialogueSpec BuildTopic()
        {
            return new DialogueSpecBuilder(Topic)
                .Speaker(Ulf)
                .Nodes(
                    new LineNode("n010", "Der Riss summt nachts.").Do(new UnlockTopic("thema.riss")).EndWith("riss"),
                    new LineNode("n020", "Grimmbart? Frag lieber nicht.").EndWith("grimmbart"))
                .Build();
        }

        /// <summary>Two switches that point at each other (no player input, endless).</summary>
        public static DialogueSpec BuildLoop()
        {
            return new DialogueSpecBuilder(Loop)
                .Speaker(Ulf)
                .Nodes(
                    new BranchNode("n010", "n020"),
                    new BranchNode("n020", "n010"),
                    new EndNode("n990", "nie"))
                .Build();
        }

        /// <summary>Short, cancelable dialogue with the stranger (role shown until the name is revealed).</summary>
        public static DialogueSpec BuildShort()
        {
            return new DialogueSpecBuilder(Short)
                .Mode(DialogueMode.Short)
                .Speaker(Stranger)
                .Cancelable()
                .Nodes(
                    new LineNode("n010", "Was starrst du so?").To("n020"),
                    new LineNode("n020", "Ich bin Ansgar. Zufrieden?").Do(new RevealName(string.Empty)).To("n030"),
                    new ChoiceNode("n030")
                        .Add(new DialogueOption("a", "Zahl mir den Weg frei.", "n040"))
                        .Add(new DialogueOption("b", "Schon gut.", "n050")),
                    new ActionNode("n040", new Bribe(20)).EndWith("bezahlt"),
                    new LineNode("n050", "Dann geh.").EndWith("weg"))
                .Build();
        }
    }
}
