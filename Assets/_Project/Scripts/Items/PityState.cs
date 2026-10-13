using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Bad luck protection counters (GDD 04 5.5, architecture 11.6 "Bad-Luck-Zaehler (im Save)"):
    /// <para>Legendary counter Z_L: +1 per random equipment drop with item level ≥ 10 that is not legendary;
    /// <c>M_Pity = 1 + 0.04 × max(0; Z_L − 50)</c>; at Z_L = 200 the next such drop is legendary; reset to 0 by every random
    /// legendary (fixed legendaries do not reset).</para>
    /// <para>Mythic counter Z_M (world tier ≥ 1): +1 per random legendary that did not become mythic; mythic share ×
    /// <c>(1 + 0.1 × max(0; Z_M − 10))</c>; at Z_M = 30 the next legendary is mythic; reset by a mythic.</para>
    /// </summary>
    /// <remarks>Plain state, saved by the inventory section (<c>inventory</c>, load order 50).</remarks>
    public sealed class PityState
    {
        /// <summary>Drops without legendary before the weight starts to rise (50).</summary>
        public const int LegendaryThreshold = 50;

        /// <summary>Weight increase per drop above the threshold (0.04).</summary>
        public const float LegendaryStep = 0.04f;

        /// <summary>Counter value that guarantees the next legendary (200).</summary>
        public const int LegendaryGuarantee = 200;

        /// <summary>Only drops from this item level on count (below, legendary cannot drop randomly).</summary>
        public const int MinItemLevel = 10;

        /// <summary>Legendaries without mythic before the share starts to rise (10).</summary>
        public const int MythicThreshold = 10;

        /// <summary>Share increase per legendary above the threshold (0.1).</summary>
        public const float MythicStep = 0.1f;

        /// <summary>Counter value that guarantees the next mythic (30).</summary>
        public const int MythicGuarantee = 30;

        /// <summary>Z_L: random equipment drops (item level ≥ 10) since the last random legendary.</summary>
        public int LegendaryCounter { get; private set; }

        /// <summary>Z_M: random legendaries since the last mythic (world tier ≥ 1).</summary>
        public int MythicCounter { get; private set; }

        /// <summary>M_Pity = 1 + 0.04 × max(0; Z_L − 50).</summary>
        public float LegendaryMultiplier => 1f + LegendaryStep * Math.Max(0, LegendaryCounter - LegendaryThreshold);

        /// <summary>True from Z_L = 200 on: the next counted drop is legendary.</summary>
        public bool LegendaryGuaranteed => LegendaryCounter >= LegendaryGuarantee;

        /// <summary>Factor on the mythic share: 1 + 0.1 × max(0; Z_M − 10).</summary>
        public float MythicMultiplier => 1f + MythicStep * Math.Max(0, MythicCounter - MythicThreshold);

        /// <summary>True from Z_M = 30 on: the next legendary becomes mythic.</summary>
        public bool MythicGuaranteed => MythicCounter >= MythicGuarantee;

        /// <summary>Counts a random equipment drop (only item level ≥ 10): legendary or mythic resets Z_L, anything else adds 1.</summary>
        /// <param name="rarity">Rarity of the drop.</param>
        /// <param name="itemLevel">Item level of the drop.</param>
        public void RecordEquipmentDrop(ItemRarity rarity, int itemLevel)
        {
            if (itemLevel < MinItemLevel)
            {
                return;
            }

            if (rarity == ItemRarity.Legendary || rarity == ItemRarity.Mythic)
            {
                LegendaryCounter = 0;
            }
            else
            {
                LegendaryCounter++;
            }
        }

        /// <summary>Counts a random legendary for the mythic counter (world tier ≥ 1 only).</summary>
        /// <param name="becameMythic">True if it was upgraded to mythic.</param>
        public void RecordLegendary(bool becameMythic)
        {
            MythicCounter = becameMythic ? 0 : MythicCounter + 1;
        }

        /// <summary>Sets both counters (loading a save); negative values become 0.</summary>
        /// <param name="legendaryCounter">Z_L.</param>
        /// <param name="mythicCounter">Z_M.</param>
        public void Restore(int legendaryCounter, int mythicCounter)
        {
            LegendaryCounter = Math.Max(0, legendaryCounter);
            MythicCounter = Math.Max(0, mythicCounter);
        }
    }
}
