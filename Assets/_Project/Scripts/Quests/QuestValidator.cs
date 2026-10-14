using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.WorldState;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Checks quest data against the validation rules of GDD 02 10.2 (pure logic; used by the editor menu "Aetherfall >
    /// Quests pruefen", later the quest editor and the CI batch run).
    /// </summary>
    /// <remarks>
    /// <para><b>Implemented:</b> V01 duplicate ids (quests, stages, objectives, ledger, options), V02 id schema, V03 stage
    /// without objectives, V04 broken references (stages, branches, start stage, fail rules, follow-up quests, ledger
    /// entries, quest/stage/objective references of conditions and actions, definition ids and flags if the lookup knows them,
    /// with spelling suggestion), V05 unreachable stage, V06 dead end, V07 cycle without exit, V08 no reachable success end,
    /// V09 branches without default exit, V10 missing German texts (from status "Fertig"), V11 neither giver nor start
    /// trigger, V13 invalid objective parameters, V14 empty entries / unknown types, V15 repeatable quest writes a lasting
    /// flag, V16 flags only read or only written (as warning: dialogues and scenes are not checked yet), V17 enum value
    /// outside the value list, V18 obvious contradictions in start conditions, W01 no reward, W04 texts too long, W05 markers
    /// without exploration hint, W07 decision without ledger entry, W10 short deadline without "notfall", W12 more than 3
    /// lasting flags, C01 (hint) condition without trigger is polled.</para>
    /// <para><b>Not yet (TODO, need other systems):</b> V10 English texts (localization), V12 mortal NPCs (NPC definitions),
    /// W02/W03 reward and level bands (XP curve, regions), W06 word budget, W08 solution ways, W09 chains, W11 quest items,
    /// W13 changed after test, W14 scope tier of used content, scene object ids (scene id index).</para>
    /// </remarks>
    public sealed class QuestValidator
    {
        /// <summary>Longest title (GDD 02 4.1).</summary>
        public const int MaxTitleLength = 32;

        /// <summary>Longest stage journal text.</summary>
        public const int MaxStageTextLength = 200;

        /// <summary>Longest exploration hint.</summary>
        public const int MaxHintLength = 140;

        /// <summary>Longest ledger text.</summary>
        public const int MaxLedgerTextLength = 120;

        /// <summary>Most flags a quest may write that last beyond the quest (GDD 02 6.2 "Konsequenz-Budget").</summary>
        public const int MaxLastingFlags = 3;

        /// <summary>Shortest deadline in game hours without the trait "notfall" (GDD 02 9.1: 2 game days).</summary>
        public const float MinDeadlineHours = 48f;

        private static readonly string[] DefinitionPrefixes =
        {
            "npc.", "item.", "enemy.", "boss.", "dlg.", "ability.", "skill.", "region.", "faction.", "class.", "recipe.", "loot.", "effect.",
            "currency.", "event."
        };

        private readonly IQuestValidationLookup _lookup;

        /// <summary>Creates the validator.</summary>
        /// <param name="lookup">Known content and flags (null = only checks inside the validated quests).</param>
        public QuestValidator(IQuestValidationLookup lookup = null)
        {
            _lookup = lookup ?? QuestValidationLookup.Empty;
        }

        /// <summary>Validates one quest.</summary>
        /// <param name="quest">Quest.</param>
        public ValidationReport Validate(QuestSpec quest)
        {
            return Validate(new[] { quest });
        }

        /// <summary>Validates a set of quests (all quests of the project: cross references and duplicates are checked too).</summary>
        /// <param name="quests">Quests.</param>
        public ValidationReport Validate(IReadOnlyList<QuestSpec> quests)
        {
            var report = new ValidationReport();
            var byId = new Dictionary<string, QuestSpec>(StringComparer.Ordinal);
            if (quests == null)
            {
                return report;
            }

            for (int i = 0; i < quests.Count; i++)
            {
                QuestSpec quest = quests[i];
                if (quest == null)
                {
                    report.Error("V14", "Leerer Eintrag in der Questliste.");
                    continue;
                }

                if (byId.ContainsKey(quest.Id))
                {
                    using (report.Scope(quest.Id))
                    {
                        report.Error("V01", "Quest-ID '" + quest.Id + "' existiert mehrfach.");
                    }

                    continue;
                }

                byId.Add(quest.Id, quest);
            }

            for (int i = 0; i < quests.Count; i++)
            {
                if (quests[i] != null)
                {
                    int firstReference = report.References.Count;
                    ValidateQuest(quests[i], report, byId);
                    CheckLastingFlags(quests[i], report, firstReference);
                }
            }

            ResolveReferences(report, byId);
            CheckFlagUsage(report);
            return report;
        }

        private static string QuestLabel(QuestSpec quest)
        {
            return quest.Id.Length > 0 ? quest.Id : "(Quest ohne ID)";
        }

        private static bool IsLocalFlag(string id)
        {
            return id.IndexOf(QuestIds.LocalFlagSegment, StringComparison.Ordinal) >= 0;
        }

        private static void CheckText(IValidationReport report, string text, int maxLength, string label, bool required)
        {
            if (string.IsNullOrEmpty(text))
            {
                if (required)
                {
                    report.Error("V10", label + " fehlt (DE).");
                }

                return;
            }

            if (text.Length > maxLength)
            {
                report.Warning("W04", label + " hat " + text.Length + " Zeichen (höchstens " + maxLength + ").");
            }
        }

        private void ValidateQuest(QuestSpec quest, ValidationReport report, Dictionary<string, QuestSpec> byId)
        {
            using (report.Scope(QuestLabel(quest)))
            {
                bool done = quest.Status >= ContentStatus.Done;
                if (!ContentIdRules.IsValid(quest.Id) || !quest.Id.StartsWith(QuestIds.QuestPrefix, StringComparison.Ordinal))
                {
                    report.Error("V02", "Quest-ID '" + quest.Id + "' verletzt das Schema quest.<kategorie>.… (nur a–z, 0–9, _ und .).");
                }

                CheckText(report, quest.Title, MaxTitleLength, "Titel", done);
                if (!done && quest.Title.Length == 0)
                {
                    report.Warning("V10", "Titel fehlt.");
                }

                CheckText(report, quest.Description, int.MaxValue, "Beschreibung", done);
                if (quest.GiverId.Length == 0 && quest.StartTriggerKind == QuestStartTriggerKind.None)
                {
                    report.Error("V11", "Kein Questgeber und kein Startauslöser: die Quest kann nie starten.");
                }

                if (quest.GiverId.Length > 0)
                {
                    report.Mentions(quest.GiverId, string.Empty);
                }

                for (int i = 0; i < quest.FallbackGiverIds.Count; i++)
                {
                    report.Mentions(quest.FallbackGiverIds[i], string.Empty);
                }

                if (quest.TurnInNpcId.Length > 0)
                {
                    report.Mentions(quest.TurnInNpcId, "npc.");
                }

                if (quest.RegionId.Length > 0)
                {
                    report.Mentions(quest.RegionId, "region.");
                }

                report.ValidateOptional(quest.StartCondition, "Startbedingung");
                CheckContradictions(quest.StartCondition, report);
                report.ValidateActions(quest.Rewards, "Belohnungen");
                if (quest.Rewards.Count == 0)
                {
                    report.Warning("W01", "Keine Belohnung (Belohnungsliste leer).");
                }

                for (int i = 0; i < quest.FollowUps.Count; i++)
                {
                    FollowUpQuest followUp = quest.FollowUps[i];
                    if (followUp == null || followUp.QuestId.Length == 0)
                    {
                        report.Error("V13", "Folgequest " + i + " ohne Quest-ID.");
                        continue;
                    }

                    report.Mentions(followUp.QuestId, QuestIds.QuestPrefix);
                }

                ValidateRules(quest.FailRules, quest, report, "Fehlschlag (Quest)");
                if (quest.Has(QuestTraits.TimeLimited) && quest.DeadlineHours <= 0f)
                {
                    report.Warning("W10", "Merkmal „zeitlich begrenzt“, aber keine Frist.");
                }

                if (quest.DeadlineHours > 0f && quest.DeadlineHours < MinDeadlineHours && !quest.Has(QuestTraits.Emergency))
                {
                    report.Warning("W10", "Frist " + quest.DeadlineHours + " Spielstunden (unter 2 Spieltagen ohne Merkmal „notfall“).");
                }

                ValidateLedger(quest, report, done);
                ValidateStages(quest, report, done);
                ValidateGraph(quest, report);
                ValidateQuestReferences(quest, report, byId);
                ValidateTriggers(quest, report);
            }
        }

        private static void ValidateLedger(QuestSpec quest, ValidationReport report, bool done)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < quest.Ledger.Count; i++)
            {
                LedgerEntryDefinition entry = quest.Ledger[i];
                if (entry == null)
                {
                    report.Error("V14", "Leerer Ledger-Eintrag " + i + ".");
                    continue;
                }

                using (report.Scope(entry.Id.Length > 0 ? entry.Id : "ledger[" + i + "]"))
                {
                    if (!QuestIds.IsValidLedgerId(entry.Id))
                    {
                        report.Error("V02", "Ledger-ID '" + entry.Id + "' verletzt das Schema ledger.c<n>.");
                    }

                    if (!ids.Add(entry.Id))
                    {
                        report.Error("V01", "Ledger-ID '" + entry.Id + "' existiert zweimal.");
                    }

                    CheckText(report, entry.Text, MaxLedgerTextLength, "Ledger-Text", done);
                    report.ValidateOptional(entry.VisibleCondition, "Sichtbar wenn");
                }
            }
        }

        private void ValidateStages(QuestSpec quest, ValidationReport report, bool done)
        {
            if (quest.Stages.Count == 0)
            {
                report.Error("V03", "Die Quest hat keine Stages.");
                return;
            }

            var stageIds = new HashSet<string>(StringComparer.Ordinal);
            for (int s = 0; s < quest.Stages.Count; s++)
            {
                StageDefinition stage = quest.Stages[s];
                if (stage == null)
                {
                    report.Error("V14", "Leere Stage " + s + ".");
                    continue;
                }

                using (report.Scope(stage.Id.Length > 0 ? stage.Id : "stage[" + s + "]"))
                {
                    if (!QuestIds.IsValidStageId(stage.Id))
                    {
                        report.Error("V02", "Stage-ID '" + stage.Id + "' verletzt das Schema s<nn>[_<name>].");
                    }

                    if (!stageIds.Add(stage.Id))
                    {
                        report.Error("V01", "Stage-ID '" + stage.Id + "' existiert zweimal in " + quest.Id + ".");
                    }

                    ValidateStage(quest, stage, report, done);
                }
            }

            if (quest.StartStageId.Length > 0 && !quest.TryGetStage(quest.StartStageId, out _))
            {
                report.Error("V04", "Start-Stage '" + quest.StartStageId + "' gibt es nicht.");
            }

            for (int i = 0; i < quest.StartBranches.Count; i++)
            {
                StageBranch branch = quest.StartBranches[i];
                if (branch == null)
                {
                    continue;
                }

                report.ValidateOptional(branch.Condition, "Start-Verzweigung " + i);
                if (!quest.TryGetStage(branch.TargetStageId, out _))
                {
                    report.Error("V04", "Start-Verzweigung zeigt auf unbekannte Stage '" + branch.TargetStageId + "'.");
                }
            }
        }

        private void ValidateStage(QuestSpec quest, StageDefinition stage, ValidationReport report, bool done)
        {
            CheckText(report, stage.JournalText, MaxStageTextLength, "Questlog-Text", done);
            CheckText(report, stage.ExplorationHint, MaxHintLength, "Erkundungshinweis", false);
            int required = 0;
            bool hasMarkers = stage.MarkerIds.Count > 0;
            bool hasChoice = false;
            var objectiveIds = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < stage.Objectives.Count; i++)
            {
                QuestObjective objective = stage.Objectives[i];
                if (objective == null)
                {
                    report.Error("V14", "Ziel " + i + " fehlt oder hat einen unbekannten Typ (umbenannte Klasse?).");
                    continue;
                }

                using (report.Scope(objective.Id.Length > 0 ? objective.Id : "ziel[" + i + "]"))
                {
                    if (!QuestIds.IsValidObjectiveId(objective.Id))
                    {
                        report.Error("V02", "Ziel-ID '" + objective.Id + "' verletzt das Schema o<n>.");
                    }

                    if (!objectiveIds.Add(objective.Id))
                    {
                        report.Error("V01", "Ziel-ID '" + objective.Id + "' existiert zweimal in " + stage.Id + ".");
                    }

                    objective.Validate(report);
                }

                if (!objective.IsOptional)
                {
                    required++;
                }

                hasMarkers |= objective.MarkerIds.Count > 0;
                hasChoice |= objective is ChooseObjective;
            }

            if (stage.Objectives.Count == 0 && !stage.IsEndStage && !stage.IsActionOnly)
            {
                report.Error("V03", "Stage '" + stage.Id + "' hat keine Ziele (und ist weder Endstage noch reine Aktionsstage).");
            }
            else if (stage.Objectives.Count > 0 && required == 0 && !stage.IsActionOnly)
            {
                report.Warning("V03", "Stage '" + stage.Id + "' hat nur optionale Ziele und ist deshalb sofort erfüllt.");
            }

            if (stage.CompletionMode == StageCompletionMode.AtLeast && stage.RequiredCount > required)
            {
                report.Error("V13", "„Mindestens " + stage.RequiredCount + "“, aber nur " + required + " Pflichtziel(e).");
            }

            report.ValidateActions(stage.OnStart, "Aktionen beim Start");
            report.ValidateActions(stage.OnComplete, "Aktionen beim Abschluss");
            for (int i = 0; i < stage.Branches.Count; i++)
            {
                StageBranch branch = stage.Branches[i];
                if (branch == null)
                {
                    report.Error("V14", "Leere Verzweigung " + i + ".");
                    continue;
                }

                report.ValidateOptional(branch.Condition, "Verzweigung " + i);
                if (!quest.TryGetStage(branch.TargetStageId, out _))
                {
                    report.Error("V04", "Verzweigung " + i + " zeigt auf unbekannte Stage '" + branch.TargetStageId + "'.");
                }
            }

            if (stage.DefaultNextStageId.Length > 0 && !quest.TryGetStage(stage.DefaultNextStageId, out _))
            {
                report.Error("V04", "Standard-Ausgang zeigt auf unbekannte Stage '" + stage.DefaultNextStageId + "'.");
            }

            bool hasExit = stage.Branches.Count > 0 || stage.DefaultNextStageId.Length > 0;
            if (!stage.IsEndStage && !hasExit)
            {
                report.Error("V06", "Sackgasse: '" + stage.Id + "' hat keinen Ausgang und ist keine Endstage.");
            }
            else if (!stage.IsEndStage && stage.DefaultNextStageId.Length == 0 && !BranchesCoverAllCases(quest, stage))
            {
                report.Error("V09", "'" + stage.Id + "' hat Verzweigungen, aber keinen Standard-Ausgang.");
            }
            else if (stage.IsEndStage && hasExit)
            {
                report.Warning("V06", "Endstage '" + stage.Id + "' hat Ausgänge, die nie benutzt werden.");
            }

            ValidateRules(stage.FailRules, quest, report, "Fehlschlag (Stage)");
            if (stage.LedgerEntryId.Length > 0 && !quest.TryGetLedgerEntry(stage.LedgerEntryId, out _))
            {
                report.Error("V04", "Ledger-Eintrag '" + stage.LedgerEntryId + "' ist in der Quest nicht definiert.");
            }

            if (hasMarkers && stage.ExplorationHint.Length == 0)
            {
                report.Warning("W05", "'" + stage.Id + "' hat Marker, aber keinen Erkundungshinweis.");
            }

            if (hasChoice && stage.LedgerEntryId.Length == 0 && !WritesLedger(stage))
            {
                report.Warning("W07", "Entscheidung ohne Ledger-Eintrag.");
            }

            for (int i = 0; i < stage.MarkerIds.Count; i++)
            {
                report.Mentions(stage.MarkerIds[i], string.Empty);
            }
        }

        private static bool WritesLedger(StageDefinition stage)
        {
            bool found = false;
            QuestDataWalker.WalkActions(stage.OnComplete, stage, (item, context) => found |= item is AddLedgerEntry);
            for (int i = 0; i < stage.Objectives.Count; i++)
            {
                if (stage.Objectives[i] != null)
                {
                    QuestDataWalker.WalkActions(stage.Objectives[i].OnCompletedActions, stage, (item, context) => found |= item is AddLedgerEntry);
                }
            }

            return found;
        }

        private static bool BranchesCoverAllCases(QuestSpec quest, StageDefinition stage)
        {
            var covered = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < stage.Branches.Count; i++)
            {
                StageBranch branch = stage.Branches[i];
                if (branch == null)
                {
                    continue;
                }

                if (branch.Condition == null || branch.Condition is Always)
                {
                    return true;
                }

                if (branch.Condition is QuestObjectiveDone done &&
                    (done.ReferencedQuestId.Length == 0 || done.ReferencedQuestId == quest.Id) &&
                    (done.ReferencedStageId.Length == 0 || done.ReferencedStageId == stage.Id))
                {
                    covered.Add(done.ReferencedObjectiveId);
                }
            }

            if (stage.CompletionMode != StageCompletionMode.Any || covered.Count == 0)
            {
                return false;
            }

            for (int i = 0; i < stage.Objectives.Count; i++)
            {
                QuestObjective objective = stage.Objectives[i];
                if (objective != null && !objective.IsOptional && !covered.Contains(objective.Id))
                {
                    return false;
                }
            }

            return true;
        }

        private static void ValidateRules(IReadOnlyList<QuestFailRule> rules, QuestSpec quest, ValidationReport report, string label)
        {
            for (int i = 0; i < rules.Count; i++)
            {
                QuestFailRule rule = rules[i];
                if (rule == null)
                {
                    report.Error("V14", label + " " + i + " ist leer.");
                    continue;
                }

                report.ValidateRequired(rule.Condition, label + " " + i);
                if (rule.TargetStageId.Length > 0)
                {
                    if (!quest.TryGetStage(rule.TargetStageId, out StageDefinition target))
                    {
                        report.Error("V04", label + " " + i + " zeigt auf unbekannte Stage '" + rule.TargetStageId + "'.");
                    }
                    else if (target.EndType != StageEndType.Failure)
                    {
                        report.Warning("V06", label + " " + i + " springt nach '" + rule.TargetStageId + "', die keine Misserfolgs-Endstage ist.");
                    }
                }
            }
        }

        private static void ValidateGraph(QuestSpec quest, ValidationReport report)
        {
            if (quest.Stages.Count == 0)
            {
                return;
            }

            Dictionary<string, List<string>> edges = BuildEdges(quest);
            var starts = new List<string>();
            if (quest.DefaultStartStageId.Length > 0)
            {
                starts.Add(quest.DefaultStartStageId);
            }

            for (int i = 0; i < quest.StartBranches.Count; i++)
            {
                if (quest.StartBranches[i] != null)
                {
                    starts.Add(quest.StartBranches[i].TargetStageId);
                }
            }

            HashSet<string> reachable = Reach(starts, edges);
            bool successReachable = false;
            var ends = new List<string>();
            for (int i = 0; i < quest.Stages.Count; i++)
            {
                StageDefinition stage = quest.Stages[i];
                if (stage == null)
                {
                    continue;
                }

                if (stage.IsEndStage)
                {
                    ends.Add(stage.Id);
                    successReachable |= stage.EndType == StageEndType.Success && reachable.Contains(stage.Id);
                }

                if (!reachable.Contains(stage.Id))
                {
                    using (report.Scope(stage.Id))
                    {
                        report.Error("V05", "'" + stage.Id + "' ist von der Start-Stage '" + quest.DefaultStartStageId + "' aus nicht erreichbar.");
                    }
                }
            }

            if (!successReachable)
            {
                report.Error("V08", "Keine erreichbare Erfolgs-Endstage: die Quest kann nicht erfolgreich enden.");
            }

            HashSet<string> canEnd = Reach(ends, Reverse(edges));
            for (int i = 0; i < quest.Stages.Count; i++)
            {
                StageDefinition stage = quest.Stages[i];
                if (stage == null || stage.IsEndStage || !reachable.Contains(stage.Id) || canEnd.Contains(stage.Id))
                {
                    continue;
                }

                if (edges.TryGetValue(stage.Id, out List<string> next) && Reach(next, edges).Contains(stage.Id))
                {
                    using (report.Scope(stage.Id))
                    {
                        report.Error("V07", "Zyklus ohne Ausgang: '" + stage.Id + "' führt im Kreis und nie zu einer Endstage.");
                    }
                }
            }
        }

        private static Dictionary<string, List<string>> BuildEdges(QuestSpec quest)
        {
            var edges = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            var questFailTargets = new List<string>();
            for (int i = 0; i < quest.FailRules.Count; i++)
            {
                if (quest.FailRules[i] != null && quest.FailRules[i].TargetStageId.Length > 0)
                {
                    questFailTargets.Add(quest.FailRules[i].TargetStageId);
                }
            }

            for (int s = 0; s < quest.Stages.Count; s++)
            {
                StageDefinition stage = quest.Stages[s];
                if (stage == null)
                {
                    continue;
                }

                var targets = new List<string>();
                for (int i = 0; i < stage.Branches.Count; i++)
                {
                    if (stage.Branches[i] != null)
                    {
                        targets.Add(stage.Branches[i].TargetStageId);
                    }
                }

                if (stage.DefaultNextStageId.Length > 0)
                {
                    targets.Add(stage.DefaultNextStageId);
                }

                for (int i = 0; i < stage.FailRules.Count; i++)
                {
                    if (stage.FailRules[i] != null && stage.FailRules[i].TargetStageId.Length > 0)
                    {
                        targets.Add(stage.FailRules[i].TargetStageId);
                    }
                }

                if (!stage.IsEndStage)
                {
                    targets.AddRange(questFailTargets);
                }

                AddJumpTargets(quest, stage, targets);
                edges[stage.Id] = targets;
            }

            return edges;
        }

        private static void AddJumpTargets(QuestSpec quest, StageDefinition stage, List<string> targets)
        {
            Action<object, StageDefinition> collect = (item, context) =>
            {
                if (item is SetQuestStage jump && (jump.ReferencedQuestId.Length == 0 || jump.ReferencedQuestId == quest.Id) && jump.ReferencedStageId.Length > 0)
                {
                    targets.Add(jump.ReferencedStageId);
                }
            };
            QuestDataWalker.WalkActions(stage.OnStart, stage, collect);
            QuestDataWalker.WalkActions(stage.OnComplete, stage, collect);
            for (int i = 0; i < stage.Objectives.Count; i++)
            {
                if (stage.Objectives[i] != null)
                {
                    QuestDataWalker.WalkActions(stage.Objectives[i].OnCompletedActions, stage, collect);
                }
            }
        }

        private static Dictionary<string, List<string>> Reverse(Dictionary<string, List<string>> edges)
        {
            var reversed = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, List<string>> pair in edges)
            {
                for (int i = 0; i < pair.Value.Count; i++)
                {
                    if (!reversed.TryGetValue(pair.Value[i], out List<string> list))
                    {
                        list = new List<string>();
                        reversed.Add(pair.Value[i], list);
                    }

                    list.Add(pair.Key);
                }
            }

            return reversed;
        }

        private static HashSet<string> Reach(IEnumerable<string> starts, Dictionary<string, List<string>> edges)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var queue = new Queue<string>();
            foreach (string start in starts)
            {
                if (!string.IsNullOrEmpty(start) && seen.Add(start))
                {
                    queue.Enqueue(start);
                }
            }

            while (queue.Count > 0)
            {
                string current = queue.Dequeue();
                if (!edges.TryGetValue(current, out List<string> next))
                {
                    continue;
                }

                for (int i = 0; i < next.Count; i++)
                {
                    if (!string.IsNullOrEmpty(next[i]) && seen.Add(next[i]))
                    {
                        queue.Enqueue(next[i]);
                    }
                }
            }

            return seen;
        }

        private static void ValidateQuestReferences(QuestSpec quest, ValidationReport report, Dictionary<string, QuestSpec> byId)
        {
            QuestDataWalker.Walk(quest, (item, stage) =>
            {
                if (!(item is IQuestDataReference reference))
                {
                    return;
                }

                QuestSpec target = quest;
                if (reference.ReferencedQuestId.Length > 0 && reference.ReferencedQuestId != quest.Id &&
                    !byId.TryGetValue(reference.ReferencedQuestId, out target))
                {
                    return;
                }

                string problem = FindReferenceProblem(reference, target, quest, stage);
                if (problem.Length == 0)
                {
                    return;
                }

                if (stage != null)
                {
                    using (report.Scope(stage.Id))
                    {
                        report.Error("V04", problem);
                    }
                }
                else
                {
                    report.Error("V04", problem);
                }
            });
        }

        private static string FindReferenceProblem(IQuestDataReference reference, QuestSpec target, QuestSpec owner, StageDefinition context)
        {
            StageDefinition stage = null;
            if (reference.ReferencedStageId.Length > 0 && !target.TryGetStage(reference.ReferencedStageId, out stage))
            {
                return "Stage '" + reference.ReferencedStageId + "' gibt es in " + target.Id + " nicht.";
            }

            if (reference.ReferencedObjectiveId.Length > 0)
            {
                if (stage == null && target == owner && context != null)
                {
                    stage = context;
                }

                bool found = stage != null ? stage.IndexOfObjective(reference.ReferencedObjectiveId) >= 0 : AnyStageHasObjective(target, reference.ReferencedObjectiveId);
                if (!found)
                {
                    return "Ziel '" + reference.ReferencedObjectiveId + "' gibt es " + (stage != null ? "in Stage " + stage.Id : "in " + target.Id) + " nicht.";
                }
            }

            if (reference.ReferencedLedgerId.Length > 0 && !target.TryGetLedgerEntry(reference.ReferencedLedgerId, out _))
            {
                return "Ledger-Eintrag '" + reference.ReferencedLedgerId + "' ist in " + target.Id + " nicht definiert.";
            }

            return string.Empty;
        }

        private static bool AnyStageHasObjective(QuestSpec quest, string objectiveId)
        {
            for (int i = 0; i < quest.Stages.Count; i++)
            {
                if (quest.Stages[i] != null && quest.Stages[i].IndexOfObjective(objectiveId) >= 0)
                {
                    return true;
                }
            }

            return false;
        }

        private static void ValidateTriggers(QuestSpec quest, ValidationReport report)
        {
            var reported = new HashSet<Type>();
            Action<Condition> check = condition =>
            {
                if (condition != null && TriggerSet.Of(condition).IsEmpty && reported.Add(condition.GetType()))
                {
                    report.Info("C01", "Bedingung " + condition.GetType().Name + " meldet keine Auslöser und wird jede Sekunde geprüft (Architektur 7.5).");
                }
            };
            check(quest.StartCondition);
            for (int i = 0; i < quest.FailRules.Count; i++)
            {
                check(quest.FailRules[i] != null ? quest.FailRules[i].Condition : null);
            }

            for (int s = 0; s < quest.Stages.Count; s++)
            {
                StageDefinition stage = quest.Stages[s];
                if (stage == null)
                {
                    continue;
                }

                for (int i = 0; i < stage.FailRules.Count; i++)
                {
                    check(stage.FailRules[i] != null ? stage.FailRules[i].Condition : null);
                }
            }
        }

        private static void CheckContradictions(Condition condition, IValidationReport report)
        {
            if (condition == null)
            {
                return;
            }

            if (condition is Never)
            {
                report.Error("V18", "Startbedingung ist „Nie“: die Quest kann nie starten.");
                return;
            }

            if (!(condition is AllOf))
            {
                return;
            }

            var flat = new List<Condition>();
            Flatten(condition, flat);
            var statusByQuest = new Dictionary<string, QuestStatus>(StringComparer.Ordinal);
            for (int i = 0; i < flat.Count; i++)
            {
                if (flat[i] is Never)
                {
                    report.Error("V18", "Startbedingung enthält „Nie“ in einem UND: nie erfüllbar.");
                }

                if (!(flat[i] is QuestStatusIs status))
                {
                    continue;
                }

                if (statusByQuest.TryGetValue(status.QuestId, out QuestStatus other) && other != status.Status)
                {
                    report.Error("V18", "Startbedingung verlangt für " + status.QuestId + " gleichzeitig " + other + " und " + status.Status + ".");
                }
                else
                {
                    statusByQuest[status.QuestId] = status.Status;
                }
            }
        }

        private static void Flatten(Condition condition, List<Condition> result)
        {
            if (condition is AllOf all)
            {
                for (int i = 0; i < all.Conditions.Count; i++)
                {
                    Flatten(all.Conditions[i], result);
                }

                return;
            }

            if (condition != null)
            {
                result.Add(condition);
            }
        }

        private void CheckLastingFlags(QuestSpec quest, ValidationReport report, int firstReference)
        {
            var written = new List<string>();
            var lasting = new List<string>();
            IReadOnlyList<ValidationReference> references = report.References;
            for (int i = firstReference; i < references.Count; i++)
            {
                ValidationReference reference = references[i];
                if (reference.Use != ReferenceUse.Write || IsLocalFlag(reference.Id) || written.Contains(reference.Id))
                {
                    continue;
                }

                written.Add(reference.Id);
                bool accumulates = _lookup.TryGetFlag(reference.Id, out FlagSpec spec) && (spec.Kind == FlagKind.Counter || spec.Kind == FlagKind.StoryNumber);
                if (!accumulates)
                {
                    lasting.Add(reference.Id);
                }
            }

            string location = QuestLabel(quest);
            if (quest.IsRepeatable && lasting.Count > 0)
            {
                report.AddAt(ValidationSeverity.Error, "V15", "Wiederholbar, aber setzt dauerhaft " + string.Join(", ", lasting) + ".", location);
            }

            if (written.Count > MaxLastingFlags)
            {
                report.AddAt(ValidationSeverity.Warning, "W12", written.Count + " Flags wirken über die Quest hinaus (höchstens " + MaxLastingFlags + "): " +
                                                                string.Join(", ", written) + ".", location);
            }
        }

        private void ResolveReferences(ValidationReport report, Dictionary<string, QuestSpec> byId)
        {
            IReadOnlyList<ValidationReference> references = report.References;
            for (int i = 0; i < references.Count; i++)
            {
                ValidationReference reference = references[i];
                string id = reference.Id;
                if (id.IndexOf('*') >= 0)
                {
                    continue;
                }

                if (!ContentIdRules.IsValid(id))
                {
                    report.AddAt(ValidationSeverity.Error, "V02", "ID '" + id + "' verletzt das Schema (nur a–z, 0–9, _ und ., mindestens 2 Teile).", reference.Location);
                    continue;
                }

                if (reference.ExpectedPrefix == "flag.")
                {
                    ResolveFlag(report, reference);
                    continue;
                }

                if (reference.ExpectedPrefix.Length > 0 && !id.StartsWith(reference.ExpectedPrefix, StringComparison.Ordinal))
                {
                    report.AddAt(ValidationSeverity.Error, "V02", "ID '" + id + "' passt nicht zum erwarteten Präfix '" + reference.ExpectedPrefix + "'.", reference.Location);
                    continue;
                }

                if (id.StartsWith(QuestIds.QuestPrefix, StringComparison.Ordinal))
                {
                    if (!byId.ContainsKey(id) && _lookup.HasContentIds && !_lookup.ContentExists(id))
                    {
                        report.AddAt(ValidationSeverity.Error, "V04", "Quest '" + id + "' nicht gefunden." + Suggest(id, byId), reference.Location);
                    }

                    continue;
                }

                if (_lookup.HasContentIds && IsDefinitionId(id) && !_lookup.ContentExists(id))
                {
                    report.AddAt(ValidationSeverity.Error, "V04", "'" + id + "' nicht gefunden." + Suggest(id, byId), reference.Location);
                }
            }
        }

        private void ResolveFlag(ValidationReport report, ValidationReference reference)
        {
            string id = reference.Id;
            if (IsLocalFlag(id))
            {
                return;
            }

            if (!id.StartsWith("flag.", StringComparison.Ordinal) && !id.StartsWith("stat.", StringComparison.Ordinal))
            {
                report.AddAt(ValidationSeverity.Error, "V02", "Flag-ID '" + id + "' muss mit flag. oder stat. beginnen.", reference.Location);
                return;
            }

            if (!_lookup.HasFlagDefinitions)
            {
                return;
            }

            if (!_lookup.TryGetFlag(id, out FlagSpec spec))
            {
                report.AddAt(ValidationSeverity.Error, "V04", "Flag '" + id + "' ist nicht definiert (FlagDefinition fehlt)." + Suggest(id, null), reference.Location);
                return;
            }

            if (reference.HasValue && (spec.Kind == FlagKind.Enum || spec.Kind == FlagKind.Bool) && !spec.IsKnownValue(reference.Value))
            {
                report.AddAt(ValidationSeverity.Error, "V17", "'" + id + " = " + reference.Value + "' ist nicht in der Werteliste von " + spec.Kind + ".", reference.Location);
            }
        }

        private static void CheckFlagUsage(ValidationReport report)
        {
            var reads = new Dictionary<string, string>(StringComparer.Ordinal);
            var writes = new Dictionary<string, string>(StringComparer.Ordinal);
            IReadOnlyList<ValidationReference> references = report.References;
            for (int i = 0; i < references.Count; i++)
            {
                ValidationReference reference = references[i];
                if (reference.ExpectedPrefix != "flag." || IsLocalFlag(reference.Id))
                {
                    continue;
                }

                if (reference.Use == ReferenceUse.Read && !reads.ContainsKey(reference.Id))
                {
                    reads.Add(reference.Id, reference.Location);
                }
                else if (reference.Use == ReferenceUse.Write && !writes.ContainsKey(reference.Id))
                {
                    writes.Add(reference.Id, reference.Location);
                }
            }

            foreach (KeyValuePair<string, string> read in reads)
            {
                if (!writes.ContainsKey(read.Key))
                {
                    report.AddAt(ValidationSeverity.Warning, "V16", "Flag '" + read.Key + "' wird gelesen, aber in keiner geprüften Quest geschrieben (Dialoge und Szenen werden noch nicht geprüft).", read.Value);
                }
            }

            foreach (KeyValuePair<string, string> write in writes)
            {
                if (!reads.ContainsKey(write.Key))
                {
                    report.AddAt(ValidationSeverity.Warning, "V16", "Flag '" + write.Key + "' wird geschrieben, aber in keiner geprüften Quest gelesen.", write.Value);
                }
            }
        }

        private static bool IsDefinitionId(string id)
        {
            for (int i = 0; i < DefinitionPrefixes.Length; i++)
            {
                if (id.StartsWith(DefinitionPrefixes[i], StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        private string Suggest(string id, Dictionary<string, QuestSpec> byId)
        {
            string best = null;
            int bestDistance = 3;
            foreach (string candidate in _lookup.ContentIds)
            {
                Consider(id, candidate, ref best, ref bestDistance);
            }

            if (byId != null)
            {
                foreach (string candidate in byId.Keys)
                {
                    Consider(id, candidate, ref best, ref bestDistance);
                }
            }

            return best != null ? " Meintest du '" + best + "'?" : string.Empty;
        }

        private static void Consider(string id, string candidate, ref string best, ref int bestDistance)
        {
            if (candidate == id || Math.Abs(candidate.Length - id.Length) >= bestDistance)
            {
                return;
            }

            int distance = Levenshtein(id, candidate, bestDistance);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = candidate;
            }
        }

        private static int Levenshtein(string a, string b, int limit)
        {
            var previous = new int[b.Length + 1];
            var current = new int[b.Length + 1];
            for (int j = 0; j <= b.Length; j++)
            {
                previous[j] = j;
            }

            for (int i = 1; i <= a.Length; i++)
            {
                current[0] = i;
                int rowMin = current[0];
                for (int j = 1; j <= b.Length; j++)
                {
                    int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                    current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
                    rowMin = Math.Min(rowMin, current[j]);
                }

                if (rowMin >= limit)
                {
                    return limit;
                }

                int[] swap = previous;
                previous = current;
                current = swap;
            }

            return previous[b.Length];
        }
    }
}
