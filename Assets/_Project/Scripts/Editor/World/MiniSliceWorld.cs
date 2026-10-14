using Aetherfall.Conditions;
using Aetherfall.Quests;
using Aetherfall.World;
using Aetherfall.WorldState;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// How the Eichental scene reacts to the mini slice quests (GDD 02, 11.1 and 11.2): which quest object offers which
    /// interaction in which stage, and in which quest state an NPC stands at which marker (the layout gives phase and stage, e.g.
    /// Hedda at the village square in s20, at the village edge from s25, in Lindenhain after the prologue). Used by
    /// <see cref="EichentalGameplayBuilder"/>; the ids are the ones of the layout file.
    /// </summary>
    public static class MiniSliceWorld
    {
        /// <summary>Door of Wenna's bakery: the area the timed objective "Hol Wenna aus dem Haus" waits for.</summary>
        public const string WennaDoorId = "obj.eichental.tuer_haus_wenna";

        /// <summary>The Aether splinter in the wolf den (two interactions: smash or break out).</summary>
        public const string SplinterId = "obj.eichental.aethersplitter_bau";

        /// <summary>Interaction of one quest object.</summary>
        public sealed class ObjectSetup
        {
            internal ObjectSetup(QuestObjectAction action, string prompt, bool hideWhenUsed, Condition interactableWhile)
            {
                Action = action;
                Prompt = prompt;
                HideWhenUsed = hideWhenUsed;
                InteractableWhile = interactableWhile;
            }

            /// <summary>What the player can do.</summary>
            public QuestObjectAction Action { get; }

            /// <summary>Prompt text.</summary>
            public string Prompt { get; }

            /// <summary>Hide the visuals after use.</summary>
            public bool HideWhenUsed { get; }

            /// <summary>Stage window of the interaction.</summary>
            public Condition InteractableWhile { get; }
        }

        /// <summary>The interaction of a quest object of the layout, or null if it has none (e.g. the door: an area).</summary>
        /// <param name="objectId">Object id.</param>
        public static ObjectSetup ForObject(string objectId)
        {
            switch (objectId)
            {
                case "obj.eichental.balken_tobold":
                    return new ObjectSetup(QuestObjectAction.Use, "Tobold befreien", true, InStage(Q.Prologue, "s25", "s30"));
                case "clue.eichental.verbrannte_runen_1":
                case "clue.eichental.verbrannte_runen_2":
                    return new ObjectSetup(QuestObjectAction.Inspect, "Verbrannte Runen untersuchen", false, InStage(Q.Prologue, "s40", "s50"));
                case "clue.eichental.weide_schaf":
                    return new ObjectSetup(QuestObjectAction.Inspect, "Gerissenes Schaf untersuchen", false, InStage(Q.Wolves, "s10", "s20"));
                case "clue.eichental.weide_pfoten":
                    return new ObjectSetup(QuestObjectAction.Inspect, "Pfotenabdrücke untersuchen", false, InStage(Q.Wolves, "s10", "s20"));
                case "clue.eichental.weide_aetherspeichel":
                    return new ObjectSetup(QuestObjectAction.Inspect, "Leuchtenden Speichel untersuchen", false, InStage(Q.Wolves, "s10", "s20"));
                case "obj.eichental.strohziel_1":
                case "obj.eichental.strohziel_2":
                case "obj.eichental.strohziel_3":
                    return new ObjectSetup(QuestObjectAction.Use, "Strohziel prüfen", false, InStage(Q.Wolves, "s10", "s20"));
                case "obj.eichental.leiche_postreiter":
                    return new ObjectSetup(QuestObjectAction.Use, "Den Toten untersuchen", false, InStage(Q.Wolves, "s20", "s30"));
                case SplinterId:
                    return new ObjectSetup(QuestObjectAction.Use, "Splitter zerschlagen", true, SplinterWindow());
                case "obj.eichental.wolfswelpe":
                    return new ObjectSetup(QuestObjectAction.PickUp, "Welpen mitnehmen", true, InStage(Q.Wolves, "s40", "s45_geborgen", "s50_kampf",
                        "s50_zerstoert", "s50_geborgen"));
                default:
                    return null;
            }
        }

        /// <summary>Second interaction of the splinter: break it out and keep it (outcome 3).</summary>
        public static ObjectSetup SplinterBreakOut()
        {
            return new ObjectSetup(QuestObjectAction.PickUp, "Splitter herausbrechen", true, SplinterWindow());
        }

        /// <summary>
        /// Visibility of an NPC marker: null = always there. Prologue markers follow the stages of "Asche über Eichental", markers
        /// "after the prologue" appear once the survivors moved to Lindenhain (s40), rescued NPCs only if they were saved.
        /// </summary>
        /// <param name="npcId">NPC id of the marker.</param>
        /// <param name="phase">Phase of the marker.</param>
        /// <param name="stage">Stage of the marker (may be empty).</param>
        public static Condition NpcVisibility(string npcId, NpcMarkerPhase phase, string stage)
        {
            if (phase == NpcMarkerPhase.Always)
            {
                return null;
            }

            Condition reached40 = AnyOf(Reached(Q.Prologue, "s40"), Done(Q.Prologue));
            switch (npcId)
            {
                case Q.Hedda:
                    if (phase == NpcMarkerPhase.AfterProlog)
                    {
                        return reached40;
                    }

                    return stage == "s20" ? (Condition)new Not(Reached(Q.Prologue, "s25")) : new AllOf(Reached(Q.Prologue, "s25"), new Not(reached40));
                case "npc.eichental.schmied_tobold":
                    return Rescued(Q.FlagToboldSaved, phase, stage, reached40);
                case "npc.eichental.baeckerin_wenna":
                    return Rescued(Q.FlagWennaSaved, phase, stage, reached40);
                case "npc.eichental.lina":
                    return new Not(AnyOf(Reached(Q.Prologue, "s60"), Done(Q.Prologue)));
                case "npc.main.graue_gestalt":
                    return new AllOf(Reached(Q.Prologue, "s40"), new Not(AnyOf(Reached(Q.Prologue, "s60"), Done(Q.Prologue))));
                default:
                    return phase == NpcMarkerPhase.AfterProlog ? reached40 : new Not(Done(Q.Prologue));
            }
        }

        private static Condition Rescued(string flag, NpcMarkerPhase phase, string stage, Condition reached40)
        {
            Condition saved = new FlagIs(flag, 1);
            if (phase == NpcMarkerPhase.AfterProlog)
            {
                return new AllOf(saved, reached40);
            }

            // s25: trapped (beam, burning house) until rescued or until the fight starts; s30: rescued at the village edge.
            return stage == "s25"
                ? new AllOf(new Not(saved), new Not(Reached(Q.Prologue, "s30")))
                : (Condition)new AllOf(saved, new Not(reached40));
        }

        private static Condition SplinterWindow()
        {
            return InStage(Q.Wolves, "s40", "s45_geborgen", "s50_kampf", "s50_zerstoert", "s50_geborgen");
        }

        /// <summary>True while the quest is active, has reached the stage and none of the later stages.</summary>
        private static Condition InStage(string questId, string stageId, params string[] laterStages)
        {
            var later = new Condition[laterStages.Length];
            for (int i = 0; i < laterStages.Length; i++)
            {
                later[i] = Reached(questId, laterStages[i]);
            }

            return new AllOf(new QuestStatusIs(questId, QuestStatus.Active), Reached(questId, stageId), new Not(AnyOf(later)));
        }

        private static Condition Reached(string questId, string stageId)
        {
            return new QuestStageReached(questId, stageId);
        }

        private static Condition Done(string questId)
        {
            return new QuestStatusIs(questId, QuestStatus.Completed);
        }

        private static Condition AnyOf(params Condition[] conditions)
        {
            return conditions.Length == 1 ? conditions[0] : new AnyOf(conditions);
        }
    }
}
