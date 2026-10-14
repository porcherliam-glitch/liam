using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Interagiere mit Objekt" (GDD 02 5.1 type 13, short code <c>Interagiere</c>): counts <c>Interacted</c> with
    /// one of the object ids, each object once. An id ending with <c>*</c> matches a group (<c>obj.eichental.strohziel_*</c>).
    /// Optionally only one verb counts (<c>open</c>, <c>use</c> …).
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Interagiere mit Objekt", 6)]
    public sealed class InteractObjective : QuestObjective, IObjectiveListener<Interacted>
    {
        [Tooltip("Objekt-IDs. Ein * am Ende passt auf eine Gruppe, z. B. obj.eichental.strohziel_*.")]
        [SerializeField] private List<string> objectIds = new List<string>();

        [Tooltip("Anzahl verschiedener Objekte.")]
        [Min(1)] [SerializeField] private int count = 1;

        [Tooltip("Nur dieses Verb zählt (open, use, talk, pickup). Leer = jedes.")]
        [SerializeField] private string verb = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public InteractObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="count">Number of different objects.</param>
        /// <param name="objectIds">Object ids (trailing <c>*</c> = group).</param>
        public InteractObjective(string id, int count, params string[] objectIds) : base(id)
        {
            this.count = count;
            if (objectIds != null)
            {
                this.objectIds.AddRange(objectIds);
            }
        }

        /// <summary>Object ids.</summary>
        public IReadOnlyList<string> ObjectIds => objectIds;

        /// <summary>Verb filter or empty.</summary>
        public string Verb => verb ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Interagiere";

        /// <summary>Only this verb counts (code-built quests).</summary>
        /// <param name="verbId">Verb id.</param>
        public InteractObjective WithVerb(string verbId)
        {
            verb = verbId ?? string.Empty;
            return this;
        }

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<Interacted>(this);
        }

        /// <inheritdoc />
        public void Handle(in Interacted evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (Verb.Length > 0 && evt.Verb != Verb)
            {
                return;
            }

            if (!Matches(evt.ObjectId))
            {
                return;
            }

            if (rt.AddDistinct(evt.ObjectId))
            {
                rt.Add(1);
            }
        }

        /// <summary>True if the object id matches one of the configured ids or groups.</summary>
        /// <param name="objectId">Object id.</param>
        public bool Matches(string objectId)
        {
            if (string.IsNullOrEmpty(objectId))
            {
                return false;
            }

            for (int i = 0; i < objectIds.Count; i++)
            {
                string pattern = objectIds[i];
                if (string.IsNullOrEmpty(pattern))
                {
                    continue;
                }

                if (pattern[pattern.Length - 1] == '*')
                {
                    if (objectId.StartsWith(pattern.Substring(0, pattern.Length - 1), StringComparison.Ordinal))
                    {
                        return true;
                    }
                }
                else if (pattern == objectId)
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + string.Join(", ", objectIds) + (count > 1 ? "; " + count : string.Empty) + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            if (objectIds.Count == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Interagiere: keine Objekt-ID angegeben.");
                return;
            }

            int exact = 0;
            bool hasGroup = false;
            for (int i = 0; i < objectIds.Count; i++)
            {
                string pattern = objectIds[i];
                if (string.IsNullOrEmpty(pattern))
                {
                    report.Error(ValidationReportExtensions.InvalidParameterCode, "Interagiere: leere Objekt-ID.");
                    continue;
                }

                if (pattern[pattern.Length - 1] == '*')
                {
                    hasGroup = true;
                    continue;
                }

                exact++;
                report.Mentions(pattern, string.Empty);
            }

            if (!hasGroup && count > exact)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Interagiere: Anzahl " + count + ", aber nur " + exact + " Objekt(e).");
            }
        }
    }
}
