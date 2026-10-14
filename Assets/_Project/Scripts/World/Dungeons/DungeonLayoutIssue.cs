namespace Aetherfall.World.Dungeons
{
    /// <summary>One finding of the <see cref="DungeonLayoutValidator"/>: severity, stable code, the id concerned and a German text.</summary>
    public sealed class DungeonLayoutIssue
    {
        /// <summary>Creates the finding.</summary>
        /// <param name="severity">Severity.</param>
        /// <param name="code">Stable code, e.g. <c>id.duplicate</c> (tests check it).</param>
        /// <param name="subjectId">Id of the element concerned (may be empty).</param>
        /// <param name="message">German text.</param>
        public DungeonLayoutIssue(DungeonIssueSeverity severity, string code, string subjectId, string message)
        {
            Severity = severity;
            Code = code ?? string.Empty;
            SubjectId = subjectId ?? string.Empty;
            Message = message ?? string.Empty;
        }

        /// <summary>Severity.</summary>
        public DungeonIssueSeverity Severity { get; }

        /// <summary>Stable code.</summary>
        public string Code { get; }

        /// <summary>Id of the element concerned.</summary>
        public string SubjectId { get; }

        /// <summary>German text.</summary>
        public string Message { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return (Severity == DungeonIssueSeverity.Error ? "Fehler" : "Hinweis") + " [" + Code + "] " +
                   (SubjectId.Length > 0 ? SubjectId + ": " : string.Empty) + Message;
        }
    }
}
