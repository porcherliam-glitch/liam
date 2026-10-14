using System.Collections.Generic;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Helpers for <see cref="IValidationReport"/>: findings by severity, location scopes, referenced ids and the checks every
    /// condition, action and objective needs (empty id, value not positive, empty or unknown list entries).
    /// </summary>
    public static class ValidationReportExtensions
    {
        /// <summary>Rule code: empty reference or invalid parameter (GDD 02, 10.2 V13).</summary>
        public const string InvalidParameterCode = "V13";

        /// <summary>Rule code: missing <c>[SerializeReference]</c> type or empty list entry (GDD 02, 10.2 V14).</summary>
        public const string MissingTypeCode = "V14";

        /// <summary>Enters a location until the returned scope is disposed (<c>using (report.Scope("s20")) { … }</c>).</summary>
        /// <param name="report">Report.</param>
        /// <param name="segment">Location segment.</param>
        /// <returns>Scope to dispose.</returns>
        public static ValidationLocationScope Scope(this IValidationReport report, string segment)
        {
            report.PushLocation(segment);
            return new ValidationLocationScope(report);
        }

        /// <summary>Adds an error.</summary>
        /// <param name="report">Report.</param>
        /// <param name="code">Rule code.</param>
        /// <param name="message">German message.</param>
        public static void Error(this IValidationReport report, string code, string message)
        {
            report.Add(ValidationSeverity.Error, code, message);
        }

        /// <summary>Adds a warning.</summary>
        /// <param name="report">Report.</param>
        /// <param name="code">Rule code.</param>
        /// <param name="message">German message.</param>
        public static void Warning(this IValidationReport report, string code, string message)
        {
            report.Add(ValidationSeverity.Warning, code, message);
        }

        /// <summary>Adds a hint.</summary>
        /// <param name="report">Report.</param>
        /// <param name="code">Rule code.</param>
        /// <param name="message">German message.</param>
        public static void Info(this IValidationReport report, string code, string message)
        {
            report.Add(ValidationSeverity.Info, code, message);
        }

        /// <summary>Records a mentioned id (NPC, item, location …).</summary>
        /// <param name="report">Report.</param>
        /// <param name="id">Id.</param>
        /// <param name="expectedPrefix">Expected prefix.</param>
        public static void Mentions(this IValidationReport report, string id, string expectedPrefix)
        {
            report.AddReference(id, expectedPrefix, ReferenceUse.Mention, 0, false);
        }

        /// <summary>Records a read flag with the compared value.</summary>
        /// <param name="report">Report.</param>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">Compared value.</param>
        public static void ReadsFlag(this IValidationReport report, string flagId, int value)
        {
            report.AddReference(flagId, "flag.", ReferenceUse.Read, value, true);
        }

        /// <summary>Records a written flag.</summary>
        /// <param name="report">Report.</param>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">Written value.</param>
        /// <param name="hasValue">False for relative changes (add).</param>
        public static void WritesFlag(this IValidationReport report, string flagId, int value, bool hasValue)
        {
            report.AddReference(flagId, "flag.", ReferenceUse.Write, value, hasValue);
        }

        /// <summary>Reports V13 if the id is empty, otherwise records it as mentioned.</summary>
        /// <param name="report">Report.</param>
        /// <param name="id">Id from the data.</param>
        /// <param name="expectedPrefix">Expected prefix.</param>
        /// <param name="fieldLabel">German field name for the message.</param>
        /// <returns>True if an id is set.</returns>
        public static bool RequireId(this IValidationReport report, string id, string expectedPrefix, string fieldLabel)
        {
            if (string.IsNullOrEmpty(id))
            {
                report.Error(InvalidParameterCode, fieldLabel + " ist leer.");
                return false;
            }

            report.Mentions(id, expectedPrefix);
            return true;
        }

        /// <summary>Reports V13 if the value is not positive.</summary>
        /// <param name="report">Report.</param>
        /// <param name="value">Value.</param>
        /// <param name="fieldLabel">German field name.</param>
        /// <returns>True if the value is at least 1.</returns>
        public static bool RequirePositive(this IValidationReport report, int value, string fieldLabel)
        {
            if (value > 0)
            {
                return true;
            }

            report.Error(InvalidParameterCode, fieldLabel + " ist " + value + " (muss mindestens 1 sein).");
            return false;
        }

        /// <summary>
        /// Validates an optional child condition: null is allowed (no condition), otherwise its own
        /// <see cref="Condition.Validate"/> runs inside a location scope.
        /// </summary>
        /// <param name="report">Report.</param>
        /// <param name="condition">Condition or null.</param>
        /// <param name="label">Location label, e.g. <c>Startbedingung</c>.</param>
        public static void ValidateOptional(this IValidationReport report, Condition condition, string label)
        {
            if (condition == null)
            {
                return;
            }

            using (report.Scope(label))
            {
                condition.Validate(report);
            }
        }

        /// <summary>Validates a required child condition: null is V14 (unknown type or empty).</summary>
        /// <param name="report">Report.</param>
        /// <param name="condition">Condition.</param>
        /// <param name="label">Location label.</param>
        public static void ValidateRequired(this IValidationReport report, Condition condition, string label)
        {
            using (report.Scope(label))
            {
                if (condition == null)
                {
                    report.Error(MissingTypeCode, "Bedingung fehlt oder hat einen unbekannten Typ (umbenannte Klasse?).");
                    return;
                }

                condition.Validate(report);
            }
        }

        /// <summary>Validates a condition list: every null entry is V14, the others validate themselves.</summary>
        /// <param name="report">Report.</param>
        /// <param name="conditions">Conditions (may be null = empty).</param>
        /// <param name="label">Location label.</param>
        public static void ValidateConditions(this IValidationReport report, IReadOnlyList<Condition> conditions, string label)
        {
            if (conditions == null)
            {
                return;
            }

            for (int i = 0; i < conditions.Count; i++)
            {
                using (report.Scope(label + "[" + i + "]"))
                {
                    if (conditions[i] == null)
                    {
                        report.Error(MissingTypeCode, "Leerer Eintrag oder unbekannter Typ in der Bedingungsliste.");
                        continue;
                    }

                    conditions[i].Validate(report);
                }
            }
        }

        /// <summary>Validates an action list: every null entry is V14, the others validate themselves.</summary>
        /// <param name="report">Report.</param>
        /// <param name="actions">Actions (may be null = empty).</param>
        /// <param name="label">Location label, e.g. <c>Aktionen beim Start</c>.</param>
        public static void ValidateActions(this IValidationReport report, IReadOnlyList<GameAction> actions, string label)
        {
            if (actions == null)
            {
                return;
            }

            for (int i = 0; i < actions.Count; i++)
            {
                using (report.Scope(label + "[" + i + "]"))
                {
                    if (actions[i] == null)
                    {
                        report.Error(MissingTypeCode, "Leerer Eintrag oder unbekannter Typ in der Aktionsliste.");
                        continue;
                    }

                    actions[i].Validate(report);
                }
            }
        }
    }
}
