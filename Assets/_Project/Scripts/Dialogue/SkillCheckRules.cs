using System;
using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The rules of dialogue skill checks (GDD 02, 12.3), pure logic:
    /// <c>value = attribute + 2 × rank of the dialogue skill + situation bonus (at most ±6)</c>, success if the value reaches
    /// the threshold of the difficulty tier. Persuade and lie use Charisma, intimidate the higher of Charisma and Strength; the
    /// raw attribute value counts (not E(x)). Level advantage: +2 per 3 levels above the NPC, at most +6. Dice mode (open
    /// decision): D20 + (value - 10) at least the threshold.
    /// </summary>
    public static class SkillCheckRules
    {
        /// <summary>Largest situation bonus or malus of a check (all modifiers and the level advantage together).</summary>
        public const int MaxSituationBonus = 6;

        /// <summary>Levels above the NPC per level step.</summary>
        public const int LevelsPerStep = 3;

        /// <summary>Bonus per level step.</summary>
        public const int BonusPerLevelStep = 2;

        /// <summary>Largest level bonus.</summary>
        public const int MaxLevelBonus = 6;

        /// <summary>Faces of the die in the dice mode.</summary>
        public const int DieFaces = 20;

        /// <summary>Value that gives +0 in the dice mode.</summary>
        public const int DiceBaseline = 10;

        /// <summary>Threshold of a difficulty tier (GDD 02, 12.3).</summary>
        /// <param name="difficulty">Tier.</param>
        public static int ThresholdOf(CheckDifficulty difficulty)
        {
            switch (difficulty)
            {
                case CheckDifficulty.Easy: return 10;
                case CheckDifficulty.EasyPlus: return 12;
                case CheckDifficulty.Medium: return 14;
                case CheckDifficulty.MediumPlus: return 16;
                case CheckDifficulty.Hard: return 18;
                case CheckDifficulty.VeryHard: return 24;
                case CheckDifficulty.Legendary: return 30;
                default: return 12;
            }
        }

        /// <summary>The attribute a check uses: Charisma, for intimidation the higher of Charisma and Strength.</summary>
        /// <param name="type">Kind of check.</param>
        /// <param name="charisma">Charisma.</param>
        /// <param name="strength">Strength.</param>
        public static StatId AttributeOf(SkillCheckType type, int charisma, int strength)
        {
            return type == SkillCheckType.Intimidate && strength > charisma ? StatId.Strength : StatId.Charisma;
        }

        /// <summary>Level advantage: +2 per 3 levels above the NPC, at most +6; 0 if the NPC level is unknown (0).</summary>
        /// <param name="playerLevel">Player level.</param>
        /// <param name="npcLevel">NPC level (0 = unknown).</param>
        public static int LevelBonus(int playerLevel, int npcLevel)
        {
            if (npcLevel <= 0 || playerLevel <= npcLevel)
            {
                return 0;
            }

            int steps = (playerLevel - npcLevel) / LevelsPerStep;
            return Math.Min(MaxLevelBonus, steps * BonusPerLevelStep);
        }

        /// <summary>Limits a situation bonus to -6 .. +6.</summary>
        /// <param name="bonus">Sum of modifiers and level bonus.</param>
        public static int ClampSituation(int bonus)
        {
            return Math.Max(-MaxSituationBonus, Math.Min(MaxSituationBonus, bonus));
        }

        /// <summary>Check value: attribute + 2 × rank + situation bonus (clamped).</summary>
        /// <param name="attribute">Raw attribute value.</param>
        /// <param name="rank">Rank of the dialogue skill (0 without skill).</param>
        /// <param name="situation">Situation bonus before clamping.</param>
        public static int Value(int attribute, int rank, int situation)
        {
            return attribute + 2 * Math.Max(0, rank) + ClampSituation(situation);
        }

        /// <summary>Deterministic result: value at least threshold.</summary>
        /// <param name="value">Check value.</param>
        /// <param name="threshold">Threshold.</param>
        public static bool Succeeds(int value, int threshold)
        {
            return value >= threshold;
        }

        /// <summary>Dice result: roll (1-20) + (value - 10) at least threshold.</summary>
        /// <param name="roll">Die roll 1-20.</param>
        /// <param name="value">Check value.</param>
        /// <param name="threshold">Threshold.</param>
        public static bool DiceSucceeds(int roll, int value, int threshold)
        {
            return roll + (value - DiceBaseline) >= threshold;
        }

        /// <summary>Chance of success in the dice mode (0-1), shown as "[Ueberzeugen · 65 %]".</summary>
        /// <param name="value">Check value.</param>
        /// <param name="threshold">Threshold.</param>
        public static float DiceChance(int value, int threshold)
        {
            int successes = 0;
            for (int roll = 1; roll <= DieFaces; roll++)
            {
                if (DiceSucceeds(roll, value, threshold))
                {
                    successes++;
                }
            }

            return successes / (float)DieFaces;
        }

        /// <summary>German name of a check for option tags.</summary>
        /// <param name="type">Kind of check.</param>
        public static string GermanName(SkillCheckType type)
        {
            switch (type)
            {
                case SkillCheckType.Intimidate: return "Einschüchtern";
                case SkillCheckType.Lie: return "Lügen";
                default: return "Überzeugen";
            }
        }

        /// <summary>USS key of an attribute colour (<c>attr-charisma</c> …, GDD 05 1.1).</summary>
        /// <param name="attribute">Attribute.</param>
        public static string AttributeColorKey(StatId attribute)
        {
            switch (attribute)
            {
                case StatId.Strength: return "strength";
                case StatId.Dexterity: return "dexterity";
                case StatId.Intelligence: return "intelligence";
                case StatId.Wisdom: return "wisdom";
                case StatId.Constitution: return "constitution";
                default: return "charisma";
            }
        }
    }
}
