using System.Collections.Generic;
using Aetherfall.EditorTools.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Unit tests for <see cref="PackagePlanner"/> (project setup, step a): the check whether a requested Package Manager
    /// change has arrived, which decides between "a) abgeschlossen" and waiting after a domain reload. Pure logic, no Unity calls.
    /// </summary>
    [TestFixture]
    public sealed class PackagePlannerTests
    {
        [TestCase("com.unity.timeline", "com.unity.timeline")]
        [TestCase("com.unity.timeline@1.8.9", "com.unity.timeline")]
        [TestCase("  com.unity.timeline@1.8.9 ", "com.unity.timeline")]
        [TestCase("", "")]
        [TestCase(null, "")]
        public void GetPackageName_StripsTheVersion(string specification, string expected)
        {
            Assert.That(PackagePlanner.GetPackageName(specification), Is.EqualTo(expected));
        }

        [Test]
        public void FindOutstandingChanges_AllAddedDirectAndAllRemovedGone_IsEmpty()
        {
            var installed = new List<InstalledPackage>
            {
                new InstalledPackage("com.unity.inputsystem", "1.20.1", true),
                new InstalledPackage("com.unity.cinemachine", "3.1.4", true),
                new InstalledPackage("com.unity.visualscripting", "1.9.7", false)
            };

            List<string> outstanding = PackagePlanner.FindOutstandingChanges(
                installed,
                new[] { "com.unity.inputsystem", "com.unity.cinemachine@3.1.2" },
                new[] { "com.unity.visualscripting", "com.unity.multiplayer.center" });

            Assert.That(outstanding, Is.Empty, "A different resolved version counts as installed; an indirect leftover counts as removed.");
        }

        [Test]
        public void FindOutstandingChanges_MissingOrIndirectAdd_IsReported()
        {
            var installed = new List<InstalledPackage>
            {
                new InstalledPackage("com.unity.timeline", "1.8.9", false)
            };

            List<string> outstanding = PackagePlanner.FindOutstandingChanges(
                installed,
                new[] { "com.unity.timeline@1.8.9", "com.unity.localization" },
                new string[0]);

            Assert.That(outstanding.Count, Is.EqualTo(2), string.Join(" | ", outstanding));
            Assert.That(outstanding[0], Does.StartWith("com.unity.timeline "));
            Assert.That(outstanding[1], Does.StartWith("com.unity.localization "));
        }

        [Test]
        public void FindOutstandingChanges_RemovedPackageStillDirect_IsReported()
        {
            var installed = new List<InstalledPackage>
            {
                new InstalledPackage("com.unity.multiplayer.center", "1.0.0", true)
            };

            List<string> outstanding = PackagePlanner.FindOutstandingChanges(installed, new string[0], new[] { "com.unity.multiplayer.center" });

            Assert.That(outstanding.Count, Is.EqualTo(1));
            Assert.That(outstanding[0], Does.Contain("noch nicht entfernt"));
        }

        [Test]
        public void FindOutstandingChanges_NothingRequested_IsEmpty()
        {
            Assert.That(PackagePlanner.FindOutstandingChanges(null, null, null), Is.Empty);
        }

        [Test]
        public void CreatePlan_ResultOfACompletedChange_PlansNothing()
        {
            // Idempotence: after a successful change the planner must not request anything again.
            IReadOnlyList<PackageRequirement> required = PackageCatalog.CreateRequiredPackages();
            var installed = new List<InstalledPackage>();
            for (int i = 0; i < required.Count; i++)
            {
                installed.Add(new InstalledPackage(required[i].PackageId, "1.0.0", true));
            }

            PackagePlan plan = PackagePlanner.CreatePlan(installed, required, PackageCatalog.CreateRemovablePackages(), true);

            Assert.That(plan.IsEmpty, Is.True);
        }
    }
}
