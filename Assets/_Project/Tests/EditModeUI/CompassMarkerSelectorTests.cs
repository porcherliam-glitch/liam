using System.Collections.Generic;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// The compass marker rules (S60, GDD 05 compass): ranges per kind, field of view, the focus target pinned to the edge,
    /// stacking within 4°, priority and the limit of 12, height arrows, distance text.
    /// </summary>
    [TestFixture]
    public sealed class CompassMarkerSelectorTests
    {
        private readonly List<CompassCandidate> _candidates = new List<CompassCandidate>();
        private readonly List<CompassSlot> _slots = new List<CompassSlot>();

        [SetUp]
        public void SetUp()
        {
            _candidates.Clear();
            _slots.Clear();
        }

        [Test]
        public void FocusTargetAhead_SitsInTheMiddleWithItsDistance()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 0f, 0f, 120f, "Quest"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(1));
            Assert.That(_slots[0].Position, Is.EqualTo(0.5f).Within(0.001f));
            Assert.That(_slots[0].Distance, Is.EqualTo(120f).Within(0.01f));
            Assert.That(_slots[0].AtEdge, Is.False);
        }

        [Test]
        public void TargetEast_WhileLookingNorth_SitsRightOfTheMiddle()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 50f, 0f, 50f, "Quest"));

            Select(0f);

            Assert.That(_slots[0].Position, Is.EqualTo(0.75f).Within(0.001f), "45° right of a 180° strip");
        }

        [Test]
        public void PlacesAndUnknownPlaces_OnlyWithinTheirRange()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 0f, float.NaN, 290f, "Nah"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 10f, float.NaN, 310f, "Fern"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.UnknownPlace, -40f, float.NaN, 90f, "?"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.UnknownPlace, 60f, float.NaN, 120f, "?"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(2));
            Assert.That(_slots.Exists(s => s.Label == "Nah"), Is.True);
            Assert.That(_slots.Exists(s => s.Kind == CompassMarkerKind.UnknownPlace), Is.True, "the ? 98 m away");
            Assert.That(_slots.Exists(s => s.Label == "Fern"), Is.False, "places only up to 300 m");
        }

        [Test]
        public void QuestTargets_HaveNoRange()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 0f, 0f, 5000f, "Fern"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(1));
        }

        [Test]
        public void TargetsBehind_AreHidden_ButTheFocusTargetStaysAtTheNearerEdge()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 0f, float.NaN, -100f, "Hinten"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, -30f, 0f, -100f, "Fokus links hinten"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(1));
            Assert.That(_slots[0].Kind, Is.EqualTo(CompassMarkerKind.FocusQuest));
            Assert.That(_slots[0].AtEdge, Is.True);
            Assert.That(_slots[0].Position, Is.EqualTo(0f), "behind on the left: left edge");

            _candidates.Clear();
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 30f, 0f, -100f, "Fokus rechts hinten"));
            Select(0f);
            Assert.That(_slots[0].Position, Is.EqualTo(1f));
        }

        [Test]
        public void MarkersWithinFourDegrees_StackIntoTheHigherOne()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 0f, float.NaN, 100f, "Ort"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 3f, 0f, 100f, "Quest"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 60f, float.NaN, 100f, "Anderer Ort"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(2));
            CompassSlot stack = _slots.Find(s => s.Kind == CompassMarkerKind.TrackedQuest);
            Assert.That(stack.Stacked, Is.EqualTo(2), "1.7° apart");
            Assert.That(_slots[0].Position, Is.LessThan(_slots[1].Position), "sorted along the strip");
        }

        [Test]
        public void AtMostTwelve_HighestPriorityFirst()
        {
            for (int i = 0; i < 14; i++)
            {
                // 10° apart, all in front: nothing stacks.
                float bearing = (-65f + i * 10f) * UnityEngine.Mathf.Deg2Rad;
                _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, UnityEngine.Mathf.Sin(bearing) * 100f, float.NaN,
                    UnityEngine.Mathf.Cos(bearing) * 100f, "Ort " + i));
            }

            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 0f, 0f, 2000f, "Fokus"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(CompassMarkerSelector.MaxMarkers));
            Assert.That(_slots.Exists(s => s.Kind == CompassMarkerKind.FocusQuest), Is.True, "the focus target is never pushed out");
        }

        [Test]
        public void HeightArrow_FromSixMetres_AndNoneWithoutHeight()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, -40f, 30f, 100f, "Oben"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 0f, 4f, 100f, "Fast eben"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 40f, -7f, 100f, "Unten"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.Place, 80f, float.NaN, 100f, "Ort"));

            Select(0f);

            Assert.That(_slots.Find(s => s.Label == "Oben").HeightArrow, Is.EqualTo(1));
            Assert.That(_slots.Find(s => s.Label == "Fast eben").HeightArrow, Is.EqualTo(0));
            Assert.That(_slots.Find(s => s.Label == "Unten").HeightArrow, Is.EqualTo(-1));
            Assert.That(_slots.Find(s => s.Label == "Ort").HeightArrow, Is.EqualTo(0), "places have no height");
        }

        [Test]
        public void SeveralFocusTargetsBehindOnOneSide_StackIntoTheNearest()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, -30f, 0f, -100f, "Fokus"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, -60f, 0f, -120f, "Fokus"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 40f, 0f, -100f, "Fokus"));

            Select(0f);

            Assert.That(_slots.Count, Is.EqualTo(2), "one per edge");
            Assert.That(_slots[0].Position, Is.EqualTo(0f));
            Assert.That(_slots[0].Stacked, Is.EqualTo(2));
            Assert.That(_slots[0].Distance, Is.EqualTo(new UnityEngine.Vector2(30f, 100f).magnitude).Within(0.01f), "the nearest stays");
        }

        [Test]
        public void OnlyTheNearestFocusTargetShowsItsDistance()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, -50f, 0f, 100f, "Fokus"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 50f, 0f, 60f, "Fokus"));
            _candidates.Add(new CompassCandidate(CompassMarkerKind.TrackedQuest, 0f, 0f, 20f, "Andere"));

            Select(0f);

            Assert.That(_slots.FindAll(s => s.ShowsDistance).Count, Is.EqualTo(1));
            Assert.That(_slots.Find(s => s.ShowsDistance).Distance, Is.EqualTo(new UnityEngine.Vector2(50f, 60f).magnitude).Within(0.01f));
        }

        [Test]
        public void AreaAndToneCarryOverIntoTheSlot()
        {
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, 0f, float.NaN, 200f, "Fokus", 60f, "bounty"));

            Select(0f);

            Assert.That(_slots[0].IsArea, Is.True);
            Assert.That(_slots[0].Tone, Is.EqualTo("bounty"));
        }

        [Test]
        public void AFocusTargetStraightBehind_KeepsTheEdgeItHad()
        {
            // 175° to the right: normally the right edge, but last frame it was on the left.
            float rad = 175f * UnityEngine.Mathf.Deg2Rad;
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, UnityEngine.Mathf.Sin(rad) * 100f, 0f, UnityEngine.Mathf.Cos(rad) * 100f, "Fokus"));

            CompassMarkerSelector.Select(_candidates, 0f, 0f, 0f, 0f, CompassMath.DefaultFieldOfView, _slots, -1);
            Assert.That(_slots[0].Position, Is.EqualTo(0f));

            CompassMarkerSelector.Select(_candidates, 0f, 0f, 0f, 0f, CompassMath.DefaultFieldOfView, _slots, 0);
            Assert.That(_slots[0].Position, Is.EqualTo(1f), "without memory the nearer side");

            _candidates.Clear();
            rad = 150f * UnityEngine.Mathf.Deg2Rad;
            _candidates.Add(new CompassCandidate(CompassMarkerKind.FocusQuest, UnityEngine.Mathf.Sin(rad) * 100f, 0f, UnityEngine.Mathf.Cos(rad) * 100f, "Fokus"));
            CompassMarkerSelector.Select(_candidates, 0f, 0f, 0f, 0f, CompassMath.DefaultFieldOfView, _slots, -1);
            Assert.That(_slots[0].Position, Is.EqualTo(1f), "30° from behind: the memory no longer holds");
        }

        [Test]
        public void FormatDistance_MetresThenKilometresWithAComma()
        {
            Assert.That(CompassMarkerSelector.FormatDistance(119.6f), Is.EqualTo("120 m"));
            Assert.That(CompassMarkerSelector.FormatDistance(999f), Is.EqualTo("999 m"));
            Assert.That(CompassMarkerSelector.FormatDistance(1240f), Is.EqualTo("1,2 km"));
        }

        private void Select(float heading)
        {
            CompassMarkerSelector.Select(_candidates, 0f, 0f, 0f, heading, CompassMath.DefaultFieldOfView, _slots);
        }
    }
}
