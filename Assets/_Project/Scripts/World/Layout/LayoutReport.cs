using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Collects the findings of reading and validating a layout.</summary>
    public sealed class LayoutReport
    {
        private readonly List<LayoutIssue> _issues = new List<LayoutIssue>();

        /// <summary>All findings in the order they were found.</summary>
        public IReadOnlyList<LayoutIssue> Issues => _issues;

        /// <summary>Number of errors.</summary>
        public int ErrorCount { get; private set; }

        /// <summary>Number of warnings.</summary>
        public int WarningCount { get; private set; }

        /// <summary>True if there is at least one error.</summary>
        public bool HasErrors => ErrorCount > 0;

        /// <summary>Adds an error.</summary>
        /// <param name="path">JSON path or element id.</param>
        /// <param name="message">German description.</param>
        public void Error(string path, string message)
        {
            _issues.Add(new LayoutIssue(LayoutIssueSeverity.Error, path, message));
            ErrorCount++;
        }

        /// <summary>Adds a warning.</summary>
        /// <param name="path">JSON path or element id.</param>
        /// <param name="message">German description.</param>
        public void Warning(string path, string message)
        {
            _issues.Add(new LayoutIssue(LayoutIssueSeverity.Warning, path, message));
            WarningCount++;
        }
    }
}
