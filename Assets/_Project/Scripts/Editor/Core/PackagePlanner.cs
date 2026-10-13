using System;
using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Decides which packages the setup adds and removes, based on what the Package Manager reports as installed.
    /// Pure logic without Unity calls (testable outside of Unity).
    /// </summary>
    /// <remarks>
    /// Rules (idempotent: a second run on the result plans nothing):
    /// <list type="number">
    /// <item>A required package that is a direct dependency stays untouched (its version is never changed).</item>
    /// <item>A required package that is missing is added by name; the Package Manager picks the version recommended
    /// for the installed editor.</item>
    /// <item>A required package that is only an indirect dependency (pulled in by another package) is added as
    /// "name@resolvedVersion", so it becomes a direct dependency without changing its version.</item>
    /// <item>A removable template package is removed only if the option is enabled and it is a direct dependency.
    /// Indirect ones cannot be removed and are reported as a note.</item>
    /// </list>
    /// </remarks>
    public static class PackagePlanner
    {
        /// <summary>Creates the plan for one <c>Client.AddAndRemove</c> call.</summary>
        /// <param name="installed">Packages reported by the Package Manager (including indirect dependencies).</param>
        /// <param name="required">Packages the project needs.</param>
        /// <param name="removable">Template packages that may be removed.</param>
        /// <param name="removeTemplatePackages">True to remove the removable packages.</param>
        /// <returns>The plan; <see cref="PackagePlan.IsEmpty"/> if nothing has to change.</returns>
        public static PackagePlan CreatePlan(
            IReadOnlyList<InstalledPackage> installed,
            IReadOnlyList<PackageRequirement> required,
            IReadOnlyList<string> removable,
            bool removeTemplatePackages)
        {
            var toAdd = new List<string>();
            var toRemove = new List<string>();
            var notes = new List<string>();
            var planned = new HashSet<string>(StringComparer.Ordinal);

            if (required != null)
            {
                for (int i = 0; i < required.Count; i++)
                {
                    PackageRequirement requirement = required[i];
                    if (requirement == null || requirement.PackageId.Length == 0 || !planned.Add(requirement.PackageId))
                    {
                        continue;
                    }

                    if (!TryFind(installed, requirement.PackageId, out InstalledPackage package))
                    {
                        toAdd.Add(requirement.PackageId);
                        continue;
                    }

                    if (package.IsDirectDependency)
                    {
                        continue;
                    }

                    if (package.Version.Length > 0)
                    {
                        toAdd.Add(requirement.PackageId + "@" + package.Version);
                        notes.Add(requirement.PackageId + " ist nur indirekt installiert (über ein anderes Paket) und wird mit Version " +
                                  package.Version + " als direkte Abhängigkeit eingetragen.");
                    }
                    else
                    {
                        toAdd.Add(requirement.PackageId);
                    }
                }
            }

            if (removable != null)
            {
                for (int i = 0; i < removable.Count; i++)
                {
                    string name = removable[i];
                    if (string.IsNullOrEmpty(name) || planned.Contains(name) || !TryFind(installed, name, out InstalledPackage package))
                    {
                        continue;
                    }

                    if (!removeTemplatePackages)
                    {
                        notes.Add(name + " bleibt installiert (Option zum Entfernen ist aus).");
                    }
                    else if (package.IsDirectDependency)
                    {
                        toRemove.Add(name);
                    }
                    else
                    {
                        notes.Add(name + " ist nur indirekt installiert (ein anderes Paket braucht es) und kann nicht direkt entfernt werden.");
                    }
                }
            }

            return new PackagePlan(toAdd, toRemove, notes);
        }

        /// <summary>
        /// Compares a requested <c>Client.AddAndRemove</c> change with the package list read afterwards. A package to add
        /// counts as done when it is a direct dependency (its version is not compared: the Package Manager may resolve a
        /// different one); a package to remove counts as done when it is no longer a direct dependency.
        /// </summary>
        /// <param name="installed">Packages reported by the Package Manager after the change.</param>
        /// <param name="added">Requested package specifications ("name" or "name@version").</param>
        /// <param name="removed">Requested package names to remove.</param>
        /// <returns>German descriptions of the parts that have not arrived yet; empty if the change is complete.</returns>
        public static List<string> FindOutstandingChanges(IReadOnlyList<InstalledPackage> installed, IReadOnlyList<string> added, IReadOnlyList<string> removed)
        {
            var outstanding = new List<string>();
            if (added != null)
            {
                for (int i = 0; i < added.Count; i++)
                {
                    string name = GetPackageName(added[i]);
                    if (name.Length > 0 && (!TryFind(installed, name, out InstalledPackage package) || !package.IsDirectDependency))
                    {
                        outstanding.Add(name + " (noch nicht installiert)");
                    }
                }
            }

            if (removed != null)
            {
                for (int i = 0; i < removed.Count; i++)
                {
                    string name = GetPackageName(removed[i]);
                    if (name.Length > 0 && TryFind(installed, name, out InstalledPackage package) && package.IsDirectDependency)
                    {
                        outstanding.Add(name + " (noch nicht entfernt)");
                    }
                }
            }

            return outstanding;
        }

        /// <summary>Returns the package name of a specification: "com.unity.timeline@1.8.9" → "com.unity.timeline".</summary>
        /// <param name="specification">"name" or "name@version"; may be null.</param>
        public static string GetPackageName(string specification)
        {
            if (string.IsNullOrEmpty(specification))
            {
                return string.Empty;
            }

            string trimmed = specification.Trim();
            int at = trimmed.IndexOf('@');
            return at > 0 ? trimmed.Substring(0, at) : trimmed;
        }

        /// <summary>Finds a package by exact name.</summary>
        /// <param name="installed">Installed packages; may be null.</param>
        /// <param name="name">Package name.</param>
        /// <param name="package">The found package, or default.</param>
        /// <returns>True if found.</returns>
        public static bool TryFind(IReadOnlyList<InstalledPackage> installed, string name, out InstalledPackage package)
        {
            if (installed != null && !string.IsNullOrEmpty(name))
            {
                for (int i = 0; i < installed.Count; i++)
                {
                    if (string.Equals(installed[i].Name, name, StringComparison.Ordinal))
                    {
                        package = installed[i];
                        return true;
                    }
                }
            }

            package = default;
            return false;
        }

        /// <summary>
        /// Checks a version against a planned line: "3.1" matches 3.1 and 3.1.x (also pre-release suffixes like 3.1.8-pre.2),
        /// "3.2.2" matches exactly 3.2.2. An empty line (editor-bound package) matches every version.
        /// </summary>
        /// <param name="version">Installed version.</param>
        /// <param name="line">Planned line from architecture 1.4.</param>
        public static bool MatchesVersionLine(string version, string line)
        {
            if (string.IsNullOrEmpty(line))
            {
                return true;
            }

            if (string.IsNullOrEmpty(version))
            {
                return false;
            }

            if (string.Equals(version, line, StringComparison.Ordinal))
            {
                return true;
            }

            bool lineHasThreeParts = CountDots(line) >= 2;
            if (lineHasThreeParts)
            {
                // Exact version required; only a pre-release suffix of the same version would also start with it.
                return false;
            }

            return version.StartsWith(line + ".", StringComparison.Ordinal);
        }

        /// <summary>German description of a planned line for the setup window, e.g. "3.1.x" or "an den Editor gebunden".</summary>
        /// <param name="line">Planned line.</param>
        public static string DescribeVersionLine(string line)
        {
            if (string.IsNullOrEmpty(line))
            {
                return "an den Editor gebunden";
            }

            return CountDots(line) >= 2 ? line : line + ".x";
        }

        private static int CountDots(string text)
        {
            int count = 0;
            for (int i = 0; i < text.Length; i++)
            {
                if (text[i] == '.')
                {
                    count++;
                }
            }

            return count;
        }
    }
}
