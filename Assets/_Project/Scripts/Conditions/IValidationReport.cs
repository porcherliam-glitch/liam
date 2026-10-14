namespace Aetherfall.Conditions
{
    /// <summary>
    /// Collects validation findings and referenced ids (architecture 6.4, GDD 02 10.2). Passed to
    /// <see cref="Condition.Validate"/>, <see cref="GameAction.Validate"/> and the quest validator. Helpers for the common
    /// cases are in <see cref="ValidationReportExtensions"/>.
    /// </summary>
    /// <remarks>
    /// Deviation from architecture 3.3: the table puts <c>IValidationReport</c> into <c>Aetherfall.Core</c>. Core is not part
    /// of this step, so it lives in <c>Aetherfall.Conditions</c> next to the types that use it.
    /// </remarks>
    public interface IValidationReport
    {
        /// <summary>Current location path (set by the validator, e.g. <c>quest.x / s20 / o1</c>).</summary>
        string Location { get; }

        /// <summary>Adds a finding at the current location.</summary>
        /// <param name="severity">Severity.</param>
        /// <param name="code">Rule code, e.g. <c>V13</c>.</param>
        /// <param name="message">German message.</param>
        void Add(ValidationSeverity severity, string code, string message);

        /// <summary>Records an id used by the validated data (checked later against the known content).</summary>
        /// <param name="id">Referenced id.</param>
        /// <param name="expectedPrefix">Expected prefix (<c>npc.</c>, <c>flag.</c> …); empty = any.</param>
        /// <param name="use">Read, write or mention.</param>
        /// <param name="value">Compared or written value (flags).</param>
        /// <param name="hasValue">True if <paramref name="value"/> is meaningful.</param>
        void AddReference(string id, string expectedPrefix, ReferenceUse use, int value, bool hasValue);

        /// <summary>Enters a location (e.g. <c>[2]</c> for a list entry); prefer <see cref="ValidationReportExtensions.Scope"/>.</summary>
        /// <param name="segment">Location segment.</param>
        void PushLocation(string segment);

        /// <summary>Leaves the innermost location.</summary>
        void PopLocation();
    }
}
