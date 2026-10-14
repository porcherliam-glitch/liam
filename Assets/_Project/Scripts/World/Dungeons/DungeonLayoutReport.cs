using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>Result of <see cref="DungeonLayoutValidator.Validate"/>: all findings, with helpers for errors and codes.</summary>
    public sealed class DungeonLayoutReport
    {
        private readonly List<DungeonLayoutIssue> _issues = new List<DungeonLayoutIssue>();

        /// <summary>All findings in the order they were found.</summary>
        public IReadOnlyList<DungeonLayoutIssue> Issues => _issues;

        /// <summary>Number of errors.</summary>
        public int ErrorCount { get; private set; }

        /// <summary>Number of warnings.</summary>
        public int WarningCount { get; private set; }

        /// <summary>True without errors.</summary>
        public bool IsValid => ErrorCount == 0;

        /// <summary>Adds an error.</summary>
        /// <param name="code">Stable code.</param>
        /// <param name="subjectId">Id concerned.</param>
        /// <param name="message">German text.</param>
        public void Error(string code, string subjectId, string message)
        {
            _issues.Add(new DungeonLayoutIssue(DungeonIssueSeverity.Error, code, subjectId, message));
            ErrorCount++;
        }

        /// <summary>Adds a warning.</summary>
        /// <param name="code">Stable code.</param>
        /// <param name="subjectId">Id concerned.</param>
        /// <param name="message">German text.</param>
        public void Warning(string code, string subjectId, string message)
        {
            _issues.Add(new DungeonLayoutIssue(DungeonIssueSeverity.Warning, code, subjectId, message));
            WarningCount++;
        }

        /// <summary>True if a finding with this code exists (optionally for one id).</summary>
        /// <param name="code">Code.</param>
        /// <param name="subjectId">Id, or null for any.</param>
        public bool Has(string code, string subjectId = null)
        {
            for (int i = 0; i < _issues.Count; i++)
            {
                if (_issues[i].Code == code && (subjectId == null || _issues[i].SubjectId == subjectId))
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            if (_issues.Count == 0)
            {
                return "Keine Befunde.";
            }

            var lines = new List<string>(_issues.Count);
            for (int i = 0; i < _issues.Count; i++)
            {
                lines.Add(_issues[i].ToString());
            }

            return string.Join("\n", lines);
        }
    }
}
