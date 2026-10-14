using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Keeps all generated meshes of the Eichental as sub-assets of one file (<see cref="EichentalPaths.MeshLibraryPath"/>), so the
    /// scene references real assets. The file is recreated on every run: the meshes are derived from the layout and the scene
    /// is rebuilt with them.
    /// </summary>
    public sealed class EichentalMeshLibrary
    {
        private readonly Dictionary<string, Mesh> _meshes = new Dictionary<string, Mesh>(StringComparer.Ordinal);
        private readonly Object _container;

        /// <summary>Deletes the old library and starts a new, empty one.</summary>
        /// <param name="report">Protocol.</param>
        public EichentalMeshLibrary(TestGroundReport report)
        {
            if (AssetDatabase.LoadAssetAtPath<Object>(EichentalPaths.MeshLibraryPath) != null)
            {
                AssetDatabase.DeleteAsset(EichentalPaths.MeshLibraryPath);
            }

            var container = new Mesh { name = "EichentalMeshes" };
            AssetDatabase.CreateAsset(container, EichentalPaths.MeshLibraryPath);
            _container = container;
            report.Info("Mesh-Bibliothek neu angelegt: " + EichentalPaths.MeshLibraryPath);
        }

        /// <summary>Number of meshes.</summary>
        public int Count => _meshes.Count;

        /// <summary>Returns the mesh with this key, creating and storing it on first use.</summary>
        /// <param name="key">Unique name of the mesh.</param>
        /// <param name="create">Creates the mesh.</param>
        public Mesh Get(string key, Func<Mesh> create)
        {
            if (_meshes.TryGetValue(key, out Mesh mesh))
            {
                return mesh;
            }

            mesh = create();
            mesh.name = key;
            AssetDatabase.AddObjectToAsset(mesh, _container);
            _meshes.Add(key, mesh);
            return mesh;
        }

        /// <summary>Stores a mesh that is used only once (e.g. a fence or a field).</summary>
        /// <param name="key">Unique name.</param>
        /// <param name="builder">Builder with the geometry.</param>
        public Mesh Add(string key, EichentalMeshBuilder builder)
        {
            return Get(key, () => builder.ToMesh(key));
        }
    }
}
