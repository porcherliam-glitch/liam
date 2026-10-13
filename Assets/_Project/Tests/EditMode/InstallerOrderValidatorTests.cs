using System;
using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="InstallerOrderValidator"/> (fail-fast boot order check, architecture 4.1).</summary>
    [TestFixture]
    public sealed class InstallerOrderValidatorTests
    {
        private static readonly IInstallerDescription LogInstallerInfo = new InstallerDescription("LogInstaller");

        private static readonly IInstallerDescription EventBusInstallerInfo =
            new InstallerDescription("EventBusInstaller", new[] { typeof(IEventBus) });

        private static readonly IInstallerDescription GameStateInstallerInfo =
            new InstallerDescription("GameStateInstaller", new[] { typeof(ITimeScaleService), typeof(IGameStateService) }, new[] { typeof(IEventBus) });

        [Test]
        public void Validate_DefaultBootOrder_IsValid()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(LogInstallerInfo, EventBusInstallerInfo, GameStateInstallerInfo), new[] { typeof(IGameStateService) });

            Assert.That(result.IsValid, Is.True, result.ToString());
            Assert.That(result.Errors.Count, Is.EqualTo(0));
        }

        [Test]
        public void Validate_EmptyList_IsValidWithoutFinalRequirements()
        {
            Assert.That(InstallerOrderValidator.Validate(List()).IsValid, Is.True);
        }

        [Test]
        public void Validate_NullList_IsInvalid()
        {
            Assert.That(InstallerOrderValidator.Validate(null).IsValid, Is.False);
        }

        [Test]
        public void Validate_MissingRequirement_NamesInstallerTypeAndPosition()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(LogInstallerInfo, GameStateInstallerInfo));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors.Count, Is.EqualTo(1), result.ToString());
            string error = result.Errors[0];
            Assert.That(error, Does.Contain("GameStateInstaller"));
            Assert.That(error, Does.Contain("Element 1"));
            Assert.That(error, Does.Contain(typeof(IEventBus).FullName));
            Assert.That(error, Does.Contain("no installer in the list provides it"));
        }

        [Test]
        public void Validate_RequirementProvidedLater_NamesTheInstallerToMove()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(LogInstallerInfo, GameStateInstallerInfo, EventBusInstallerInfo));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors.Count, Is.EqualTo(1), result.ToString());
            Assert.That(result.Errors[0], Does.Contain("provided later"));
            Assert.That(result.Errors[0], Does.Contain("Move 'EventBusInstaller' before 'GameStateInstaller'"));
        }

        [Test]
        public void Validate_RequirementProvidedBySameInstaller_IsInvalid()
        {
            var selfDependent = new InstallerDescription("SelfInstaller", new[] { typeof(IEventBus) }, new[] { typeof(IEventBus) });

            InstallerValidationResult result = InstallerOrderValidator.Validate(List(selfDependent));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors[0], Does.Contain("provides itself"));
        }

        [Test]
        public void Validate_SameServiceProvidedTwice_IsInvalid()
        {
            var secondBus = new InstallerDescription("SecondEventBusInstaller", new[] { typeof(IEventBus) });

            InstallerValidationResult result = InstallerOrderValidator.Validate(List(EventBusInstallerInfo, secondBus));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors[0], Does.Contain("SecondEventBusInstaller"));
            Assert.That(result.Errors[0], Does.Contain("already provides"));
        }

        [Test]
        public void Validate_ProvidedTypeIsNotAnInterface_IsInvalid()
        {
            var concrete = new InstallerDescription("ConcreteInstaller", new[] { typeof(EventBus) });

            InstallerValidationResult result = InstallerOrderValidator.Validate(List(concrete));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors[0], Does.Contain("not an interface"));
        }

        [Test]
        public void Validate_EmptySlot_IsInvalid()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(LogInstallerInfo, null, EventBusInstallerInfo));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors.Count, Is.EqualTo(1), result.ToString());
            Assert.That(result.Errors[0], Does.Contain("Element 1 is empty"));
        }

        [Test]
        public void Validate_SameInstallerListedTwice_IsInvalid()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(EventBusInstallerInfo, LogInstallerInfo, EventBusInstallerInfo));

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors.Count, Is.EqualTo(1), result.ToString());
            Assert.That(result.Errors[0], Does.Contain("listed twice"));
            Assert.That(result.Errors[0], Does.Contain("Element 0"));
        }

        [Test]
        public void Validate_MissingFinalRequirement_IsInvalid()
        {
            InstallerValidationResult result = InstallerOrderValidator.Validate(List(LogInstallerInfo, EventBusInstallerInfo), new[] { typeof(IGameStateService) });

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors[0], Does.Contain("boot sequence requires"));
            Assert.That(result.Errors[0], Does.Contain(typeof(IGameStateService).FullName));
        }

        [Test]
        public void Validate_ReportsAllProblemsAtOnce()
        {
            var concrete = new InstallerDescription("ConcreteInstaller", new[] { typeof(EventBus) });

            InstallerValidationResult result = InstallerOrderValidator.Validate(List(GameStateInstallerInfo, null, concrete), new[] { typeof(ISessionService) });

            Assert.That(result.Errors.Count, Is.EqualTo(4), result.ToString());
            string report = result.BuildReport("Header");
            Assert.That(report, Does.StartWith("Header\n1. "));
            Assert.That(report, Does.Contain("\n4. "));
        }

        [Test]
        public void CheckRegistrations_MatchingDeclaration_IsValid()
        {
            InstallerValidationResult result = InstallerOrderValidator.CheckRegistrations(GameStateInstallerInfo, new[] { typeof(IGameStateService), typeof(ITimeScaleService) });

            Assert.That(result.IsValid, Is.True, result.ToString());
        }

        [Test]
        public void CheckRegistrations_UndeclaredRegistration_IsInvalid()
        {
            InstallerValidationResult result = InstallerOrderValidator.CheckRegistrations(LogInstallerInfo, new[] { typeof(IEventBus) });

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors[0], Does.Contain("does not declare it in Provides"));
        }

        [Test]
        public void CheckRegistrations_DeclaredButNotRegistered_IsInvalid()
        {
            InstallerValidationResult result = InstallerOrderValidator.CheckRegistrations(GameStateInstallerInfo, new[] { typeof(ITimeScaleService) });

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors.Count, Is.EqualTo(1), result.ToString());
            Assert.That(result.Errors[0], Does.Contain(typeof(IGameStateService).FullName));
            Assert.That(result.Errors[0], Does.Contain("did not register it"));
        }

        private static IReadOnlyList<IInstallerDescription> List(params IInstallerDescription[] installers)
        {
            return installers;
        }
    }
}
