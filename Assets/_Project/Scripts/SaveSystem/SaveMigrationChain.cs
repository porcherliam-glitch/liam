using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Ordered, gap-free chain of <see cref="ISaveMigration"/>s from the oldest supported version to
    /// <see cref="CurrentVersion"/> (architecture 9.5). "Fehlt ein Glied, startet der Build nicht": the save installer calls
    /// <see cref="Validate"/> at boot, a test does the same for <see cref="CreateDefault"/>.
    /// </summary>
    public sealed class SaveMigrationChain
    {
        private readonly ISaveMigration[] _steps;

        /// <summary>Creates a chain.</summary>
        /// <param name="currentVersion">Format version of the running game.</param>
        /// <param name="migrations">Steps (any order); null = none.</param>
        public SaveMigrationChain(int currentVersion, IEnumerable<ISaveMigration> migrations)
        {
            CurrentVersion = currentVersion;
            var steps = new List<ISaveMigration>();
            if (migrations != null)
            {
                foreach (ISaveMigration migration in migrations)
                {
                    if (migration != null)
                    {
                        steps.Add(migration);
                    }
                }
            }

            steps.Sort((a, b) => a.FromVersion.CompareTo(b.FromVersion));
            _steps = steps.ToArray();
            OldestSupportedVersion = _steps.Length > 0 ? Math.Min(_steps[0].FromVersion, currentVersion) : currentVersion;
        }

        /// <summary>Format version of the running game.</summary>
        public int CurrentVersion { get; }

        /// <summary>Oldest version that can be migrated (smallest <see cref="ISaveMigration.FromVersion"/>).</summary>
        public int OldestSupportedVersion { get; }

        /// <summary>Number of steps.</summary>
        public int StepCount => _steps.Length;

        /// <summary>The chain of the game: v0 → v1 (<see cref="SaveMigrationV0ToV1"/>).</summary>
        public static SaveMigrationChain CreateDefault()
        {
            return new SaveMigrationChain(SaveFormat.CurrentVersion, new ISaveMigration[] { new SaveMigrationV0ToV1() });
        }

        /// <summary>Checks that every version from the oldest supported one to the current one has exactly one step.</summary>
        /// <param name="problem">First problem, or empty.</param>
        /// <returns>True if the chain is complete.</returns>
        public bool Validate(out string problem)
        {
            for (int i = 0; i < _steps.Length; i++)
            {
                int from = _steps[i].FromVersion;
                if (from < 0 || from >= CurrentVersion)
                {
                    problem = _steps[i].GetType().Name + " migrates from v" + from + ", but the current version is v" + CurrentVersion + ".";
                    return false;
                }

                if (i > 0 && _steps[i - 1].FromVersion == from)
                {
                    problem = "Two migrations start at v" + from + ": " + _steps[i - 1].GetType().Name + " and " + _steps[i].GetType().Name + ".";
                    return false;
                }
            }

            for (int version = OldestSupportedVersion; version < CurrentVersion; version++)
            {
                if (Find(version) == null)
                {
                    problem = "Missing save migration v" + version + " -> v" + (version + 1) + " (architecture 9.5: the chain must be gap-free).";
                    return false;
                }
            }

            problem = string.Empty;
            return true;
        }

        /// <summary>Reads <c>header.saveVersion</c> (missing = 0, the pre-release format).</summary>
        /// <param name="root">Parsed document.</param>
        public static int ReadVersion(JObject root)
        {
            if (root[SaveFormat.HeaderKey] is JObject header && header[SaveFormat.SaveVersionKey] is JValue value &&
                (value.Type == JTokenType.Integer || value.Type == JTokenType.Float))
            {
                return Convert.ToInt32(value.Value);
            }

            return 0;
        }

        /// <summary>Migrates the document in place to <see cref="CurrentVersion"/>.</summary>
        /// <param name="root">Parsed document.</param>
        /// <param name="slotId">Slot id for notes.</param>
        public MigrationOutcome Migrate(JObject root, string slotId)
        {
            if (root == null)
            {
                throw new ArgumentNullException(nameof(root));
            }

            int version = ReadVersion(root);
            if (version > CurrentVersion)
            {
                return new MigrationOutcome(MigrationStatus.NewerVersion, version, version,
                    "Save v" + version + " is newer than the game (v" + CurrentVersion + ").");
            }

            if (version == CurrentVersion)
            {
                return new MigrationOutcome(MigrationStatus.UpToDate, version, version, string.Empty);
            }

            if (version < OldestSupportedVersion)
            {
                return new MigrationOutcome(MigrationStatus.TooOld, version, version,
                    "Save v" + version + " is older than the oldest supported version v" + OldestSupportedVersion + ".");
            }

            var context = new MigrationContext(slotId, version);
            int current = version;
            while (current < CurrentVersion)
            {
                ISaveMigration step = Find(current);
                if (step == null)
                {
                    return new MigrationOutcome(MigrationStatus.Failed, version, current, "Missing save migration v" + current + " -> v" + (current + 1) + ".");
                }

                try
                {
                    step.Apply(root, context);
                }
                catch (Exception exception)
                {
                    return new MigrationOutcome(MigrationStatus.Failed, version, current,
                        step.GetType().Name + " failed: " + exception.GetType().Name + ": " + exception.Message);
                }

                current++;
                if (!(root[SaveFormat.HeaderKey] is JObject header))
                {
                    header = new JObject();
                    root[SaveFormat.HeaderKey] = header;
                }

                header[SaveFormat.SaveVersionKey] = current;
                context.Note(step.GetType().Name + ": v" + (current - 1) + " -> v" + current);
            }

            return new MigrationOutcome(MigrationStatus.Migrated, version, current, string.Join("; ", context.Notes));
        }

        private ISaveMigration Find(int fromVersion)
        {
            for (int i = 0; i < _steps.Length; i++)
            {
                if (_steps[i].FromVersion == fromVersion)
                {
                    return _steps[i];
                }
            }

            return null;
        }
    }
}
