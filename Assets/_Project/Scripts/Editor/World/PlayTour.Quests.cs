using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Companions;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Economy;
using Aetherfall.Minigames;
using Aetherfall.NPC;
using Aetherfall.Player;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Aetherfall.World;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using Aetherfall.WorldState;
using UnityEngine;
using Object = UnityEngine.Object;
using D = Aetherfall.EditorTools.Narrative.MiniSliceDialogueLibrary;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Automated play-through of the mini slice quests (<c>-tourMode quests</c>): "Asche über Eichental", "Die Wölfe vom
    /// Nordhang" and "Die vergessene Gruft" from the first step to the reward, the way a player does it – the player is placed in
    /// front of each object, NPC or portal and uses it through the <see cref="PlayerInteractor"/> (range, facing and "usable now"
    /// as in play), walks into the location zones and along the trails, solves the crypt puzzles slab by slab and mirror by
    /// mirror, and the enemies of the quest groups are defeated. After every step the tour checks the quest stage and writes it
    /// into the report. The player is invulnerable during the run.
    /// </summary>
    public static partial class PlayTour
    {
        private const string TourInvulnerability = "tour.quests";

        private static void BuildQuestPlan()
        {
            Steps.Enqueue(MakePlayerInvulnerable);

            // GDD 02 11.1 "Asche über Eichental".
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s10"));
            Steps.Enqueue(GoToArea("loc.eichental.dorfplatz"));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s20"));
            Steps.Enqueue(TalkTo(Q.Hedda));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s25"));
            Steps.Enqueue(() => Capture("q01_hedda_dorfplatz", null));
            Steps.Enqueue(UseObject("obj.eichental.balken_tobold", QuestObjectAction.Use));
            Steps.Enqueue(() => WaitFlag(Q.FlagToboldSaved, 1));
            Steps.Enqueue(GoToArea(MiniSliceWorld.WennaDoorId));
            Steps.Enqueue(() => WaitFlag(Q.FlagWennaSaved, 1));
            Steps.Enqueue(GoToArea("loc.eichental.dorfrand"));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s30"));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Capture("q02_dorfrand", null));
            // GDD 01 11.4: the Risslinge lie in ambush and break out when the player comes close.
            Steps.Enqueue(CheckAmbush("spawn.eichental.dorfrand_risslinge"));
            Steps.Enqueue(() => Capture("q02b_rissling", ViewAtTarget));
            Steps.Enqueue(KillGroup("spawn.eichental.dorfrand_risslinge"));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s40"));
            Steps.Enqueue(UseObject("clue.eichental.verbrannte_runen_1", QuestObjectAction.Inspect));
            Steps.Enqueue(UseObject("clue.eichental.verbrannte_runen_2", QuestObjectAction.Inspect));
            Steps.Enqueue(TalkTo(D.Lina));
            Steps.Enqueue(FollowTrail("spur.eichental.graue_gestalt"));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s50"));
            Steps.Enqueue(GoToArea("loc.eichental.riss_eichental"));
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s60"));
            Steps.Enqueue(ExpectDialogue(D.Dialogue(D.GreyFigure)));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Capture("q03_riss", null));
            Steps.Enqueue(AetherPushAt("spawn.eichental.rissbrut_prolog"));
            Steps.Enqueue(() => WaitObjective(Q.Prologue, "s60", "o2"));
            // S42: the push broke the Aether shell; at half health two Risslinge break out of the ground.
            Steps.Enqueue(CheckShellBroken("spawn.eichental.rissbrut_prolog"));
            Steps.Enqueue(BossPhaseTwo("spawn.eichental.rissbrut_prolog"));
            Steps.Enqueue(() => Capture("q03c_rissbrut_bossbalken", null));
            Steps.Enqueue(() => Capture("q03d_rissbrut_phase2", ViewAtTarget));
            Steps.Enqueue(KillGroup("spawn.eichental.rissbrut_prolog"));
            // The push started a fight: nobody talks in combat (ends 5 s after the last hit).
            Steps.Enqueue(WaitOutOfCombat);
            Steps.Enqueue(() => WaitStage(Q.Prologue, "s70"));
            Steps.Enqueue(GoToArea("loc.eichental.lindenhain"));
            Steps.Enqueue(TalkTo(Q.Hedda));
            Steps.Enqueue(() => WaitQuest(Q.Prologue, QuestStatus.Completed));
            Steps.Enqueue(() => Capture("q04_prolog_fertig", null));

            // GDD 02 11.2 "Die Wölfe vom Nordhang" (splinter broken out: the longest way).
            Steps.Enqueue(TalkTo(Q.Hollmann));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s10"));
            Steps.Enqueue(UseObject("clue.eichental.weide_schaf", QuestObjectAction.Inspect));
            Steps.Enqueue(UseObject("clue.eichental.weide_pfoten", QuestObjectAction.Inspect));
            // s10 o2: Hollmann's bow (F takes it from the bag), three straw targets shot with fully drawn arrows (+10 arrows).
            Steps.Enqueue(ShootStrawTarget("obj.eichental.strohziel_1"));
            Steps.Enqueue(ShootStrawTarget("obj.eichental.strohziel_2"));
            Steps.Enqueue(() => Capture("q04b_strohziel", null));
            Steps.Enqueue(ShootStrawTarget("obj.eichental.strohziel_3"));
            Steps.Enqueue(() => WaitObjective(Q.Wolves, "s10", "o2"));
            Steps.Enqueue(ReportArrowsAndLeaveStance);
            Steps.Enqueue(WaitOutOfCombat);
            Steps.Enqueue(UseObject("clue.eichental.weide_aetherspeichel", QuestObjectAction.Inspect));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s20"));
            Steps.Enqueue(UseObject("obj.eichental.leiche_postreiter", QuestObjectAction.Use));
            Steps.Enqueue(() => WaitFlag(Q.FlagPostRider, 1));
            Steps.Enqueue(FollowTrail("spur.eichental.wolfsspur"));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s30"));
            Steps.Enqueue(GoToArea("loc.eichental.wolfsbau_nordhang"));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s40"));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Capture("q05_wolfsbau", null));
            Steps.Enqueue(UseObject("obj.eichental.wolfswelpe", QuestObjectAction.PickUp));
            Steps.Enqueue(() => WaitFlag(Q.FlagPup, 1));
            Steps.Enqueue(UseObject(MiniSliceWorld.SplinterId, QuestObjectAction.PickUp));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s45_geborgen"));
            // S42: Glutfang's boss bar; at half health he howls for two Aether wolves.
            Steps.Enqueue(BossPhaseTwo("spawn.eichental.glutfang"));
            Steps.Enqueue(() => Capture("q05b_glutfang_bossbalken", null));
            Steps.Enqueue(() => Capture("q05c_glutfang_phase2", ViewAtTarget));
            Steps.Enqueue(KillGroup("spawn.eichental.glutfang"));
            Steps.Enqueue(KillGroup("spawn.eichental.bau_wut"));
            Steps.Enqueue(() => WaitStage(Q.Wolves, "s50_geborgen"));
            Steps.Enqueue(TalkTo(Q.Hollmann));
            Steps.Enqueue(() => WaitQuest(Q.Wolves, QuestStatus.Completed));
            Steps.Enqueue(() => WaitFlag(Q.FlagWolvesOutcome, 3));
            Steps.Enqueue(() => Capture("q06_woelfe_fertig", null));

            // GDD 01 10.6: Ser Maren waits at the guard post of Lindenhain; "Prüft mich" – she comes along (loyalty 40).
            Steps.Enqueue(TalkTo(D.Maren));
            Steps.Enqueue(() => WaitFlag(Q.FlagMarenTest, 1));
            Steps.Enqueue(CompanionNearPlayer("am Wachposten"));
            Steps.Enqueue(() => Capture("q06b_maren", null));

            // GDD 02 11.7 "Die vergessene Gruft" (seal stone taken and brought to Corvin).
            Steps.Enqueue(TalkTo(Q.Corvin));
            Steps.Enqueue(CompanionNearPlayer("im Gasthaus"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s10"));
            Steps.Enqueue(Travel(EichentalDungeonLinks.EntranceId));
            Steps.Enqueue(GoToArea("loc.eichental.vergessene_gruft"));
            Steps.Enqueue(CompanionNearPlayer("in der Gruft"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s20"));
            Steps.Enqueue(() => Capture("q07_gruft_tor", null));
            Steps.Enqueue(UseById("obj.eichental.gruft_wandrelief_1"));
            Steps.Enqueue(UseById("obj.eichental.gruft_wandrelief_2"));
            Steps.Enqueue(UseById("obj.eichental.gruft_wandrelief_3"));
            Steps.Enqueue(() => WaitFlag(Q.FlagReliefsRead, 1));
            Steps.Enqueue(SolveSequence("puzzle.eichental.gruft_grabplatten"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s30"));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(KillEnemiesInScene());
            Steps.Enqueue(GoToArea("loc.eichental.gruft_siegelkammer_vorraum"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s40"));
            Steps.Enqueue(SolveMirrors("puzzle.eichental.gruft_spiegel"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s50"));
            Steps.Enqueue(() => Capture("q08_spiegel", null));
            Steps.Enqueue(ApproachBoss(GruftBossId));
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(() => Capture("q09_ritter", null));
            Steps.Enqueue(KillBoss(GruftBossId));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s60"));
            Steps.Enqueue(UseById("obj.eichental.gruft_siegelstein"));
            Steps.Enqueue(() => WaitStage(Q.Crypt, "s70_genommen"));
            Steps.Enqueue(() => WaitFlag(Q.FlagUndead, 1));
            Steps.Enqueue(Travel("obj.eichental.gruft_ausgang_fluchtweg"));
            Steps.Enqueue(TalkTo(Q.Corvin));
            Steps.Enqueue(() => WaitQuest(Q.Crypt, QuestStatus.Completed));
            Steps.Enqueue(() => WaitFlag(Q.FlagSealStone, 1));
            Steps.Enqueue(() => Capture("q10_gruft_fertig", null));

            // The villagers of Lindenhain, the mill and the farm (short talks).
            int shot = 11;
            foreach (string villager in new[] { D.Tobold, D.Wenna, D.Ulf, D.Brenner, D.Liese, D.Pim })
            {
                string name = "q" + shot++ + "_" + villager.Substring(villager.LastIndexOf('.') + 1);
                Steps.Enqueue(TalkTo(villager));
                string merchant = villager == D.Tobold ? MiniSliceAssets.SmithyMerchant : villager == D.Ulf ? MiniSliceAssets.InnMerchant : null;
                if (merchant != null)
                {
                    // "Zeig mir deine Waren." ends the talk with "Handeln": the trade screen opens, one purchase and one sale.
                    Steps.Enqueue(TradeAt(merchant));
                    Steps.Enqueue(() => Capture(name + "_handel", null));
                    Steps.Enqueue(CloseMenu);
                }

                if (villager == D.Ulf)
                {
                    // "Würfeln wir eine Runde?" ends the talk with "Würfeln": a whole game of Krähenwurf at the lowest stake.
                    Steps.Enqueue(() => PreferOption(D.UlfDiceOption));
                    Steps.Enqueue(TalkTo(villager));
                    Steps.Enqueue(PlayDice());
                    Steps.Enqueue(() => Capture(name + "_wuerfeln", null));
                    Steps.Enqueue(CloseMenu);
                }

                Steps.Enqueue(() => Capture(name, NpcView(villager)));
            }
        }

        /// <summary>Waits for the trade screen (game state Menu), buys the first affordable offer and sells one item of the bag.</summary>
        private static Func<bool> TradeAt(string merchantId)
        {
            return () =>
            {
                if (_gameState.Current != GameState.Menu)
                {
                    return Fail(Elapsed > 5.0, "Handelsfenster für " + merchantId + " ist nicht aufgegangen (Zustand " + _gameState.Current + ").");
                }

                IMerchantService merchants = Services.Locator.Get<IMerchantService>();
                Aetherfall.Inventory.IInventoryService inventory = Services.Locator.Get<Aetherfall.Inventory.IInventoryService>();
                int gold = inventory.GetCurrency(MerchantService.PlayerId, Aetherfall.Items.CurrencyIds.Gold);
                MerchantOffer offer = merchants.Offers(merchantId).OrderBy(o => o.Price).FirstOrDefault();
                if (offer.ItemId == null || offer.Price > gold)
                {
                    return Fail(true, "Händler " + merchantId + ": nichts Bezahlbares (Gold " + gold + ").");
                }

                if (!merchants.TryBuy(merchantId, offer.Index, 1, out string reason))
                {
                    return Fail(true, "Kauf bei " + merchantId + " abgelehnt: " + reason);
                }

                Note("Gekauft bei " + merchantId + ": " + offer.Name + " für " + offer.Price + " Gold (vorher " + gold + ").");
                foreach (Aetherfall.Items.ItemInstance item in inventory.PlayerContainer.Entries.ToList())
                {
                    int price = merchants.SellPrice(merchantId, item);
                    if (price > 0 && item.ItemId != offer.ItemId)
                    {
                        bool sold = merchants.TrySell(merchantId, item.InstanceId, 1, out reason);
                        Note((sold ? "Verkauft an " : "Verkauf abgelehnt an ") + merchantId + ": " + item.ItemId + " für " + price + " Gold" +
                             (sold ? "." : " (" + reason + ")."));
                        break;
                    }
                }

                return true;
            };
        }

        /// <summary>
        /// Waits for the dice screen and plays one game: the lowest stake, the best dice of every roll, banking from 300 points
        /// of the turn on; the opponent's steps are triggered directly instead of waiting for the screen's pause.
        /// </summary>
        private static Func<bool> PlayDice()
        {
            var best = new List<int>(5);
            int moves = 0;
            return () =>
            {
                var dice = Services.Locator.Get<IUIManager>().Top as DiceScreen;
                if (_gameState.Current != GameState.Menu || dice == null || !dice.IsOpen)
                {
                    return Fail(Elapsed > 5.0, "Würfelfenster ist nicht aufgegangen (Zustand " + _gameState.Current + ").");
                }

                switch (dice.Mode)
                {
                    case DiceMode.Stake:
                        dice.SecondaryAction();
                        if (dice.Mode != DiceMode.Playing)
                        {
                            return Fail(true, "Krähenwurf startet nicht: " + dice.LastMessage);
                        }

                        Note("Krähenwurf gegen Ulf, Einsatz " + dice.Stake + " Gold.");
                        return false;
                    case DiceMode.Done:
                        CrowThrowGame finished = dice.Game;
                        Note("Krähenwurf beendet nach " + moves + " Zügen: " + finished.Score(CrowThrowGame.Player) + " zu " +
                             finished.Score(CrowThrowGame.Opponent) + ". " + dice.LastMessage);
                        return true;
                }

                if (++moves > 2000)
                {
                    return Fail(true, "Krähenwurf endet nicht.");
                }

                CrowThrowGame game = dice.Game;
                if (game.Current == CrowThrowGame.Opponent)
                {
                    dice.StepOpponent();
                }
                else if (game.Phase == CrowThrowPhase.AwaitRoll)
                {
                    dice.PrimaryAction();
                }
                else
                {
                    int points = game.BestSelection(best);
                    foreach (int die in best)
                    {
                        dice.TogglePick(die);
                    }

                    if (game.TurnPoints + points >= 300)
                    {
                        dice.SecondaryAction();
                    }
                    else
                    {
                        dice.PrimaryAction();
                    }
                }

                return false;
            };
        }

        private static bool CloseMenu()
        {
            if (_gameState.Current == GameState.Menu)
            {
                _gameState.Pop(GameState.Menu);
            }

            return Fail(Elapsed > 3.0 && _gameState.Current != GameState.Playing, "Menü schließt nicht (Zustand " + _gameState.Current + ").") ||
                   _gameState.Current == GameState.Playing;
        }

        private const string GruftBossId = "boss.eichental.wachender_ritter";

        // ---- Checks -------------------------------------------------------------------------------------------------

        private static bool MakePlayerInvulnerable()
        {
            PlayerMotor player = FindPlayer();
            if (player != null)
            {
                player.GetComponent<Aetherfall.Combat.DamageableComponent>().Health.AddInvulnerability(TourInvulnerability);
                Note("Spielfigur für den Quest-Durchlauf unverwundbar.");
            }

            return true;
        }

        private static bool WaitStage(string questId, string stageId)
        {
            IQuestService quests = Services.Locator.Get<IQuestService>();
            if (quests.IsStageReached(questId, stageId))
            {
                Note("Quest " + Short(questId) + ": Stufe " + stageId + " erreicht (" + Elapsed.ToString("0.0") + " s).");
                return true;
            }

            return Fail(Elapsed > 20.0, "Quest " + Short(questId) + ": Stufe " + stageId + " nicht erreicht. Status " + quests.GetStatus(questId) +
                                        ", aktuelle Stufe " + CurrentStage(quests, questId) + ".");
        }

        private static bool WaitQuest(string questId, QuestStatus status)
        {
            IQuestService quests = Services.Locator.Get<IQuestService>();
            if (quests.GetStatus(questId) == status)
            {
                Note("Quest " + Short(questId) + ": " + status + ".");
                return true;
            }

            return Fail(Elapsed > 20.0, "Quest " + Short(questId) + " ist nicht " + status + " (Status " + quests.GetStatus(questId) + ", Stufe " +
                                        CurrentStage(quests, questId) + ").");
        }

        private static bool WaitFlag(string flagId, int value)
        {
            int current = Services.Locator.Get<IWorldState>().GetInt(flagId);
            if (current == value)
            {
                Note("Flag " + flagId + " = " + value + ".");
                return true;
            }

            return Fail(Elapsed > 10.0, "Flag " + flagId + " ist " + current + " statt " + value + ".");
        }

        private static string CurrentStage(IQuestService quests, string questId)
        {
            return quests.TryGetInstance(questId, out QuestInstance instance) ? instance.StageId : "–";
        }

        private static string Short(string questId)
        {
            int dot = questId.LastIndexOf('.');
            return dot >= 0 ? questId.Substring(dot + 1) : questId;
        }

        // ---- Actions like a player ----------------------------------------------------------------------------------

        /// <summary>Walks into a location zone (or the timed area at a door): the player is placed at its centre.</summary>
        private static Func<bool> GoToArea(string areaId)
        {
            return () =>
            {
                AreaTrigger area = Object.FindObjectsByType<AreaTrigger>(FindObjectsInactive.Exclude).FirstOrDefault(a => a.AreaId == areaId);
                if (area == null)
                {
                    return Fail(true, "Ort " + areaId + " nicht gefunden.");
                }

                Collider zone = area.GetComponent<Collider>();
                Vector3 centre = zone != null ? zone.bounds.center : area.transform.position;
                PlaceOnGround(centre, FindPlayer().transform.forward);
                Note("Gehe zu " + areaId + ".");
                return true;
            };
        }

        /// <summary>Walks the nodes of a trail in order.</summary>
        private static Func<bool> FollowTrail(string trailId)
        {
            List<TrailNodeTrigger> nodes = null;
            int next = 0;
            return () =>
            {
                if (nodes == null)
                {
                    nodes = Object.FindObjectsByType<TrailNodeTrigger>(FindObjectsInactive.Exclude).Where(n => n.TrailId == trailId)
                        .OrderBy(n => n.Index).ToList();
                    if (nodes.Count == 0)
                    {
                        return Fail(true, "Spur " + trailId + " nicht gefunden.");
                    }

                    Note("Folge der Spur " + trailId + " (" + nodes.Count + " Knoten).");
                }

                if (Elapsed < 0.5 * next)
                {
                    return false;
                }

                if (next >= nodes.Count)
                {
                    return true;
                }

                Vector3 here = nodes[next].transform.position;
                Vector3 ahead = next + 1 < nodes.Count ? nodes[next + 1].transform.position - here : FindPlayer().transform.forward;
                PlaceOnGround(here, ahead);
                next++;
                return false;
            };
        }

        /// <summary>Uses a quest object: stands in front of it and presses "Interagieren".</summary>
        private static Func<bool> UseObject(string objectId, QuestObjectAction action)
        {
            return UseTarget(() => Object.FindObjectsByType<QuestObjectMarker>(FindObjectsInactive.Exclude)
                .FirstOrDefault(m => m.ObjectId == objectId && m.Action == action), objectId + " (" + action + ")", null);
        }

        /// <summary>Talks to the visible NPC: stands in front of it, presses "Interagieren" and clicks through the dialogue.</summary>
        private static Func<bool> TalkTo(string npcId)
        {
            return UseTarget(() => Object.FindObjectsByType<NpcInteractable>(FindObjectsInactive.Exclude).FirstOrDefault(n => n.NpcId == npcId),
                npcId, DriveDialogue);
        }

        private static Func<bool> UseTarget(Func<Component> find, string label, Func<bool> afterUse)
        {
            Component target = null;
            int phase = 0;
            return () =>
            {
                switch (phase)
                {
                    case 0:
                        target = find();
                        if (target == null)
                        {
                            return Fail(Elapsed > 5.0, label + " nicht gefunden (nicht sichtbar oder nicht benutzbar).");
                        }

                        var interactable = (IInteractable)target;
                        Vector3 point = interactable.InteractionPosition;
                        Vector3 from = FindPlayer().transform.position - point;
                        Transform parent = target.transform.parent;
                        if (parent != null && parent.GetComponent<QuestObjectMarker>() != null)
                        {
                            // A second interaction beside its object (splinter "herausbrechen"): step up from the outer side.
                            from = target.transform.position - parent.position;
                        }
                        else if (target is DungeonPortal || target is ReadableObject)
                        {
                            // Doorways and wall reliefs: stand on the open side along their axis, the side the player is on.
                            Vector3 axis = target.transform.forward;
                            from = Vector3.Dot(from, axis) >= 0f || target is ReadableObject ? axis : -axis;
                        }

                        from.y = 0f;
                        if (from.sqrMagnitude < 0.01f)
                        {
                            from = -target.transform.forward;
                        }

                        PlaceOnGround(point + from.normalized * 1.3f, -from);
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        PlayerInteractor interactor = FindPlayer().GetComponent<PlayerInteractor>();
                        if (interactor.CurrentTarget == (IInteractable)target)
                        {
                            if (!interactor.InteractWithCurrentTarget())
                            {
                                return Fail(true, label + ": Interaktion abgelehnt.");
                            }

                            Note("Benutzt: " + label + " („" + ((IInteractable)target).InteractionPrompt + "“).");
                            phase = 2;
                            _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                            return afterUse == null;
                        }

                        IInteractable current = interactor.CurrentTarget;
                        return Fail(Elapsed > 4.0, label + ": Die Spielfigur findet es nicht (aktuelles Ziel: " +
                                                   (current != null ? current.InteractionObjectId : "keins") + ").");
                    default:
                        return afterUse();
                }
            };
        }

        private static readonly HashSet<string> ChosenOptions = new HashSet<string>();
        private static string _preferredOption = string.Empty;

        /// <summary>The next conversation takes this answer as soon as it is offered (then the usual order).</summary>
        private static bool PreferOption(string text)
        {
            _preferredOption = text ?? string.Empty;
            return true;
        }

        private static bool DriveDialogue()
        {
            IDialogueService dialogues = Services.Locator.Get<IDialogueService>();
            if (!dialogues.IsRunning)
            {
                ChosenOptions.Clear();
                _preferredOption = string.Empty;
                return true;
            }

            if (Elapsed < 0.4)
            {
                return false;
            }

            _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
            if (dialogues.View.State == DialogueViewState.Choice)
            {
                // The first answer not taken yet (hubs lead back to their choice), at last the final one ("Mach's gut").
                List<DialogueOptionView> options = dialogues.View.Options.ToList();
                DialogueOptionView option = options.FirstOrDefault(o => o.IsEnabled && o.Text == _preferredOption && !ChosenOptions.Contains(o.Text)) ??
                                            options.FirstOrDefault(o => o.IsEnabled && !ChosenOptions.Contains(o.Text)) ??
                                            options.LastOrDefault(o => o.IsEnabled);
                int index = option != null ? options.IndexOf(option) : 0;
                if (option != null)
                {
                    ChosenOptions.Add(option.Text);
                }

                Note("Antwort: " + (option != null ? option.Text : "?"));
                dialogues.Choose(index);
            }
            else
            {
                if (dialogues.View.Line != null)
                {
                    Note("„" + dialogues.View.Line.Text + "“");
                }

                dialogues.Continue();
            }

            return false;
        }

        /// <summary>Waits for a conversation that starts by itself (quest action) and clicks through it.</summary>
        private static Func<bool> ExpectDialogue(string dialogueId)
        {
            bool seen = false;
            return () =>
            {
                IDialogueService dialogues = Services.Locator.Get<IDialogueService>();
                if (!seen)
                {
                    if (!dialogues.IsRunning || dialogues.View.DialogueId != dialogueId)
                    {
                        return Fail(Elapsed > 5.0, "Gespräch " + dialogueId + " hat nicht von selbst begonnen.");
                    }

                    seen = true;
                    Note("Gespräch von selbst begonnen: " + dialogueId + ".");
                }

                return DriveDialogue();
            };
        }

        /// <summary>Defeats the enemies of a quest group as soon as the quest switched it on.</summary>
        private static Func<bool> KillGroup(string spawnId)
        {
            return () =>
            {
                SpawnGroupMarker marker = Object.FindObjectsByType<SpawnGroupMarker>(FindObjectsInactive.Exclude).FirstOrDefault(m => m.SpawnId == spawnId);
                if (marker == null || marker.Group == null || !marker.Group.activeInHierarchy)
                {
                    return Fail(Elapsed > 10.0, "Gegnergruppe " + spawnId + " ist nicht aktiv.");
                }

                if (Elapsed < 0.4)
                {
                    return false;
                }

                _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                foreach (EnemyController enemy in marker.Group.GetComponentsInChildren<EnemyController>())
                {
                    var combatant = enemy.GetComponent<Aetherfall.Combat.Combatant>();
                    if (combatant != null && combatant.Health != null && combatant.Health.IsAlive)
                    {
                        PlaceOnGround(enemy.transform.position + enemy.transform.forward * 2f, -enemy.transform.forward);
                        combatant.Health.Kill(SubjectIdsPlayer);
                        Note("Besiegt: " + combatant.CombatantId + " (" + spawnId + ").");
                        return false;
                    }
                }

                return true;
            };
        }

        private const string SubjectIdsPlayer = "player";

        /// <summary>
        /// Uses the Aether-Stoß (key 4) on the first living enemy of a group the way a player does: 3 m in front of it, then the
        /// same call as the key press; checks that the cast hits and takes a picture of the effect.
        /// </summary>
        private static Func<bool> AetherPushAt(string spawnId)
        {
            int phase = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerAbilityCaster caster = player != null ? player.GetComponent<PlayerAbilityCaster>() : null;
                Aetherfall.Combat.AbilityRunner runner = caster != null ? caster.GetRunner(PlayerAbilityCaster.AetherPushId) : null;
                if (runner == null)
                {
                    return Fail(true, "Die Spielfigur hat keinen Aether-Stoß (PlayerAbilityCaster fehlt).");
                }

                switch (phase)
                {
                    case 0:
                        SpawnGroupMarker marker = Object.FindObjectsByType<SpawnGroupMarker>(FindObjectsInactive.Exclude).FirstOrDefault(m => m.SpawnId == spawnId);
                        EnemyController enemy = marker != null && marker.Group != null && marker.Group.activeInHierarchy
                            ? marker.Group.GetComponentsInChildren<EnemyController>().FirstOrDefault(e => e.GetComponent<Aetherfall.Combat.Combatant>().IsAlive)
                            : null;
                        if (enemy == null || Elapsed < 0.4)
                        {
                            return Fail(Elapsed > 10.0, "Kein lebender Gegner in " + spawnId + " für den Aether-Stoß.");
                        }

                        Vector3 front = enemy.transform.forward;
                        front.y = 0f;
                        PlaceOnGround(enemy.transform.position + front.normalized * 3f, -front);
                        Note("Aether-Stoß gelernt: " + caster.IsLearned(PlayerAbilityCaster.AetherPushId) + " (Leiste 1, Platz " +
                             (caster.Bar.IndexOf(PlayerAbilityCaster.AetherPushId) + 1) + "), Mana " + caster.Mana.ToString("0") + ".");
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 0.3)
                        {
                            return false;
                        }

                        if (!caster.TryCast(PlayerAbilityCaster.AetherPushId))
                        {
                            return Fail(Elapsed > 3.0, "Aether-Stoß startet nicht: " + caster.LastRefusal + " (Mana " + caster.Mana.ToString("0") + ").");
                        }

                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (runner.Phase == Aetherfall.Combat.AbilityPhase.Windup)
                        {
                            return Fail(Elapsed > 2.0, "Aether-Stoß bleibt im Ausholen hängen.");
                        }

                        Note("Aether-Stoß: " + caster.LastHitCount + " Treffer, Mana danach " + caster.Mana.ToString("0") + ", Abklingzeit " +
                             runner.CooldownRemaining.ToString("0.0") + " s.");
                        if (caster.LastHitCount == 0)
                        {
                            return Fail(true, "Der Aether-Stoß hat nichts getroffen.");
                        }

                        phase = 3;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        // A moment later the sparks and the wave are on their way.
                        return Elapsed >= 0.12 && Capture("q03b_aether_stoss", null);
                }
            };
        }

        /// <summary>Checks that Maren is in the group and close to the player (she follows, or appears next to him after travel).</summary>
        private static Func<bool> CompanionNearPlayer(string where)
        {
            return () =>
            {
                CompanionController companion = Object.FindObjectsByType<CompanionController>(FindObjectsInactive.Exclude).FirstOrDefault();
                PlayerMotor player = FindPlayer();
                if (companion == null || player == null || !companion.IsJoined)
                {
                    return Fail(Elapsed > 6.0, "Maren ist nicht in der Gruppe (" + where + ").");
                }

                float distance = Vector3.Distance(companion.transform.position, player.transform.position);
                if (distance <= 6f && Elapsed > 1.0)
                {
                    Note("Maren folgt (" + where + "): " + distance.ToString("0.0") + " m neben der Spielfigur, " + companion.DebugStateText + ".");
                    return true;
                }

                return Fail(Elapsed > 10.0, "Maren folgt nicht (" + where + "): " + distance.ToString("0.0") + " m entfernt.");
            };
        }

        private static bool WaitOutOfCombat()
        {
            bool inCombat = Services.Locator.Get<Aetherfall.Combat.ICombatService>().InCombat;
            return !inCombat || Fail(Elapsed > 12.0, "Der Kampf endet nicht (noch 12 s nach dem letzten Schritt im Kampf).");
        }

        private static bool WaitObjective(string questId, string stageId, string objectiveId)
        {
            bool done = Services.Locator.Get<IQuestService>().IsObjectiveDone(questId, stageId, objectiveId);
            if (done)
            {
                Note("Ziel erfüllt: " + questId + " " + stageId + "/" + objectiveId + ".");
            }

            return done || Fail(Elapsed > 5.0, "Ziel " + questId + " " + stageId + "/" + objectiveId + " ist nicht erfüllt.");
        }

        /// <summary>Uses any interactable (relief, seal stone, portal …) by its object id.</summary>
        private static Func<bool> UseById(string objectId)
        {
            return UseTarget(() => FindInteractable(objectId), objectId, null);
        }

        private static Component FindInteractable(string objectId)
        {
            foreach (MonoBehaviour behaviour in Object.FindObjectsByType<MonoBehaviour>(FindObjectsInactive.Exclude))
            {
                if (behaviour is IInteractable interactable && interactable.InteractionObjectId == objectId)
                {
                    return behaviour;
                }
            }

            return null;
        }

        /// <summary>Walks through a portal ("Gruft betreten", "Gruft verlassen") and waits until the new scene is playable.</summary>
        private static Func<bool> Travel(string portalId)
        {
            string before = string.Empty;
            return UseTarget(() =>
            {
                before = FindPlayer().gameObject.scene.name;
                return Object.FindObjectsByType<DungeonPortal>(FindObjectsInactive.Exclude).FirstOrDefault(p => p.ObjectId == portalId);
            }, portalId, () =>
            {
                PlayerMotor player = FindPlayer();
                if (player != null && player.gameObject.scene.name != before && _gameState.Current == GameState.Playing)
                {
                    Note("Angekommen in „" + player.gameObject.scene.name + "“ nach " + Elapsed.ToString("0.0") + " s.");
                    return true;
                }

                return Fail(Elapsed > PlayingTimeoutSeconds, "Reise durch " + portalId + " nicht abgeschlossen (Zustand " + _gameState.Current + ").");
            });
        }

        /// <summary>Presses the slabs of a sequence puzzle in the order of the solution.</summary>
        private static Func<bool> SolveSequence(string puzzleId)
        {
            return Chain(() =>
            {
                var parts = new List<Func<bool>>();
                SequencePuzzleController puzzle = Object.FindObjectsByType<SequencePuzzleController>(FindObjectsInactive.Exclude)
                    .FirstOrDefault(p => p.PuzzleId == puzzleId);
                if (puzzle == null)
                {
                    Fail(true, "Rätsel " + puzzleId + " nicht gefunden.");
                    return parts;
                }

                UnityEditor.SerializedProperty steps = new UnityEditor.SerializedObject(puzzle).FindProperty("steps");
                for (int i = 0; i < steps.arraySize; i++)
                {
                    if (steps.GetArrayElementAtIndex(i).objectReferenceValue is PuzzleSwitch slab)
                    {
                        parts.Add(UseTarget(() => slab, slab.ObjectId, null));
                        parts.Add(() => Wait(0.3));
                    }
                }

                Note("Rätsel " + puzzleId + ": " + parts.Count / 2 + " Schritte in der Reihenfolge der Lösung.");
                parts.Add(() => PuzzleSolved(puzzleId, puzzle.IsSolved));
                return parts;
            });
        }

        /// <summary>Turns the mirrors of a light puzzle until each points in the direction of the solution (crypt layout).</summary>
        private static Func<bool> SolveMirrors(string puzzleId)
        {
            return Chain(() =>
            {
                var parts = new List<Func<bool>>();
                DungeonPuzzle puzzle = DungeonLayoutReader.Read(System.IO.File.ReadAllText(GruftPaths.LayoutPath)).Puzzles
                    .FirstOrDefault(p => p.Id == puzzleId);
                MirrorPuzzleController controller = Object.FindObjectsByType<MirrorPuzzleController>(FindObjectsInactive.Exclude)
                    .FirstOrDefault(p => p.PuzzleId == puzzleId);
                if (puzzle == null || controller == null)
                {
                    Fail(true, "Rätsel " + puzzleId + " nicht gefunden.");
                    return parts;
                }

                foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
                {
                    parts.Add(TurnMirror(mirror.Id, mirror.Solution));
                }

                parts.Add(() => PuzzleSolved(puzzleId, controller.IsSolved));
                return parts;
            });
        }

        private static Func<bool> TurnMirror(string mirrorId, GridDirection solution)
        {
            Func<bool> use = null;
            int turns = 0;
            return () =>
            {
                RotatableMirror mirror = Object.FindObjectsByType<RotatableMirror>(FindObjectsInactive.Exclude).FirstOrDefault(m => m.ObjectId == mirrorId);
                if (mirror == null)
                {
                    return Fail(true, "Spiegel " + mirrorId + " nicht gefunden.");
                }

                if (use == null)
                {
                    if (mirror.Direction == solution)
                    {
                        Note("Spiegel " + mirrorId + " zeigt nach " + solution + " (" + turns + "× gedreht).");
                        return true;
                    }

                    if (turns >= 4)
                    {
                        return Fail(true, "Spiegel " + mirrorId + " erreicht " + solution + " nicht (steht auf " + mirror.Direction + ").");
                    }

                    use = UseTarget(() => mirror, mirrorId, null);
                    turns++;
                }

                if (use())
                {
                    use = null;
                    _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                }

                return false;
            };
        }

        private static bool PuzzleSolved(string puzzleId, bool solved)
        {
            if (solved)
            {
                Note("Rätsel " + puzzleId + " gelöst.");
                return true;
            }

            return Fail(Elapsed > 3.0, "Rätsel " + puzzleId + " ist nicht gelöst.");
        }

        /// <summary>Defeats every awake enemy in the player's scene (the crypt halls wake when the gate opens).</summary>
        private static Func<bool> KillEnemiesInScene()
        {
            return () =>
            {
                if (Elapsed < 0.4)
                {
                    return false;
                }

                _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                UnityEngine.SceneManagement.Scene scene = FindPlayer().gameObject.scene;
                foreach (EnemyController enemy in Object.FindObjectsByType<EnemyController>(FindObjectsInactive.Exclude))
                {
                    var combatant = enemy.GetComponent<Aetherfall.Combat.Combatant>();
                    if (enemy.gameObject.scene == scene && combatant != null && combatant.Health != null && combatant.Health.IsAlive)
                    {
                        combatant.Health.Kill(SubjectIdsPlayer);
                        Note("Besiegt: " + combatant.CombatantId + ".");
                        return false;
                    }
                }

                return true;
            };
        }

        /// <summary>Steps into the boss arena, 5 m in front of the boss.</summary>
        private static Func<bool> ApproachBoss(string bossId)
        {
            return () =>
            {
                BossController boss = FindBoss(bossId);
                if (boss == null)
                {
                    return Fail(Elapsed > 5.0, "Boss " + bossId + " nicht gefunden.");
                }

                Vector3 front = boss.transform.forward;
                front.y = 0f;
                PlaceOnGround(boss.transform.position + front.normalized * 5f, -front);
                Note("Arena von " + bossId + " betreten.");
                return true;
            };
        }

        private static Func<bool> KillBoss(string bossId)
        {
            return () =>
            {
                BossController boss = FindBoss(bossId);
                if (boss == null || boss.Combatant == null || boss.Combatant.Health == null)
                {
                    return Fail(true, "Boss " + bossId + " nicht gefunden.");
                }

                if (boss.Combatant.Health.IsAlive)
                {
                    boss.Combatant.Health.Kill(SubjectIdsPlayer);
                    Note("Besiegt: " + bossId + ".");
                }

                return true;
            };
        }

        /// <summary>Camera 2.6 m in front of a visible NPC at eye height, a little from the side (the figure, not the player).</summary>
        private static Func<Transform, Pose> NpcView(string npcId)
        {
            return player =>
            {
                NpcInteractable npc = Object.FindObjectsByType<NpcInteractable>(FindObjectsInactive.Exclude).FirstOrDefault(n => n.NpcId == npcId);
                if (npc == null)
                {
                    return ViewBehindPlayer(player);
                }

                Transform figure = npc.transform;
                Vector3 front = Quaternion.Euler(0f, 35f, 0f) * figure.forward;
                return Look(figure.position + front * 2.6f + Vector3.up * 1.5f, figure.position + Vector3.up * 1.0f);
            };
        }

        private static BossController FindBoss(string bossId)
        {
            return Object.FindObjectsByType<BossController>(FindObjectsInactive.Exclude).FirstOrDefault(b => b.BossId == bossId);
        }

        /// <summary>Runs steps built on first use (they need the loaded scene) one after the other.</summary>
        private static Func<bool> Chain(Func<List<Func<bool>>> build)
        {
            List<Func<bool>> parts = null;
            int index = 0;
            return () =>
            {
                if (parts == null)
                {
                    parts = build();
                }

                if (index < parts.Count && parts[index]())
                {
                    index++;
                    _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                }

                return index >= parts.Count;
            };
        }

        private static void PlaceOnGround(Vector3 position, Vector3 look)
        {
            PlayerMotor player = FindPlayer();
            int ignore = 1 << player.gameObject.layer;
            Vector3 ground = position;
            // Short rays first (no roofs or crypt ceilings above doors and NPCs), then from high above (zone centres can lie
            // below a slope).
            if (Physics.Raycast(position + Vector3.up * 0.3f, Vector3.down, out RaycastHit hit, 60f, ~ignore, QueryTriggerInteraction.Ignore) ||
                Physics.Raycast(position + Vector3.up * 2.5f, Vector3.down, out hit, 60f, ~ignore, QueryTriggerInteraction.Ignore) ||
                Physics.Raycast(position + Vector3.up * 40f, Vector3.down, out hit, 120f, ~ignore, QueryTriggerInteraction.Ignore))
            {
                ground = hit.point + Vector3.up * 0.05f;
            }

            look.y = 0f;
            float yaw = look.sqrMagnitude > 0.0001f ? Quaternion.LookRotation(look.normalized, Vector3.up).eulerAngles.y : player.transform.eulerAngles.y;
            player.Teleport(new PlayerPose(ground.x, ground.y, ground.z, yaw));
        }
    }
}
