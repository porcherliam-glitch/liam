using System.Collections.Generic;
using System.Text;

namespace Aetherfall.Core
{
    /// <summary>Result of <see cref="InstallerOrderValidator.Validate"/>: valid, or a list of readable error messages.</summary>
    public sealed class InstallerValidationResult
    {
        private readonly List<string> _errors;

        /// <summary>Creates a result from a list of errors (empty list = valid).</summary>
        /// <param name="errors">Error messages; the list is copied.</param>
        public InstallerValidationResult(IEnumerable<string> errors)
        {
            _errors = errors == null ? new List<string>() : new List<string>(errors);
        }

        /// <summary>True if no error was found.</summary>
        public bool IsValid => _errors.Count == 0;

        /// <summary>All error messages in the order they were found.</summary>
        public IReadOnlyList<string> Errors => _errors;

        /// <summary>Builds a multi-line report: a header line followed by one numbered line per error.</summary>
        /// <param name="header">First line of the report.</param>
        public string BuildReport(string header)
        {
            var builder = new StringBuilder();
            builder.Append(header);
            for (int i = 0; i < _errors.Count; i++)
            {
                builder.Append('\n').Append(i + 1).Append(". ").Append(_errors[i]);
            }

            return builder.ToString();
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return IsValid ? "Installer order valid." : BuildReport("Installer order invalid:");
        }
    }
}
