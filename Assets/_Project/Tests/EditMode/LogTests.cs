using System;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for the <see cref="Log"/> facade: level filter per category, sink handling and reset.</summary>
    [TestFixture]
    public sealed class LogTests
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
        public void Defaults_GlobalInfo_FiltersTraceAndDebug()
        {
            Log.Trace(LogCategory.Core, "trace");
            Log.Debug(LogCategory.Core, "debug");
            Log.Info(LogCategory.Core, "info");
            Log.Warning(LogCategory.Core, "warning");
            Log.Error(LogCategory.Core, "error");
            Log.Fatal(LogCategory.Core, "fatal");

            Assert.That(Log.GlobalMinLevel, Is.EqualTo(LogLevel.Info));
            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(4), _log.Sink.Dump());
            Assert.That(_log.Sink.Entries[0].Level, Is.EqualTo(LogLevel.Info));
            Assert.That(_log.Sink.Entries[3].Level, Is.EqualTo(LogLevel.Fatal));
        }

        [Test]
        public void Sink_ReceivesLevelCategoryAndMessageSeparately()
        {
            Log.Warning(LogCategory.Save, "slot 3 missing");

            CapturedLogEntry entry = _log.Sink.Entries[0];
            Assert.That(entry.Level, Is.EqualTo(LogLevel.Warning));
            Assert.That(entry.Category, Is.EqualTo(LogCategory.Save));
            Assert.That(entry.Message, Is.EqualTo("slot 3 missing"));
            Assert.That(entry.Exception, Is.Null);
        }

        [Test]
        public void CategoryMinLevel_OverridesGlobalLevelOnlyForThatCategory()
        {
            Log.SetMinLevel(LogCategory.Events, LogLevel.Debug);
            Log.SetMinLevel(LogCategory.Audio, LogLevel.Error);

            Log.Write(LogLevel.Debug, LogCategory.Events, "events debug"); // Write: independent of the [Conditional] stripping of Log.Debug
            Log.Write(LogLevel.Debug, LogCategory.Core, "core debug");
            Log.Warning(LogCategory.Audio, "audio warning");
            Log.Error(LogCategory.Audio, "audio error");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(2), _log.Sink.Dump());
            Assert.That(_log.Sink.Entries[0].Message, Is.EqualTo("events debug"));
            Assert.That(_log.Sink.Entries[1].Message, Is.EqualTo("audio error"));
            Assert.That(Log.GetMinLevel(LogCategory.Events), Is.EqualTo(LogLevel.Debug));
            Assert.That(Log.GetMinLevel(LogCategory.Core), Is.EqualTo(LogLevel.Info));
            Assert.That(Log.HasMinLevel(LogCategory.Events), Is.True);
            Assert.That(Log.HasMinLevel(LogCategory.Core), Is.False);
        }

        [Test]
        public void GlobalMinLevel_AppliesToCategoriesWithoutOwnLevel()
        {
            Log.SetMinLevel(LogCategory.Boot, LogLevel.Info);
            Log.SetGlobalMinLevel(LogLevel.Error);

            Log.Warning(LogCategory.Quests, "quest warning");
            Log.Error(LogCategory.Quests, "quest error");
            Log.Info(LogCategory.Boot, "boot info");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(2), _log.Sink.Dump());
            Assert.That(_log.Sink.Entries[0].Message, Is.EqualTo("quest error"));
            Assert.That(_log.Sink.Entries[1].Message, Is.EqualTo("boot info"));
        }

        [Test]
        public void CategoryOff_SilencesEvenFatal()
        {
            Log.SetMinLevel(LogCategory.AI, LogLevel.Off);

            Log.Fatal(LogCategory.AI, "ai fatal");
            Log.Fatal(LogCategory.World, "world fatal");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(1));
            Assert.That(_log.Sink.Entries[0].Category, Is.EqualTo(LogCategory.World));
            Assert.That(Log.IsEnabled(LogCategory.AI, LogLevel.Fatal), Is.False);
        }

        [Test]
        public void GlobalOff_SilencesAllCategoriesWithoutOwnLevel()
        {
            Log.SetGlobalMinLevel(LogLevel.Off);
            Log.SetMinLevel(LogCategory.UI, LogLevel.Trace);

            Log.Error(LogCategory.Core, "core error");
            Log.Info(LogCategory.UI, "ui info");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(1));
            Assert.That(_log.Sink.Entries[0].Category, Is.EqualTo(LogCategory.UI));
        }

        [Test]
        public void ClearMinLevel_FallsBackToGlobalLevel()
        {
            Log.SetMinLevel(LogCategory.Input, LogLevel.Trace);
            Log.ClearMinLevel(LogCategory.Input);

            Log.Write(LogLevel.Debug, LogCategory.Input, "input debug");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(0));
            Assert.That(Log.HasMinLevel(LogCategory.Input), Is.False);
            Assert.That(Log.GetMinLevel(LogCategory.Input), Is.EqualTo(LogLevel.Info));
        }

        [Test]
        public void ClearAllCategoryMinLevels_RemovesEveryOverride()
        {
            Log.SetMinLevel(LogCategory.Input, LogLevel.Trace);
            Log.SetMinLevel(LogCategory.World, LogLevel.Off);

            Log.ClearAllCategoryMinLevels();

            Assert.That(Log.HasMinLevel(LogCategory.Input), Is.False);
            Assert.That(Log.HasMinLevel(LogCategory.World), Is.False);
        }

        [Test]
        public void IsEnabled_ReflectsLevelAndSink()
        {
            Assert.That(Log.IsEnabled(LogCategory.Core, LogLevel.Info), Is.True);
            Assert.That(Log.IsEnabled(LogCategory.Core, LogLevel.Debug), Is.False);
            Assert.That(Log.IsEnabled(LogCategory.Core, LogLevel.Off), Is.False);

            Log.SetSink(null);
            Assert.That(Log.IsEnabled(LogCategory.Core, LogLevel.Fatal), Is.False, "Without a sink nothing is enabled.");
        }

        [Test]
        public void WithoutSink_MessagesAreDroppedSilently()
        {
            Log.SetSink(null);

            Assert.DoesNotThrow(() =>
            {
                Log.Info(LogCategory.Core, "dropped");
                Log.Exception(LogCategory.Core, new InvalidOperationException("dropped"));
            });
            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(0));
        }

        [Test]
        public void Exception_IsLoggedAsErrorWithException()
        {
            var exception = new InvalidOperationException("broken");

            Log.Exception(LogCategory.Save, exception, "Writing slot 2 failed.");
            Log.Exception(LogCategory.Save, exception);

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(2));
            Assert.That(_log.Sink.Entries[0].Level, Is.EqualTo(LogLevel.Error));
            Assert.That(_log.Sink.Entries[0].Message, Is.EqualTo("Writing slot 2 failed."));
            Assert.That(_log.Sink.Entries[0].Exception, Is.SameAs(exception));
            Assert.That(_log.Sink.Entries[1].Message, Does.Contain("broken"));
        }

        [Test]
        public void Write_WithLevelOff_IsIgnoredAndNullMessageBecomesEmpty()
        {
            Log.Write(LogLevel.Off, LogCategory.Core, "never");
            Log.Write(LogLevel.Warning, LogCategory.Core, null);

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(1));
            Assert.That(_log.Sink.Entries[0].Message, Is.EqualTo(string.Empty));
        }

        [Test]
        public void Reset_RestoresDefaultsAndRemovesSink()
        {
            Log.SetGlobalMinLevel(LogLevel.Trace);
            Log.SetMinLevel(LogCategory.Combat, LogLevel.Off);

            Log.Reset();

            Assert.That(Log.Sink, Is.Null);
            Assert.That(Log.GlobalMinLevel, Is.EqualTo(Log.DefaultMinLevel));
            Assert.That(Log.HasMinLevel(LogCategory.Combat), Is.False);
            Assert.That(Log.GetMinLevel(LogCategory.Combat), Is.EqualTo(LogLevel.Info));
        }

        [Test]
        public void EveryCategoryCanHaveItsOwnLevel()
        {
            foreach (LogCategory category in Enum.GetValues(typeof(LogCategory)))
            {
                Log.SetMinLevel(category, LogLevel.Warning);
                Assert.That(Log.GetMinLevel(category), Is.EqualTo(LogLevel.Warning), category.ToString());
            }
        }
    }
}
