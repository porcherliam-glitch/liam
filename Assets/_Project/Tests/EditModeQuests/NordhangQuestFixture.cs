using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Quests;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Test data of the example quest "Die Woelfe vom Nordhang" (GDD 02, 11.2) built exactly like its stage table, plus the
    /// two neighbours it needs: the prologue "Asche ueber Eichental" (start condition, shortened to two stages) and the
    /// follow-up "Das Kraut der Kraeuterfrau" (offered after the wolves, shortened). Shows how a designer's table becomes quest
    /// data; the same structure is entered in the inspector of a <c>QuestDefinition</c> asset.
    /// </summary>
    /// <remarks>
    /// Effects of systems that do not exist yet use stand-ins: <see cref="GiveTestItem"/> (<c>GibItem</c>),
    /// <see cref="GiveTestGold"/> (<c>GibGold</c>), <see cref="RecordAction"/> (<c>Gegner+</c>, <c>Beziehung</c>,
    /// <c>GiveXp</c>), <see cref="TestHourBetween"/> (Glutfang sleeps from 06 to 20 o'clock).
    /// </remarks>
    public static class NordhangQuestFixture
    {
        /// <summary>Prologue (main quest 1).</summary>
        public const string AscheId = "quest.main.asche_ueber_eichental";

        /// <summary>"Die Woelfe vom Nordhang".</summary>
        public const string WolvesId = "quest.side.eichental.woelfe_vom_nordhang";

        /// <summary>"Das Kraut der Kraeuterfrau" (follow-up, offered).</summary>
        public const string HerbId = "quest.side.eichental.kraut_der_kraeuterfrau";

        /// <summary>Quest giver of the wolves.</summary>
        public const string Hollmann = "npc.eichental.bauer_hollmann";

        /// <summary>Quest giver of the herb quest.</summary>
        public const string Alwine = "npc.eichental.kraeuterfrau_alwine";

        /// <summary>Village elder (prologue).</summary>
        public const string Hedda = "npc.eichental.dorfvorsteherin_hedda";

        /// <summary>Outcome of the wolves: 1 fight, 2 destroyed, 3 recovered.</summary>
        public const string FlagOutcome = "flag.eichental.woelfe_ausgang";

        /// <summary>Hollmann told about Pim's fever.</summary>
        public const string FlagPimFever = "flag.eichental.pim_fieber_bekannt";

        /// <summary>The splinter was taken: aether wolves roam at night.</summary>
        public const string FlagAetherActive = "flag.eichental.nordhang_aether_aktiv";

        /// <summary>The wolf pup was taken along.</summary>
        public const string FlagPupSaved = "flag.eichental.wolfswelpe_gerettet";

        /// <summary>Set by the prologue.</summary>
        public const string FlagVillageDestroyed = "flag.eichental.dorf_zerstoert";

        /// <summary>The three clues of s10.</summary>
        public const string ClueSheep = "clue.eichental.weide_schaf";

        /// <summary>Second clue.</summary>
        public const string CluePaws = "clue.eichental.weide_pfoten";

        /// <summary>Third clue.</summary>
        public const string ClueSaliva = "clue.eichental.weide_aetherspeichel";

        /// <summary>Straw targets of the bow tutorial (group pattern).</summary>
        public const string StrawTargetPattern = "obj.eichental.strohziel_*";

        /// <summary>Corpse of the post rider (s20 o2, start of quest 3).</summary>
        public const string PostRider = "obj.eichental.leiche_postreiter";

        /// <summary>Trail of s20.</summary>
        public const string Trail = "spur.eichental.wolfsspur";

        /// <summary>Number of trail nodes.</summary>
        public const int TrailNodes = 3;

        /// <summary>Wolf den (s30).</summary>
        public const string Den = "loc.eichental.wolfsbau_nordhang";

        /// <summary>Grey wolf.</summary>
        public const string GreyWolf = "enemy.wolf.grauwolf";

        /// <summary>Aether-corrupted variant.</summary>
        public const string AetherVariant = "aether_verderbt";

        /// <summary>Lead wolf Glutfang.</summary>
        public const string Glutfang = "boss.eichental.glutfang";

        /// <summary>Aether push.</summary>
        public const string AetherPush = "ability.aether.aether_stoss";

        /// <summary>The splinter in the den.</summary>
        public const string Splinter = "obj.eichental.aethersplitter_bau";

        /// <summary>The wolf pup (optional).</summary>
        public const string Pup = "obj.eichental.wolfswelpe";

        /// <summary>Hollmann's bow.</summary>
        public const string Bow = "item.weapon.hollmanns_jagdbogen";

        /// <summary>Arrows.</summary>
        public const string Arrow = "item.ammo.pfeil";

        /// <summary>Aether wolf fur (optional kill reward).</summary>
        public const string AetherFur = "item.material.wolfspelz_aether";

        /// <summary>The splinter as quest item (way 3).</summary>
        public const string SplinterItem = "item.quest.aethersplitter_nordhang";

        /// <summary>Cheese (way 2).</summary>
        public const string Cheese = "item.food.hollmanns_kaese";

        /// <summary>Herb of the follow-up stub.</summary>
        public const string RiftMoss = "item.herb.rissmoos";

        /// <summary>Flag definitions used by the three quests (the flag register of the region).</summary>
        public static FlagRegistry CreateFlags()
        {
            return FlagRegistry.FromSpecs(
                FlagSpec.Enum(FlagOutcome, "unbekannt", "Kampf", "zerstört", "geborgen"),
                FlagSpec.Bool(FlagPimFever),
                FlagSpec.Bool(FlagAetherActive),
                FlagSpec.Bool(FlagPupSaved),
                FlagSpec.Bool(FlagVillageDestroyed));
        }

        /// <summary>All three quests (prologue, wolves, herb).</summary>
        public static QuestSpec[] CreateAll()
        {
            return new[] { CreateAsche(), CreateWolves(), CreateHerb() };
        }

        /// <summary>The prologue, shortened to two stages (starts automatically, no giver).</summary>
        public static QuestSpec CreateAsche()
        {
            return new QuestSpecBuilder(AscheId)
                .Title("Asche über Eichental", "Am Erntefest öffnet sich über Eichental ein Riss.")
                .Category(QuestCategory.Main)
                .Level(1, "region.eichental")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Text("Eichental brennt. Lina ist fort. Irgendwo ruft jemand um Hilfe.", "Der Dorfplatz liegt mitten im Rauch.")
                    .Objective(new GoToObjective("o1", "loc.eichental.dorfplatz", 15f))
                    .OnStart(new SetFlag(FlagVillageDestroyed, 1))
                    .Next("s70"))
                .Stage(new StageBuilder("s70")
                    .Text("Die Überlebenden warten in Lindenhain.")
                    .Objective(new TalkToObjective("o1", Hedda))
                    .OnComplete(new GiveTestGold(20))
                    .Ledger("ledger.c2")
                    .EndSuccess())
                .LedgerEntry("ledger.c2", "Eine graue Gestalt hat am Riss auf dich gewartet.")
                .Rewards(new RecordAction("GiveXp 500"))
                .Build();
        }

        /// <summary>"Die Woelfe vom Nordhang" exactly as in GDD 02, 11.2.</summary>
        public static QuestSpec CreateWolves()
        {
            return new QuestSpecBuilder(WolvesId)
                .Title("Die Wölfe vom Nordhang", "Ansgar Hollmann verliert jede Nacht Schafe. Er tippt auf Wölfe.")
                .Category(QuestCategory.Side)
                .Level(3, "region.eichental", "verborgene_ursache")
                .Giver(Hollmann, string.Empty, "npc.eichental.wirt_ulf")
                .StartTrigger(QuestStartTriggerKind.Dialogue, "dlg.eichental.hollmann_schafe")
                .StartCondition(new QuestStatusIs(AscheId, QuestStatus.Completed))
                .Stage(new StageBuilder("s10")
                    .Text("Auf der oberen Weide liegen gerissene Schafe. Hollmann hat dir seinen alten Jagdbogen geliehen.",
                          "Die gerissenen Schafe liegen auf der oberen Weide hinter Hollmanns Scheune, beim umgestürzten Zaun.")
                    .Objective(new InspectCluesObjective("o1", 3, ClueSheep, CluePaws, ClueSaliva))
                    .Optional(new InteractObjective("o2", 3, StrawTargetPattern).WithJournalText("Triff die Strohziele hinter der Scheune"),
                              new GiveTestItem(Arrow, 10))
                    .OnStart(new GiveTestItem(Bow), new GiveTestItem(Arrow, 30))
                    .Markers(50f, ClueSheep, CluePaws, ClueSaliva)
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Die Abdrücke sind zu groß für Wölfe, und der Speichel leuchtet. Die Spur führt zum Nordhang.",
                          "Die Spur führt bergauf zum Nordhang, dorthin, wo die Birken enden.")
                    .Objective(new FollowTrailObjective("o1", Trail, TrailNodes))
                    .Optional(new InteractObjective("o2", 1, PostRider).WithJournalText("Untersuche den Toten am Weg"),
                              new RecordAction("StartQuest quest.side.eichental.brief_der_nie_ankam"))
                    .OnStart(new RecordAction("Gegner+ spawn.eichental.nordhang_rudel"))
                    .Next("s30"))
                .Stage(new StageBuilder("s30")
                    .Text("Am Nordhang leben Wölfe, die von innen leuchten. Ihr Bau liegt unter dem Wolfskopf-Felsen.",
                          "Der Bau liegt unter dem Felsen, der aussieht wie ein Wolfskopf.")
                    .Objective(new GoToObjective("o1", Den, 10f))
                    .Optional(new KillObjective("o2", GreyWolf, 3, AetherVariant), new GiveTestItem(AetherFur, 3))
                    .Next("s40"))
                .Stage(new StageBuilder("s40")
                    .Text("Im Bau steckt ein Aether-Splitter im Fels. Der Leitwolf Glutfang ist mit ihm verwachsen. Töte ihn, zerstöre den Splitter oder brich ihn heraus.",
                          "Im hinteren Teil des Baus leuchtet etwas im Fels.")
                    .Objective(new KillSpecificObjective("o1", Glutfang))
                    .Objective(new UseAbilityObjective("o2", AetherPush, Splinter).WithJournalText("Zerstöre den Splitter"))
                    .Objective(new InteractObjective("o3", 1, Splinter).WithJournalText("Brich den Splitter heraus"))
                    .Optional(new InteractObjective("o4", 1, Pup).WithJournalText("Nimm den Welpen mit")
                                  .VisibleWhen(new TestHourBetween(6, 20)),
                              new SetFlag(FlagPupSaved, 1))
                    .AnyObjective()
                    .OnStart(new RecordAction("Gegner+ spawn.eichental.glutfang"))
                    .Branch(new QuestObjectiveDone("o1"), "s50_kampf", "Glutfang getötet")
                    .Branch(new QuestObjectiveDone("o2"), "s50_zerstoert", "Splitter zerstört")
                    .Next("s45_geborgen"))
                .Stage(new StageBuilder("s45_geborgen")
                    .Text("Du hast den Splitter. Das Rudel ist außer sich vor Wut.")
                    .Objective(new KillSpecificObjective("o1", Glutfang))
                    .Objective(new KillObjective("o2", GreyWolf, 3, AetherVariant))
                    .OnStart(new GiveTestItem(SplinterItem), new RecordAction("Gegner+ spawn.eichental.bau_wut"))
                    .Next("s50_geborgen"))
                .Stage(new StageBuilder("s50_kampf")
                    .Text("Glutfang ist tot. Die übrigen Wölfe fliehen in die Berge.",
                          "Hollmanns Hof liegt nördlich von Lindenhain, gleich hinter der Steinbrücke.")
                    .Objective(new TalkToObjective("o1", Hollmann))
                    .OnComplete(new SetFlag(FlagOutcome, 1), new SetFlag(FlagPimFever, 1), new GiveTestGold(60))
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .Stage(new StageBuilder("s50_zerstoert")
                    .Text("Der Splitter ist zerbrochen. Das Leuchten erlischt. Die Wölfe sind wieder nur Wölfe und laufen davon.",
                          "Hollmanns Hof liegt nördlich von Lindenhain, gleich hinter der Steinbrücke.")
                    .Objective(new TalkToObjective("o1", Hollmann))
                    .OnComplete(new SetFlag(FlagOutcome, 2), new SetFlag(FlagPimFever, 1), new RecordAction("Beziehung npc.eichental.bauer_hollmann +10"),
                                new GiveTestGold(60), new GiveTestItem(Cheese, 3))
                    .Ledger("ledger.c2")
                    .EndSuccess())
                .Stage(new StageBuilder("s50_geborgen")
                    .Text("Der Splitter ist in deiner Tasche. Am Nordhang heulen die Wölfe lauter als zuvor.",
                          "Hollmanns Hof liegt nördlich von Lindenhain, gleich hinter der Steinbrücke.")
                    .Objective(new TalkToObjective("o1", Hollmann))
                    .OnComplete(new SetFlag(FlagOutcome, 3), new SetFlag(FlagAetherActive, 1), new SetFlag(FlagPimFever, 1), new GiveTestGold(60))
                    .Ledger("ledger.c3")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast Glutfang getötet. Das Rudel ist in die Berge geflohen.")
                .LedgerEntry("ledger.c2", "Du hast den Aether-Splitter im Wolfsbau zerstört. Die Wölfe sind wieder nur Wölfe.")
                .LedgerEntry("ledger.c3", "Du hast den Aether-Splitter behalten. Am Nordhang streifen nachts Aether-Wölfe.")
                .Rewards(new RecordAction("GiveXp 0.5 Lv"))
                .FollowUp(HerbId, FollowUpMode.Offer)
                .Production(ContentStatus.Draft, QuestScopeTier.A, 75, "liam", 1500)
                .Build();
        }

        /// <summary>"Das Kraut der Kraeuterfrau", shortened: collect three rift moss and bring news to Alwine.</summary>
        public static QuestSpec CreateHerb()
        {
            return new QuestSpecBuilder(HerbId)
                .Title("Das Kraut der Kräuterfrau", "Alwine braucht Kräuter für einen Fiebertrank.")
                .Category(QuestCategory.Side)
                .Level(5, "region.eichental")
                .Giver(Alwine)
                .StartTrigger(QuestStartTriggerKind.Dialogue, "dlg.eichental.alwine_kraeuter")
                .StartCondition(new AllOf(new QuestStatusIs(AscheId, QuestStatus.Completed), new QuestStatusIs(WolvesId, QuestStatus.Completed)))
                .Stage(new StageBuilder("s10")
                    .Text("Alwine braucht Rissmoos vom Rand des Risses.")
                    .Objective(new CollectObjective("o1", RiftMoss, 3))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Bring Alwine das Moos.")
                    .Objective(new TalkToObjective("o1", Alwine))
                    .Branch(new FlagIs(FlagAetherActive, 1), "s30_unruhig")
                    .Next("s30_ruhig"))
                .Stage(new StageBuilder("s30_ruhig")
                    .Text("Pims Fieber sinkt.")
                    .ActionOnly()
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .Stage(new StageBuilder("s30_unruhig")
                    .Text("Pims Fieber sinkt nur langsam. Der Nordhang leuchtet.")
                    .ActionOnly()
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast Alwine das Rissmoos gebracht.")
                .Rewards(new GiveTestGold(40))
                .Build();
        }
    }
}
