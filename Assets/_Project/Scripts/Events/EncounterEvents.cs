// Global combat events of named enemies and abilities (architecture 4.3, "Weitere verbindliche Event-Namen", area Kampf:
// EnemyDefeated, BossDefeated, AbilityUsedAt). Several event structs of one area may share a file (architecture 15.2,
// rule 18). Senders: AI (defeat, bosses) and the ability system (later steps).

using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Events
{
    /// <summary>
    /// An enemy was beaten without being killed (surrendered, knocked out; GDD 02 5.1 type 2 "bezwingen"). Receivers: quests.
    /// </summary>
    public readonly struct EnemyDefeated : IGameEvent
    {
        /// <summary>Enemy type id, e.g. <c>enemy.bandit.schlaeger</c>.</summary>
        public readonly string EnemyTypeId;

        /// <summary>Unique id of the beaten enemy (spawner, boss or NPC id).</summary>
        public readonly string UniqueId;

        /// <summary>Region id (empty until the world system exists).</summary>
        public readonly string RegionId;

        /// <summary>Creates the event.</summary>
        /// <param name="enemyTypeId">Enemy type id.</param>
        /// <param name="uniqueId">Unique id.</param>
        /// <param name="regionId">Region id.</param>
        public EnemyDefeated(string enemyTypeId, string uniqueId, string regionId)
        {
            EnemyTypeId = enemyTypeId ?? string.Empty;
            UniqueId = uniqueId ?? string.Empty;
            RegionId = regionId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "EnemyDefeated(" + EnemyTypeId + " #" + UniqueId + ")";
        }
    }

    /// <summary>A boss or mini boss was beaten (architecture 4.3; boss music, autosave, quests). Sender: AI.</summary>
    public readonly struct BossDefeated : IGameEvent
    {
        /// <summary>Boss id, e.g. <c>boss.eichental.glutfang</c>.</summary>
        public readonly string BossId;

        /// <summary>Creates the event.</summary>
        /// <param name="bossId">Boss id.</param>
        public BossDefeated(string bossId)
        {
            BossId = bossId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossDefeated(" + BossId + ")";
        }
    }

    /// <summary>
    /// The player used an ability at a target or place (GDD 02 5.1 type 25 "Setze Faehigkeit ein"). Receivers: quests, world
    /// objects.
    /// </summary>
    public readonly struct AbilityUsedAt : IGameEvent
    {
        /// <summary>Ability id, e.g. <c>ability.aether.aether_stoss</c>.</summary>
        public readonly string AbilityId;

        /// <summary>Id of the hit target (object, NPC or enemy id); empty if nothing was hit.</summary>
        public readonly string TargetId;

        /// <summary>World position of the use.</summary>
        public readonly Vector3 Position;

        /// <summary>Creates the event.</summary>
        /// <param name="abilityId">Ability id.</param>
        /// <param name="targetId">Target id or empty.</param>
        /// <param name="position">World position.</param>
        public AbilityUsedAt(string abilityId, string targetId, Vector3 position)
        {
            AbilityId = abilityId ?? string.Empty;
            TargetId = targetId ?? string.Empty;
            Position = position;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "AbilityUsedAt(" + AbilityId + " -> " + TargetId + ")";
        }
    }
}
