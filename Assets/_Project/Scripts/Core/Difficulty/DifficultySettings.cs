namespace Aetherfall.Core
{
    /// <summary>
    /// The factors of one difficulty level (GDD 03 9.7 table): enemy damage, health and poise, status build-up on the player,
    /// parry window, extra i-frames of the roll, telegraph length, attack tokens, enemy cooldowns, healing, fall damage and the
    /// loot rarity bonus. Experience is the same on every level. Pure C#.
    /// </summary>
    public sealed class DifficultySettings
    {
        private static readonly DifficultySettings StoryLevel = new DifficultySettings(DifficultyLevel.Story, "Geschichte", 0.5f, 0.7f, 0.7f, 0.5f, 0.25f,
            0.1f, 1.5f, 1, 1, 1.3f, 1.5f, 0.5f, 0);

        private static readonly DifficultySettings NormalLevel = new DifficultySettings(DifficultyLevel.Normal, "Normal", 1f, 1f, 1f, 1f, 0.15f, 0f, 1f, 2, 2,
            1f, 1f, 1f, 0);

        private static readonly DifficultySettings HardLevel = new DifficultySettings(DifficultyLevel.Hard, "Schwer", 1.35f, 1.25f, 1.15f, 1.25f, 0.12f, 0f, 1f,
            3, 2, 0.9f, 1f, 1f, 5);

        private static readonly DifficultySettings NightmareLevel = new DifficultySettings(DifficultyLevel.Nightmare, "Albtraum", 1.8f, 1.6f, 1.3f, 1.5f, 0.1f,
            -0.05f, 0.9f, 3, 3, 0.8f, 0.8f, 1.25f, 10);

        private DifficultySettings(DifficultyLevel level, string name, float enemyDamage, float enemyHealth, float enemyPoise, float statusOnPlayer,
            float parryWindowSeconds, float rollIFrameBonus, float telegraphFactor, int meleeTokens, int rangedTokens, float enemyCooldownFactor,
            float healingFactor, float fallDamageFactor, int lootRarityBonus)
        {
            Level = level;
            Name = name;
            EnemyDamage = enemyDamage;
            EnemyHealth = enemyHealth;
            EnemyPoise = enemyPoise;
            StatusOnPlayer = statusOnPlayer;
            ParryWindowSeconds = parryWindowSeconds;
            RollIFrameBonus = rollIFrameBonus;
            TelegraphFactor = telegraphFactor;
            MeleeTokens = meleeTokens;
            RangedTokens = rangedTokens;
            EnemyCooldownFactor = enemyCooldownFactor;
            HealingFactor = healingFactor;
            FallDamageFactor = fallDamageFactor;
            LootRarityBonus = lootRarityBonus;
        }

        /// <summary>Level.</summary>
        public DifficultyLevel Level { get; }

        /// <summary>German name for the options.</summary>
        public string Name { get; }

        /// <summary>Factor on the damage of enemies (G: 0.5 / 1 / 1.35 / 1.8).</summary>
        public float EnemyDamage { get; }

        /// <summary>Factor on the health of enemies (0.7 / 1 / 1.25 / 1.6).</summary>
        public float EnemyHealth { get; }

        /// <summary>Factor on the poise of enemies (0.7 / 1 / 1.15 / 1.3).</summary>
        public float EnemyPoise { get; }

        /// <summary>Factor on status build-up on the player (0.5 / 1 / 1.25 / 1.5).</summary>
        public float StatusOnPlayer { get; }

        /// <summary>Parry window in seconds (250 / 150 / 120 / 100 ms).</summary>
        public float ParryWindowSeconds { get; }

        /// <summary>Extra i-frame seconds of the roll (+100 ms / 0 / 0 / −50 ms).</summary>
        public float RollIFrameBonus { get; }

        /// <summary>Factor on the telegraph (wind-up) of enemy attacks (1.5 / 1 / 1 / 0.9).</summary>
        public float TelegraphFactor { get; }

        /// <summary>Melee attack tokens on the player at the same time (1 / 2 / 3 / 3).</summary>
        public int MeleeTokens { get; }

        /// <summary>Ranged attack tokens on the player at the same time (1 / 2 / 2 / 3).</summary>
        public int RangedTokens { get; }

        /// <summary>Factor on the cooldowns of enemy attacks (1.3 / 1 / 0.9 / 0.8).</summary>
        public float EnemyCooldownFactor { get; }

        /// <summary>Factor on healing (potions, food: 1.5 / 1 / 1 / 0.8).</summary>
        public float HealingFactor { get; }

        /// <summary>Factor on fall damage and climate (0.5 / 1 / 1 / 1.25).</summary>
        public float FallDamageFactor { get; }

        /// <summary>Loot rarity bonus (B_Schwierigkeit: 0 / 0 / +5 / +10).</summary>
        public int LootRarityBonus { get; }

        /// <summary>The factors of a level (unknown values count as Normal).</summary>
        /// <param name="level">Level.</param>
        public static DifficultySettings For(DifficultyLevel level)
        {
            switch (level)
            {
                case DifficultyLevel.Story:
                    return StoryLevel;
                case DifficultyLevel.Hard:
                    return HardLevel;
                case DifficultyLevel.Nightmare:
                    return NightmareLevel;
                default:
                    return NormalLevel;
            }
        }
    }
}
