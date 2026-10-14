using System;
using System.Reflection;
using Aetherfall.Conditions;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>
    /// Validation infrastructure shared by conditions, actions and the quest validator: findings with location paths,
    /// collected references, the helper checks (empty id, value not positive, empty list entries = V14), the validation of
    /// the logic types, and the structure rules of architecture 7.6 for every concrete type of Aetherfall.Conditions.
    /// </summary>
    [TestFixture]
    public sealed class ValidationReportTests
    {
        [Test]
        public void Scopes_BuildTheLocationPath()
        {
            var report = new ValidationReport();
            using (report.Scope("quest.test.a"))
            {
                using (report.Scope("s20"))
                {
                    report.Error("V13", "kaputt");
                    report.Mentions("npc.eichental.hollmann", "npc.");
                }

                report.Warning("W04", "lang");
            }

            report.Info("C01", "hinweis");

            Assert.That(report.Issues.Count, Is.EqualTo(3));
            Assert.That(report.Issues[0].Location, Is.EqualTo("quest.test.a / s20"));
            Assert.That(report.Issues[1].Location, Is.EqualTo("quest.test.a"));
            Assert.That(report.Issues[2].Location, Is.Empty);
            Assert.That(report.References[0].Location, Is.EqualTo("quest.test.a / s20"));
            Assert.That(report.ErrorCount, Is.EqualTo(1));
            Assert.That(report.WarningCount, Is.EqualTo(1));
            Assert.That(report.HasErrors, Is.True);
            Assert.That(report.Contains("W04"), Is.True);
            Assert.That(report.ToText(), Does.Contain("Fehler V13 [quest.test.a / s20]: kaputt"));
            report.PopLocation();
        }

        [Test]
        public void Helpers_ReportEmptyIdsAndValues()
        {
            var report = new ValidationReport();

            Assert.That(report.RequireId(string.Empty, "npc.", "NPC"), Is.False);
            Assert.That(report.RequireId("npc.eichental.ulf", "npc.", "NPC"), Is.True);
            Assert.That(report.RequirePositive(0, "Anzahl"), Is.False);
            Assert.That(report.RequirePositive(3, "Anzahl"), Is.True);
            report.ReadsFlag("flag.test.a", 1);
            report.WritesFlag("flag.test.b", 0, false);

            Assert.That(report.CountOf("V13"), Is.EqualTo(2));
            Assert.That(report.References.Count, Is.EqualTo(3));
            Assert.That(report.References[1].Use, Is.EqualTo(ReferenceUse.Read));
            Assert.That(report.References[1].HasValue, Is.True);
            Assert.That(report.References[2].Use, Is.EqualTo(ReferenceUse.Write));
            Assert.That(report.References[2].HasValue, Is.False);
        }

        [Test]
        public void LogicTypes_ReportEmptyEntriesAndImpossibleCounts()
        {
            var report = new ValidationReport();
            new AllOf(new Always(), null, new Not(null)).Validate(report);
            new AtLeastNOf(3, new Always()).Validate(report);
            new AnyOf().Validate(report);

            Assert.That(report.CountOf("V14"), Is.EqualTo(2), "null entry in AND and the empty NOT");
            Assert.That(report.CountOf("V18"), Is.EqualTo(2), "3 of 1 and the empty OR");
            Assert.That(report.Issues[0].Location, Is.EqualTo("UND[1]"));
        }

        [Test]
        public void TypeMenuAttribute_SplitsThePath()
        {
            var attribute = new TypeMenuAttribute("Welt/Flag setzen", 3);

            Assert.That(attribute.DisplayName, Is.EqualTo("Flag setzen"));
            Assert.That(attribute.Order, Is.EqualTo(3));
            Assert.That(new TypeMenuAttribute(null).Path, Is.Empty);
        }

        [Test]
        public void ConcreteTypesOfConditionsAssembly_FollowArchitecture76()
        {
            int checkedTypes = 0;
            foreach (Type type in typeof(Condition).Assembly.GetTypes())
            {
                if (type.IsAbstract || !(typeof(Condition).IsAssignableFrom(type) || typeof(GameAction).IsAssignableFrom(type)))
                {
                    continue;
                }

                checkedTypes++;
                Assert.That(type.IsSealed, Is.True, type.Name + " must be sealed");
                Assert.That(Attribute.IsDefined(type, typeof(SerializableAttribute), false), Is.True, type.Name + " must be [Serializable]");
                Assert.That(type.IsGenericType, Is.False, type.Name + " must not be generic");
                Assert.That(type.GetConstructor(Type.EmptyTypes), Is.Not.Null, type.Name + " needs a public parameterless constructor");
                var menu = type.GetCustomAttribute<TypeMenuAttribute>(false);
                Assert.That(menu, Is.Not.Null, type.Name + " needs a German [TypeMenu]");
                Assert.That(menu.Path, Does.StartWith("Logik/"), type.Name);
            }

            Assert.That(checkedTypes, Is.EqualTo(7), "AllOf, AnyOf, Not, AtLeastNOf, Always, Never, ConditionalAction");
        }
    }
}
