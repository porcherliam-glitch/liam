using Newtonsoft.Json.Linq;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// One step of the format migration (architecture 9.5): converts the raw JSON of a save from
    /// <see cref="FromVersion"/> to <see cref="FromVersion"/> + 1. Works on the JSON, never on DTOs (old DTO classes do
    /// not exist anymore). The chain sets <c>header.saveVersion</c> after each step.
    /// </summary>
    public interface ISaveMigration
    {
        /// <summary>Version this step migrates from (exactly one step: FromVersion → FromVersion + 1).</summary>
        int FromVersion { get; }

        /// <summary>Changes the document in place.</summary>
        /// <param name="root">Whole document (<c>header</c> and <c>sections</c>).</param>
        /// <param name="ctx">Slot and notes for the log.</param>
        void Apply(JObject root, MigrationContext ctx);
    }
}
