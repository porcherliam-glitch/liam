using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.NPC;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The dialogue validator behind "Aetherfall > Dialoge pruefen" (architecture 11.11, GDD 02 12.2): dead ends, broken
    /// targets and jumps, unknown NPCs and dialogues, missing and too long texts, unreachable nodes, cycles without exit,
    /// duplicate ids, id schema, too many options, missing exits, empty action nodes and checks without failure exit. The test
    /// dialogues and the Muehlbach example have no errors.
    /// </summary>
    [TestFixture]
    public sealed class DialogueValidatorTests
    {
        private const string Npc = TestDialogues.Ulf;

        [Test]
        public void TestDialogues_AndMuehlbach_HaveNoErrors()
        {
            var specs = new List<DialogueSpec>(TestDialogues.All());
            specs.RemoveAll(spec => spec.Id == TestDialogues.Loop);

            ValidationReport report = Validator().Validate(specs);

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
            Assert.That(report.Contains(DialogueValidator.UnreachableCode), Is.False, "jump targets of other dialogues count as reachable");
        }

        [Test]
        public void Muehlbach_HasNoErrors_AndWarnsAboutTwoLongOptions()
        {
            ValidationReport report = Validator().Validate(MuehlbachDialogueFixture.Build());

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
            Assert.That(report.CountOf(DialogueValidator.TextLengthCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.WarningCount, Is.EqualTo(2), report.ToText());
            Assert.That(report.ToText(), Does.Contain("n040").And.Contain("n510"));
        }

        [Test]
        public void GuideExample_IsClean_AndTheBuiltInMistakesAreFound()
        {
            // Guide 10, sections 5 and 6: Ulf's greeting as the beginner builds it in the inspector.
            ValidationReport clean = Validator().Validate(GuideExample("n020", Npc));
            ValidationReport brokenTarget = Validator().Validate(GuideExample("n099", Npc));
            ValidationReport typo = Validator().Validate(GuideExample("n020", "npc.test.wirt_uff"));

            Assert.That(clean.Issues, Is.Empty, clean.ToText());
            Assert.That(brokenTarget.ErrorCount, Is.EqualTo(2), brokenTarget.ToText());
            Assert.That(brokenTarget.ToText(), Does.Contain("Fehler V04 [dlg.test.ulf_gruss / n030]: Ziel-Knoten 'n099' existiert nicht."));
            Assert.That(brokenTarget.ToText(), Does.Contain("Fehler V07 [dlg.test.ulf_gruss / n030]: Von 'n030' aus kann das Gespräch nie enden"));
            Assert.That(typo.ErrorCount, Is.EqualTo(1), typo.ToText());
            Assert.That(typo.ToText(), Does.Contain("NPC 'npc.test.wirt_uff' existiert nicht (NpcDefinition fehlt)."));
        }

        [Test]
        public void EndlessLoop_IsACycle_WithAnUnreachableEnd()
        {
            ValidationReport report = Validator().Validate(TestDialogues.BuildLoop());

            Assert.That(report.CountOf(DialogueValidator.CycleCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.CountOf(DialogueValidator.UnreachableCode), Is.EqualTo(1), report.ToText());
            Assert.That(report.Contains(DialogueValidator.NoEndCode), Is.True, report.ToText());
        }

        [Test]
        public void LineWithoutNextAndWithoutExit_IsADeadEnd()
        {
            ValidationReport report = Validate(
                new LineNode("n010", "Hallo.").To("n020"),
                new LineNode("n020", "Und dann?"));

            Assert.That(report.Contains(DialogueValidator.DeadEndCode), Is.True, report.ToText());
            Assert.That(report.Contains(DialogueValidator.NoEndCode), Is.True, report.ToText());
        }

        [Test]
        public void MissingTargetNode_IsABrokenReference()
        {
            ValidationReport report = Validate(
                new ChoiceNode("n010")
                    .Add(new DialogueOption("a", "Weiter.", "n999"))
                    .Add(new DialogueOption("b", "Tschüss.", "n990")),
                new EndNode("n990", "tschuess"));

            Assert.That(report.CountOf(DialogueValidator.BrokenReferenceCode), Is.EqualTo(1), report.ToText());
            Assert.That(report.ToText(), Does.Contain("n999"));
        }

        [Test]
        public void MissingStartNode_IsABrokenReference()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_start").Speaker(Npc).Start("n500")
                .Nodes(new EndNode("n010", "ende"))
                .Build();

            ValidationReport report = Validator().Validate(spec);

            Assert.That(report.ToText(), Does.Contain("Start-Knoten 'n500'"));
        }

        [Test]
        public void JumpToAnUnknownDialogue_OrNode_IsABrokenReference()
        {
            ValidationReport report = Validate(
                new ChoiceNode("n010")
                    .Add(new DialogueOption("a", "Thema eins.", "n020"))
                    .Add(new DialogueOption("b", "Thema zwei.", "n030")),
                new JumpNode("n020", "dlg.test.gibt_es_nicht", string.Empty),
                new JumpNode("n030", TestDialogues.Topic, "n777"));

            Assert.That(report.CountOf(DialogueValidator.BrokenReferenceCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.ToText(), Does.Contain("dlg.test.gibt_es_nicht").And.Contain("n777"));
        }

        [Test]
        public void UnknownNpc_IsReported_WhenNpcDataIsKnown()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.geist_hallo").Speaker("npc.test.geist")
                .Nodes(new LineNode("n010", "Buh.").EndWith("buh"))
                .Build();

            ValidationReport withNpcs = Validator().Validate(spec);
            ValidationReport withoutNpcs = new DialogueValidator(new DialogueValidationLookup(Catalog(), null)).Validate(spec);

            Assert.That(withNpcs.CountOf(DialogueValidator.BrokenReferenceCode), Is.EqualTo(1), withNpcs.ToText());
            Assert.That(withNpcs.ToText(), Does.Contain("npc.test.geist"));
            Assert.That(withoutNpcs.ErrorCount, Is.EqualTo(0), "without NPC data NPCs are not checked");
        }

        [Test]
        public void MissingTexts_AreErrors()
        {
            ValidationReport report = Validate(
                new LineNode("n010", string.Empty).To("n020"),
                new ChoiceNode("n020")
                    .Add(new DialogueOption("a", string.Empty, "n990")),
                new EndNode("n990", "ende"));

            Assert.That(report.CountOf(DialogueValidator.MissingTextCode), Is.EqualTo(2), report.ToText());
        }

        [Test]
        public void TooLongLine_IsAWarning()
        {
            ValidationReport report = Validate(new LineNode("n010", new string('a', LineNode.MaxLength + 1)).EndWith("ende"));

            Assert.That(report.CountOf(DialogueValidator.TextLengthCode), Is.EqualTo(1), report.ToText());
            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
        }

        [Test]
        public void UnreachableNode_IsReported()
        {
            ValidationReport report = Validate(
                new LineNode("n010", "Hallo.").EndWith("hallo"),
                new LineNode("n020", "Mich sieht keiner.").EndWith("nie"));

            Assert.That(report.CountOf(DialogueValidator.UnreachableCode), Is.EqualTo(1), report.ToText());
            Assert.That(report.ToText(), Does.Contain("n020"));
        }

        [Test]
        public void ChoiceThatOnlyLoopsBack_IsACycleWithoutExit()
        {
            ValidationReport report = Validate(
                new LineNode("n010", "Frag ruhig.").To("n020"),
                new ChoiceNode("n020")
                    .Add(new DialogueOption("a", "Nochmal.", "n010"))
                    .Add(new DialogueOption("b", "Und nochmal.", "n020")));

            Assert.That(report.CountOf(DialogueValidator.CycleCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.Contains(DialogueValidator.NoEndCode), Is.True);
        }

        [Test]
        public void DuplicateIds_AreReported()
        {
            DialogueSpec spec = Spec(
                new LineNode("n010", "Eins.").EndWith("eins"),
                new LineNode("n010", "Zwei.").EndWith("zwei"));
            DialogueSpec copy = Spec(new EndNode("n010", "ende"));

            ValidationReport report = Validator().Validate(new[] { spec, copy });

            Assert.That(report.CountOf(DialogueValidator.DuplicateCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.ToText(), Does.Contain("Knoten-ID 'n010'").And.Contain("Dialog-ID"));
        }

        [Test]
        public void DuplicateOptionIds_AreReported()
        {
            ValidationReport report = Validate(
                new ChoiceNode("n010")
                    .Add(new DialogueOption("a", "Eins.", "n990"))
                    .Add(new DialogueOption("a", "Zwei.", "n990")),
                new EndNode("n990", "ende"));

            Assert.That(report.CountOf(DialogueValidator.DuplicateCode), Is.EqualTo(1), report.ToText());
        }

        [TestCase("Dialog Eins")]
        [TestCase("quest.test.falsch")]
        [TestCase("dlg.Test.Gross")]
        public void DialogueIdSchema_IsChecked(string id)
        {
            DialogueSpec spec = new DialogueSpecBuilder(id).Speaker(Npc).Nodes(new EndNode("n010", "ende")).Build();

            Assert.That(Validator().Validate(spec).Contains(DialogueValidator.IdSchemaCode), Is.True);
        }

        [Test]
        public void TooManyOptions_IsAWarning_HubsMayHaveNine()
        {
            ChoiceNode normal = new ChoiceNode("n010");
            ChoiceNode hub = new ChoiceNode("n020", true);
            for (int i = 0; i < 7; i++)
            {
                normal.Add(new DialogueOption(((char)('a' + i)).ToString(), "Option " + i, i == 0 ? "n020" : "n990"));
                hub.Add(new DialogueOption(((char)('a' + i)).ToString(), "Option " + i, "n990"));
            }

            ValidationReport report = Validate(normal, hub, new EndNode("n990", "ende"));

            Assert.That(report.CountOf(DialogueValidator.TooManyOptionsCode), Is.EqualTo(1), report.ToText());
        }

        [Test]
        public void EndWithoutExit_AndUnusedQuestExit_AreWarnings()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_quest").Speaker(Npc)
                .Quest("quest.side.test.bier", "geliefert", "abgelehnt")
                .Nodes(
                    new ChoiceNode("n010")
                        .Add(new DialogueOption("a", "Hier ist dein Bier.", "n020"))
                        .Add(new DialogueOption("b", "Später.", "n030")),
                    new LineNode("n020", "Danke!").EndWith("geliefert"),
                    new EndNode("n030", string.Empty))
                .Build();

            ValidationReport report = Validator().Validate(spec);

            Assert.That(report.CountOf(DialogueValidator.MissingExitCode), Is.EqualTo(2), report.ToText());
            Assert.That(report.ToText(), Does.Contain("abgelehnt"));
            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
        }

        [Test]
        public void EmptyActionNode_IsAWarning()
        {
            ValidationReport report = Validate(new ActionNode("n010").EndWith("leer"));

            Assert.That(report.CountOf(DialogueValidator.EmptyActionCode), Is.EqualTo(1), report.ToText());
        }

        [Test]
        public void CheckWithoutFailureExit_IsAHint_AndUnconventionalNodeIdsToo()
        {
            ValidationReport report = Validate(
                new ChoiceNode("n010")
                    .Add(new DialogueOption("a", "Glaub mir.", "probe"))
                    .Add(new DialogueOption("b", "Egal.", "n990")),
                new CheckNode("probe", SkillCheckType.Persuade, CheckDifficulty.Easy, "n990", string.Empty),
                new EndNode("n990", "ende"));

            Assert.That(report.Contains(DialogueValidator.CheckWithoutFailureCode), Is.True, report.ToText());
            Assert.That(report.Contains(DialogueValidator.NodeIdConventionCode), Is.True, report.ToText());
            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
            Assert.That(report.WarningCount, Is.EqualTo(0), "hints are only information");
        }

        [Test]
        public void SwitchWithoutDefault_IsAnError()
        {
            ValidationReport report = Validate(
                new BranchNode("n010", string.Empty).When(new FlagIs(TestDialogues.FlagFriend, 1), "n990"),
                new EndNode("n990", "ende"));

            Assert.That(report.Contains(DialogueValidator.MissingDefaultCode), Is.True, report.ToText());
        }

        [Test]
        public void EmptyDialogue_IsADeadEnd()
        {
            ValidationReport report = Validate();

            Assert.That(report.Contains(DialogueValidator.DeadEndCode), Is.True, report.ToText());
        }

        [Test]
        public void MissingNode_ReportsAnUnknownType()
        {
            ValidationReport report = Validate(new LineNode("n010", "Hallo.").EndWith("hallo"), null);

            Assert.That(report.Contains(ValidationReportExtensions.MissingTypeCode), Is.True, report.ToText());
        }

        private static DialogueSpec GuideExample(string n030Next, string speakerId)
        {
            return new DialogueSpecBuilder("dlg.test.ulf_gruss")
                .Title("Ulf grüßt")
                .Speaker(speakerId)
                .Nodes(
                    new LineNode("n010", "Na, Rissgeborener? Was gibt's?").To("n020"),
                    new ChoiceNode("n020")
                        .Add(new DialogueOption("a", "Wie laufen die Geschäfte?", "n030").OnlyOnce())
                        .Add(new DialogueOption("b", "Bis später.", "n040")),
                    new LineNode("n030", "Schlecht. Seit dem Riss trinkt keiner mehr.").To(n030Next),
                    new EndNode("n040", "tschuess"))
                .Build();
        }

        private static DialogueSpec Spec(params DialogueNode[] nodes)
        {
            return new DialogueSpecBuilder("dlg.test.ulf_pruefung").Speaker(Npc).Nodes(nodes).Build();
        }

        private static ValidationReport Validate(params DialogueNode[] nodes)
        {
            return Validator().Validate(Spec(nodes));
        }

        private static DialogueCatalog Catalog()
        {
            return DialogueCatalog.FromSpecs(TestDialogues.All());
        }

        private static DialogueValidator Validator()
        {
            NpcCatalog npcs = TestDialogues.Npcs();
            var ids = new List<string>();
            for (int i = 0; i < npcs.All.Count; i++)
            {
                ids.Add(npcs.All[i].Id);
            }

            return new DialogueValidator(new DialogueValidationLookup(Catalog(), ids));
        }
    }
}
