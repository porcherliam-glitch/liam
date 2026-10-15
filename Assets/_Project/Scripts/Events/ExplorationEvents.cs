// Global events of exploring the world (architecture 4.3, "Weitere verbindliche Event-Namen", area Welt: AreaEntered,
// ClueInspected, TrailNodeReached; InvestigateModeChanged for the HUD). Several event structs of one area may share a file
// (architecture 15.2, rule 18). Senders are trigger volumes, clue and trail components of the world step; until then tests and
// debug tools send them.

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
}
