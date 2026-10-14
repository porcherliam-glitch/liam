using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Id and activation rule of an enemy group (spawner id from GDD 02, e.g. <c>spawn.eichental.nordhang_rudel</c>). The marker
    /// stays active and registers with the <see cref="ISpawnGroupRegistry"/>; the enemies and their <c>EnemySpawner</c> sit on the
    /// child <see cref="Group"/>. Groups with activation "Quest" keep that child switched off until the quest action
    /// <c>Gegner+(spawn-id)</c> (<see cref="SpawnEncounter"/>) activates them. Activated and defeated groups are saved (section
    /// <c>spawners</c>), so a pack that a quest stage called stays there after loading.
    /// </summary>
    /// <remarks>GameObject: the root "Gegner … (spawn id)" created by "Aetherfall > Eichental erstellen"; child "Gruppe".</remarks>
    [DisallowMultipleComponent]
    public sealed class SpawnGroupMarker : MonoBehaviour, ISpawnGroup
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

        [Tooltip("Kind-Objekt mit den Gegnern und dem EnemySpawner. Bei Aktivierung „Quest“ ausgeschaltet, bis die Quest es einschaltet.")]
        [SerializeField] private GameObject group;

        private ISpawnGroupRegistry _registry;
        private bool _registered;

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

        /// <summary>Child object with the enemies (may be null in hand-made scenes).</summary>
        public GameObject Group => group;

        /// <summary>True while the enemies are shown.</summary>
        public bool IsGroupActive => group != null && group.activeSelf;

        /// <inheritdoc />
        public void SetGroupActive(bool active)
        {
            if (group != null && group.activeSelf != active)
            {
                group.SetActive(active);
            }
        }

        /// <summary>
        /// Switches the group on through the registry (so it is saved); without a registry (no WorldInstaller in the BootConfig)
        /// only in this scene.
        /// </summary>
        public void Activate()
        {
            if (_registry != null)
            {
                _registry.Activate(SpawnId);
            }
            else
            {
                SetGroupActive(true);
            }
        }

        /// <summary>Called by the group's spawner when all its enemies are dead and none come back.</summary>
        public void ReportCleared()
        {
            if (_registry != null)
            {
                _registry.MarkCleared(SpawnId);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _registry = await Services.WaitForAsync<ISpawnGroupRegistry>(destroyCancellationToken);
                Register();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "SpawnGroupMarker '" + SpawnId + "' could not resolve ISpawnGroupRegistry.");
            }
        }

        private void OnEnable()
        {
            Register();
        }

        private void OnDisable()
        {
            if (_registered)
            {
                _registry.Unregister(this);
                _registered = false;
            }
        }

        private void Register()
        {
            if (_registered || _registry == null || !isActiveAndEnabled)
            {
                return;
            }

            _registry.Register(this);
            _registered = true;
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = activation == SpawnActivation.Always ? new Color(0.9f, 0.2f, 0.15f) : new Color(1f, 0.55f, 0.5f);
            Gizmos.DrawWireSphere(transform.position + Vector3.up * 0.5f, 1.2f);
        }
    }
}
