using System;
using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="ServiceLocator"/>, <see cref="Services"/> and <see cref="RecordingServiceRegistry"/>.</summary>
    [TestFixture]
    public sealed class ServiceLocatorTests
    {
        private interface IAlphaService
        {
        }

        private interface IBetaService
        {
        }

        private interface IMissingService
        {
        }

        [Test]
        public void Register_ThenGet_ReturnsSameInstance()
        {
            var locator = new ServiceLocator();
            var service = new AlphaBetaService();

            locator.Register<IAlphaService>(service);

            Assert.That(locator.Get<IAlphaService>(), Is.SameAs(service));
            Assert.That(locator.Count, Is.EqualTo(1));
            Assert.That(locator.IsRegistered(typeof(IAlphaService)), Is.True);
        }

        [Test]
        public void Register_SameTypeTwice_ThrowsWithTypeName()
        {
            var locator = new ServiceLocator();
            locator.Register<IAlphaService>(new AlphaBetaService());

            var exception = Assert.Throws<InvalidOperationException>(() => locator.Register<IAlphaService>(new AlphaBetaService()));

            Assert.That(exception.Message, Does.Contain(nameof(IAlphaService)));
            Assert.That(exception.Message, Does.Contain("already registered"));
        }

        [Test]
        public void Register_Null_Throws()
        {
            var locator = new ServiceLocator();

            Assert.Throws<ArgumentNullException>(() => locator.Register<IAlphaService>(null));
            Assert.That(locator.Count, Is.EqualTo(0));
        }

        [Test]
        public void Get_MissingService_ThrowsWithTypeName()
        {
            var locator = new ServiceLocator();

            var exception = Assert.Throws<KeyNotFoundException>(() => locator.Get<IMissingService>());

            Assert.That(exception.Message, Does.Contain(nameof(IMissingService)));
        }

        [Test]
        public void TryGet_MissingService_ReturnsFalseAndNull()
        {
            var locator = new ServiceLocator();

            bool found = locator.TryGet(out IMissingService service);

            Assert.That(found, Is.False);
            Assert.That(service, Is.Null);
        }

        [Test]
        public void TryGet_RegisteredService_ReturnsTrueAndInstance()
        {
            var locator = new ServiceLocator();
            var service = new AlphaBetaService();
            locator.Register<IBetaService>(service);

            bool found = locator.TryGet(out IBetaService resolved);

            Assert.That(found, Is.True);
            Assert.That(resolved, Is.SameAs(service));
        }

        [Test]
        public void Instances_AreDistinctAndInRegistrationOrder()
        {
            var locator = new ServiceLocator();
            var shared = new AlphaBetaService();
            var other = new BetaOnlyService();

            locator.Register<IAlphaService>(shared);
            locator.Register<IBetaService>(other);

            var secondLocator = new ServiceLocator();
            secondLocator.Register<IAlphaService>(shared);
            secondLocator.Register<IBetaService>(shared); // same instance under two interfaces

            Assert.That(locator.Instances, Is.EqualTo(new object[] { shared, other }));
            Assert.That(secondLocator.Instances.Count, Is.EqualTo(1));
            Assert.That(secondLocator.Count, Is.EqualTo(2));
        }

        [Test]
        public void Services_SetAndReset_ControlTheGlobalLocator()
        {
            IServiceLocator previous = Services.Locator;
            try
            {
                var locator = new ServiceLocator();

                Services.Set(locator);
                Assert.That(Services.Locator, Is.SameAs(locator));

                Services.Reset();
                Assert.That(Services.Locator, Is.Null);
            }
            finally
            {
                Services.Set(previous);
            }
        }

        [Test]
        public void RecordingRegistry_ForwardsAndRecordsTypes()
        {
            var locator = new ServiceLocator();
            var recorder = new RecordingServiceRegistry(locator);
            var service = new AlphaBetaService();

            recorder.Register<IAlphaService>(service);
            recorder.Register<IBetaService>(service);

            Assert.That(recorder.RecordedTypes, Is.EqualTo(new[] { typeof(IAlphaService), typeof(IBetaService) }));
            Assert.That(locator.Get<IBetaService>(), Is.SameAs(service));

            recorder.ClearRecording();
            Assert.That(recorder.RecordedTypes.Count, Is.EqualTo(0));
            Assert.That(locator.Count, Is.EqualTo(2), "Clearing the recording must not touch the registry.");
        }

        [Test]
        public void RecordingRegistry_DoesNotRecordFailedRegistrations()
        {
            var locator = new ServiceLocator();
            var recorder = new RecordingServiceRegistry(locator);
            recorder.Register<IAlphaService>(new AlphaBetaService());
            recorder.ClearRecording();

            Assert.Throws<InvalidOperationException>(() => recorder.Register<IAlphaService>(new AlphaBetaService()));
            Assert.That(recorder.RecordedTypes.Count, Is.EqualTo(0));
        }

        private sealed class AlphaBetaService : IAlphaService, IBetaService
        {
        }

        private sealed class BetaOnlyService : IBetaService
        {
        }
    }
}
