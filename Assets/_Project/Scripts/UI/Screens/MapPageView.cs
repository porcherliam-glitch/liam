using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.UI.Framework;
using Aetherfall.World;
using Aetherfall.World.Exploration;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The map page of the journal (S63, GDD 05 1.3: first hub tab, M): the painted map of the current region cut to the
    /// playable area, the fog over everything not explored yet (soft edges), icons and names of the discovered places, "?" for
    /// places seen from a viewpoint, the player as an arrow, and at the side the region name, counters and a legend. Without a
    /// map (crypt, menus) it says so.
    /// </summary>
    /// <remarks>
    /// Built in code inside the page element of Journal.uxml (styles in Journal.uss, classes <c>af-map…</c>). Redraws the fog
    /// and the icons only when <see cref="IExplorationService.Revision"/> changed; the arrow every refresh.
    /// </remarks>
    public sealed class MapPageView
    {
        /// <summary>Metres shown around the playable area.</summary>
        public const float Margin = 14f;

        private static readonly Color32 FogColour = new Color32(214, 196, 160, 240);

        private readonly IExplorationService _exploration;
        private readonly IPlayerLocator _players;
        private readonly VisualElement _frame;
        private readonly VisualElement _image;
        private readonly VisualElement _fog;
        private readonly VisualElement _icons;
        private readonly VisualElement _player;
        private readonly Label _noMap;
        private readonly Label _region;
        private readonly Label _places;
        private readonly Label _viewpoints;
        private readonly Label _revealed;
        private readonly List<VisualElement> _iconPool = new List<VisualElement>();
        private Texture2D _fogTexture;
        private Color32[] _fogPixels;
        private RegionMapDefinition _shownMap;
        private int _shownRevision = -1;
        private float _viewMinX;
        private float _viewMaxZ;
        private float _viewExtent = 1f;

        /// <summary>Builds the page.</summary>
        /// <param name="page">Page element of Journal.uxml ("journal-map-page").</param>
        /// <param name="exploration">Exploration service (null: always "Keine Karte").</param>
        /// <param name="players">Player locator (null: no arrow).</param>
        public MapPageView(VisualElement page, IExplorationService exploration, IPlayerLocator players)
        {
            _exploration = exploration;
            _players = players;
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.AddToClassList("af-map");
            _frame = new VisualElement { name = "map-frame", pickingMode = PickingMode.Ignore };
            _frame.AddToClassList("af-map__frame");
            _image = Child(_frame, "af-map__image");
            _fog = Child(_frame, "af-map__fog");
            _icons = Child(_frame, "af-map__icons");
            _player = Child(_frame, "af-map__player");
            _player.generateVisualContent += DrawArrow;
            _noMap = new Label(UiTexts.Get(UiTextKeys.MapNone)) { pickingMode = PickingMode.Ignore };
            _noMap.AddToClassList("af-text");
            _noMap.AddToClassList("af-map__none");
            _frame.Add(_noMap);
            row.Add(_frame);

            var side = new VisualElement { pickingMode = PickingMode.Ignore };
            side.AddToClassList("af-map__side");
            _region = SideLabel(side, "af-map__region");
            _places = SideLabel(side, "af-map__count");
            _viewpoints = SideLabel(side, "af-map__count");
            _revealed = SideLabel(side, "af-map__count");
            var legend = new VisualElement { pickingMode = PickingMode.Ignore };
            legend.AddToClassList("af-map__legend");
            legend.Add(LegendRow("af-map__place", UiTexts.Get(UiTextKeys.MapLegendPlace)));
            legend.Add(LegendRow("af-map__place--viewpoint", UiTexts.Get(UiTextKeys.MapLegendViewpoint)));
            legend.Add(LegendRow("af-map__place--unknown", UiTexts.Get(UiTextKeys.MapLegendUnknown)));
            legend.Add(LegendRow("af-map__legend-player", UiTexts.Get(UiTextKeys.MapLegendPlayer)));
            side.Add(legend);
            row.Add(side);
            if (page != null)
            {
                page.Add(row);
            }
        }

        /// <summary>The map shown, or null.</summary>
        public RegionMapDefinition ShownMap => _shownMap;

        /// <summary>Icons shown (discovered places and "?"), for tests and the tour.</summary>
        public int VisibleIcons { get; private set; }

        /// <summary>Text of the counters (tests, tour).</summary>
        public string CountText => _places.text + " · " + _viewpoints.text + " · " + _revealed.text;

        /// <summary>Redraws what changed (call while the page is visible).</summary>
        public void Refresh()
        {
            RegionMapDefinition map = _exploration != null ? _exploration.ActiveMap : null;
            ExplorationState state = _exploration != null ? _exploration.ActiveState : null;
            bool hasMap = map != null && state != null;
            UiElementUtility.SetDisplayed(_noMap, !hasMap);
            UiElementUtility.SetDisplayed(_image, hasMap);
            UiElementUtility.SetDisplayed(_fog, hasMap);
            UiElementUtility.SetDisplayed(_icons, hasMap);
            if (!hasMap)
            {
                _shownMap = null;
                VisibleIcons = 0;
                UiElementUtility.SetDisplayed(_player, false);
                UiElementUtility.SetText(_region, UiTexts.Get(UiTextKeys.JournalMap));
                UiElementUtility.SetText(_places, string.Empty);
                UiElementUtility.SetText(_viewpoints, string.Empty);
                UiElementUtility.SetText(_revealed, string.Empty);
                return;
            }

            if (!ReferenceEquals(map, _shownMap))
            {
                ShowMap(map);
                _shownRevision = -1;
            }

            if (_exploration.Revision != _shownRevision)
            {
                _shownRevision = _exploration.Revision;
                DrawFog(state);
                DrawIcons(state);
                DrawCounters(state);
            }

            DrawPlayer(map);
        }

        /// <summary>Releases the fog texture.</summary>
        public void Dispose()
        {
            if (_fogTexture != null)
            {
                Object.Destroy(_fogTexture);
                _fogTexture = null;
            }
        }

        private void ShowMap(RegionMapDefinition map)
        {
            _shownMap = map;
            Vector2 min = map.PlayableMin;
            Vector2 max = map.PlayableMax;
            float size = Mathf.Max(max.x - min.x, max.y - min.y) + 2f * Margin;
            _viewMinX = (min.x + max.x) * 0.5f - size * 0.5f;
            _viewMaxZ = (min.y + max.y) * 0.5f + size * 0.5f;
            _viewExtent = size;

            // The picture covers the whole terrain; it is scaled and moved so the playable area fills the frame.
            MapProjection projection = map.Projection;
            _image.style.backgroundImage = map.MapImage != null ? new StyleBackground(map.MapImage) : new StyleBackground();
            _image.style.width = Length.Percent(projection.Extent / size * 100f);
            _image.style.height = Length.Percent(projection.Extent / size * 100f);
            _image.style.left = Length.Percent((projection.OriginX - _viewMinX) / size * 100f);
            _image.style.top = Length.Percent((_viewMaxZ - (projection.OriginZ + projection.Extent)) / size * 100f);

            _fog.style.left = Length.Percent((min.x - _viewMinX) / size * 100f);
            _fog.style.top = Length.Percent((_viewMaxZ - max.y) / size * 100f);
            _fog.style.width = Length.Percent((max.x - min.x) / size * 100f);
            _fog.style.height = Length.Percent((max.y - min.y) / size * 100f);
            if (_fogTexture != null)
            {
                Object.Destroy(_fogTexture);
            }

            _fogTexture = new Texture2D(map.FogColumns, map.FogRows, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                name = "Kartennebel"
            };
            _fogPixels = new Color32[map.FogColumns * map.FogRows];
            _fog.style.backgroundImage = new StyleBackground(_fogTexture);
        }

        private void DrawFog(ExplorationState state)
        {
            FogGrid fog = state.Fog;
            if (_fogTexture == null || _fogPixels == null || _fogPixels.Length != fog.Columns * fog.Rows)
            {
                return;
            }

            // Each cell takes the share of revealed cells around it: soft edges without a shader.
            for (int row = 0; row < fog.Rows; row++)
            {
                for (int column = 0; column < fog.Columns; column++)
                {
                    int revealed = 0;
                    for (int dz = -1; dz <= 1; dz++)
                    {
                        for (int dx = -1; dx <= 1; dx++)
                        {
                            if (fog.IsCellRevealed(column + dx, row + dz))
                            {
                                revealed++;
                            }
                        }
                    }

                    Color32 c = FogColour;
                    c.a = (byte)(FogColour.a * (1f - revealed / 9f));
                    _fogPixels[row * fog.Columns + column] = c;
                }
            }

            _fogTexture.SetPixels32(_fogPixels);
            _fogTexture.Apply(false);
        }

        private void DrawIcons(ExplorationState state)
        {
            int used = 0;
            foreach (MapPlace place in state.Map.Places)
            {
                if (place == null || !place.ShowOnMap)
                {
                    continue;
                }

                bool discovered = state.IsDiscovered(place.Id);
                bool unknown = !discovered && state.IsRevealed(place.Id);
                if (!discovered && !unknown)
                {
                    continue;
                }

                VisualElement icon = Icon(used++);
                icon.EnableInClassList("af-map__place--viewpoint", discovered && place.IsViewpoint);
                icon.EnableInClassList("af-map__place--unknown", unknown);
                icon.EnableInClassList("af-map__place--dungeon", discovered && place.Kind == LocationKind.DungeonEntrance);
                var label = (Label)icon[0];
                label.text = unknown ? "?" : place.DisplayName;
                label.EnableInClassList("af-map__name--unknown", unknown);
                Place(icon, place.X, place.Z);
                UiElementUtility.SetDisplayed(icon, true);
            }

            for (int i = used; i < _iconPool.Count; i++)
            {
                UiElementUtility.SetDisplayed(_iconPool[i], false);
            }

            VisibleIcons = used;
        }

        private void DrawCounters(ExplorationState state)
        {
            state.CountPlaces(out int places, out int totalPlaces);
            state.CountViewpoints(out int viewpoints, out int totalViewpoints);
            UiElementUtility.SetText(_region, state.Map.RegionName);
            UiElementUtility.SetText(_places, UiTexts.Format(UiTextKeys.MapCountPlaces, places, totalPlaces));
            UiElementUtility.SetText(_viewpoints, UiTexts.Format(UiTextKeys.MapCountViewpoints, viewpoints, totalViewpoints));
            UiElementUtility.SetText(_revealed, UiTexts.Format(UiTextKeys.MapCountRevealed, Mathf.RoundToInt(state.Fog.RevealedFraction * 100f)));
        }

        private void DrawPlayer(RegionMapDefinition map)
        {
            IPlayerAnchor player = _players != null ? _players.Current : null;
            bool show = player != null && (player.WorldSpaceId.Length == 0 || player.WorldSpaceId == map.WorldSpaceId);
            UiElementUtility.SetDisplayed(_player, show);
            if (!show)
            {
                return;
            }

            Vector3 position = player.Position;
            Place(_player, position.x, position.z);
            _player.style.rotate = new Rotate(new Angle(player.Yaw, AngleUnit.Degree));
        }

        private void Place(VisualElement element, float x, float z)
        {
            element.style.left = Length.Percent((x - _viewMinX) / _viewExtent * 100f);
            element.style.top = Length.Percent((_viewMaxZ - z) / _viewExtent * 100f);
        }

        private VisualElement Icon(int index)
        {
            while (_iconPool.Count <= index)
            {
                var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("af-map__place");
                var name = new Label { pickingMode = PickingMode.Ignore };
                name.AddToClassList("af-text");
                name.AddToClassList("af-map__name");
                icon.Add(name);
                _icons.Add(icon);
                _iconPool.Add(icon);
            }

            return _iconPool[index];
        }

        private static VisualElement Child(VisualElement parent, string className)
        {
            var child = new VisualElement { pickingMode = PickingMode.Ignore };
            child.AddToClassList(className);
            parent.Add(child);
            return child;
        }

        private static Label SideLabel(VisualElement parent, string className)
        {
            var label = new Label { pickingMode = PickingMode.Ignore };
            label.AddToClassList("af-text");
            label.AddToClassList(className);
            parent.Add(label);
            return label;
        }

        private static VisualElement LegendRow(string swatchClass, string text)
        {
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.AddToClassList("af-map__legend-row");
            var swatch = new VisualElement { pickingMode = PickingMode.Ignore };
            if (swatchClass.StartsWith("af-map__place", System.StringComparison.Ordinal))
            {
                swatch.AddToClassList("af-map__place");
            }

            swatch.AddToClassList("af-map__swatch");
            swatch.AddToClassList(swatchClass);
            row.Add(swatch);
            var label = new Label(text) { pickingMode = PickingMode.Ignore };
            label.AddToClassList("af-text");
            label.AddToClassList("af-map__legend-text");
            row.Add(label);
            return row;
        }

        private static void DrawArrow(MeshGenerationContext context)
        {
            // An arrow pointing up (north at yaw 0); the element's rotation turns it with the player.
            Rect r = context.visualElement.contentRect;
            Painter2D painter = context.painter2D;
            painter.fillColor = new Color(0.75f, 0.12f, 0.1f);
            painter.strokeColor = new Color(0.12f, 0.08f, 0.05f);
            painter.lineWidth = 1.5f;
            painter.BeginPath();
            painter.MoveTo(new Vector2(r.width * 0.5f, 0f));
            painter.LineTo(new Vector2(r.width, r.height));
            painter.LineTo(new Vector2(r.width * 0.5f, r.height * 0.72f));
            painter.LineTo(new Vector2(0f, r.height));
            painter.ClosePath();
            painter.Fill();
            painter.Stroke();
        }
    }
}
