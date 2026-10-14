using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.Stats;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Subtitle data (GDD 05, 2.4: at most 2 lines of 45 characters per page, display time 1 s + 0.06 s per character, at least
    /// 2 s, reading factor up to 3, clip length + 0.5 s), the ids and keys of lines and options, and the option markings
    /// (tag and quest symbol priorities, badge rules of actions).
    /// </summary>
    [TestFixture]
    public sealed class SubtitleAndMarkingTests
    {
        [Test]
        public void Wrap_BreaksAtSpaces_AndSplitsTooLongWords()
        {
            Assert.That(SubtitlePager.Wrap("eins zwei drei", 9), Is.EqualTo(new[] { "eins zwei", "drei" }));
            Assert.That(SubtitlePager.Wrap("abcdefghijk", 8), Is.EqualTo(new[] { "abcdefgh", "ijk" }));
            Assert.That(SubtitlePager.Wrap(string.Empty, 8), Is.EqualTo(new[] { string.Empty }));
        }

        [Test]
        public void Paginate_PutsTwoLinesOnAPage()
        {
            string text = "Seine Mühle. Ich hab sein Mehl zehn Jahre lang gefahren, drüben nach Eichental. Ich bin Harrik. Und Eichental gibt's nicht mehr.";

            var pages = SubtitlePager.Paginate(text);

            Assert.That(pages.Count, Is.EqualTo(2));
            Assert.That(pages[0].Split('\n').Length, Is.EqualTo(2));
            foreach (string page in pages)
            {
                foreach (string line in page.Split('\n'))
                {
                    Assert.That(line.Length, Is.LessThanOrEqualTo(SubtitlePager.CharactersPerLine), line);
                }
            }

            Assert.That(string.Join(" ", pages).Replace('\n', ' '), Is.EqualTo(text));
        }

        [Test]
        public void DisplaySeconds_FollowTheReadingRule()
        {
            Assert.That(SubtitleTiming.DisplaySeconds(10), Is.EqualTo(2f).Within(0.001f), "at least 2 s");
            Assert.That(SubtitleTiming.DisplaySeconds(100), Is.EqualTo(7f).Within(0.001f), "1 + 0.06 × 100");
            Assert.That(SubtitleTiming.DisplaySeconds(100, 2f), Is.EqualTo(14f).Within(0.001f));
            Assert.That(SubtitleTiming.DisplaySeconds(100, 9f), Is.EqualTo(21f).Within(0.001f), "reading factor at most 3");
            Assert.That(SubtitleTiming.DisplaySeconds(100, 1f, 3f), Is.EqualTo(3.5f).Within(0.001f), "voice clip + 0.5 s");
        }

        [Test]
        public void Ids_AndKeys()
        {
            Assert.That(DialogueIds.NodeKey("dlg.a", "n010"), Is.EqualTo("dlg.a.n010"));
            Assert.That(DialogueIds.OptionKey("dlg.a", "n010", "b"), Is.EqualTo("dlg.a.n010.b"));
            Assert.That(DialogueIds.VariantKey("dlg.a", "n010", 2), Is.EqualTo("dlg.a.n010.v2"));
            Assert.That(DialogueIds.VoiceClipId("npc.x", "dlg.a", "n010"), Is.EqualTo("VO_npc.x_dlg.a.n010"));
            Assert.That(DialogueIds.IsConventionalNodeId("n010"), Is.True);
            Assert.That(DialogueIds.IsConventionalNodeId("n01"), Is.False);
            Assert.That(DialogueIds.IsConventionalNodeId("start"), Is.False);
            Assert.That(DialogueIds.IsValidOptionId("a"), Is.True);
            Assert.That(DialogueIds.IsValidOptionId("Option A"), Is.False);
        }

        [Test]
        public void Tag_FollowsThePriority()
        {
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.Kill | DialogueOptionMarks.Combat), Is.EqualTo(DialogueOptionTag.Kill));
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.Combat | DialogueOptionMarks.End), Is.EqualTo(DialogueOptionTag.Combat));
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.Check | DialogueOptionMarks.Bribe), Is.EqualTo(DialogueOptionTag.Check));
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.Bribe | DialogueOptionMarks.Trade), Is.EqualTo(DialogueOptionTag.Bribe));
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.Trade | DialogueOptionMarks.End), Is.EqualTo(DialogueOptionTag.Trade));
            Assert.That(DialogueOptionFormatter.TagOf(DialogueOptionMarks.QuestProgress), Is.EqualTo(DialogueOptionTag.None));
        }

        [Test]
        public void Symbol_FollowsThePriority_AndTheDiamondOnlyWithoutTag()
        {
            Assert.That(DialogueOptionFormatter.SymbolOf(DialogueOptionMarks.QuestComplete | DialogueOptionMarks.NewQuest, DialogueOptionTag.None),
                Is.EqualTo(DialogueQuestSymbol.Complete));
            Assert.That(DialogueOptionFormatter.SymbolOf(DialogueOptionMarks.NewQuest | DialogueOptionMarks.QuestProgress, DialogueOptionTag.End),
                Is.EqualTo(DialogueQuestSymbol.NewQuest));
            Assert.That(DialogueOptionFormatter.SymbolOf(DialogueOptionMarks.QuestProgress, DialogueOptionTag.None), Is.EqualTo(DialogueQuestSymbol.Progress));
            Assert.That(DialogueOptionFormatter.SymbolOf(DialogueOptionMarks.QuestProgress, DialogueOptionTag.Bribe), Is.EqualTo(DialogueQuestSymbol.None));
            Assert.That(DialogueOptionFormatter.SymbolText(DialogueQuestSymbol.Complete), Is.EqualTo("★"));
            Assert.That(DialogueOptionFormatter.SymbolText(DialogueQuestSymbol.NewQuest), Is.EqualTo("!"));
        }

        [Test]
        public void OptionView_BuildsTheDisplayText()
        {
            var view = new DialogueOptionView("e", "Nehmt das Gold.", "k", DialogueOptionMarks.Bribe, true, default, 80, string.Empty, false);
            var kill = new DialogueOptionView("h", "Klinge.", "k", DialogueOptionMarks.Kill, true, default, 0, string.Empty, false);
            var locked = new DialogueOptionView("x", "Zauber.", "k", DialogueOptionMarks.Requirement, false, default, 0, "Magier", false);
            var trade = new DialogueOptionView("t", "Zeig deine Waren.", "k", DialogueOptionMarks.Trade | DialogueOptionMarks.NewQuest, true, default, 0,
                string.Empty, false);

            Assert.That(view.DisplayText, Is.EqualTo("[80 Gold] Nehmt das Gold."));
            Assert.That(kill.DisplayText, Is.EqualTo("[Töten] Klinge."));
            Assert.That(kill.RequiresHold, Is.True);
            Assert.That(locked.DisplayText, Is.EqualTo("[Magier] Zauber."));
            Assert.That(trade.DisplayText, Is.EqualTo("! [Handel] Zeig deine Waren."));
            Assert.That(view.AttributeKey, Is.Empty, "only checks have an attribute colour");
        }

        [Test]
        public void BadgeRules_MapActionsByInterfaceAndByTypeName()
        {
            var rules = new DialogueBadgeRules();

            Assert.That(rules.MarksOf(new Bribe(10)), Is.EqualTo(DialogueOptionMarks.Bribe));
            Assert.That(rules.MarksOf(new SetFlag("flag.test.x", 1)), Is.EqualTo(DialogueOptionMarks.None));
            Assert.That(rules.MarksOf((GameAction)null), Is.EqualTo(DialogueOptionMarks.None));

            rules.Map(nameof(SetFlag), DialogueOptionMarks.QuestComplete);

            Assert.That(rules.MarksOf(new GameAction[] { new SetFlag("flag.test.x", 1), new Bribe(5) }),
                Is.EqualTo(DialogueOptionMarks.QuestComplete | DialogueOptionMarks.Bribe));
        }

        [Test]
        public void SkillCheckResult_RememberedOnDiceMode_ShowsTheOutcome()
        {
            var won = new SkillCheckResult(SkillCheckType.Persuade, 12, 10, StatId.Charisma, 0, true, 0, 1f, true);

            Assert.That(DialogueOptionFormatter.CheckText(won, true), Is.EqualTo("[Überzeugen · bestanden]"));
        }
    }
}
