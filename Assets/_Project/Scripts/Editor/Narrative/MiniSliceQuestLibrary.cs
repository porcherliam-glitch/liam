using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Inventory;
using Aetherfall.NPC;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.World;
using Aetherfall.World.Gameplay;
using Aetherfall.WorldState;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// The three quests of the mini slice as data (GDD 02, 11.1 "Asche über Eichental", 11.2 "Die Wölfe vom Nordhang" and
    /// 11.7 "Die vergessene Gruft"), connected with the objects of the Eichental layout (locations, quest objects, enemy groups,
    /// trails, NPC markers) and the crypt (zones, puzzles, boss, seal stone; guide 12, 11.4). Built fresh on every call.
    /// </summary>
    /// <remarks>
    /// <para>Deviations until the systems exist (documented in docs/Status.md): no cutscenes, music or Aether push (skill), no
    /// bow (Hollmann's bow, arrows and straw targets are touched instead of shot), no faction reputation, no cheese item. Rift
    /// spawns are Aether wolves (layout stand-ins), so the kill objective of s30 counts them. The splitter in the den offers
    /// "zerschlagen" (stand-in for the Aether push, outcome 2) and "herausbrechen" (outcome 3).</para>
    /// <para>The crypt quest gives no blade fragment and no seal stone itself: the reward object in the arena and the seal stone
    /// object hand them out (guide 12, 11.4, no duplicates).</para>
    /// </remarks>
    public static class MiniSliceQuestLibrary
    {
        /// <summary>Quest 1 (main, prologue).</summary>
        public const string Prologue = "quest.main.asche_ueber_eichental";

        /// <summary>Quest 2 (side).</summary>
        public const string Wolves = "quest.side.eichental.woelfe_vom_nordhang";

        /// <summary>Quest 7 (dungeon).</summary>
        public const string Crypt = "quest.dungeon.eichental.vergessene_gruft";

        /// <summary>Hedda Eichholz (prologue giver and turn-in).</summary>
        public const string Hedda = "npc.eichental.dorfvorsteherin_hedda";

        /// <summary>Ansgar Hollmann (quest 2).</summary>
        public const string Hollmann = "npc.eichental.bauer_hollmann";

        /// <summary>Corvin Ascher (quest 7).</summary>
        public const string Corvin = "npc.eichental.gelehrter_corvin";

        /// <summary>Hauptmann Veit Dorn (quest 7 without Corvin).</summary>
        public const string Dorn = "npc.eichental.hauptmann_dorn";

        /// <summary>Enemy type of the wolves (also the stand-in of the rift creatures).</summary>
        public const string WolfType = "enemy.wolf.grauwolf";

        /// <summary>Variant of the glowing wolves.</summary>
        public const string AetherVariant = "aether_verderbt";

        /// <summary>Quest item of outcome 3 of quest 2.</summary>
        public const string SplinterItem = "item.quest.aethersplitter_nordhang";

        /// <summary>Seal stone of the crypt (given by the object in the seal chamber).</summary>
        public const string SealStoneItem = "item.quest.siegelstein_gruft";

        /// <summary>Flags written by the three quests.</summary>
        public const string FlagVillageDestroyed = "flag.eichental.dorf_zerstoert";

        /// <summary>Tobold was freed in s25.</summary>
        public const string FlagToboldSaved = "flag.eichental.tobold_gerettet";

        /// <summary>Wenna was saved in s25 (also read by the Mühlbach dialogue).</summary>
        public const string FlagWennaSaved = "flag.eichental.wenna_gerettet";

        /// <summary>The player received the Aether power at the rift.</summary>
        public const string FlagAetherPower = "flag.main.aether_kraft_erhalten";

        /// <summary>Outcome of quest 2: 1 fight, 2 destroyed, 3 taken.</summary>
        public const string FlagWolvesOutcome = "flag.eichental.woelfe_ausgang";

        /// <summary>Pim's fever is known (offers quest 5 later).</summary>
        public const string FlagPimFever = "flag.eichental.pim_fieber_bekannt";

        /// <summary>The North slope stays Aether-active (outcome 3).</summary>
        public const string FlagSlopeAether = "flag.eichental.nordhang_aether_aktiv";

        /// <summary>The wolf pup was taken.</summary>
        public const string FlagPup = "flag.eichental.wolfswelpe_gerettet";

        /// <summary>The dead post rider was searched (start of quest 3 later).</summary>
        public const string FlagPostRider = "flag.eichental.postreiter_gefunden";

        /// <summary>Undead walk at night (seal stone taken).</summary>
        public const string FlagUndead = "flag.eichental.gruft_untote_nachts";

        /// <summary>Where the seal stone went: 1 Corvin, 2 left in the crypt, 3 kept.</summary>
        public const string FlagSealStone = "flag.eichental.siegelstein_verbleib";

        /// <summary>Hedda heard the report from the rift (her dialogue shows it once).</summary>
        public const string FlagHeddaReport = "flag.eichental.hedda_bericht_gehoert";

        /// <summary>The wall reliefs were read (Corvin pays 40 gold for the lore).</summary>
        public const string FlagReliefsRead = "flag.eichental.gruft_reliefs_gelesen";

        /// <summary>All flags of the mini slice quests.</summary>
        public static FlagSpec[] CreateFlags()
        {
            return new[]
            {
                Bool(FlagVillageDestroyed, "Eichental ist im Prolog abgebrannt."),
                Bool(FlagToboldSaved, "Tobold wurde im Prolog unter dem Balken befreit."),
                Bool(FlagWennaSaved, "Wenna wurde im Prolog aus der brennenden Bäckerei geholt."),
                Bool(FlagAetherPower, "Die Spielfigur hat am Riss die Aether-Kraft erhalten."),
                new FlagSpec(FlagWolvesOutcome, FlagKind.Enum, 0, 0, 0, new[] { "offen", "Kampf", "zerstört", "geborgen" }, false,
                    "Ausgang von „Die Wölfe vom Nordhang“: 1 Glutfang getötet, 2 Splitter zerstört, 3 Splitter geborgen."),
                Bool(FlagPimFever, "Hollmann hat von Pims Fieber erzählt (Quest 5)."),
                Bool(FlagSlopeAether, "Am Nordhang streifen nachts Aether-Wölfe (Splitter geborgen)."),
                Bool(FlagPup, "Der Wolfswelpe aus dem Bau wurde mitgenommen."),
                Bool(FlagPostRider, "Der tote Postreiter am Nordhang wurde durchsucht (Quest 3)."),
                Bool(FlagUndead, "Der Siegelstein ist aus der Gruft genommen: nachts gehen Untote um."),
                new FlagSpec(FlagSealStone, FlagKind.Enum, 0, 0, 0, new[] { "offen", "Corvin", "belassen", "behalten" }, false,
                    "Verbleib des Siegelsteins: 1 bei Corvin, 2 in der Gruft belassen, 3 behalten."),
                Bool(FlagReliefsRead, "Die drei Wandreliefs der Gruft wurden gelesen."),
                Bool(FlagHeddaReport, "Hedda hat nach dem Prolog den Bericht vom Riss gehört.")
            };
        }

        /// <summary>The three quests.</summary>
        public static QuestSpec[] CreateQuests()
        {
            return new[] { CreatePrologue(), CreateWolves(), CreateCrypt() };
        }

        /// <summary>GDD 02, 11.1 "Asche über Eichental".</summary>
        public static QuestSpec CreatePrologue()
        {
            return new QuestSpecBuilder(Prologue)
                .Title("Asche über Eichental",
                    "Am Erntefest hat sich über Eichental ein Riss geöffnet. Lina ist fort, das Dorf brennt. Finde Überlebende und folge der grauen Gestalt.")
                .Category(QuestCategory.Main)
                .Level(1, string.Empty, "Zufall und Zeit")
                .Giver(Hedda, Hedda)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Text("Eichental brennt. Lina ist fort. Irgendwo ruft jemand um Hilfe.", "Der Dorfplatz liegt westlich, beim Brunnen.")
                    .OnStart(new SetFlag(FlagVillageDestroyed, 1))
                    .Objective(new GoToObjective("o1", "loc.eichental.dorfplatz", 15f).WithJournalText("Zum Dorfplatz gehen"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Hedda, die Dorfvorsteherin, lebt.", "Hedda steht am Brunnen auf dem Dorfplatz.")
                    .Objective(new TalkToObjective("o1", Hedda).WithJournalText("Mit Hedda sprechen"))
                    .Next("s25"))
                .Stage(new StageBuilder("s25")
                    .Text("Hedda sammelt die Überlebenden am Dorfrand. Tobold liegt unter einem Balken, Wennas Haus steht in Flammen.",
                          "Der Dorfrand liegt im Südwesten. Die Bäckerei steht nördlich des Dorfplatzes.")
                    .Objective(new GoToObjective("o1", "loc.eichental.dorfrand", 10f).WithJournalText("Zum Dorfrand gehen"))
                    .Optional(new InteractObjective("o2", 1, "obj.eichental.balken_tobold").WithVerb(InteractionVerbs.Use)
                        .WithJournalText("Befreie Tobold"), new SetFlag(FlagToboldSaved, 1))
                    .Optional(new ReachInTimeObjective("o3", "obj.eichental.tuer_haus_wenna", 120f).WithJournalText("Hol Wenna aus dem Haus"),
                        new SetFlag(FlagWennaSaved, 1))
                    .Ledger("ledger.c1")
                    .Next("s30"))
                .Stage(new StageBuilder("s30")
                    .Text("Kreaturen aus dem Riss greifen an. Halte sie von den Überlebenden fern.")
                    .OnStart(new SpawnEncounter("spawn.eichental.dorfrand_risslinge"))
                    .Objective(new KillObjective("o1", WolfType, 4, AetherVariant).WithJournalText("Kreaturen aus dem Riss besiegen"))
                    .Ledger("ledger.c2")
                    .Next("s40"))
                .Stage(new StageBuilder("s40")
                    .Text("Eine Gestalt in grauem Mantel geht ruhig durch die Flammen zum Wald. Hedda führt die anderen nach Lindenhain. Du folgst der Gestalt.",
                          "Die Spur führt nach Osten durch das Dorf zum Waldrand.")
                    .Objective(new FollowTrailObjective("o1", "spur.eichental.graue_gestalt", 7).WithJournalText("Der grauen Gestalt folgen"))
                    .Optional(new InspectCluesObjective("o2", 2, "clue.eichental.verbrannte_runen_1", "clue.eichental.verbrannte_runen_2")
                        .WithJournalText("Untersuche die verbrannten Runen"))
                    .Next("s50"))
                .Stage(new StageBuilder("s50")
                    .Text("Der Riss klafft am Waldrand. Die Gestalt wartet dort, als hätte sie dich erwartet.")
                    .Objective(new GoToObjective("o1", "loc.eichental.riss_eichental", 20f).WithJournalText("Zum Riss gehen"))
                    .OnComplete(new SetFlag(FlagAetherPower, 1))
                    .Next("s60"))
                .Stage(new StageBuilder("s60")
                    .Text("Etwas Großes kriecht aus dem Riss. Nutze die neue Kraft.")
                    .OnStart(new SpawnEncounter("spawn.eichental.rissbrut_prolog"))
                    .Objective(new KillSpecificObjective("o1", "boss.eichental.rissbrut_prolog").WithJournalText("Die Rissbrut besiegen"))
                    .Next("s70"))
                .Stage(new StageBuilder("s70")
                    .Text("Der Riss ist still, die Gestalt verschwunden. Die Überlebenden warten in Lindenhain.",
                          "Lindenhain liegt im Westen, hinter der Mühle.")
                    .Objective(new GoToObjective("o1", "loc.eichental.lindenhain", 40f).WithJournalText("Nach Lindenhain gehen"))
                    .Objective(new TalkToObjective("o2", Hedda).WithJournalText("Mit Hedda sprechen"))
                    .OnComplete(new GiveCurrency(20))
                    .Ledger("ledger.c3")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast Wenna aus dem brennenden Haus geholt.", false, new FlagIs(FlagWennaSaved, 1))
                .LedgerEntry("ledger.c2", "Für Wenna kam jede Hilfe zu spät.", false, new Not(new FlagIs(FlagWennaSaved, 1)))
                .LedgerEntry("ledger.c3", "Eine graue Gestalt hat am Riss auf dich gewartet.")
                .Rewards(new GiveXp(500), new GiveItem("item.potion.heiltrank_schwach", 3))
                .Production(ContentStatus.Draft, QuestScopeTier.A, 0, "claude", 40,
                    "Mini-Slice: ohne Zwischensequenzen, Musik und Aether-Stoß; Risslinge und Rissbrut sind Aether-Wölfe (Platzhalter).")
                .Build();
        }

        /// <summary>GDD 02, 11.2 "Die Wölfe vom Nordhang".</summary>
        public static QuestSpec CreateWolves()
        {
            var splinterUse = new InteractObjective("o2", 1, "obj.eichental.aethersplitter_bau").WithVerb(InteractionVerbs.Use);
            var splinterTake = new InteractObjective("o3", 1, "obj.eichental.aethersplitter_bau").WithVerb(InteractionVerbs.PickUp);
            return new QuestSpecBuilder(Wolves)
                .Title("Die Wölfe vom Nordhang",
                    "Ansgar Hollmann verliert jede Nacht Schafe. Er tippt auf Wölfe – aber die Spuren auf seiner Weide sind seltsam.")
                .Category(QuestCategory.Side)
                .Level(3, string.Empty, "Verborgene Ursache")
                .Giver(Hollmann, Hollmann)
                .StartTrigger(QuestStartTriggerKind.Dialogue, "dlg.eichental.hollmann")
                .StartCondition(new QuestStatusIs(Prologue, QuestStatus.Completed))
                .Stage(new StageBuilder("s10")
                    .Text("Auf der oberen Weide liegen gerissene Schafe. Sieh dir die Spuren genau an.",
                          "Die obere Weide liegt nördlich vom Hollmann-Hof.")
                    .Objective(new InspectCluesObjective("o1", 3, "clue.eichental.weide_schaf", "clue.eichental.weide_pfoten",
                        "clue.eichental.weide_aetherspeichel").WithJournalText("Untersuche die Weide"))
                    .Optional(new InteractObjective("o2", 3, "obj.eichental.strohziel_*").WithVerb(InteractionVerbs.Use)
                        .WithJournalText("Prüfe die Strohziele hinter der Scheune"), new GiveXp(30))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Die Abdrücke sind zu groß für Wölfe, und der Speichel leuchtet. Die Spur führt zum Nordhang.")
                    .OnStart(new SpawnEncounter("spawn.eichental.nordhang_rudel"))
                    .Objective(new FollowTrailObjective("o1", "spur.eichental.wolfsspur", 6).WithJournalText("Der Wolfsspur folgen"))
                    .Optional(new InteractObjective("o2", 1, "obj.eichental.leiche_postreiter").WithVerb(InteractionVerbs.Use)
                        .WithJournalText("Untersuche den Toten am Weg"), new SetFlag(FlagPostRider, 1))
                    .Next("s30"))
                .Stage(new StageBuilder("s30")
                    .Text("Am Nordhang leben Wölfe, die von innen leuchten. Ihr Bau liegt unter dem Wolfskopf-Felsen.")
                    .Objective(new GoToObjective("o1", "loc.eichental.wolfsbau_nordhang", 10f).WithJournalText("Zum Wolfsbau gehen"))
                    .Optional(new KillObjective("o2", WolfType, 3, AetherVariant).WithJournalText("Leuchtende Wölfe besiegen"))
                    .Next("s40"))
                .Stage(new StageBuilder("s40")
                    .Text("Im Bau steckt ein Aether-Splitter im Fels. Der Leitwolf Glutfang ist mit ihm verwachsen. Töte ihn, zerstöre den Splitter oder brich ihn heraus.")
                    .OnStart(new SpawnEncounter("spawn.eichental.glutfang"))
                    .Objective(new KillSpecificObjective("o1", "boss.eichental.glutfang").WithJournalText("Glutfang töten"))
                    .Objective(splinterUse.WithJournalText("Den Splitter zerschlagen"))
                    .Objective(splinterTake.WithJournalText("Den Splitter herausbrechen"))
                    .Optional(new InteractObjective("o4", 1, "obj.eichental.wolfswelpe").WithVerb(InteractionVerbs.PickUp)
                        .WithJournalText("Nimm den Welpen mit"), new SetFlag(FlagPup, 1))
                    .AnyObjective()
                    .Branch(new QuestObjectiveDone("o1"), "s50_kampf", "Glutfang getötet")
                    .Branch(new QuestObjectiveDone("o3"), "s45_geborgen", "Splitter geborgen")
                    .Next("s50_zerstoert"))
                .Stage(new StageBuilder("s45_geborgen")
                    .Text("Du hast den Splitter. Das Rudel ist außer sich vor Wut.")
                    .OnStart(new GiveItem(SplinterItem), new SpawnEncounter("spawn.eichental.bau_wut"))
                    .Objective(new KillSpecificObjective("o1", "boss.eichental.glutfang").WithJournalText("Glutfang töten"))
                    .Objective(new KillObjective("o2", WolfType, 3, AetherVariant).WithJournalText("Das wütende Rudel besiegen"))
                    .Next("s50_geborgen"))
                .Stage(TurnIn("s50_kampf", "Glutfang ist tot. Die übrigen Wölfe fliehen in die Berge.", "ledger.c1",
                    new SetFlag(FlagWolvesOutcome, 1), new SetFlag(FlagPimFever, 1), new GiveCurrency(60)))
                .Stage(TurnIn("s50_zerstoert", "Der Splitter ist zerbrochen. Das Leuchten erlischt. Die Wölfe sind wieder nur Wölfe und laufen davon.",
                    "ledger.c2", new SetFlag(FlagWolvesOutcome, 2), new SetFlag(FlagPimFever, 1), new ChangeRelationship(Hollmann, 10),
                    new GiveCurrency(60)))
                .Stage(TurnIn("s50_geborgen", "Der Splitter ist in deiner Tasche. Am Nordhang heulen die Wölfe lauter als zuvor.", "ledger.c3",
                    new SetFlag(FlagWolvesOutcome, 3), new SetFlag(FlagSlopeAether, 1), new SetFlag(FlagPimFever, 1), new GiveCurrency(60)))
                .LedgerEntry("ledger.c1", "Du hast Glutfang, den Leitwolf vom Nordhang, getötet.")
                .LedgerEntry("ledger.c2", "Du hast den Aether-Splitter im Wolfsbau zerschlagen. Die Wölfe sind wieder nur Wölfe.")
                .LedgerEntry("ledger.c3", "Du hast den Aether-Splitter aus dem Wolfsbau mitgenommen.", true)
                .Rewards(new GiveXp(0.5f, 3))
                .Production(ContentStatus.Draft, QuestScopeTier.A, 75, "claude", 20,
                    "Mini-Slice: ohne Bogen (Strohziele werden geprüft statt beschossen) und ohne Aether-Stoß (Splitter zerschlagen).")
                .Build();
        }

        /// <summary>GDD 02, 11.7 "Die vergessene Gruft" (sources: guide 12, 11.4).</summary>
        public static QuestSpec CreateCrypt()
        {
            return new QuestSpecBuilder(Crypt)
                .Title("Die vergessene Gruft",
                    "Corvin Ascher vom Aether-Konvent will den Siegelstein aus der Gruft der Eichenritter. Der Eingang liegt in der Senke unter dem Rabenfels.")
                .Category(QuestCategory.Dungeon)
                .Level(6, string.Empty, "Moralischer Preis")
                .Giver(Corvin, Corvin, Dorn)
                .StartTrigger(QuestStartTriggerKind.AreaEntered, "loc.eichental.vergessene_gruft")
                .StartCondition(new QuestStatusIs(Prologue, QuestStatus.Completed))
                .Stage(new StageBuilder("s10")
                    .Text("Corvin will den Siegelstein aus der Gruft der Eichenritter. Der Eingang liegt in der Senke unter dem Rabenfels.",
                          "Der Rabenfels ragt im Norden über dem Dorf auf.")
                    .Objective(new GoToObjective("o1", "loc.eichental.vergessene_gruft", 12f).WithJournalText("Zur Gruft gehen"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Text("Das Tor ist versiegelt. Die Inschrift nennt eine Reihenfolge: „Erst die Eiche, die den Schild trug, dann die Krone, die sich beugte, zuletzt der Schild, der nie brach.“")
                    .Objective(new ConditionObjective("o1", new PuzzleIsSolved("puzzle.eichental.gruft_grabplatten")).WithJournalText("Das Tor öffnen"))
                    .Optional(new InspectCluesObjective("o2", 3, "clue.eichental.gruft_wandrelief_1", "clue.eichental.gruft_wandrelief_2",
                        "clue.eichental.gruft_wandrelief_3").WithJournalText("Untersuche die Wandreliefs"), new SetFlag(FlagReliefsRead, 1))
                    .Next("s30"))
                .Stage(new StageBuilder("s30")
                    .Text("In den Hallen der Eichenritter regen sich die Toten. Die Siegelkammer liegt in der Tiefe.")
                    .Objective(new GoToObjective("o1", "loc.eichental.gruft_siegelkammer_vorraum", 6f).WithJournalText("Zur Siegelkammer gehen"))
                    .Optional(new InteractObjective("o2", 1, "obj.eichental.gruft_kaefig").WithVerb(InteractionVerbs.Use)
                        .WithJournalText("Befreie den Grabräuber"))
                    .Next("s40"))
                .Stage(new StageBuilder("s40")
                    .Text("Ein Strahl aus Aether-Licht fällt durch einen Spalt. Drei Spiegel stehen schief in ihren Halterungen.")
                    .Objective(new ConditionObjective("o1", new PuzzleIsSolved("puzzle.eichental.gruft_spiegel")).WithJournalText("Den Strahl zum Siegel lenken"))
                    .Next("s50"))
                .Stage(new StageBuilder("s50")
                    .Text("Vor dem Siegelstein erhebt sich der Wachende Ritter.")
                    .Objective(new KillSpecificObjective("o1", "boss.eichental.wachender_ritter").WithJournalText("Den Wachenden Ritter besiegen"))
                    .Next("s60"))
                .Stage(new StageBuilder("s60")
                    .Text("Der Siegelstein liegt frei. Die Inschrift warnt: „Wer den Riegel nimmt, öffnet die Gräber.“")
                    .Objective(new InteractObjective("o1", 1, "obj.eichental.gruft_siegelstein").WithVerb(InteractionVerbs.PickUp)
                        .WithJournalText("Nimm den Siegelstein"))
                    .Objective(new GoToObjective("o2", "loc.eichental.gruft_ausgang", 6f).WithJournalText("Lass ihn liegen und geh"))
                    .AnyObjective()
                    .Branch(new QuestObjectiveDone("o1"), "s70_genommen", "Stein genommen")
                    .Next("s70_belassen"))
                .Stage(new StageBuilder("s70_genommen")
                    .Text("Du hast den Siegelstein. Hinter dir knirschen Sargdeckel.")
                    .OnStart(new SetFlag(FlagUndead, 1))
                    .Objective(new ConditionObjective("o1", new FlagIs(FlagSealStone, 1)).VisibleWhen(new NpcAlive(Corvin))
                        .WithJournalText("Bring den Siegelstein zu Corvin")
                        .WithCompletionActions(new GiveCurrency(120)))
                    .Objective(new ConditionObjective("o2", new Not(new NpcAlive(Corvin))).VisibleWhen(new Not(new NpcAlive(Corvin)))
                        .WithJournalText("Behalte den Stein")
                        .WithCompletionActions(new SetFlag(FlagSealStone, 3)))
                    .AnyObjective()
                    .Ledger("ledger.c1")
                    .EndSuccess())
                .Stage(new StageBuilder("s70_belassen")
                    .Text("Die Gruft bleibt versiegelt. Corvin wird nicht erfreut sein.")
                    .Objective(new TalkToObjective("o1", Corvin).VisibleWhen(new NpcAlive(Corvin)).WithJournalText("Mit Corvin sprechen"))
                    .Objective(new TalkToObjective("o2", Dorn).VisibleWhen(new Not(new NpcAlive(Corvin))).WithJournalText("Mit Hauptmann Dorn sprechen"))
                    .AnyObjective()
                    .OnComplete(new SetFlag(FlagSealStone, 2),
                        new ConditionalAction(new NpcAlive(Corvin), new GameAction[] { new ChangeRelationship(Corvin, -10) }),
                        new ConditionalAction(new FlagIs(FlagReliefsRead, 1), new GameAction[] { new GiveCurrency(40) }))
                    .Ledger("ledger.c2")
                    .EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast den Siegelstein aus der Gruft genommen. Nachts gehen im Tal Untote um.", true)
                .LedgerEntry("ledger.c2", "Du hast den Siegelstein in der Gruft gelassen. Die Toten schlafen weiter.")
                .Rewards(new GiveXp(0.6f, 6))
                .Production(ContentStatus.Draft, QuestScopeTier.A, 150, "claude", 35,
                    "Mini-Slice: ohne Fraktionsruf; Klingenfragment und Siegelstein geben die Objekte der Gruft (Anleitung 12, 11.4).")
                .Build();
        }

        private static StageBuilder TurnIn(string stageId, string text, string ledgerId, params GameAction[] actions)
        {
            return new StageBuilder(stageId)
                .Text(text, "Hollmann wartet auf seinem Hof.")
                .Objective(new TalkToObjective("o1", Hollmann).WithJournalText("Mit Hollmann sprechen"))
                .OnComplete(actions)
                .Ledger(ledgerId)
                .EndSuccess();
        }

        private static FlagSpec Bool(string id, string description)
        {
            return new FlagSpec(id, FlagKind.Bool, 0, 0, 0, null, false, description);
        }
    }
}
