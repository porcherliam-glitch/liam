using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.WorldState;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// The two test quests of the test ground as data (guide 09): "Wolfsjagd im Testgelaende" (accept at the notice board,
    /// defeat 3 wolves in the arena, pick up a wolf fur, back to the board, reward XP, gold and potions, world state flag) and
    /// "Die Bewaehrungsprobe" (go to the training ground, then open a chest OR hit the training dummy three times: a branch
    /// with two endings, flags and ledger entries). They use only real condition, action and objective types, so the menu
    /// "Aetherfall > Testgelaende erstellen" (German menu text) writes them as assets that the quest validator accepts.
    /// </summary>
    /// <remarks>
    /// <para>The ids of the scene objects (notice board, chests, dummy, training ground zone) are the ones the test ground menu
    /// uses. Built fresh on every call: specs and the objects inside them are never shared between quests or assets.</para>
    /// <para>Levels: made for the test character of level 10 (<see cref="TestGroundLevels"/>). Each quest gives 0.5 Lv at level
    /// 10 = 1110 XP, so the level-up to 11 (2220 XP) comes with the second quest.</para>
    /// </remarks>
    public static class TestGroundQuestLibrary
    {
        /// <summary>Quest "Wolfsjagd im Testgelaende".</summary>
        public const string WolfHuntId = "quest.side.test.wolfsjagd";

        /// <summary>Quest "Die Bewaehrungsprobe" (branching).</summary>
        public const string TrialId = "quest.side.test.bewaehrungsprobe";

        /// <summary>Object id of the notice board (giver and turn-in).</summary>
        public const string BoardId = "obj.test.anschlagtafel";

        /// <summary>Location id of the training ground zone next to the dummy.</summary>
        public const string TrainingGroundId = "loc.test.uebungsplatz";

        /// <summary>Combatant id of the training dummy.</summary>
        public const string DummyId = "trainingspuppe";

        /// <summary>Group of the chests of the test ground (any of the three).</summary>
        public const string ChestGroup = "obj.test.truhe_*";

        /// <summary>Enemy type of the arena wolves (the Aether wolf is a variant of it).</summary>
        public const string WolfTypeId = "enemy.wolf.grauwolf";

        /// <summary>Wolf fur (guaranteed loot of the grey wolf).</summary>
        public const string WolfFurId = "item.material.wolfsfell";

        /// <summary>Small healing potion (reward).</summary>
        public const string PotionId = "item.potion.heiltrank_schwach";

        /// <summary>Flag: the wolf hunt is done (bool).</summary>
        public const string FlagWolfHuntDone = "flag.test.wolfsjagd_erledigt";

        /// <summary>Flag: the path of the trial (enum: 0 open, 1 chest, 2 dummy).</summary>
        public const string FlagTrialPath = "flag.test.bewaehrung_weg";

        /// <summary>
        /// Recommended level and reference level of the level share rewards: the start level of the test ground (level 10), so
        /// the rewards are not attenuated (GDD 02 8.4) and both quests together fill exactly one level (2 × 0.5 × 2220 XP).
        /// </summary>
        public const int RecommendedLevel = TestGroundLevels.PlayerStartLevel;

        /// <summary>Level share of each quest reward (GDD 02 2.2: side quests up to level 10 give 0.3–0.5 Lv).</summary>
        public const float RewardLevelShare = 0.5f;

        /// <summary>The flag definitions both quests need.</summary>
        public static FlagSpec[] CreateFlags()
        {
            return new[]
            {
                new FlagSpec(FlagWolfHuntDone, FlagKind.Bool, 0, 0, 0, null, false, "Testgelände: Die Wolfsjagd ist abgeschlossen (schaltet „Die Bewährungsprobe“ frei)."),
                new FlagSpec(FlagTrialPath, FlagKind.Enum, 0, 0, 0, new[] { "offen", "truhe", "puppe" }, false,
                    "Testgelände: Weg der Bewährungsprobe – 1 = Truhe geöffnet, 2 = Trainingspuppe getroffen.")
            };
        }

        /// <summary>Both quests.</summary>
        public static QuestSpec[] CreateQuests()
        {
            return new[] { CreateWolfHunt(), CreateTrial() };
        }

        /// <summary>"Wolfsjagd im Testgelaende": board → 3 wolves → wolf fur → back to the board → reward.</summary>
        public static QuestSpec CreateWolfHunt()
        {
            return new QuestSpecBuilder(WolfHuntId)
                .Title("Wolfsjagd im Testgelände",
                    "Ein Aushang an der Anschlagtafel: Wölfe streifen durch die Kampfarena. Wer drei von ihnen erlegt und ein Fell als Beweis bringt, bekommt eine Belohnung.")
                .Category(QuestCategory.Side)
                .Level(RecommendedLevel)
                .Giver(BoardId)
                .StartTrigger(QuestStartTriggerKind.NoticeBoard, BoardId)
                .Stage(new StageBuilder("s10")
                    .Text("Drei Wölfe streifen durch die Kampfarena südwestlich des Startpunkts. Besiege sie.",
                          "Die Arena liegt hinter der Trainingspuppe, dort wo die großen Felsen stehen.")
                    .Objective(new KillObjective("o1", WolfTypeId, 3).WithJournalText("Wölfe besiegen"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Die Wölfe sind besiegt. Nimm ein Wolfsfell als Beweis mit.")
                    .Objective(new CollectObjective("o1", WolfFurId, 1).WithJournalText("Wolfsfell aufheben"))
                    .Next("s30"))
                .Stage(new StageBuilder("s30")
                    .Text("Bring das Wolfsfell zur Anschlagtafel beim Startpunkt.")
                    .Objective(new InteractObjective("o1", 1, BoardId).WithVerb(InteractionVerbs.Read).WithJournalText("An der Anschlagtafel melden"))
                    .Branch(new HasItem(WolfFurId, 1, true), "s40_belohnung", "Fell dabei")
                    .Next("s20"))
                .Stage(new StageBuilder("s40_belohnung")
                    .Text("Du hast das Wolfsfell an der Anschlagtafel abgegeben. Die Belohnung gehört dir.")
                    .ActionOnly()
                    .OnStart(new RemoveItem(WolfFurId, 1), new SetFlag(FlagWolfHuntDone, 1))
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast drei Wölfe in der Kampfarena erlegt und das Fell an der Anschlagtafel abgegeben.")
                .Rewards(new GiveXp(RewardLevelShare, RecommendedLevel), new GiveCurrency(50, CurrencyIds.Gold), new GiveItem(PotionId, 2))
                .Production(ContentStatus.Draft, QuestScopeTier.A, 0, "claude", 120, "Test-Quest des Testgeländes (Anleitung 09).")
                .Build();
        }

        /// <summary>"Die Bewaehrungsprobe": go to the training ground, then chest OR dummy (two endings).</summary>
        public static QuestSpec CreateTrial()
        {
            return new QuestSpecBuilder(TrialId)
                .Title("Die Bewährungsprobe",
                    "Ein zweiter Aushang: Zeig am Übungsplatz, was du kannst. Ob du eine Truhe öffnest oder die Trainingspuppe triffst, entscheidest du.")
                .Category(QuestCategory.Side)
                .Level(RecommendedLevel)
                .Giver(BoardId)
                .StartTrigger(QuestStartTriggerKind.NoticeBoard, BoardId)
                .StartCondition(new FlagIs(FlagWolfHuntDone, 1))
                .Stage(new StageBuilder("s10")
                    .Text("Geh zum Übungsplatz bei der Trainingspuppe.", "Die Trainingspuppe steht südwestlich des Startpunkts, links hinter der Mauer.")
                    .Objective(new GoToObjective("o1", TrainingGroundId, 6f).WithJournalText("Zum Übungsplatz gehen"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Entscheide dich: Öffne eine der Truhen beim Startpunkt oder triff die Trainingspuppe dreimal.")
                    .Objective(new InteractObjective("o1", 1, ChestGroup).WithVerb(InteractionVerbs.Open).WithJournalText("Eine Truhe öffnen"))
                    .Objective(new HitTargetObjective("o2", 3, DummyId).WithJournalText("Trainingspuppe treffen"))
                    .AnyObjective()
                    .Branch(new QuestObjectiveDone("o1"), "s30_truhe", "Truhe geöffnet")
                    .Next("s30_puppe"))
                .Stage(new StageBuilder("s30_truhe")
                    .Text("Du hast eine Truhe geöffnet – Neugier zahlt sich aus.")
                    .ActionOnly()
                    .OnStart(new SetFlag(FlagTrialPath, 1), new GiveCurrency(25, CurrencyIds.Gold))
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .Stage(new StageBuilder("s30_puppe")
                    .Text("Die Trainingspuppe hat drei Treffer eingesteckt – deine Technik sitzt.")
                    .ActionOnly()
                    .OnStart(new SetFlag(FlagTrialPath, 2), new GiveXp(60))
                    .Ledger("ledger.c2")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast dich für die Truhe entschieden und 25 Gold extra bekommen.", false, new FlagIs(FlagTrialPath, 1))
                .LedgerEntry("ledger.c2", "Du hast an der Trainingspuppe geübt und 60 Erfahrung extra bekommen.", false, new FlagIs(FlagTrialPath, 2))
                .Rewards(new GiveXp(RewardLevelShare, RecommendedLevel), new GiveCurrency(20, CurrencyIds.Gold))
                .Production(ContentStatus.Draft, QuestScopeTier.A, 0, "claude", 120, "Test-Quest des Testgeländes mit Verzweigung (Anleitung 09).")
                .Build();
        }
    }
}
