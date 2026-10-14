using System.Collections;
using System.Collections.Generic;
using System.Text;
using Aetherfall.EditorTools.Narrative;
using NUnit.Framework;
using UnityEngine.TestTools;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// CI check of architecture 7.6 no. 6: no asset of the project stores <c>[SerializeReference]</c> entries of a missing
    /// class (renamed without <c>[MovedFrom]</c>, deleted, or only in a test assembly). Needs the Unity editor (asset database),
    /// therefore a <c>[UnityTest]</c>: the compile check without Unity reports it as skipped. In the editor the same check
    /// runs per quest in "Aetherfall > Quests pruefen" (V14).
    /// </summary>
    [TestFixture]
    public sealed class MissingTypeAssetTests
    {
        private const string ProjectFolder = "Assets/_Project";

        [UnityTest]
        public IEnumerator ProjectAssets_StoreNoMissingSerializeReferenceTypes()
        {
            Assert.That(ManagedReferenceApi.CanReadMissingTypes, Is.True, "UnityEditor.SerializationUtility.GetManagedReferencesWithMissingTypes not found");

            List<KeyValuePair<string, List<MissingManagedType>>> affected = ManagedReferenceApi.FindAssetsWithMissingTypes(ProjectFolder);

            Assert.That(affected, Is.Empty, Describe(affected));
            yield break;
        }

        private static string Describe(List<KeyValuePair<string, List<MissingManagedType>>> affected)
        {
            var builder = new StringBuilder("Assets with missing [SerializeReference] types:");
            foreach (KeyValuePair<string, List<MissingManagedType>> asset in affected)
            {
                foreach (MissingManagedType missing in asset.Value)
                {
                    builder.Append('\n').Append(asset.Key).Append(": ").Append(missing);
                }
            }

            return builder.ToString();
        }
    }
}
