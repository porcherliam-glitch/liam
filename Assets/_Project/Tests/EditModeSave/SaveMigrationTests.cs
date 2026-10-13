using System;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Versioning and migration (architecture 9.5): gap-free chain, the example migration v0 → v1 on the golden saves.</summary>
    [TestFixture]
    public sealed class SaveMigrationTests
    {
        private sealed class StepMigration : ISaveMigration
        {
            public StepMigration(int from, bool fail = false)
            {
                FromVersion = from;
                Fail = fail;
            }

            public int FromVersion { get; }

            private bool Fail { get; }

            public void Apply(JObject root, MigrationContext ctx)
            {
                if (Fail)
                {
                    throw new InvalidOperationException("broken step");
                }

                ctx.Note("step " + FromVersion);
            }
        }

        private static JObject Golden(string path)
        {
            return new SaveDocumentCodec().ParseDocument(TestDataFiles.ReadAllBytes(path));
        }

        [Test]
        public void DefaultChain_IsComplete()
        {
            SaveMigrationChain chain = SaveMigrationChain.CreateDefault();

            Assert.That(chain.Validate(out string problem), Is.True, problem);
            Assert.That(chain.CurrentVersion, Is.EqualTo(SaveFormat.CurrentVersion));
            Assert.That(chain.OldestSupportedVersion, Is.EqualTo(0));
        }

        [Test]
        public void Chain_WithAGap_IsInvalid()
        {
            var chain = new SaveMigrationChain(3, new ISaveMigration[] { new StepMigration(0), new StepMigration(2) });

            Assert.That(chain.Validate(out string problem), Is.False);
            Assert.That(problem, Does.Contain("v1 -> v2"));
        }

        [Test]
        public void Chain_WithDuplicateOrTooNewSteps_IsInvalid()
        {
            Assert.That(new SaveMigrationChain(2, new ISaveMigration[] { new StepMigration(0), new StepMigration(0), new StepMigration(1) }).Validate(out _), Is.False);
            Assert.That(new SaveMigrationChain(1, new ISaveMigration[] { new StepMigration(0), new StepMigration(1) }).Validate(out _), Is.False);
        }

        [Test]
        public void GoldenV0_MigratesExactlyIntoGoldenV1()
        {
            JObject v0 = Golden("Saves/v0/golden_v0.sav.json");
            JObject v1 = Golden("Saves/v1/golden_v1.sav.json");
            Assert.That(SaveMigrationChain.ReadVersion(v0), Is.EqualTo(0), "v0 has no saveVersion");

            MigrationOutcome outcome = SaveMigrationChain.CreateDefault().Migrate(v0, "char_01/quick_0");

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.Migrated), outcome.Message);
            Assert.That(outcome.FromVersion, Is.EqualTo(0));
            Assert.That(outcome.ToVersion, Is.EqualTo(1));
            Assert.That(outcome.Message, Does.Contain("SaveMigrationV0ToV1"));
            Assert.That(JToken.DeepEquals(v0, v1), Is.True, "migrated v0:\n" + v0 + "\nexpected v1:\n" + v1);
        }

        [Test]
        public void CurrentVersion_IsUpToDate_AndUnchanged()
        {
            JObject v1 = Golden("Saves/v1/golden_v1.sav.json");
            JObject copy = (JObject)v1.DeepClone();

            MigrationOutcome outcome = SaveMigrationChain.CreateDefault().Migrate(v1, "x");

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.UpToDate));
            Assert.That(JToken.DeepEquals(v1, copy), Is.True);
        }

        [Test]
        public void NewerVersion_IsNotMigrated()
        {
            JObject root = JObject.Parse("{ \"header\": { \"saveVersion\": 99 }, \"sections\": {} }");

            MigrationOutcome outcome = SaveMigrationChain.CreateDefault().Migrate(root, "x");

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.NewerVersion));
            Assert.That(outcome.IsUsable, Is.False);
            Assert.That((int)root["header"]["saveVersion"], Is.EqualTo(99));
        }

        [Test]
        public void StepsRunInOrder_AndSetTheVersionAfterEachStep()
        {
            var chain = new SaveMigrationChain(3, new ISaveMigration[] { new StepMigration(2), new StepMigration(0), new StepMigration(1) });
            JObject root = JObject.Parse("{ \"header\": { \"saveVersion\": 0 }, \"sections\": {} }");

            MigrationOutcome outcome = chain.Migrate(root, "x");

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.Migrated));
            Assert.That((int)root["header"]["saveVersion"], Is.EqualTo(3));
            Assert.That(outcome.Message, Does.Contain("step 0").And.Contain("step 1").And.Contain("step 2"));
            Assert.That(outcome.Message.IndexOf("step 0", StringComparison.Ordinal), Is.LessThan(outcome.Message.IndexOf("step 2", StringComparison.Ordinal)));
        }

        [Test]
        public void FailingStep_IsReported()
        {
            var chain = new SaveMigrationChain(2, new ISaveMigration[] { new StepMigration(0), new StepMigration(1, fail: true) });
            JObject root = JObject.Parse("{ \"header\": { \"saveVersion\": 0 }, \"sections\": {} }");

            MigrationOutcome outcome = chain.Migrate(root, "x");

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.Failed));
            Assert.That(outcome.Message, Does.Contain("broken step"));
        }

        [Test]
        public void TooOldVersion_IsRefused()
        {
            var chain = new SaveMigrationChain(3, new ISaveMigration[] { new StepMigration(2) });
            JObject root = JObject.Parse("{ \"header\": { \"saveVersion\": 1 }, \"sections\": {} }");

            Assert.That(chain.Migrate(root, "x").Status, Is.EqualTo(MigrationStatus.TooOld));
        }
    }
}
