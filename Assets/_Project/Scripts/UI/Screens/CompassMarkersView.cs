using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.UI.Framework;
using Aetherfall.World.Exploration;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Markers on the HUD compass (S60, GDD 05 compass): quest targets in the colour of their category (focus large with the
    /// distance of the nearest one, pinned to the edge when behind the player; other tracked quests small), search areas
    /// (bracket), the nearest own markers (their symbol, at most <see cref="MapMarkerRules.MaxOnCompass"/>), discovered places within
    /// 300 m (white dot), places seen from a viewpoint within 100 m (grey "?"), ▲/▼ from 6 m height difference. Built in code inside the compass
    /// strip of Hud.uxml (styles in Hud.uss, classes <c>af-compass__marker…</c>); hidden together with the compass.
    /// </summary>
    public sealed class CompassMarkersView
    {
        private const float EdgeInset = 0.03f;
        private const string TonePrefix = "af-compass__marker--tone-";

        private readonly VisualElement _strip;
        private readonly QuestMarkerModel _quests;
        private readonly IExplorationService _exploration;
        private readonly IPlayerLocator _players;
        private readonly List<CompassCandidate> _candidates = new List<CompassCandidate>();
        private readonly List<CompassSlot> _slots = new List<CompassSlot>();
        private readonly VisualElement[] _markers = new VisualElement[CompassMarkerSelector.MaxMarkers];
        private readonly Label[] _distances = new Label[CompassMarkerSelector.MaxMarkers];
        private readonly Label[] _arrows = new Label[CompassMarkerSelector.MaxMarkers];
        private readonly Label[] _glyphs = new Label[CompassMarkerSelector.MaxMarkers];
        private readonly List<int> _nearest = new List<int>();
        private readonly float[] _shownPositions = new float[CompassMarkerSelector.MaxMarkers];
        private readonly int[] _shownDistances = new int[CompassMarkerSelector.MaxMarkers];
        private readonly string[] _shownTones = new string[CompassMarkerSelector.MaxMarkers];
        private int _lastEdge;

        /// <summary>Builds the marker pool inside the compass.</summary>
        /// <param name="hudRoot">Root of the HUD document.</param>
        /// <param name="quests">Quest markers (null: none).</param>
        /// <param name="exploration">Exploration (places and own markers; null: none).</param>
        /// <param name="players">Player locator (null: no markers at all).</param>
        public CompassMarkersView(VisualElement hudRoot, QuestMarkerModel quests, IExplorationService exploration, IPlayerLocator players)
        {
            _quests = quests;
            _exploration = exploration;
            _players = players;
            _strip = hudRoot != null ? hudRoot.Q<VisualElement>("hud-compass") : null;
            for (int i = 0; i < _markers.Length; i++)
            {
                var marker = new VisualElement { pickingMode = PickingMode.Ignore };
                marker.AddToClassList("af-compass__marker");
                var distance = new Label { pickingMode = PickingMode.Ignore };
                distance.AddToClassList("af-text");
                distance.AddToClassList("af-compass__distance");
                var pip = new VisualElement { pickingMode = PickingMode.Ignore };
                pip.AddToClassList("af-compass__pip");
                var glyph = new Label { pickingMode = PickingMode.Ignore };
                glyph.AddToClassList("af-text");
                glyph.AddToClassList("af-compass__glyph");
                var arrow = new Label { pickingMode = PickingMode.Ignore };
                arrow.AddToClassList("af-text");
                arrow.AddToClassList("af-compass__arrow");
                marker.Add(distance);
                marker.Add(pip);
                marker.Add(glyph);
                marker.Add(arrow);
                _strip?.Add(marker);
                UiElementUtility.SetDisplayed(marker, false);
                UiElementUtility.SetDisplayed(distance, false);
                _markers[i] = marker;
                _arrows[i] = arrow;
                _glyphs[i] = glyph;
                _distances[i] = distance;
                _shownPositions[i] = float.NaN;
                _shownDistances[i] = -1;
                _shownTones[i] = string.Empty;
            }
        }

        /// <summary>Markers shown right now (tests, tour).</summary>
        public IReadOnlyList<CompassSlot> Slots => _slots;

        /// <summary>
        /// Indices of the own markers nearest to a point, nearest first, at most <paramref name="max"/> (GDD 05 1.8: at most 5 in
        /// the compass).
        /// </summary>
        /// <param name="markers">Own markers of the map.</param>
        /// <param name="x">Player x.</param>
        /// <param name="z">Player z.</param>
        /// <param name="max">Most indices.</param>
        /// <param name="result">Receives the indices (cleared first).</param>
        public static void NearestOwnMarkers(IReadOnlyList<MapMarker> markers, float x, float z, int max, List<int> result)
        {
            result.Clear();
            if (markers == null || max <= 0)
            {
                return;
            }

            // At most 50 markers and 5 picks: a plain selection, no sorting and no allocation per frame.
            while (result.Count < max)
            {
                int best = -1;
                float bestSq = float.PositiveInfinity;
                for (int i = 0; i < markers.Count; i++)
                {
                    float dx = markers[i].X - x;
                    float dz = markers[i].Z - z;
                    float sq = dx * dx + dz * dz;
                    if (sq < bestSq && !result.Contains(i))
                    {
                        bestSq = sq;
                        best = i;
                    }
                }

                if (best < 0)
                {
                    return;
                }

                result.Add(best);
            }
        }

        /// <summary>Updates the markers for the camera heading (call every HUD frame after the compass labels).</summary>
        /// <param name="heading">Camera heading in degrees (NaN: compass hidden or no player – no markers, no work).</param>
        public void Tick(float heading)
        {
            IPlayerAnchor player = _players != null ? _players.Current : null;
            _candidates.Clear();
            _slots.Clear();
            if (_strip != null && player != null && !float.IsNaN(heading))
            {
                _quests?.Collect(_candidates);
                CollectPlaces(player);
                Vector3 p = player.Position;
                CompassMarkerSelector.Select(_candidates, p.x, p.y, p.z, heading, CompassMath.DefaultFieldOfView, _slots, _lastEdge);
            }

            // Remember the edge of the pinned focus target, so a target straight behind keeps its side.
            _lastEdge = 0;
            for (int i = 0; i < _slots.Count; i++)
            {
                if (_slots[i].AtEdge && _slots[i].Kind == CompassMarkerKind.FocusQuest)
                {
                    _lastEdge = _slots[i].Position < 0.5f ? -1 : 1;
                    break;
                }
            }

            for (int i = 0; i < _markers.Length; i++)
            {
                bool shown = i < _slots.Count;
                UiElementUtility.SetDisplayed(_markers[i], shown);
                if (!shown)
                {
                    continue;
                }

                CompassSlot slot = _slots[i];
                VisualElement marker = _markers[i];
                // Focus targets stay just inside the edges, so the strip never cuts them in half and the step from "in view" to
                // "pinned behind" is smooth.
                float left = slot.Kind == CompassMarkerKind.FocusQuest ? Mathf.Clamp(slot.Position, EdgeInset, 1f - EdgeInset) : slot.Position;
                if (_shownPositions[i] != left)
                {
                    _shownPositions[i] = left;
                    marker.style.left = Length.Percent(left * 100f);
                }

                marker.EnableInClassList("af-compass__marker--focus", slot.Kind == CompassMarkerKind.FocusQuest);
                marker.EnableInClassList("af-compass__marker--quest", slot.Kind == CompassMarkerKind.TrackedQuest);
                marker.EnableInClassList("af-compass__marker--area", slot.IsArea || slot.Kind == CompassMarkerKind.SearchArea);
                marker.EnableInClassList("af-compass__marker--own", slot.Kind == CompassMarkerKind.OwnMarker);
                marker.EnableInClassList("af-compass__marker--place", slot.Kind == CompassMarkerKind.Place);
                marker.EnableInClassList("af-compass__marker--unknown", slot.Kind == CompassMarkerKind.UnknownPlace);
                marker.EnableInClassList("af-compass__marker--edge", slot.AtEdge);
                marker.EnableInClassList("af-compass__marker--right", left > 0.75f && slot.Kind != CompassMarkerKind.UnknownPlace);
                SetTone(i, slot.Tone);
                UiElementUtility.SetText(_glyphs[i], slot.Kind == CompassMarkerKind.UnknownPlace ? "?" :
                    slot.Kind == CompassMarkerKind.OwnMarker ? slot.Label : string.Empty);
                UiElementUtility.SetText(_arrows[i], slot.HeightArrow > 0 ? "▲" : slot.HeightArrow < 0 ? "▼" : string.Empty);

                // The distance of the nearest focus target in whole metres (the text changes only when the number does).
                int metres = slot.ShowsDistance ? Mathf.RoundToInt(slot.Distance) : -1;
                if (_shownDistances[i] != metres)
                {
                    _shownDistances[i] = metres;
                    UiElementUtility.SetText(_distances[i], metres >= 0 ? CompassMarkerSelector.FormatDistance(metres) : string.Empty);
                    UiElementUtility.SetDisplayed(_distances[i], metres >= 0);
                }

                // The marker with the distance plate lies above the others (a place dot must not cover the number).
                if (slot.ShowsDistance && marker.parent != null && marker.parent.IndexOf(marker) != marker.parent.childCount - 1)
                {
                    marker.BringToFront();
                }
            }
        }

        private void SetTone(int index, string tone)
        {
            // Quest category colour (GDD 05 1.9): one class per tone, swapped only when it changes.
            tone = tone ?? string.Empty;
            if (_shownTones[index] == tone)
            {
                return;
            }

            if (_shownTones[index].Length > 0)
            {
                _markers[index].RemoveFromClassList(TonePrefix + _shownTones[index]);
            }

            if (tone.Length > 0)
            {
                _markers[index].AddToClassList(TonePrefix + tone);
            }

            _shownTones[index] = tone;
        }

        private void CollectPlaces(IPlayerAnchor player)
        {
            ExplorationState state = _exploration != null ? _exploration.ActiveState : null;
            if (state == null || (player.WorldSpaceId.Length > 0 && player.WorldSpaceId != state.Map.WorldSpaceId))
            {
                return;
            }

            // Own markers: the nearest five, always shown (GDD 05 1.8), with their symbol and colour.
            Vector3 p = player.Position;
            NearestOwnMarkers(state.Markers, p.x, p.z, MapMarkerRules.MaxOnCompass, _nearest);
            for (int i = 0; i < _nearest.Count; i++)
            {
                MapMarker own = state.Markers[_nearest[i]];
                _candidates.Add(new CompassCandidate(CompassMarkerKind.OwnMarker, own.X, float.NaN, own.Z, MapMarkerSymbols.Glyph(own.Symbol), 0f,
                    MapMarkerSymbols.Tone(own.Symbol)));
            }

            // An index loop: foreach over the IReadOnlyList would allocate an enumerator every frame.
            IReadOnlyList<MapPlace> places = state.Map.Places;
            for (int i = 0; i < places.Count; i++)
            {
                MapPlace place = places[i];
                if (place == null || !place.ShowOnMap)
                {
                    continue;
                }

                if (state.IsDiscovered(place.Id))
                {
                    _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, place.X, float.NaN, place.Z, place.DisplayName));
                }
                else if (state.IsRevealed(place.Id))
                {
                    _candidates.Add(new CompassCandidate(CompassMarkerKind.UnknownPlace, place.X, float.NaN, place.Z, "?"));
                }
            }
        }
    }
}
