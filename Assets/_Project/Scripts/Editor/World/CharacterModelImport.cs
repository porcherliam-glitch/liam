using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Import settings of the character models from <c>Tools/Blender/build_characters.py</c> (folder
    /// <see cref="CharacterModels.Folder"/>, building kit <see cref="EichentalHouseKit.Folder"/>): metres, Blender axes baked into the
    /// vertices (no −90° root rotation), no rig, no
    /// animation, no cameras or lights; materials from the FBX colours (URP turns them into Lit materials).
    /// </summary>
    public sealed class CharacterModelImport : AssetPostprocessor
    {
        private void OnPreprocessModel()
        {
            bool ours = assetPath.StartsWith(CharacterModels.Folder + "/", System.StringComparison.Ordinal) ||
                        assetPath.StartsWith(EichentalHouseKit.Folder + "/", System.StringComparison.Ordinal);
            if (!ours || !(assetImporter is ModelImporter importer))
            {
                return;
            }

            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.bakeAxisConversion = true;
            importer.animationType = ModelImporterAnimationType.None;
            importer.importAnimation = false;
            importer.importCameras = false;
            importer.importLights = false;
            importer.importBlendShapes = false;
            importer.importVisibility = false;
            importer.isReadable = false;
            importer.addCollider = false;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.importNormals = ModelImporterNormals.Import;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
        }
    }
}
