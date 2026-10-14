namespace Aetherfall.World
{
    /// <summary>Severity of a finding of the layout reader or validator.</summary>
    public enum LayoutIssueSeverity
    {
        /// <summary>The layout cannot be built like this.</summary>
        Error = 0,

        /// <summary>Works, but probably not intended.</summary>
        Warning = 1
    }
}
