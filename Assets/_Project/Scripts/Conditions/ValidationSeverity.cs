namespace Aetherfall.Conditions
{
    /// <summary>Severity of a validation finding (GDD 02, 10.2: errors block "Fertig", warnings must be justified).</summary>
    public enum ValidationSeverity
    {
        /// <summary>Hint (German "Hinweis"), e.g. W08.</summary>
        Info = 0,

        /// <summary>Warning (German "Warnung").</summary>
        Warning = 1,

        /// <summary>Error (German "Fehler").</summary>
        Error = 2
    }
}
