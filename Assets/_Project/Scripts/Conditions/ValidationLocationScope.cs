using System;

namespace Aetherfall.Conditions
{
    /// <summary>Leaves a location of an <see cref="IValidationReport"/> when disposed (see <see cref="ValidationReportExtensions.Scope"/>).</summary>
    public readonly struct ValidationLocationScope : IDisposable
    {
        private readonly IValidationReport _report;

        /// <summary>Creates the scope (the location was already entered).</summary>
        /// <param name="report">Report.</param>
        public ValidationLocationScope(IValidationReport report)
        {
            _report = report;
        }

        /// <summary>Leaves the location.</summary>
        public void Dispose()
        {
            if (_report != null)
            {
                _report.PopLocation();
            }
        }
    }
}
