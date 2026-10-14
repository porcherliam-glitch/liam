using System;
using System.IO;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Core;
using Aetherfall.EditorTools.Core;
using Aetherfall.SaveSystem;
using Aetherfall.World.Puzzles;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Boot installers of the crypt and the access to the types of <c>Aetherfall.World.Gameplay</c>: this editor assembly may not
    /// reference that nested assembly (its asmdef is fixed), so the save installer and the gameplay components (arrow trap,
    /// condition gate, state actions) are found by their full type names through the <see cref="TypeCache"/>.
    /// </summary>
    public static class GruftInstallers
    {
        /// <summary>Full name of the save installer of the world objects.</summary>
        public const string WorldSaveInstallerType = "Aetherfall.World.Gameplay.WorldSaveInstaller";

        /// <summary>Full name of the arrow trap.</summary>
        public const string ArrowTrapType = "Aetherfall.World.Gameplay.ArrowTrap";

        /// <summary>Full name of the condition gate.</summary>
        public const string ConditionGateType = "Aetherfall.World.Gameplay.ConditionGate";

        /// <summary>Full name of the state actions.</summary>
        public const string StateActionsType = "Aetherfall.World.Gameplay.StateActions";

        private const string InstallersField = "installers";

        /// <summary>Puts the installers of world objects, bosses and world saving into the BootConfig.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if all three are in the BootConfig afterwards.</returns>
        public static bool EnsureAll(TestGroundReport report)
        {
            bool world = TestGroundAssets.EnsureInstallerInBootConfig<WorldObjectsInstaller>(GruftPaths.WorldObjectsInstallerPath, report,
                typeof(EventBusInstaller));
            bool boss = TestGroundAssets.EnsureInstallerInBootConfig<BossInstaller>(GruftPaths.BossInstallerPath, report, typeof(AIInstaller));
            Type saveType = FindType<ServiceInstaller>(WorldSaveInstallerType);
            bool save = false;
            if (saveType == null)
            {
                report.Warning("Typ " + WorldSaveInstallerType + " nicht gefunden (Paket Newtonsoft fehlt?) – Rätsel, Türen und Boss werden " +
                               "nicht gespeichert.");
            }
            else
            {
                save = EnsureInstallerByType(saveType, GruftPaths.WorldSaveInstallerPath, report, typeof(WorldObjectsInstaller),
                    typeof(SaveInstaller), typeof(EventBusInstaller));
            }

            return world && boss && save;
        }

        /// <summary>Finds a type by its full name among the types derived from <typeparamref name="TBase"/>.</summary>
        /// <typeparam name="TBase">Base type.</typeparam>
        /// <param name="fullName">Full type name.</param>
        /// <returns>The type or null.</returns>
        public static Type FindType<TBase>(string fullName)
        {
            foreach (Type type in TypeCache.GetTypesDerivedFrom<TBase>())
            {
                if (type.FullName == fullName)
                {
                    return type;
                }
            }

            return null;
        }

        /// <summary>Adds a component of <c>Aetherfall.World.Gameplay</c> by its full type name.</summary>
        /// <param name="target">GameObject.</param>
        /// <param name="fullName">Full type name.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The component, or null (warning) if the type is missing.</returns>
        public static Component AddGameplayComponent(GameObject target, string fullName, TestGroundReport report)
        {
            Type type = FindType<MonoBehaviour>(fullName);
            if (type == null)
            {
                report.Warning("Komponente " + fullName + " nicht gefunden – „" + target.name + "“ bleibt ohne sie.");
                return null;
            }

            return target.AddComponent(type);
        }

        /// <summary>Creates an instance of a <c>[SerializeReference]</c> value (condition, action) by its type.</summary>
        /// <param name="target">Component.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Managed value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetManagedReference(Object target, string field, object value, TestGroundReport report)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + target.GetType().Name + " nicht gefunden.");
                return;
            }

            property.managedReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Appends a <c>[SerializeReference]</c> value to a list field.</summary>
        /// <param name="target">Component.</param>
        /// <param name="field">List field name.</param>
        /// <param name="value">Managed value.</param>
        /// <param name="report">Protocol.</param>
        public static void AddManagedReference(Object target, string field, object value, TestGroundReport report)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty list = serialized.FindProperty(field);
            if (list == null || !list.isArray)
            {
                report.Warning("Liste „" + field + "“ an " + target.GetType().Name + " nicht gefunden.");
                return;
            }

            list.arraySize++;
            list.GetArrayElementAtIndex(list.arraySize - 1).managedReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static bool EnsureInstallerByType(Type type, string assetPath, TestGroundReport report, params Type[] placeAfter)
        {
            BootConfig bootConfig = AssetDatabase.LoadAssetAtPath<BootConfig>(SetupPaths.BootConfigAssetPath);
            if (bootConfig == null)
            {
                report.Warning("BootConfig fehlt (" + SetupPaths.BootConfigAssetPath + "). Bitte zuerst „Aetherfall > Projekt-Setup …“ ausführen.");
                return false;
            }

            Object installer = AssetDatabase.LoadAssetAtPath(assetPath, type);
            if (installer == null)
            {
                if (File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath)))
                {
                    report.Warning(assetPath + " existiert, ist aber kein " + type.Name + " – bitte prüfen.");
                    return false;
                }

                installer = ScriptableObject.CreateInstance(type);
                AssetDatabase.CreateAsset(installer, assetPath);
                report.Info("Angelegt: " + assetPath);
            }

            var serialized = new SerializedObject(bootConfig);
            SerializedProperty list = serialized.FindProperty(InstallersField);
            if (list == null || !list.isArray)
            {
                report.Warning("Feld „" + InstallersField + "“ der BootConfig nicht gefunden. Bitte den " + type.Name + " von Hand eintragen.");
                return false;
            }

            int existing = -1;
            int lastRequired = -1;
            for (int i = 0; i < list.arraySize; i++)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry != null && type.IsInstanceOfType(entry) && existing < 0)
                {
                    existing = i;
                }

                for (int t = 0; t < placeAfter.Length; t++)
                {
                    if (entry != null && placeAfter[t].IsInstanceOfType(entry))
                    {
                        lastRequired = Math.Max(lastRequired, i);
                    }
                }
            }

            if (existing >= 0)
            {
                if (existing > lastRequired)
                {
                    report.Info("BootConfig enthält bereits einen " + type.Name + " (Element " + existing + ", unverändert).");
                    return true;
                }

                list.MoveArrayElement(existing, lastRequired);
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(bootConfig);
                report.Info(type.Name + " in der BootConfig hinter die benötigten Installer verschoben.");
                return true;
            }

            int insertAt = lastRequired >= 0 ? lastRequired + 1 : list.arraySize;
            if (insertAt >= list.arraySize)
            {
                list.arraySize++;
                insertAt = list.arraySize - 1;
            }
            else
            {
                list.InsertArrayElementAtIndex(insertAt);
            }

            list.GetArrayElementAtIndex(insertAt).objectReferenceValue = installer;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(bootConfig);
            report.Info(type.Name + " in die BootConfig eingetragen (Element " + insertAt + ").");
            return true;
        }
    }
}
