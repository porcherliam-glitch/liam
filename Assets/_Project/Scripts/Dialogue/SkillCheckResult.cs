using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Outcome of a skill check (or the preview of it on an option): threshold, own value, attribute, situation bonus, success
    /// and, in the dice mode, roll and chance.
    /// </summary>
    public readonly struct SkillCheckResult
    {
        /// <summary>Kind of check.</summary>
        public readonly SkillCheckType Type;

        /// <summary>Threshold of the difficulty tier.</summary>
        public readonly int Threshold;

        /// <summary>Own check value.</summary>
        public readonly int Value;

        /// <summary>Attribute used (Charisma or Strength).</summary>
        public readonly StatId Attribute;

        /// <summary>Situation bonus after clamping (-6 .. +6).</summary>
        public readonly int Situation;

        /// <summary>True on success.</summary>
        public readonly bool Success;

        /// <summary>Die roll 1-20 in the dice mode; 0 in the deterministic mode.</summary>
        public readonly int Roll;

        /// <summary>Chance of success 0-1 (deterministic: 0 or 1).</summary>
        public readonly float Chance;

        /// <summary>True if the result came from the dialogue memory (remembered check).</summary>
        public readonly bool Remembered;

        /// <summary>Creates a result.</summary>
        /// <param name="type">Kind.</param>
        /// <param name="threshold">Threshold.</param>
        /// <param name="value">Value.</param>
        /// <param name="attribute">Attribute.</param>
        /// <param name="situation">Situation bonus.</param>
        /// <param name="success">Success.</param>
        /// <param name="roll">Roll (dice) or 0.</param>
        /// <param name="chance">Chance 0-1.</param>
        /// <param name="remembered">True if taken from memory.</param>
        public SkillCheckResult(SkillCheckType type, int threshold, int value, StatId attribute, int situation, bool success, int roll, float chance,
            bool remembered)
        {
            Type = type;
            Threshold = threshold;
            Value = value;
            Attribute = attribute;
            Situation = situation;
            Success = success;
            Roll = roll;
            Chance = chance;
            Remembered = remembered;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Type + " " + Value + "/" + Threshold + (Success ? " success" : " failure") + (Remembered ? " (remembered)" : string.Empty);
        }
    }
}
