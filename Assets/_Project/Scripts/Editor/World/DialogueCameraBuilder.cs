using Aetherfall.Cinematics;
using Aetherfall.Cinematics.Playback;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Puts the dialogue cameras into the boot scene (S58): the object "Dialogkamera" with <see cref="DialogueCameraRig"/> and
    /// three Cinemachine cameras without body or aim (CM_Dialog_A shot and close-up, CM_Dialog_B reverse shot, CM_Dialog_Wide
    /// two-shot), priority 40, switched off until a conversation needs them. Living in the boot scene, they work in every world
    /// scene without regenerating it. Idempotent: an existing rig keeps its object and only gets its references refreshed.
    /// </summary>
    public static class DialogueCameraBuilder
    {
        /// <summary>Name of the rig object.</summary>
        public const string RigName = "Dialogkamera";

        /// <summary>Name of the shot camera.</summary>
        public const string ShotName = "CM_Dialog_A";

        /// <summary>Name of the reverse shot camera.</summary>
        public const string ReverseName = "CM_Dialog_B";

        /// <summary>Name of the two-shot camera.</summary>
        public const string WideName = "CM_Dialog_Wide";

        /// <summary>Creates or refreshes the rig in the open boot scene (the caller saves the scene).</summary>
        /// <param name="boot">Boot scene.</param>
        /// <param name="report">Protocol.</param>
        public static void Ensure(Scene boot, TestGroundReport report)
        {
            DialogueCameraRig rig = null;
            GameObject[] roots = boot.GetRootGameObjects();
            for (int i = 0; i < roots.Length && rig == null; i++)
            {
                rig = roots[i].GetComponentInChildren<DialogueCameraRig>(true);
            }

            if (rig == null)
            {
                var rigObject = new GameObject(RigName);
                SceneManager.MoveGameObjectToScene(rigObject, boot);
                rig = rigObject.AddComponent<DialogueCameraRig>();
                report.Info("Boot-Szene: Objekt „" + RigName + "“ mit DialogueCameraRig angelegt.");
            }

            TestGroundFields.SetReference(rig, "shotCamera", EnsureCamera(rig.transform, ShotName, DialogueCameraRules.ShotFieldOfView), report);
            TestGroundFields.SetReference(rig, "reverseCamera", EnsureCamera(rig.transform, ReverseName, DialogueCameraRules.ShotFieldOfView), report);
            TestGroundFields.SetReference(rig, "wideCamera", EnsureCamera(rig.transform, WideName, DialogueCameraRules.WideFieldOfView), report);
            int mask = 0;
            foreach (string layer in new[] { TestGroundPaths.EnvironmentLayerName, EichentalPaths.TerrainLayerName })
            {
                int index = LayerMask.NameToLayer(layer);
                if (index >= 0)
                {
                    mask |= 1 << index;
                }
            }

            TestGroundFields.SetInt(rig, "obstacles", mask, report);
            report.Info("Dialogkamera: " + ShotName + ", " + ReverseName + ", " + WideName + " (Priorität " + DialogueCameraRules.CameraPriority +
                        ", Sichtprüfung gegen Umgebung und Gelände).");
        }

        private static CinemachineCamera EnsureCamera(Transform parent, string name, double fieldOfView)
        {
            Transform child = parent.Find(name);
            GameObject cameraObject = child != null ? child.gameObject : new GameObject(name);
            cameraObject.transform.SetParent(parent, false);
            if (!cameraObject.TryGetComponent(out CinemachineCamera vcam))
            {
                vcam = cameraObject.AddComponent<CinemachineCamera>();
            }

            vcam.Priority = DialogueCameraRules.CameraPriority;
            LensSettings lens = vcam.Lens;
            lens.FieldOfView = (float)fieldOfView;
            lens.NearClipPlane = 0.1f;
            vcam.Lens = lens;
            vcam.enabled = false;
            return vcam;
        }
    }
}
