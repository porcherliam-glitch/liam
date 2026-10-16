// Global events of exploring the world (architecture 4.3, "Weitere verbindliche Event-Namen", area Welt: AreaEntered,
// ClueInspected, TrailNodeReached, LocationDiscovered; ViewpointActivated, RegionDiscovered and InvestigateModeChanged for the
// HUD). Several event structs of one area may share a file (architecture 15.2, rule 18). Senders are trigger volumes, clue and
// trail components and the exploration service; tests and debug tools send them too.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>The player entered an area (trigger volume of a location). Receivers: quests ("Gehe zu Ort"), autosave.</summary>
    public readonly struct AreaEntered : IGameEvent
    {
        /// <summary>Location or area id, e.g. <c>loc.eichental.wolfsbau_nordhang</c>.</summary>
        public readonly string AreaId;

        /// <summary>Creates the event.</summary>
        /// <param name="areaId">Area id.</param>
        public AreaEntered(string areaId)
        {
            AreaId = areaId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "AreaEntered(" + AreaId + ")";
        }
    }

    /// <summary>The player inspected a clue (detective mode, GDD 02 5.1 type 18). Receivers: quests.</summary>
    public readonly struct ClueInspected : IGameEvent
    {
        /// <summary>Clue id, e.g. <c>clue.eichental.weide_pfoten</c>.</summary>
        public readonly string ClueId;

        /// <summary>Creates the event.</summary>
        /// <param name="clueId">Clue id.</param>
        public ClueInspected(string clueId)
        {
            ClueId = clueId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ClueInspected(" + ClueId + ")";
        }
    }

    /// <summary>The player reached a node of a trail ("Folge der Spur", GDD 02 5.1 type 17). Receivers: quests.</summary>
    public readonly struct TrailNodeReached : IGameEvent
    {
        /// <summary>Trail id, e.g. <c>spur.eichental.wolfsspur</c>.</summary>
        public readonly string TrailId;

        /// <summary>Index of the reached node (0 = first node).</summary>
        public readonly int Index;

        /// <summary>Creates the event.</summary>
        /// <param name="trailId">Trail id.</param>
        /// <param name="index">Node index.</param>
        public TrailNodeReached(string trailId, int index)
        {
            TrailId = trailId ?? string.Empty;
            Index = index;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "TrailNodeReached(" + TrailId + " #" + Index + ")";
        }
    }

    /// <summary>
    /// The detective mode changed (GDD 02 5.1, GDD 03 "Untersuchen → Aether-Sicht"): on, off, Aether sight or the number of lit
    /// clues. Sender: the player's investigator. Receivers: the HUD overlay.
    /// </summary>
    public readonly struct InvestigateModeChanged : IGameEvent
    {
        /// <summary>True while the Investigate button is held (and no lock-on target is held).</summary>
        public readonly bool Active;

        /// <summary>True in Aether sight (40 m, hidden paths, only walking).</summary>
        public readonly bool AetherSight;

        /// <summary>Number of clues, trail marks and hidden paths lit up right now.</summary>
        public readonly int Revealed;

        /// <summary>Creates the event.</summary>
        /// <param name="active">Detective mode on.</param>
        /// <param name="aetherSight">Aether sight.</param>
        /// <param name="revealed">Number of lit things.</param>
        public InvestigateModeChanged(bool active, bool aetherSight, int revealed)
        {
            Active = active;
            AetherSight = aetherSight;
            Revealed = revealed < 0 ? 0 : revealed;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "InvestigateModeChanged(" + Active + ", Aether " + AetherSight + ", " + Revealed + ")";
        }
    }

    /// <summary>
    /// The player discovered a place shown on the world map (GDD 01 6.6, architecture 4.3 "LocationDiscovered"): the first visit.
    /// Receivers: HUD message "Ort entdeckt", later the "Erkunde" objective and the codex.
    /// </summary>
    public readonly struct LocationDiscovered : IGameEvent
    {
        /// <summary>Location id.</summary>
        public readonly string LocationId;

        /// <summary>Map id.</summary>
        public readonly string MapId;

        /// <summary>Name on the map (German).</summary>
        public readonly string DisplayName;

        /// <summary>Creates the event.</summary>
        /// <param name="locationId">Location id.</param>
        /// <param name="mapId">Map id.</param>
        /// <param name="displayName">Name on the map.</param>
        public LocationDiscovered(string locationId, string mapId, string displayName)
        {
            LocationId = locationId ?? string.Empty;
            MapId = mapId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "LocationDiscovered(" + LocationId + ")";
        }
    }

    /// <summary>
    /// A viewpoint was activated (GDD 01 6.6: climbing up clears the fog around it and marks the places there with "?").
    /// Receivers: HUD message, later the camera pan and the codex.
    /// </summary>
    public readonly struct ViewpointActivated : IGameEvent
    {
        /// <summary>Location id of the viewpoint.</summary>
        public readonly string ViewpointId;

        /// <summary>Map id.</summary>
        public readonly string MapId;

        /// <summary>Name of the viewpoint (German).</summary>
        public readonly string DisplayName;

        /// <summary>Number of places newly marked with "?".</summary>
        public readonly int RevealedPlaces;

        /// <summary>Creates the event.</summary>
        /// <param name="viewpointId">Location id of the viewpoint.</param>
        /// <param name="mapId">Map id.</param>
        /// <param name="displayName">Name of the viewpoint.</param>
        /// <param name="revealedPlaces">Number of places newly marked with "?".</param>
        public ViewpointActivated(string viewpointId, string mapId, string displayName, int revealedPlaces)
        {
            ViewpointId = viewpointId ?? string.Empty;
            MapId = mapId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
            RevealedPlaces = revealedPlaces;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ViewpointActivated(" + ViewpointId + ", " + RevealedPlaces + ")";
        }
    }

    /// <summary>The player set foot in a region for the first time (GDD 05 notification "Region entdeckt", priority P0).</summary>
    public readonly struct RegionDiscovered : IGameEvent
    {
        /// <summary>Map id.</summary>
        public readonly string MapId;

        /// <summary>Name of the region (German).</summary>
        public readonly string RegionName;

        /// <summary>Creates the event.</summary>
        /// <param name="mapId">Map id.</param>
        /// <param name="regionName">Name of the region.</param>
        public RegionDiscovered(string mapId, string regionName)
        {
            MapId = mapId ?? string.Empty;
            RegionName = regionName ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "RegionDiscovered(" + MapId + ")";
        }
    }
}
