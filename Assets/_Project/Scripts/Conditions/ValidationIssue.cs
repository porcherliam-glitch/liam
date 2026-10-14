namespace Aetherfall.Conditions
{
    /// <summary>One validation finding: rule code (e.g. <c>V05</c>), German message and where it was found.</summary>
    public readonly struct ValidationIssue
    {
        /// <summary>Severity.</summary>
        public readonly ValidationSeverity Severity;

        /// <summary>Rule code, e.g. <c>V05</c> or <c>W04</c> (GDD 02, 10.2).</summary>
        public readonly string Code;

        /// <summary>German message for the author.</summary>
        public readonly string Message;

        /// <summary>Location path, e.g. <c>quest.side.eichental.woelfe_vom_nordhang / s40 / o2</c>.</summary>
        public readonly string Location;

        /// <summary>Creates the finding.</summary>
        /// <param name="severity">Severity.</param>
        /// <param name="code">Rule code.</param>
        /// <param name="message">Message.</param>
        /// <param name="location">Location path.</param>
        public ValidationIssue(ValidationSeverity severity, string code, string message, string location)
        {
            Severity = severity;
            Code = code ?? string.Empty;
            Message = message ?? string.Empty;
            Location = location ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            string prefix = Severity == ValidationSeverity.Error ? "Fehler" : Severity == ValidationSeverity.Warning ? "Warnung" : "Hinweis";
            return prefix + " " + Code + (Location.Length > 0 ? " [" + Location + "]" : string.Empty) + ": " + Message;
        }
    }
}
