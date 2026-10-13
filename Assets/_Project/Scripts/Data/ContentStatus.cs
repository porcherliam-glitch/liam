namespace Aetherfall.Data
{
    /// <summary>
    /// Production status of a definition (architecture 5.1; GDD 02 10.5): Idee, Entwurf, Fertig, Getestet, Abgenommen. From
    /// <see cref="Done"/> on the id is frozen (renaming only through the id migration table, architecture 6.5). Values are
    /// stored in assets: never renumber.
    /// </summary>
    public enum ContentStatus
    {
        /// <summary>Idea (German "Idee"): placeholder, may change freely.</summary>
        Idea = 0,

        /// <summary>Draft (German "Entwurf"): being built.</summary>
        Draft = 1,

        /// <summary>Done (German "Fertig"): complete; the id is frozen from here on.</summary>
        Done = 2,

        /// <summary>Tested (German "Getestet").</summary>
        Tested = 3,

        /// <summary>Approved (German "Abgenommen").</summary>
        Approved = 4
    }
}
