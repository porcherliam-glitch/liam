using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Checks dialogue data (GDD 02, 12.2: "V01, V02, V04-V07, V10 und V14 gelten sinngemaess auch fuer Dialoge"; architecture
    /// 6.4). Pure logic; used by the menu "Aetherfall > Dialoge pruefen", batch mode and tests.
    /// </summary>
    /// <remarks>
    /// <list type="table">
    /// <item><term>V01</term><description>duplicate dialogue, node or option id (error)</description></item>
    /// <item><term>V02</term><description>id breaks the schema: <c>dlg.&lt;region&gt;.&lt;name&gt;</c>, empty node id (error)</description></item>
    /// <item><term>V04</term><description>broken reference: unknown target node, start node, jump dialogue, speaker NPC (error)</description></item>
    /// <item><term>V05</term><description>node not reachable from the start or a jump of another dialogue (error)</description></item>
    /// <item><term>V06</term><description>dead end: line or action without next node and without exit, choice without options,
    /// option or branch without target, check without success exit (error)</description></item>
    /// <item><term>V07</term><description>cycle without exit: a reachable node from which no end can be reached (error)</description></item>
    /// <item><term>V09</term><description>condition switch without default exit (error)</description></item>
    /// <item><term>V10</term><description>missing text of a line, variant or option (error)</description></item>
    /// <item><term>V13/V14</term><description>invalid parameters, missing <c>[SerializeReference]</c> types (error)</description></item>
    /// <item><term>W04</term><description>text too long: line &gt; 180, option &gt; 60 characters (warning)</description></item>
    /// <item><term>D01</term><description>more than 6 options (hub: 9) (warning)</description></item>
    /// <item><term>D02</term><description>no reachable end at all (error)</description></item>
    /// <item><term>D03</term><description>end without exit id, or a quest exit that no end uses (warning)</description></item>
    /// <item><term>D04</term><description>action node without actions (warning)</description></item>
    /// <item><term>D05</term><description>node id not in the form <c>n010</c> (hint)</description></item>
    /// <item><term>D06</term><description>check without failure exit (hint: a failed check returns to the last choice)</description></item>
    /// <item><term>D07</term><description>choice without an answer that is always selectable (no visible-if, no selectable-if,
    /// not one-time, target no check, no gold): in the game all answers may be greyed (warning)</description></item>
    /// </list>
    /// </remarks>
    public sealed class DialogueValidator
    {
        /// <summary>Duplicate id.</summary>
        public const string DuplicateCode = "V01";

        /// <summary>Id breaks the schema.</summary>
        public const string IdSchemaCode = "V02";

        /// <summary>Broken reference.</summary>
        public const string BrokenReferenceCode = "V04";

        /// <summary>Unreachable node.</summary>
        public const string UnreachableCode = "V05";

        /// <summary>Dead end.</summary>
        public const string DeadEndCode = "V06";

        /// <summary>Cycle without exit.</summary>
        public const string CycleCode = "V07";

        /// <summary>Condition switch without default exit.</summary>
        public const string MissingDefaultCode = "V09";

        /// <summary>Missing text.</summary>
        public const string MissingTextCode = "V10";

        /// <summary>Text too long.</summary>
        public const string TextLengthCode = "W04";

        /// <summary>Too many options.</summary>
        public const string TooManyOptionsCode = "D01";

        /// <summary>No reachable end.</summary>
        public const string NoEndCode = "D02";

        /// <summary>End without exit id or unused quest exit.</summary>
        public const string MissingExitCode = "D03";

        /// <summary>Action node without actions.</summary>
        public const string EmptyActionCode = "D04";

        /// <summary>Unconventional node id.</summary>
        public const string NodeIdConventionCode = "D05";

        /// <summary>Check without failure exit.</summary>
        public const string CheckWithoutFailureCode = "D06";

        /// <summary>Choice without an always selectable answer.</summary>
        public const string NoSafeOptionCode = "D07";

        private readonly IDialogueValidationLookup _lookup;
        private readonly DialogueBadgeRules _badges = new DialogueBadgeRules();

        /// <summary>Creates the validator.</summary>
        /// <param name="lookup">Known content (null = references to other dialogues and NPCs are not checked).</param>
        public DialogueValidator(IDialogueValidationLookup lookup = null)
        {
            _lookup = lookup;
        }

        /// <summary>Validates several dialogues (also duplicate dialogue ids and jumps between them).</summary>
        /// <param name="specs">Dialogues.</param>
        public ValidationReport Validate(IEnumerable<DialogueSpec> specs)
        {
            var report = new ValidationReport();
            var list = specs != null ? new List<DialogueSpec>(specs) : new List<DialogueSpec>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var external = CollectExternalEntries(list);
            for (int i = 0; i < list.Count; i++)
            {
                DialogueSpec spec = list[i];
                if (spec == null)
                {
                    continue;
                }

                if (spec.Id.Length > 0 && !seen.Add(spec.Id))
                {
                    report.AddAt(ValidationSeverity.Error, DuplicateCode, "Dialog-ID '" + spec.Id + "' gibt es zweimal.", spec.Id);
                }

                ValidateSpec(spec, report, external);
            }

            return report;
        }

        /// <summary>Validates one dialogue.</summary>
        /// <param name="spec">Dialogue.</param>
        public ValidationReport Validate(DialogueSpec spec)
        {
            return Validate(new[] { spec });
        }

        private void ValidateSpec(DialogueSpec spec, ValidationReport report, Dictionary<string, HashSet<string>> externalEntries)
        {
            int firstReference = report.References.Count;
            using (report.Scope(spec.Id.Length > 0 ? spec.Id : "(ohne ID)"))
            {
                CheckIds(spec, report);
                if (spec.Nodes.Count == 0)
                {
                    report.Error(DeadEndCode, "Der Dialog hat keine Knoten.");
                    return;
                }

                if (!spec.HasNode(spec.StartNodeId))
                {
                    report.Error(BrokenReferenceCode, "Start-Knoten '" + spec.StartNodeId + "' existiert nicht.");
                }

                var targets = new List<string>();
                for (int i = 0; i < spec.Nodes.Count; i++)
                {
                    DialogueNode node = spec.Nodes[i];
                    using (report.Scope(node != null && node.Id.Length > 0 ? node.Id : "[" + i + "]"))
                    {
                        if (node == null)
                        {
                            report.Error(ValidationReportExtensions.MissingTypeCode, "Knoten fehlt oder hat einen unbekannten Typ (umbenannte Klasse?).");
                            continue;
                        }

                        CheckNode(spec, node, report, targets);
                    }
                }

                CheckQuestExits(spec, report);
                externalEntries.TryGetValue(spec.Id, out HashSet<string> entries);
                CheckGraph(spec, report, entries);
            }

            ResolveReferences(report, firstReference);
        }

        private static void CheckIds(DialogueSpec spec, ValidationReport report)
        {
            if (spec.Id.Length == 0)
            {
                report.Error(IdSchemaCode, "Der Dialog hat keine ID.");
            }
            else if (!spec.Id.StartsWith(DialogueIds.DialoguePrefix, StringComparison.Ordinal) || !ContentIdRules.IsValid(spec.Id))
            {
                report.Error(IdSchemaCode, "Dialog-ID '" + spec.Id + "' passt nicht zum Schema dlg.<region>.<npc>_<thema> (nur a–z, 0–9, _ und .).");
            }

            if (spec.SpeakerId.Length > 0)
            {
                report.Mentions(spec.SpeakerId, DialogueIds.NpcPrefix);
            }

            for (int i = 0; i < spec.DuplicateNodeIds.Count; i++)
            {
                report.Error(DuplicateCode, "Knoten-ID '" + spec.DuplicateNodeIds[i] + "' gibt es mehrmals (nur der erste zählt).");
            }
        }

        private void CheckNode(DialogueSpec spec, DialogueNode node, ValidationReport report, List<string> targets)
        {
            if (node.Id.Length == 0)
            {
                report.Error(IdSchemaCode, "Der Knoten hat keine ID.");
            }
            else if (!DialogueIds.IsConventionalNodeId(node.Id))
            {
                report.Info(NodeIdConventionCode, "Knoten-ID '" + node.Id + "' folgt nicht dem Muster n010, n020 … (GDD 02, 12.2).");
            }

            node.Validate(report);

            targets.Clear();
            node.CollectTargets(targets);
            for (int t = 0; t < targets.Count; t++)
            {
                if (!spec.HasNode(targets[t]))
                {
                    report.Error(BrokenReferenceCode, "Ziel-Knoten '" + targets[t] + "' existiert nicht.");
                }
            }

            if (node is FlowNode flow && flow.EndsAfter && flow.ExitId.Length == 0)
            {
                report.Error(DeadEndCode, "Sackgasse: kein nächster Knoten und keine Ausgangs-ID.");
            }

            if (node is CheckNode check && check.FailureNodeId.Length == 0)
            {
                report.Info(CheckWithoutFailureCode, "Probe ohne Misserfolgs-Ausgang: Bei Misserfolg geht es zurück zur letzten Auswahl.");
            }

            if (node is ChoiceNode choice && choice.Options.Count > 0 && !HasSafeOption(spec, choice))
            {
                report.Warning(NoSafeOptionCode, "Keine Antwort ist immer wählbar (jede hat eine Bedingung, ist einmalig, führt zu einer Probe oder " +
                                                 "kostet Gold). Sind im Spiel alle grau, bleibt nur Abbrechen mit B/Kreis. Eine Antwort ohne " +
                                                 "Bedingung ergänzen, z. B. „Ich komme wieder.“ mit Ziel Ende.");
            }

            // A missing target dialogue is reported with the other references (ResolveReferences); here only its node.
            if (node is JumpNode jump && jump.IsExternal && jump.TargetNodeId.Length > 0 && _lookup != null &&
                _lookup.TryGetDialogue(jump.TargetDialogueId, out DialogueSpec target) && !target.HasNode(jump.TargetNodeId))
            {
                report.Error(BrokenReferenceCode, "Ziel-Knoten '" + jump.TargetNodeId + "' existiert in '" + jump.TargetDialogueId + "' nicht.");
            }
        }

        /// <summary>
        /// True if the choice has an answer that is selectable in every game state: visible and selectable without condition,
        /// not one-time, its target is no check, and neither it nor the straight path behind it costs gold.
        /// </summary>
        private bool HasSafeOption(DialogueSpec spec, ChoiceNode choice)
        {
            for (int i = 0; i < choice.Options.Count; i++)
            {
                DialogueOption option = choice.Options[i];
                if (option == null || option.VisibleIf != null || option.SelectableIf != null || option.Once)
                {
                    continue;
                }

                spec.TryGetNode(option.TargetNodeId, out DialogueNode target);
                if (target is CheckNode || CostsGold(option.Actions))
                {
                    continue;
                }

                if (!PathCostsGold(spec, target))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Follows lines and action nodes behind an answer (like the markings do) and looks for a bribe.</summary>
        private bool PathCostsGold(DialogueSpec spec, DialogueNode node)
        {
            for (int step = 0; step < DialogueRules.DefaultMaxPathLength && node is FlowNode flow; step++)
            {
                if ((flow is LineNode line && CostsGold(line.Actions)) || (flow is ActionNode action && CostsGold(action.Actions)))
                {
                    return true;
                }

                if (flow.EndsAfter)
                {
                    return false;
                }

                spec.TryGetNode(flow.NextNodeId, out node);
            }

            return false;
        }

        private bool CostsGold(IReadOnlyList<GameAction> actions)
        {
            return (_badges.MarksOf(actions) & DialogueOptionMarks.Bribe) != 0;
        }

        private static void CheckQuestExits(DialogueSpec spec, ValidationReport report)
        {
            if (spec.QuestExitIds.Count == 0)
            {
                return;
            }

            var used = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < spec.Nodes.Count; i++)
            {
                if (spec.Nodes[i] is FlowNode flow && flow.EndsAfter && flow.ExitId.Length > 0)
                {
                    used.Add(flow.ExitId);
                }
                else if (spec.Nodes[i] is EndNode end && end.ExitId.Length > 0)
                {
                    used.Add(end.ExitId);
                }
            }

            foreach (string exit in spec.QuestExitIds)
            {
                if (!used.Contains(exit))
                {
                    report.Warning(MissingExitCode, "Quest-Ausgang '" + exit + "' kommt in keinem Ende vor.");
                }
            }
        }

        private static void CheckGraph(DialogueSpec spec, ValidationReport report, HashSet<string> externalEntries)
        {
            // Reachability (V05): from the start node and from nodes other dialogues jump to.
            var reachable = new HashSet<string>(StringComparer.Ordinal);
            var queue = new Queue<string>();
            Enqueue(spec, spec.StartNodeId, reachable, queue);
            if (externalEntries != null)
            {
                foreach (string entry in externalEntries)
                {
                    Enqueue(spec, entry, reachable, queue);
                }
            }

            var targets = new List<string>();
            while (queue.Count > 0)
            {
                spec.TryGetNode(queue.Dequeue(), out DialogueNode node);
                targets.Clear();
                node.CollectTargets(targets);
                for (int i = 0; i < targets.Count; i++)
                {
                    Enqueue(spec, targets[i], reachable, queue);
                }
            }

            // Nodes that can reach an end (reverse search from every node that can end the conversation).
            var canEnd = new HashSet<string>(StringComparer.Ordinal);
            bool changed = true;
            while (changed)
            {
                changed = false;
                for (int i = 0; i < spec.Nodes.Count; i++)
                {
                    DialogueNode node = spec.Nodes[i];
                    if (node == null || node.Id.Length == 0 || canEnd.Contains(node.Id))
                    {
                        continue;
                    }

                    bool ends = node.CanEndHere;
                    if (!ends)
                    {
                        targets.Clear();
                        node.CollectTargets(targets);
                        for (int t = 0; t < targets.Count && !ends; t++)
                        {
                            ends = canEnd.Contains(targets[t]);
                        }
                    }

                    if (ends)
                    {
                        canEnd.Add(node.Id);
                        changed = true;
                    }
                }
            }

            bool anyEnd = false;
            for (int i = 0; i < spec.Nodes.Count; i++)
            {
                DialogueNode node = spec.Nodes[i];
                if (node == null || node.Id.Length == 0)
                {
                    continue;
                }

                if (!reachable.Contains(node.Id))
                {
                    using (report.Scope(node.Id))
                    {
                        report.Error(UnreachableCode, "'" + node.Id + "' ist vom Start-Knoten '" + spec.StartNodeId + "' aus nicht erreichbar.");
                    }

                    continue;
                }

                if (node.CanEndHere)
                {
                    anyEnd = true;
                }

                if (!canEnd.Contains(node.Id))
                {
                    using (report.Scope(node.Id))
                    {
                        report.Error(CycleCode, "Von '" + node.Id + "' aus kann das Gespräch nie enden (Zyklus oder Sackgasse ohne Ausgang).");
                    }
                }
            }

            if (!anyEnd && reachable.Count > 0)
            {
                report.Error(NoEndCode, "Kein erreichbares Ende: Jeder Dialog braucht mindestens einen Ende-Knoten oder eine Zeile mit Ausgang.");
            }
        }

        private static void Enqueue(DialogueSpec spec, string nodeId, HashSet<string> reachable, Queue<string> queue)
        {
            if (!string.IsNullOrEmpty(nodeId) && spec.HasNode(nodeId) && reachable.Add(nodeId))
            {
                queue.Enqueue(nodeId);
            }
        }

        private static Dictionary<string, HashSet<string>> CollectExternalEntries(List<DialogueSpec> specs)
        {
            var result = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            for (int i = 0; i < specs.Count; i++)
            {
                DialogueSpec spec = specs[i];
                if (spec == null)
                {
                    continue;
                }

                for (int n = 0; n < spec.Nodes.Count; n++)
                {
                    if (spec.Nodes[n] is JumpNode jump && jump.IsExternal && jump.TargetNodeId.Length > 0)
                    {
                        if (!result.TryGetValue(jump.TargetDialogueId, out HashSet<string> entries))
                        {
                            entries = new HashSet<string>(StringComparer.Ordinal);
                            result.Add(jump.TargetDialogueId, entries);
                        }

                        entries.Add(jump.TargetNodeId);
                    }
                }
            }

            return result;
        }

        private void ResolveReferences(ValidationReport report, int firstReference)
        {
            if (_lookup == null)
            {
                return;
            }

            IReadOnlyList<ValidationReference> references = report.References;
            for (int i = firstReference; i < references.Count; i++)
            {
                ValidationReference reference = references[i];
                if (reference.ExpectedPrefix == DialogueIds.NpcPrefix && _lookup.HasNpcData && !_lookup.NpcExists(reference.Id))
                {
                    report.AddAt(ValidationSeverity.Error, BrokenReferenceCode, "NPC '" + reference.Id + "' existiert nicht (NpcDefinition fehlt).", reference.Location);
                }
                else if (reference.ExpectedPrefix == DialogueIds.DialoguePrefix && !_lookup.TryGetDialogue(reference.Id, out _))
                {
                    report.AddAt(ValidationSeverity.Error, BrokenReferenceCode, "Dialog '" + reference.Id + "' existiert nicht.", reference.Location);
                }
            }
        }
    }
}
