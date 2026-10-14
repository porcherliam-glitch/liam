using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Id and activation rule of an enemy group (spawner id from GDD 02, e.g. <c>spawn.eichental.nordhang_rudel</c>). Sits on the
    /// GameObject of the <c>EnemySpawner</c>. Groups with activation "Quest" are built inactive; the quest action
    /// <c>Gegner+(spawn-id)</c> switches them on (comes with the quests of the mini slice).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SpawnGroupMarker : MonoBehaviour
    {
        [Tooltip("Spawner-ID, z. B. spawn.eichental.nordhang_rudel (GDD 02).")]
        [SerializeField] private string spawnId = "spawn.region.name";

        [Tooltip("Gegnertyp laut GDD, z. B. enemy.wolf.grauwolf oder enemy.rissbrut.rissling.")]
        [SerializeField] private string enemyTypeId = string.Empty;

        [Tooltip("Variante, z. B. normal oder aether_verderbt.")]
        [SerializeField] private string variantId = "normal";

        [Tooltip("Benannter Gegner (boss.…) oder leer.")]
        [SerializeField] private string bossId = string.Empty;

        [Tooltip("Immer da (Wildtiere) oder erst durch eine Quest.")]
        [SerializeField] private SpawnActivation activation = SpawnActivation.Always;

        [Tooltip("Quest, die die Gruppe einschaltet (nur bei Aktivierung „Quest“).")]
        [SerializeField] private string questId = string.Empty;

        [Tooltip("True, wenn ein Platzhalter-Gegnertyp benutzt wird, weil es den echten Typ noch nicht gibt.")]
        [SerializeField] private bool usesStandIn;

        /// <summary>Spawner id.</summary>
        public string SpawnId => spawnId ?? string.Empty;

        /// <summary>Enemy type id from the GDD.</summary>
        public string EnemyTypeId => enemyTypeId ?? string.Empty;

        /// <summary>Variant id.</summary>
        public string VariantId => variantId ?? string.Empty;

        /// <summary>Named enemy id or empty.</summary>
        public string BossId => bossId ?? string.Empty;

        /// <summary>Activation rule.</summary>
        public SpawnActivation Activation => activation;

        /// <summary>Quest that activates the group.</summary>
        public string QuestId => questId ?? string.Empty;

        /// <summary>True if a stand-in enemy type is used.</summary>
        public bool UsesStandIn => usesStandIn;

        private void OnDrawGizmos()
        {
            Gizmos.color = activation == SpawnActivation.Always ? new Color(0.9f, 0.2f, 0.15f) : new Color(1f, 0.55f, 0.5f);
            Gizmos.DrawWireSphere(transform.position + Vector3.up * 0.5f, 1.2f);
        }
    }
}
