using System.Collections.Generic;
using Aetherfall.UI.Screens;
using Aetherfall.World.Exploration;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// The cursor of the map page for own markers and the choice of own markers for the compass (GDD 05 1.8): starts at the
    /// player or in the middle, moves in steps and stays on the map; the compass takes the five nearest markers.
    /// </summary>
    [TestFixture]
    public sealed class MapCursorTests
    {
        [Test]
        public void Cursor_StartsAtThePlayer_AndStaysInsideTheArea()
        {
            var cursor = new MapCursor();
            cursor.Begin(150f, -20f, -200f, -200f, 200f, 200f);

            Assert.That(cursor.Active, Is.True);
            Assert.That(cursor.X, Is.EqualTo(150f));
            Assert.That(cursor.Z, Is.EqualTo(-20f));

            for (int i = 0; i < 100; i++)
            {
                cursor.Move(1, 1);
            }

            Assert.That(cursor.X, Is.EqualTo(200f), "not past the east edge");
            Assert.That(cursor.Z, Is.EqualTo(200f), "not past the north edge");
        }

        [Test]
        public void Cursor_StepIsAShareOfTheArea_AndStartsInTheMiddleWithoutAPlayer()
        {
            var cursor = new MapCursor();
            cursor.Begin(float.NaN, float.NaN, -200f, -100f, 200f, 300f);

            Assert.That(cursor.X, Is.EqualTo(0f));
            Assert.That(cursor.Z, Is.EqualTo(100f));

            cursor.Move(-1, 0);
            Assert.That(cursor.X, Is.EqualTo(-400f * MapCursor.StepShare).Within(0.001f));

            cursor.End();
            cursor.Move(1, 0);
            Assert.That(cursor.Active, Is.False);
            Assert.That(cursor.X, Is.EqualTo(-400f * MapCursor.StepShare).Within(0.001f), "an ended cursor does not move");
        }

        [Test]
        public void Compass_TakesTheNearestOwnMarkers_NearestFirst()
        {
            var markers = new List<MapMarker>();
            for (int i = 0; i < 8; i++)
            {
                markers.Add(new MapMarker(i * 10f, 0f, i));
            }

            var nearest = new List<int>();
            CompassMarkersView.NearestOwnMarkers(markers, 31f, 0f, MapMarkerRules.MaxOnCompass, nearest);

            Assert.That(nearest, Is.EqualTo(new[] { 3, 4, 2, 5, 1 }));
        }

        [Test]
        public void Symbols_HaveAGlyphAToneAndAGermanName()
        {
            Assert.That(MapMarkerSymbols.Glyph(1), Is.EqualTo("▲"));
            Assert.That(MapMarkerSymbols.Tone(7), Is.EqualTo("own1"), "wraps");
            Assert.That(MapMarkerSymbols.Name(1), Is.EqualTo("Gefahr"));
        }
    }
}
