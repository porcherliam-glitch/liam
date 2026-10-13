using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Checks the installer list of the boot sequence before any installer runs (fail-fast, architecture 4.1).
    /// Pure logic without Unity calls, so it is fully testable outside of Unity.
    /// </summary>
    /// <remarks>
    /// Rules checked by <see cref="Validate"/>:
    /// <list type="number">
    /// <item>No empty slots, no installer listed twice.</item>
    /// <item>Every type in <c>Provides</c> is an interface (architecture 4.2, rule 4) and is provided by exactly one installer.</item>
    /// <item>Every type in <c>Requires</c> is provided by an <b>earlier</b> installer.</item>
    /// <item>Optional: types the boot sequence itself needs after all installers ran are provided by some installer.</item>
    /// </list>
    /// Positions are reported as "Element n", exactly as the Unity inspector labels the list entries of <see cref="BootConfig"/>.
    /// </remarks>
    public static class InstallerOrderValidator
    {
        /// <summary>Validates the order and declarations of an installer list.</summary>
        /// <param name="installers">Installers in boot order. Null entries are reported as empty slots.</param>
        /// <param name="requiredAfterAllInstallers">Service types the caller needs after all installers ran (may be null).</param>
        /// <returns>The result with one readable message per problem.</returns>
        public static InstallerValidationResult Validate(
            IReadOnlyList<IInstallerDescription> installers,
            IEnumerable<Type> requiredAfterAllInstallers = null)
        {
            var errors = new List<string>();
            if (installers == null)
            {
                errors.Add("The installer list is missing (null).");
                return new InstallerValidationResult(errors);
            }

            var providerIndex = new Dictionary<Type, int>();
            var skipped = new bool[installers.Count];

            // Pass 1: empty slots, duplicates and the Provides declarations.
            for (int i = 0; i < installers.Count; i++)
            {
                IInstallerDescription installer = installers[i];
                if (installer == null)
                {
                    errors.Add(Slot(i) + " is empty. Assign an installer asset or remove the element.");
                    skipped[i] = true;
                    continue;
                }

                int firstIndex = IndexOfInstance(installers, installer, i);
                if (firstIndex >= 0)
                {
                    errors.Add(Describe(installers, i) + " is listed twice (also " + Slot(firstIndex) + "). Remove one of the entries.");
                    skipped[i] = true;
                    continue;
                }

                IEnumerable<Type> provides = installer.Provides;
                if (provides == null)
                {
                    continue;
                }

                foreach (Type type in provides)
                {
                    if (type == null)
                    {
                        errors.Add(Describe(installers, i) + " has an empty (null) entry in Provides.");
                    }
                    else if (!type.IsInterface)
                    {
                        errors.Add(Describe(installers, i) + " declares '" + TypeName(type) + "' in Provides, but it is not an interface. " +
                                   "Register interfaces, not implementations (architecture 4.2, rule 4).");
                    }
                    else if (providerIndex.TryGetValue(type, out int otherIndex))
                    {
                        errors.Add(otherIndex == i
                            ? Describe(installers, i) + " lists '" + TypeName(type) + "' twice in Provides."
                            : Describe(installers, i) + " provides '" + TypeName(type) + "', which " + Describe(installers, otherIndex) +
                              " already provides. Each service may be registered only once.");
                    }
                    else
                    {
                        providerIndex.Add(type, i);
                    }
                }
            }

            // Pass 2: every requirement must be provided by an earlier installer.
            for (int i = 0; i < installers.Count; i++)
            {
                if (skipped[i])
                {
                    continue;
                }

                IEnumerable<Type> requires = installers[i].Requires;
                if (requires == null)
                {
                    continue;
                }

                foreach (Type type in requires)
                {
                    if (type == null)
                    {
                        errors.Add(Describe(installers, i) + " has an empty (null) entry in Requires.");
                    }
                    else if (!providerIndex.TryGetValue(type, out int providerPosition))
                    {
                        errors.Add(Describe(installers, i) + " requires '" + TypeName(type) + "', but no installer in the list provides it. " +
                                   "Add the installer that registers '" + TypeName(type) + "' before '" + installers[i].DisplayName + "'.");
                    }
                    else if (providerPosition == i)
                    {
                        errors.Add(Describe(installers, i) + " requires '" + TypeName(type) + "', which it provides itself. " +
                                   "Requires may only list services of earlier installers.");
                    }
                    else if (providerPosition > i)
                    {
                        errors.Add(Describe(installers, i) + " requires '" + TypeName(type) + "', which is provided later by " +
                                   Describe(installers, providerPosition) + ". Move '" + installers[providerPosition].DisplayName +
                                   "' before '" + installers[i].DisplayName + "'.");
                    }
                }
            }

            // Pass 3: what the boot sequence itself needs after all installers ran.
            if (requiredAfterAllInstallers != null)
            {
                foreach (Type type in requiredAfterAllInstallers)
                {
                    if (type != null && !providerIndex.ContainsKey(type))
                    {
                        errors.Add("The boot sequence requires '" + TypeName(type) + "' after all installers ran, but no installer in the list provides it. " +
                                   "Add the installer that registers it.");
                    }
                }
            }

            return new InstallerValidationResult(errors);
        }

        /// <summary>
        /// Compares the types an installer really registered with its <see cref="IInstallerDescription.Provides"/> declaration.
        /// </summary>
        /// <param name="installer">The installer that just ran.</param>
        /// <param name="registeredTypes">Types it registered (see <see cref="RecordingServiceRegistry.RecordedTypes"/>).</param>
        /// <returns>Valid if declaration and registrations match exactly.</returns>
        public static InstallerValidationResult CheckRegistrations(IInstallerDescription installer, IReadOnlyList<Type> registeredTypes)
        {
            var errors = new List<string>();
            string name = installer == null ? "(null)" : installer.DisplayName;

            var declared = new List<Type>();
            IEnumerable<Type> provides = installer == null ? null : installer.Provides;
            if (provides != null)
            {
                foreach (Type type in provides)
                {
                    if (type != null)
                    {
                        declared.Add(type);
                    }
                }
            }

            if (registeredTypes != null)
            {
                for (int i = 0; i < registeredTypes.Count; i++)
                {
                    Type type = registeredTypes[i];
                    if (type != null && !declared.Contains(type))
                    {
                        errors.Add("Installer '" + name + "' registered '" + TypeName(type) + "' but does not declare it in Provides. " +
                                   "Add it to Provides so the order check knows about it.");
                    }
                }
            }

            for (int i = 0; i < declared.Count; i++)
            {
                if (registeredTypes == null || !Contains(registeredTypes, declared[i]))
                {
                    errors.Add("Installer '" + name + "' declares '" + TypeName(declared[i]) + "' in Provides but did not register it.");
                }
            }

            return new InstallerValidationResult(errors);
        }

        private static int IndexOfInstance(IReadOnlyList<IInstallerDescription> installers, IInstallerDescription installer, int before)
        {
            for (int j = 0; j < before; j++)
            {
                if (ReferenceEquals(installers[j], installer))
                {
                    return j;
                }
            }

            return -1;
        }

        private static bool Contains(IReadOnlyList<Type> types, Type type)
        {
            for (int i = 0; i < types.Count; i++)
            {
                if (types[i] == type)
                {
                    return true;
                }
            }

            return false;
        }

        private static string Slot(int index)
        {
            return "Element " + index;
        }

        private static string Describe(IReadOnlyList<IInstallerDescription> installers, int index)
        {
            return "Installer '" + installers[index].DisplayName + "' (" + Slot(index) + ")";
        }

        private static string TypeName(Type type)
        {
            return type.FullName ?? type.Name;
        }
    }
}
