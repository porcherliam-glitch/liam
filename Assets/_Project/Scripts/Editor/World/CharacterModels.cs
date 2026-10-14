using System.Text;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The character models from <c>Tools/Blender/build_characters.py</c> (own work, see the license register) and a batch check of
    /// their axes: in Unity the model must look along +Z, its right side (".R" parts) must lie at +X and the feet on y = 0.
    /// </summary>
    public static class CharacterModels
    {
        /// <summary>Folder of the exported FBX files.</summary>
        public const string Folder = "Assets/_Project/Art/Models/Characters";

        /// <summary>Player character (warrior).</summary>
        public const string Warrior = Folder + "/Krieger.fbx";

        /// <summary>Sword of the starting kit.</summary>
        public const string Sword = Folder + "/Schwert.fbx";

        /// <summary>Wooden shield of the starting kit.</summary>
        public const string WoodenShield = Folder + "/Holzschild.fbx";

        /// <summary>Apprentice staff of the mage (crystal slot "Stab_Kristall_Leuchten").</summary>
        public const string Staff = Folder + "/Zauberstab.fbx";

        /// <summary>Grey wolf.</summary>
        public const string Wolf = Folder + "/Wolf.fbx";

        /// <summary>Aether wolf (dark fur, glowing eyes and crystals; materials "…_Leuchten" glow in Unity).</summary>
        public const string AetherWolf = Folder + "/AetherWolf.fbx";

        /// <summary>Base villager with optional pieces ("Acc_<Name>@<Joint>") and colour-slot materials ("Dorf_<Slot>").</summary>
        public const string Villager = Folder + "/Dorfbewohner.fbx";

        /// <summary>Skeleton warrior of the crypt (material slots "Gruft_…").</summary>
        public const string Skeleton = Folder + "/Skelett.fbx";

        /// <summary>Der Wachende Ritter (built at 1.8 m, scaled by the crypt builder).</summary>
        public const string Knight = Folder + "/Ritter.fbx";

        /// <summary>Tower shield of the elite skeletons and the knight.</summary>
        public const string TowerShield = Folder + "/Turmschild.fbx";

        /// <summary>Loads a model (the FBX root object), or null with a warning.</summary>
        /// <param name="path">Asset path.</param>
        /// <param name="report">Protocol.</param>
        public static GameObject Load(string path, TestGroundReport report)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (model == null)
            {
                report.Warning("Modell fehlt: " + path + " (Blender-Skript Tools/Blender/build_characters.py ausführen).");
            }

            return model;
        }

        /// <summary>
        /// Batch (<c>-executeMethod Aetherfall.EditorTools.World.CharacterModels.CheckBatch</c>): imports the folder again and logs
        /// every part with position, rotation and mesh centre, plus the three axis checks. Exit code 1 if a check fails.
        /// </summary>
        public static void CheckBatch()
        {
            AssetDatabase.ImportAsset(Folder, ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate);
            bool ok = true;
            foreach (string path in new[] { Warrior, Sword, WoodenShield, Wolf, AetherWolf, Villager, Skeleton, Knight, TowerShield })
            {
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (model == null)
                {
                    Debug.LogError("[Modelle] fehlt: " + path);
                    ok = false;
                    continue;
                }

                var text = new StringBuilder("[Modelle] " + path + "\n");
                foreach (Transform part in model.GetComponentsInChildren<Transform>(true))
                {
                    text.Append("  ").Append(part.name).Append(" pos ").Append(part.position.ToString("F3")).Append(" rot ")
                        .Append(part.rotation.eulerAngles.ToString("F1"));
                    if (part.TryGetComponent(out MeshFilter filter) && filter.sharedMesh != null)
                    {
                        text.Append(" mesh-mitte ").Append(filter.sharedMesh.bounds.center.ToString("F3"));
                    }

                    text.Append('\n');
                }

                Debug.Log(text.ToString());
            }

            var warrior = AssetDatabase.LoadAssetAtPath<GameObject>(Warrior);
            if (warrior != null)
            {
                Transform shin = Find(warrior.transform, "Shin.R");
                Transform arm = Find(warrior.transform, "UpperArm.R");
                Transform head = Find(warrior.transform, "Head");
                bool forward = shin != null && shin.TransformPoint(shin.GetComponent<MeshFilter>().sharedMesh.bounds.center).z > shin.position.z;
                bool right = arm != null && arm.position.x > 0f;
                bool up = head != null && head.position.y > 1.3f;
                Debug.Log("[Modelle] Krieger: Blick +Z " + forward + ", rechts +X " + right + ", Kopf oben " + up + ".");
                ok &= forward && right && up;
            }

            EditorApplication.Exit(ok ? 0 : 1);
        }

        /// <summary>
        /// Joint chains of the models: part → parent part (the FBX parts are flat, see build_characters.py). Humanoids and four-legged
        /// animals share the list ("Head" hangs on "Torso" in both); parts a model does not have are skipped.
        /// </summary>
        private static readonly string[,] HumanoidChain =
        {
            { "Torso", "Pelvis" }, { "Head", "Torso" }, { "UpperArm.R", "Torso" }, { "Forearm.R", "UpperArm.R" }, { "UpperArm.L", "Torso" },
            { "Forearm.L", "UpperArm.L" }, { "Thigh.R", "Pelvis" }, { "Shin.R", "Thigh.R" }, { "Thigh.L", "Pelvis" }, { "Shin.L", "Thigh.L" },
            { "Tail", "Torso" }, { "FrontUpper.L", "Torso" }, { "FrontLower.L", "FrontUpper.L" }, { "FrontUpper.R", "Torso" },
            { "FrontLower.R", "FrontUpper.R" }, { "HindUpper.L", "Torso" }, { "HindLower.L", "HindUpper.L" }, { "HindUpper.R", "Torso" },
            { "HindLower.R", "HindUpper.R" }
        };

        /// <summary>
        /// Places a copy of a model under <paramref name="parent"/> (local origin, no prefab link), rebuilds the joint chain of
        /// humanoids and puts every part on <paramref name="layer"/>.
        /// </summary>
        /// <param name="path">Model path.</param>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name of the copy.</param>
        /// <param name="layer">Layer or −1 to keep the parent's.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The model root, or null if the model is missing.</returns>
        public static Transform Instantiate(string path, Transform parent, string name, int layer, TestGroundReport report)
        {
            GameObject model = Load(path, report);
            if (model == null)
            {
                return null;
            }

            var copy = (GameObject)Object.Instantiate(model);
            copy.name = name;
            copy.transform.SetParent(parent, false);
            copy.transform.localPosition = Vector3.zero;
            copy.transform.localRotation = Quaternion.identity;
            for (int i = 0; i < HumanoidChain.GetLength(0); i++)
            {
                Transform part = Find(copy.transform, HumanoidChain[i, 0]);
                Transform joint = Find(copy.transform, HumanoidChain[i, 1]);
                if (part != null && joint != null)
                {
                    part.SetParent(joint, true);
                }
            }

            // Optional pieces name their joint after "@" (e.g. "Acc_Bart@Head"); they keep the name before it.
            foreach (Transform part in copy.GetComponentsInChildren<Transform>(true))
            {
                int at = part.name.IndexOf('@');
                Transform joint = at > 0 ? Find(copy.transform, part.name.Substring(at + 1)) : null;
                if (joint != null)
                {
                    part.name = part.name.Substring(0, at);
                    part.SetParent(joint, true);
                }
            }

            int target = layer >= 0 ? layer : parent.gameObject.layer;
            foreach (Transform part in copy.GetComponentsInChildren<Transform>(true))
            {
                part.gameObject.layer = target;
            }

            return copy.transform;
        }

        /// <summary>Finds a part by name anywhere below <paramref name="root"/>.</summary>
        /// <param name="root">Model root.</param>
        /// <param name="name">Part name, e.g. "Forearm.R".</param>
        public static Transform Find(Transform root, string name)
        {
            foreach (Transform part in root.GetComponentsInChildren<Transform>(true))
            {
                if (part.name == name)
                {
                    return part;
                }
            }

            return null;
        }
    }
}
