using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.World;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// NPC daily routines (GDD 01 7.1: Hollmann 7–18 at the herd, evening at the farm, night at home) and barks (7.4: fitting
    /// part of the day, the same line at most every 10 min, lines take turns).
    /// </summary>
    [TestFixture]
    public sealed class NpcRoutineTests
    {
        private static List<NpcScheduleEntry> Hollmann()
        {
            return new List<NpcScheduleEntry>
            {
                new NpcScheduleEntry(7, 18, new Vector3(-174, 0, 130), 315, "Arbeit bei der Herde"),
                new NpcScheduleEntry(18, 21, new Vector3(-152, 0, 104), 200, "Feierabend am Hof"),
                new NpcScheduleEntry(21, 7, new Vector3(-158, 0, 102), 90, "Schlaf (zu Hause)")
            };
        }

        [TestCase(10.0, 0)]
        [TestCase(7.0, 0)]
        [TestCase(17.99, 0)]
        [TestCase(18.0, 1)]
        [TestCase(20.5, 1)]
        [TestCase(21.0, 2)]
        [TestCase(2.0, 2)]
        [TestCase(6.99, 2)]
        public void HollmannIsAtTheRightPlace(double hour, int expected)
        {
            Assert.That(NpcScheduleRules.EntryAt(Hollmann(), hour), Is.EqualTo(expected));
        }

        [Test]
        public void ARoutineMustCoverTheWholeDay()
        {
            Assert.That(NpcScheduleRules.Validate(Hollmann()), Is.Empty);

            var gap = new List<NpcScheduleEntry> { new NpcScheduleEntry(7, 18, Vector3.zero, 0, "Arbeit") };
            Assert.That(NpcScheduleRules.Validate(gap), Does.Contain("00:00"), "the first hour without a block");
            Assert.That(NpcScheduleRules.Validate(new List<NpcScheduleEntry>()), Is.Not.Empty);
        }

        [Test]
        public void TheWirtTavernRunsUntilMidnight()
        {
            var ulf = new List<NpcScheduleEntry>
            {
                new NpcScheduleEntry(10, 24, Vector3.zero, 0, "Taverne"),
                new NpcScheduleEntry(0, 10, Vector3.one, 0, "Schlaf")
            };

            Assert.That(NpcScheduleRules.EntryAt(ulf, 23.9), Is.EqualTo(0));
            Assert.That(NpcScheduleRules.EntryAt(ulf, 0.0), Is.EqualTo(1));
            Assert.That(NpcScheduleRules.Validate(ulf), Is.Empty);
        }

        [Test]
        public void BarksFitThePartOfTheDay()
        {
            var lines = new List<NpcBarkLine>
            {
                new NpcBarkLine("Tag", DayPhase.Day),
                new NpcBarkLine("Nacht", DayPhase.Night),
                new NpcBarkLine("Immer")
            };

            Assert.That(NpcBarkRules.Pick(lines, DayPhase.Night, null, 0f), Is.EqualTo(1));
            Assert.That(NpcBarkRules.Pick(lines, DayPhase.Evening, null, 0f), Is.EqualTo(2));
        }

        [Test]
        public void TheSameLineWaitsTenMinutesAndLinesTakeTurns()
        {
            var lines = new List<NpcBarkLine> { new NpcBarkLine("Eins"), new NpcBarkLine("Zwei") };
            var said = new List<float> { 100f, -1f };

            Assert.That(NpcBarkRules.Pick(lines, DayPhase.Day, said, 120f), Is.EqualTo(1), "line 0 was said 20 s ago");

            said[1] = 130f;
            Assert.That(NpcBarkRules.Pick(lines, DayPhase.Day, said, 200f), Is.EqualTo(-1), "both lines are cooling down");
            Assert.That(NpcBarkRules.Pick(lines, DayPhase.Day, said, 800f), Is.EqualTo(0), "after 10 min the older line comes first");
        }
    }
}
