namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A location zone (trigger volume for <c>AreaEntered</c>, objective "Gehe zu"): zone id, location id and rectangle. Two
    /// zones may share a location id (both exits of the crypt count as <c>loc.eichental.gruft_ausgang</c>).
    /// </summary>
    public sealed class DungeonArea
    {
        /// <summary>Zone id, e.g. <c>zone.gruft.vorraum</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Location id for the event, e.g. <c>loc.eichental.vergessene_gruft</c>.</summary>
        public string LocationId { get; set; } = string.Empty;

        /// <summary>Rectangle; the volume reaches from 1 m below the lowest floor to 4 m above it.</summary>
        public DungeonRect Bounds { get; set; }
    }
}
