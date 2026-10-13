// Global events of the combat system (architecture 4.3, events #10, #11 and #12). Several event structs of one area may
// share a file (architecture 15.2, rule 18). Payloads exactly as in table 4.3: only IDs, numbers, enums and Vector3.

using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player entered or left combat (GDD 05 5.2: an enemy targets the player, or damage dealt or taken in the last
    /// 5 s). Receivers: save system (save lock), audio, UI.
    /// </summary>
    public readonly struct CombatStateChanged : IGameEvent
    {
        /// <summary>True while in combat.</summary>
        public readonly bool InCombat;

        /// <summary>Creates the event.</summary>
        /// <param name="inCombat">True while in combat.</param>
        public CombatStateChanged(bool inCombat)
        {
            InCombat = inCombat;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CombatStateChanged(inCombat=" + InCombat + ")";
        }
    }

    /// <summary>
    /// A hit dealt damage (architecture 4.3, event #10). Sender: Combat (combat service, after the damage calculation).
    /// Receivers: UI (damage numbers), AI, telemetry. Not sent for evaded or parried hits (no damage).
    /// </summary>
    public readonly struct DamageDealt : IGameEvent
    {
        /// <summary>Id of the attacker (<c>player</c> or the unique id of an enemy).</summary>
        public readonly string AttackerId;

        /// <summary>Id of the target.</summary>
        public readonly string TargetId;

        /// <summary>Damage of the hit after block, armor and resistances (rounded; on the killing blow it may exceed the health that was left).</summary>
        public readonly int Amount;

        /// <summary>Main damage type of the hit.</summary>
        public readonly DamageType DamageType;

        /// <summary>True for a critical hit.</summary>
        public readonly bool IsCritical;

        /// <summary>Hurtbox zone that was hit.</summary>
        public readonly HitZone Zone;

        /// <summary>Creates the event.</summary>
        /// <param name="attackerId">Id of the attacker.</param>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="amount">Damage of the hit after all reductions.</param>
        /// <param name="damageType">Main damage type.</param>
        /// <param name="isCritical">True for a critical hit.</param>
        /// <param name="zone">Hit zone.</param>
        public DamageDealt(string attackerId, string targetId, int amount, DamageType damageType, bool isCritical, HitZone zone)
        {
            AttackerId = attackerId ?? string.Empty;
            TargetId = targetId ?? string.Empty;
            Amount = amount;
            DamageType = damageType;
            IsCritical = isCritical;
            Zone = zone;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DamageDealt(" + AttackerId + " -> " + TargetId + ": " + Amount + " " + DamageType + (IsCritical ? " crit" : string.Empty) +
                   ", " + Zone + ")";
        }
    }

    /// <summary>
    /// An enemy died (architecture 4.3, event #12, exactly 64 bytes). Sender: the AI adapter <c>EnemyDeathReporter</c>,
    /// which listens to the enemy's health. Receivers: quests, world state, progression (XP_Kill, GDD 03 12.7), inventory
    /// (drops), telemetry.
    /// </summary>
    public readonly struct EnemyKilled : IGameEvent
    {
        /// <summary>Type id of the enemy, e.g. <c>enemy.wolf.grauwolf</c>.</summary>
        public readonly string EnemyTypeId;

        /// <summary>Variant id, e.g. <c>normal</c> or <c>aether_verderbt</c>.</summary>
        public readonly string VariantId;

        /// <summary>Unique id of the enemy instance (spawner or scene object).</summary>
        public readonly string UniqueId;

        /// <summary>Id of the killer (<c>player</c>, a companion id …).</summary>
        public readonly string KillerId;

        /// <summary>Id of the region the enemy died in (empty until the world system exists).</summary>
        public readonly string RegionId;

        /// <summary>Loot table of the enemy type (from the enemy type definition; empty for now).</summary>
        public readonly string LootTableId;

        /// <summary>Level of the enemy (for XP_Kill, GDD 03 12.7).</summary>
        public readonly int EnemyLevel;

        /// <summary>World position of the enemy at death.</summary>
        public readonly Vector3 Position;

        /// <summary>Creates the event (architecture 4.3 signature).</summary>
        /// <param name="type">Enemy type id.</param>
        /// <param name="variant">Variant id.</param>
        /// <param name="uid">Unique id.</param>
        /// <param name="killer">Killer id.</param>
        /// <param name="region">Region id.</param>
        /// <param name="lootTable">Loot table id.</param>
        /// <param name="level">Enemy level.</param>
        /// <param name="pos">Position.</param>
        public EnemyKilled(string type, string variant, string uid, string killer, string region, string lootTable, int level, Vector3 pos)
        {
            EnemyTypeId = type ?? string.Empty;
            VariantId = variant ?? string.Empty;
            UniqueId = uid ?? string.Empty;
            KillerId = killer ?? string.Empty;
            RegionId = region ?? string.Empty;
            LootTableId = lootTable ?? string.Empty;
            EnemyLevel = level;
            Position = pos;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "EnemyKilled(" + EnemyTypeId + "/" + VariantId + " '" + UniqueId + "' by '" + KillerId + "', level " + EnemyLevel + ")";
        }
    }
}
