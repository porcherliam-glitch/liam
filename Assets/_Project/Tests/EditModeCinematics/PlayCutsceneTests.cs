using System;
using Aetherfall.Cinematics;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Cinematics
{
    /// <summary>The quest action "Inszenierung/Zwischensequenz" (S58).</summary>
    [TestFixture]
    public sealed class PlayCutsceneTests
    {
        private LogCapture _log;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        [Test]
        public void Execute_RequestsTheCutsceneWithTheSourceOfTheContext()
        {
            var services = new ServiceLocator();
            var cutscenes = new RecordingCutscenes();
            services.Register<ICutsceneService>(cutscenes);

            new PlayCutscene(CutsceneIds.PrologueAwakening).Execute(new ActionContext(services, string.Empty, null, "quest.main.asche_ueber_eichental"));

            Assert.That(cutscenes.LastId, Is.EqualTo(CutsceneIds.PrologueAwakening));
            Assert.That(cutscenes.LastSource, Is.EqualTo("quest.main.asche_ueber_eichental"));
        }

        [Test]
        public void Execute_WithoutTheService_OnlyWarns()
        {
            Assert.DoesNotThrow(() => new PlayCutscene(CutsceneIds.PrologueAwakening).Execute(new ActionContext(new ServiceLocator(), null, null, "test")));
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
        }

        [Test]
        public void Validate_AcceptsAnId_AndRecordsItAsACutsceneReference()
        {
            var report = new ValidationReport();

            new PlayCutscene(CutsceneIds.PrologueAwakening).Validate(report);

            Assert.That(report.ErrorCount, Is.Zero);
            Assert.That(report.References, Has.Count.EqualTo(1));
            Assert.That(report.References[0].Id, Is.EqualTo(CutsceneIds.PrologueAwakening));
            Assert.That(report.References[0].ExpectedPrefix, Is.EqualTo(CutsceneIds.Prefix));
        }

        [Test]
        public void Validate_EmptyId_IsV13()
        {
            var report = new ValidationReport();

            new PlayCutscene().Validate(report);

            Assert.That(report.Contains(ValidationReportExtensions.InvalidParameterCode), Is.True);
        }

        [Test]
        public void Describe_IsGerman_AlsoWhenEmpty()
        {
            StringAssert.Contains("Zwischensequenz", new PlayCutscene().Describe());
            StringAssert.Contains(CutsceneIds.PrologueAwakening, new PlayCutscene(CutsceneIds.PrologueAwakening).Describe());
        }

        [Test]
        public void KnownIds_AllHaveThePrefix()
        {
            foreach (string id in CutsceneIds.All)
            {
                StringAssert.StartsWith(CutsceneIds.Prefix, id);
            }
        }

        private sealed class RecordingCutscenes : ICutsceneService
        {
            public event Action Changed;

            public string LastId { get; private set; }

            public string LastSource { get; private set; }

            public bool IsPlaying => false;

            public bool IsPending => false;

            public string CurrentId => string.Empty;

            public double CurrentTime => 0d;

            public double CurrentDuration => 0d;

            public bool CanSkip => false;

            public CutsceneOverlay Overlay => CutsceneOverlay.Empty;

            public int OverlayRevision => 0;

            public bool Request(string cutsceneId, string sourceId)
            {
                LastId = cutsceneId;
                LastSource = sourceId;
                Changed?.Invoke();
                return true;
            }

            public bool Skip(string reason)
            {
                return false;
            }

            public void Register(ICutscenePlayer player)
            {
            }

            public void Unregister(ICutscenePlayer player)
            {
            }
        }
    }
}
