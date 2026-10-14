using System;
using Aetherfall.Conditions;
using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>Shared checks of the currency conditions and actions (validator, GDD 02 10.2).</summary>
    public static class CurrencyRules
    {
        /// <summary>Prefix of currency ids (architecture 6.1).</summary>
        public const string Prefix = "currency.";

        /// <summary>
        /// Reports V13 for an empty id or one without the prefix <c>currency.</c>, a warning for an unknown currency. Currencies
        /// have no definition assets yet, so the id is not recorded as a reference (it would be reported as missing content).
        /// </summary>
        /// <param name="report">Report.</param>
        /// <param name="currencyId">Currency id.</param>
        public static void Validate(IValidationReport report, string currencyId)
        {
            if (string.IsNullOrEmpty(currencyId) || !currencyId.StartsWith(Prefix, StringComparison.Ordinal))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Währungs-ID '" + currencyId + "' muss mit " + Prefix + " beginnen.");
                return;
            }

            if (currencyId != CurrencyIds.Gold && currencyId != CurrencyIds.AetherShards)
            {
                report.Warning(ValidationReportExtensions.InvalidParameterCode, "Unbekannte Währung '" + currencyId + "' (bekannt: " + CurrencyIds.Gold + ", " +
                                                                               CurrencyIds.AetherShards + ").");
            }
        }
    }
}
