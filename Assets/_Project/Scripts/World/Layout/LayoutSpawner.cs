using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Enemy spawner; enemies stand on a ring around the centre (<see cref="LayoutPlacement.SpawnerPositions"/>).</summary>
    public sealed class LayoutSpawner
    {
        /// <summary>Spawner id (<c>spawn.</c>, GDD 02).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Enemy type id (<c>enemy.</c>).</summary>
        public string EnemyTypeId { get; internal set; } = string.Empty;

        /// <summary>Variant id, e.g. <c>normal</c> or <c>aether_verderbt</c>.</summary>
        public string Variant { get; internal set; } = string.Empty;

        /// <summary>Number of enemies.</summary>
        public int Count { get; internal set; }

        /// <summary>Id of a named enemy (<c>boss.</c>) or empty.</summary>
        public string BossId { get; internal set; } = string.Empty;

        /// <summary>Centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Radius of the group.</summary>
        public double Radius { get; internal set; }

        /// <summary>When the enemies exist.</summary>
        public SpawnActivation Activation { get; internal set; }

        /// <summary>Seconds until a dead enemy returns (0 = never).</summary>
        public double RespawnSeconds { get; internal set; }

        /// <summary>Location id the spawner belongs to.</summary>
        public string LocationId { get; internal set; } = string.Empty;

        /// <summary>Quest that activates it (activation quest).</summary>
        public string QuestId { get; internal set; } = string.Empty;

        /// <summary>Patrol points (may be empty).</summary>
        public IReadOnlyList<LayoutPoint> Patrol { get; internal set; } = Array.Empty<LayoutPoint>();

        /// <summary>Enemy type used until the real type exists, or empty.</summary>
        public string StandInTypeId { get; internal set; } = string.Empty;

        /// <summary>Variant of the stand-in type.</summary>
        public string StandInVariant { get; internal set; } = string.Empty;

        /// <summary>Area level of the group (GDD 03 9.7; elite +2, champion +3 on top); 0 = the area level of the region.</summary>
        public int Level { get; internal set; }

        /// <summary>Parts of a mixed group in order (empty: all of <see cref="EnemyTypeId"/> and <see cref="Variant"/>).</summary>
        public IReadOnlyList<LayoutSpawnMember> Members { get; internal set; } = Array.Empty<LayoutSpawnMember>();

        /// <summary>Type and variant of the enemy at a position of the group (members in order, then the main type).</summary>
        /// <param name="index">Position 0 … <see cref="Count"/> − 1.</param>
        /// <param name="variant">Variant at that position.</param>
        /// <returns>Enemy type id.</returns>
        public string MemberAt(int index, out string variant)
        {
            int start = 0;
            for (int i = 0; i < Members.Count; i++)
            {
                LayoutSpawnMember member = Members[i];
                if (index < start + member.Count)
                {
                    variant = member.Variant;
                    return member.EnemyTypeId;
                }

                start += member.Count;
            }

            variant = Variant;
            return EnemyTypeId;
        }

        /// <summary>Note (German).</summary>
        public string Note { get; internal set; } = string.Empty;
    }
}
