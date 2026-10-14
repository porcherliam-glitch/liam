using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Building kit from Blender (<c>Hausteile.fbx</c>, own work from <c>Tools/Blender/build_characters.py</c>): windows with frame
    /// and open shutters, plank door with iron fittings and step, their burned versions, chimney, barrel, crate, woodpile and
    /// bridge parts (plank, post, rail, stone parapet). Every piece has its origin at its attachment point and faces +Z (away
    /// from the wall); <see cref="Place"/> copies one onto a generated building or bridge and swaps the material slots
    /// "Haus_&lt;Platz&gt;" for the village materials.
    /// </summary>
    public sealed class EichentalHouseKit
    {
        /// <summary>Folder of the building kit.</summary>
        public const string Folder = "Assets/_Project/Art/Models/Buildings";

        /// <summary>Path of the kit.</summary>
        public const string Path = Folder + "/Hausteile.fbx";

        private readonly Dictionary<string, GameObject> _pieces = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, Material> _slots = new Dictionary<string, Material>();

        private EichentalHouseKit()
        {
        }

        /// <summary>Loads the kit, or returns null with a warning (the generators then keep their boxes).</summary>
        /// <param name="materials">Village materials.</param>
        /// <param name="report">Protocol.</param>
        public static EichentalHouseKit Load(EichentalMaterials materials, TestGroundReport report)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(Path);
            if (model == null)
            {
                report.Warning("Bausatz fehlt: " + Path + " (Blender-Skript Tools/Blender/build_characters.py ausführen) – Häuser behalten ihre Kästen.");
                return null;
            }

            GeneratorAssetPins.Hold(model, Path);
            var kit = new EichentalHouseKit();
            foreach (Transform piece in model.transform)
            {
                kit._pieces[piece.name] = piece.gameObject;
            }

            kit._slots["Haus_Holz"] = materials.Get("wood", 0.25f);
            kit._slots["Haus_Rahmen"] = materials.Get("woodDark", 0.25f);
            kit._slots["Haus_Glas"] = materials.Fixed("window", new Color(0.08f, 0.07f, 0.07f), 0.5f);
            kit._slots["Haus_Laden"] = materials.Fixed("shutter", new Color(0.33f, 0.42f, 0.36f), 0.3f);
            kit._slots["Haus_Tuer"] = materials.Fixed("door", new Color(0.25f, 0.16f, 0.1f), 0.25f);
            kit._slots["Haus_Eisen"] = materials.Fixed("iron", new Color(0.37f, 0.38f, 0.4f), 0.6f, 0.6f);
            kit._slots["Haus_Stein"] = materials.Get("stone", 0.15f);
            kit._slots["Haus_Verkohlt"] = materials.Get("burnedWood", 0.25f);
            kit._slots["Haus_Russ"] = materials.Fixed("soot", new Color(0.12f, 0.1f, 0.09f), 0.05f);
            report.Info("Bausatz geladen: " + kit._pieces.Count + " Teile (" + string.Join(", ", kit._pieces.Keys) + ").");
            return kit;
        }

        /// <summary>Places a copy of a piece under <paramref name="parent"/>.</summary>
        /// <param name="name">Piece name, e.g. "Fenster".</param>
        /// <param name="parent">Building or bridge root.</param>
        /// <param name="localPosition">Attachment point in the parent.</param>
        /// <param name="yaw">Turn around Y in degrees (0 = the piece faces the parent's +Z).</param>
        /// <param name="scale">Scale of the piece.</param>
        /// <returns>The copy, or null if the kit has no such piece.</returns>
        public GameObject Place(string name, Transform parent, Vector3 localPosition, float yaw, Vector3 scale)
        {
            if (!_pieces.TryGetValue(name, out GameObject source))
            {
                return null;
            }

            var copy = Object.Instantiate(source, parent, false);
            copy.name = name;
            copy.transform.localPosition = localPosition;
            copy.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            copy.transform.localScale = scale;
            copy.layer = parent.gameObject.layer;
            if (copy.TryGetComponent(out Renderer renderer))
            {
                Material[] materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    if (materials[i] != null && _slots.TryGetValue(materials[i].name, out Material village))
                    {
                        materials[i] = village;
                    }
                }

                renderer.sharedMaterials = materials;
            }

            return copy;
        }
    }
}
