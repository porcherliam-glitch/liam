namespace Aetherfall.World
{
    /// <summary>One finding of <see cref="RegionLayoutReader"/> or <see cref="RegionLayoutValidator"/> (message in German).</summary>
    public sealed class LayoutIssue
    {
        /// <summary>Creates a finding.</summary>
        /// <param name="severity">Severity.</param>
        /// <param name="path">JSON path or element id, e.g. <c>buildings[3].size</c>.</param>
        /// <param name="message">German description.</param>
        public LayoutIssue(LayoutIssueSeverity severity, string path, string message)
        {
            Severity = severity;
            Path = path ?? string.Empty;
            Message = message ?? string.Empty;
        }

        /// <summary>Severity.</summary>
        public LayoutIssueSeverity Severity { get; }

        /// <summary>JSON path or element id.</summary>
        public string Path { get; }

        /// <summary>German description.</summary>
        public string Message { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return (Severity == LayoutIssueSeverity.Error ? "Fehler" : "Hinweis") + " [" + Path + "]: " + Message;
        }
    }
}
