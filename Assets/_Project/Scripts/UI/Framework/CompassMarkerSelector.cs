using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Framework
{
    /// <summary>What a compass marker stands for (GDD 05 compass table; the order is the priority, highest first).</summary>
    public enum CompassMarkerKind
    {
        /// <summary>Target of the focus quest: always shown, large, with distance.</summary>
        FocusQuest = 0,

        /// <summary>Target of another tracked quest: always shown, small.</summary>
        TrackedQuest = 1,

        /// <summary>Search area of a quest stage without a fixed target: always shown, bracket icon.</summary>
        SearchArea = 2,

        /// <summary>Elite or boss: 150 m.</summary>
        Boss = 3,

        /// <summary>Own map marker: always shown.</summary>
        OwnMarker = 4,

        /// <summary>Quest giver: 75 m.</summary>
        QuestGiver = 5,

        /// <summary>Companion: 100 m.</summary>
        Companion = 6,

        /// <summary>Discovered place: 300 m, white.</summary>
        Place = 7,

        /// <summary>Fast travel point: 300 m.</summary>
        Waypoint = 8,

        /// <summary>Place seen from a viewpoint, not visited ("?"): 100 m, grey.</summary>
        UnknownPlace = 9
    }

    /// <summary>A possible marker: what it is and where (world metres).</summary>
    public readonly struct CompassCandidate
    {
        /// <summary>Creates a candidate.</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="x">World x.</param>
        /// <param name="y">World height.</param>
        /// <param name="z">World z.</param>
        /// <param name="label">Short label (place name, quest title) or empty.</param>
        /// <param name="radius">Radius of a search area in metres (0 for a point).</param>
        /// <param name="tone">Colour tone (USS class suffix, e.g. <c>main</c> for a main quest), empty = default.</param>
        public CompassCandidate(CompassMarkerKind kind, float x, float y, float z, string label, float radius = 0f, string tone = "")
        {
            Kind = kind;
            X = x;
            Y = y;
            Z = z;
            Label = label ?? string.Empty;
            Radius = radius;
            Tone = tone ?? string.Empty;
        }

        /// <summary>Kind.</summary>
        public CompassMarkerKind Kind { get; }

        /// <summary>World x.</summary>
        public float X { get; }

        /// <summary>World height.</summary>
        public float Y { get; }

        /// <summary>World z.</summary>
        public float Z { get; }

        /// <summary>Label.</summary>
        public string Label { get; }

        /// <summary>Radius of a search area in metres (0 for a point).</summary>
        public float Radius { get; }

        /// <summary>Colour tone (USS class suffix), empty = default.</summary>
        public string Tone { get; }
    }

    /// <summary>A marker the compass shows: where on the strip, distance, height arrow, how many it stands for.</summary>
    public struct CompassSlot
    {
        /// <summary>Kind (the highest of a stack).</summary>
        public CompassMarkerKind Kind;

        /// <summary>Position on the strip 0–1 (0.5 = straight ahead).</summary>
        public float Position;

        /// <summary>Horizontal distance in metres.</summary>
        public float Distance;

        /// <summary>+1 above (▲), −1 below (▼), 0 level (GDD 05: from 6 m height difference).</summary>
        public int HeightArrow;

        /// <summary>Markers within 4° shown as this one (≥ 1).</summary>
        public int Stacked;

        /// <summary>Label of the highest marker.</summary>
        public string Label;

        /// <summary>True for a focus target outside the field of view, pinned to the edge it is nearer to.</summary>
        public bool AtEdge;

        /// <summary>True for a search area (bracket on the compass, circle on the map).</summary>
        public bool IsArea;

        /// <summary>True for the one slot that shows its distance: the nearest focus target (GDD 05 1.8).</summary>
        public bool ShowsDistance;

        /// <summary>Colour tone of the highest marker (USS class suffix).</summary>
        public string Tone;
    }

    /// <summary>
    /// Chooses the compass markers (GDD 05 compass rules): each kind has its visibility range (quest markers and own markers
    /// always), only markers within the field of view, at most <see cref="MaxMarkers"/>, by priority (focus quest, other tracked
    /// quests, search areas, danger, own markers, quest givers, companion, places), markers less than
    /// <see cref="StackDegrees"/> apart stacked into the higher one, a height arrow from <see cref="HeightArrowMetres"/>. A focus
    /// target behind the player stays at the edge of the strip it is nearer to, so the player knows which way to turn; several
    /// focus targets on one edge stack into the nearest. Only the nearest focus target shows its distance. Pure logic.
    /// </summary>
    public static class CompassMarkerSelector
    {
        /// <summary>Most markers at once.</summary>
        public const int MaxMarkers = 12;

        /// <summary>Markers closer than this on the strip are stacked (degrees).</summary>
        public const float StackDegrees = 4f;

        /// <summary>Height difference for the ▲/▼ arrow (metres).</summary>
        public const float HeightArrowMetres = 6f;

        /// <summary>A focus target this close to straight behind keeps the edge it had (degrees), so it does not flicker across.</summary>
        public const float EdgeHysteresisDegrees = 10f;

        private static readonly List<Entry> Entries = new List<Entry>(64);
        private static readonly PriorityOrder ByPriority = new PriorityOrder();
        private static readonly StripOrder ByPosition = new StripOrder();

        /// <summary>Visibility range of a kind in metres (∞ for quest and own markers).</summary>
        /// <param name="kind">Kind.</param>
        public static float RangeOf(CompassMarkerKind kind)
        {
            switch (kind)
            {
                case CompassMarkerKind.Boss:
                    return 150f;
                case CompassMarkerKind.QuestGiver:
                    return 75f;
                case CompassMarkerKind.Companion:
                case CompassMarkerKind.UnknownPlace:
                    return 100f;
                case CompassMarkerKind.Place:
                case CompassMarkerKind.Waypoint:
                    return 300f;
                default:
                    return float.PositiveInfinity;
            }
        }

        /// <summary>Selects the markers to show.</summary>
        /// <param name="candidates">All possible markers.</param>
        /// <param name="playerX">Player x.</param>
        /// <param name="playerY">Player height.</param>
        /// <param name="playerZ">Player z.</param>
        /// <param name="heading">Camera heading in degrees (0 = north).</param>
        /// <param name="fieldOfView">Visible field of the strip in degrees.</param>
        /// <param name="result">Filled with the slots, sorted by position on the strip.</param>
        /// <param name="preferredEdge">Edge a focus target was pinned to last frame (−1 left, +1 right, 0 none); kept while the
        /// target is within <see cref="EdgeHysteresisDegrees"/> of straight behind.</param>
        public static void Select(IReadOnlyList<CompassCandidate> candidates, float playerX, float playerY, float playerZ, float heading,
            float fieldOfView, List<CompassSlot> result, int preferredEdge = 0)
        {
            result.Clear();
            Entries.Clear();
            if (candidates == null)
            {
                return;
            }

            for (int i = 0; i < candidates.Count; i++)
            {
                CompassCandidate c = candidates[i];
                float dx = c.X - playerX;
                float dz = c.Z - playerZ;
                float distance = (float)Math.Sqrt(dx * dx + dz * dz);
                if (distance > RangeOf(c.Kind) || distance < 0.5f)
                {
                    continue;
                }

                float bearing = CompassMath.HeadingOf(dx, dz);
                bool atEdge = false;
                if (!CompassMath.TryGetStripPosition(bearing, heading, fieldOfView, out float position))
                {
                    if (c.Kind != CompassMarkerKind.FocusQuest)
                    {
                        continue;
                    }

                    bool left = position < 0.5f;
                    if (preferredEdge != 0 && Math.Abs(CompassMath.DeltaAngle(heading, bearing)) > 180f - EdgeHysteresisDegrees)
                    {
                        left = preferredEdge < 0;
                    }

                    position = left ? 0f : 1f;
                    atEdge = true;
                }

                float dy = c.Y - playerY;
                Entries.Add(new Entry
                {
                    Index = i,
                    Bearing = bearing,
                    Slot = new CompassSlot
                    {
                        Kind = c.Kind,
                        Position = position,
                        Distance = distance,
                        HeightArrow = dy >= HeightArrowMetres ? 1 : dy <= -HeightArrowMetres ? -1 : 0,
                        Stacked = 1,
                        Label = c.Label,
                        AtEdge = atEdge,
                        IsArea = c.Radius > 0f,
                        Tone = c.Tone
                    }
                });
            }

            // Highest priority first, then the nearest.
            Entries.Sort(ByPriority);
            for (int i = 0; i < Entries.Count; i++)
            {
                Entry entry = Entries[i];
                bool stacked = false;
                for (int k = 0; k < result.Count; k++)
                {
                    // Pinned markers stack with pinned ones on the same edge; the others by their angle on the strip.
                    bool together = entry.Slot.AtEdge || result[k].AtEdge
                        ? entry.Slot.AtEdge && result[k].AtEdge && entry.Slot.Position == result[k].Position
                        : Math.Abs(CompassMath.DeltaAngle(BearingOf(result[k], heading, fieldOfView), entry.Bearing)) < StackDegrees;
                    if (together)
                    {
                        CompassSlot top = result[k];
                        top.Stacked++;
                        result[k] = top;
                        stacked = true;
                        break;
                    }
                }

                if (!stacked && result.Count < MaxMarkers)
                {
                    result.Add(entry.Slot);
                }
            }

            // GDD 05 1.8: the focus target shows its distance - only the nearest one, so several labels never cover each other.
            int nearestFocus = -1;
            for (int k = 0; k < result.Count; k++)
            {
                if (result[k].Kind == CompassMarkerKind.FocusQuest && (nearestFocus < 0 || result[k].Distance < result[nearestFocus].Distance))
                {
                    nearestFocus = k;
                }
            }

            if (nearestFocus >= 0)
            {
                CompassSlot focus = result[nearestFocus];
                focus.ShowsDistance = true;
                result[nearestFocus] = focus;
            }

            result.Sort(ByPosition);
        }

        /// <summary>Distance as German text: "120 m", from 1000 m "1,2 km" (GDD 05).</summary>
        /// <param name="metres">Distance in metres.</param>
        public static string FormatDistance(float metres)
        {
            if (metres < 1000f)
            {
                return Math.Max(0, (int)Math.Round(metres)) + " m";
            }

            return (metres / 1000f).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',') + " km";
        }

        private static float BearingOf(CompassSlot slot, float heading, float fieldOfView)
        {
            // Inverse of the strip position (linear over the field of view).
            float fov = fieldOfView > 0f ? fieldOfView : CompassMath.DefaultFieldOfView;
            return heading + (slot.Position - 0.5f) * fov;
        }

        private sealed class PriorityOrder : IComparer<Entry>
        {
            // Highest priority first, then the nearest (a comparer object: List.Sort with a lambda allocates on Mono).
            public int Compare(Entry a, Entry b)
            {
                return a.Slot.Kind != b.Slot.Kind ? a.Slot.Kind.CompareTo(b.Slot.Kind) : a.Slot.Distance.CompareTo(b.Slot.Distance);
            }
        }

        private sealed class StripOrder : IComparer<CompassSlot>
        {
            public int Compare(CompassSlot a, CompassSlot b)
            {
                return a.Position.CompareTo(b.Position);
            }
        }

        private struct Entry
        {
            public int Index;
            public float Bearing;
            public CompassSlot Slot;
        }
    }
}
