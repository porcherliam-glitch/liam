using System.Collections.Generic;
using Aetherfall.Conditions;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Checks of the stored <c>[SerializeReference]</c> data of an asset that the quest validator cannot see on the quest data
    /// (there a missing class is just <c>null</c>, which means "always" in optional fields): missing classes (rule V14,
    /// architecture 6.4 and 7.6 no. 6) and objects stored at several places (rule R01). Pure logic: the Unity data is read by
    /// <see cref="ManagedReferenceApi"/>; used by "Aetherfall > Quests pruefen", the type picker and tests.
    /// </summary>
    public static class ManagedReferenceChecks
    {
        /// <summary>Rule code of a missing class (GDD 02 10.2).</summary>
        public const string MissingTypeCode = ValidationReportExtensions.MissingTypeCode;

        /// <summary>Rule code of an object stored at several places of one asset.</summary>
        public const string SharedReferenceCode = "R01";

        /// <summary>Managed reference id of an empty field (Unity <c>RefIdNull</c>).</summary>
        public const long NullId = -2L;

        /// <summary>Managed reference id Unity reports when it does not know the id (Unity <c>RefIdUnknown</c>).</summary>
        public const long UnknownId = -1L;

        /// <summary>True if the id stands for a stored object (not <see cref="NullId"/> or <see cref="UnknownId"/>).</summary>
        /// <param name="id">Managed reference id.</param>
        public static bool IsReferenceId(long id)
        {
            return id != NullId && id != UnknownId;
        }

        /// <summary>
        /// Finds every place that shares its managed reference id with an earlier place (in the given order). The first place
        /// keeps the object; every later place is returned, also when three or more places share it. <see cref="NullId"/> and
        /// <see cref="UnknownId"/> are ignored.
        /// </summary>
        /// <param name="places">Property path and managed reference id of every managed reference field, in document order.</param>
        public static List<SharedManagedReference> FindShared(IEnumerable<KeyValuePair<string, long>> places)
        {
            var result = new List<SharedManagedReference>();
            if (places == null)
            {
                return result;
            }

            var firstPathById = new Dictionary<long, string>();
            foreach (KeyValuePair<string, long> place in places)
            {
                if (!IsReferenceId(place.Value))
                {
                    continue;
                }

                if (firstPathById.TryGetValue(place.Value, out string firstPath))
                {
                    result.Add(new SharedManagedReference(place.Value, firstPath, place.Key));
                }
                else
                {
                    firstPathById.Add(place.Value, place.Key);
                }
            }

            return result;
        }

        /// <summary>Adds one V14 error per missing class (German message with class, namespace and assembly).</summary>
        /// <param name="report">Report.</param>
        /// <param name="location">Location of the findings (quest id, so the result window can ping the asset).</param>
        /// <param name="missing">Missing classes of the asset.</param>
        public static void ReportMissingTypes(ValidationReport report, string location, IReadOnlyList<MissingManagedType> missing)
        {
            if (report == null || missing == null)
            {
                return;
            }

            for (int i = 0; i < missing.Count; i++)
            {
                MissingManagedType entry = missing[i];
                report.AddAt(ValidationSeverity.Error, MissingTypeCode,
                             "Fehlender Typ: Klasse '" + entry.ClassName + "' (Namespace '" + entry.NamespaceName + "', Assembly '" + entry.AssemblyName +
                             "') gibt es nicht mehr – umbenannt ohne [MovedFrom] oder gelöscht. Bis zur Reparatur gilt das Feld als leer " +
                             "(bei Startbedingungen und Verzweigungen heißt das „immer“). Nicht überschreiben, an Claude melden.",
                             location);
            }
        }

        /// <summary>Adds one R01 warning per later place that shares an object with an earlier place.</summary>
        /// <param name="report">Report.</param>
        /// <param name="location">Location of the findings (quest id).</param>
        /// <param name="shared">Shared places (<see cref="FindShared"/>).</param>
        public static void ReportSharedReferences(ValidationReport report, string location, IReadOnlyList<SharedManagedReference> shared)
        {
            if (report == null || shared == null)
            {
                return;
            }

            for (int i = 0; i < shared.Count; i++)
            {
                report.AddAt(ValidationSeverity.Warning, SharedReferenceCode,
                             "'" + ReadablePath(shared[i].Path) + "' und '" + ReadablePath(shared[i].FirstPath) + "' sind dasselbe Objekt: Ändern an einer Stelle ändert auch die andere. " +
                             "Asset im Inspector öffnen und die Stelle aufklappen – die Typauswahl trennt sie dann.",
                             location);
            }
        }

        /// <summary>Shortens a Unity property path for messages: <c>stages.Array.data[1].objectives.Array.data[0]</c> becomes <c>stages[1].objectives[0]</c>.</summary>
        /// <param name="propertyPath">Unity property path.</param>
        public static string ReadablePath(string propertyPath)
        {
            return string.IsNullOrEmpty(propertyPath) ? string.Empty : propertyPath.Replace(".Array.data[", "[");
        }

        /// <summary>Adds a warning that a check of the stored data was not possible (Unity API not found).</summary>
        /// <param name="report">Report.</param>
        /// <param name="code">Rule code of the skipped check (<see cref="MissingTypeCode"/> or <see cref="SharedReferenceCode"/>).</param>
        /// <param name="what">German name of the skipped check.</param>
        public static void ReportUnavailable(ValidationReport report, string code, string what)
        {
            if (report == null)
            {
                return;
            }

            report.AddAt(ValidationSeverity.Warning, code, what + " konnten nicht geprüft werden (Unity-Funktion nicht gefunden). Bitte an Claude melden.", string.Empty);
        }
    }
}
