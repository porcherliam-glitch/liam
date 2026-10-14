using System.Collections.Generic;
using System.Text;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Default <see cref="IValidationReport"/>: a list of findings and referenced ids plus a location stack
    /// (<see cref="ValidationReportExtensions.Scope"/>) that prefixes every finding with where it was found. Pure logic, used by the quest validator,
    /// the editor menu "Aetherfall/Quests pruefen" and tests.
    /// </summary>
    public sealed class ValidationReport : IValidationReport
    {
        private const string Separator = " / ";

        private readonly List<ValidationIssue> _issues = new List<ValidationIssue>();
        private readonly List<ValidationReference> _references = new List<ValidationReference>();
        private readonly List<string> _locationStack = new List<string>();
        private string _location = string.Empty;

        /// <summary>All findings in the order they were added.</summary>
        public IReadOnlyList<ValidationIssue> Issues => _issues;

        /// <summary>All referenced ids in the order they were added.</summary>
        public IReadOnlyList<ValidationReference> References => _references;

        /// <summary>Number of errors.</summary>
        public int ErrorCount { get; private set; }

        /// <summary>Number of warnings.</summary>
        public int WarningCount { get; private set; }

        /// <summary>True if there is at least one error.</summary>
        public bool HasErrors => ErrorCount > 0;

        /// <inheritdoc />
        public string Location => _location;

        /// <inheritdoc />
        public void Add(ValidationSeverity severity, string code, string message)
        {
            _issues.Add(new ValidationIssue(severity, code, message, _location));
            if (severity == ValidationSeverity.Error)
            {
                ErrorCount++;
            }
            else if (severity == ValidationSeverity.Warning)
            {
                WarningCount++;
            }
        }

        /// <summary>Adds a finding with an explicit location (used when resolving collected references).</summary>
        /// <param name="severity">Severity.</param>
        /// <param name="code">Rule code.</param>
        /// <param name="message">Message.</param>
        /// <param name="location">Location path.</param>
        public void AddAt(ValidationSeverity severity, string code, string message, string location)
        {
            _issues.Add(new ValidationIssue(severity, code, message, location));
            if (severity == ValidationSeverity.Error)
            {
                ErrorCount++;
            }
            else if (severity == ValidationSeverity.Warning)
            {
                WarningCount++;
            }
        }

        /// <inheritdoc />
        public void AddReference(string id, string expectedPrefix, ReferenceUse use, int value, bool hasValue)
        {
            if (string.IsNullOrEmpty(id))
            {
                return;
            }

            _references.Add(new ValidationReference(id, expectedPrefix, use, value, hasValue, _location));
        }

        /// <inheritdoc />
        public void PushLocation(string segment)
        {
            _locationStack.Add(string.IsNullOrEmpty(segment) ? "?" : segment);
            RebuildLocation();
        }

        /// <inheritdoc />
        public void PopLocation()
        {
            if (_locationStack.Count == 0)
            {
                return;
            }

            _locationStack.RemoveAt(_locationStack.Count - 1);
            RebuildLocation();
        }

        /// <summary>Number of findings with the given code (tests, summaries).</summary>
        /// <param name="code">Rule code.</param>
        public int CountOf(string code)
        {
            int count = 0;
            for (int i = 0; i < _issues.Count; i++)
            {
                if (_issues[i].Code == code)
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>True if at least one finding has the given code.</summary>
        /// <param name="code">Rule code.</param>
        public bool Contains(string code)
        {
            return CountOf(code) > 0;
        }

        /// <summary>All findings as text, one per line (logs, batch mode).</summary>
        public string ToText()
        {
            var builder = new StringBuilder();
            for (int i = 0; i < _issues.Count; i++)
            {
                builder.AppendLine(_issues[i].ToString());
            }

            return builder.ToString();
        }

        private void RebuildLocation()
        {
            if (_locationStack.Count == 0)
            {
                _location = string.Empty;
                return;
            }

            var builder = new StringBuilder();
            for (int i = 0; i < _locationStack.Count; i++)
            {
                if (i > 0)
                {
                    builder.Append(Separator);
                }

                builder.Append(_locationStack[i]);
            }

            _location = builder.ToString();
        }
    }
}
