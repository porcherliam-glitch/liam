namespace Aetherfall.World
{
    /// <summary>
    /// One part of a mixed enemy group (GDD 01 11.1 "Gemischte Gruppen": e.g. 2 Bandit-Schläger + 1 Armbrustschütze + 1
    /// Anführer): enemy type, variant and how many.
    /// </summary>
    public sealed class LayoutSpawnMember
    {
        /// <summary>Enemy type id (<c>enemy.</c>).</summary>
        public string EnemyTypeId { get; internal set; } = string.Empty;

        /// <summary>Variant id (<c>normal</c>, <c>elite</c>, <c>champion</c>, <c>aether_verderbt</c>).</summary>
        public string Variant { get; internal set; } = "normal";

        /// <summary>Number of enemies of this kind.</summary>
        public int Count { get; internal set; } = 1;
    }
}
