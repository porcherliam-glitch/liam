namespace Aetherfall.Inventory
{
    /// <summary>
    /// Carry capacity and overload of GDD 04 1.3 (canon GDD 03 3.1/10.3) as pure functions. The capacity itself is the stat
    /// <c>CarryCapacity</c> (60 kg + 2 kg × E(Str) + bags and buffs as modifiers). The movement penalty reaches the player as
    /// stat modifiers with the source <see cref="SourceId"/> (architecture 11.6): move speed −40 % / −60 % (run 5 m/s →
    /// 3 m/s; the move speed cap of −60 % limits the heavy stage, so the motor also clamps to <see cref="MaxSpeed"/>) and
    /// stamina regeneration −25 % / −50 %.
    /// </summary>
    public static class EncumbranceRules
    {
        /// <summary>Source id of the overload modifiers (architecture 11.6: "Quelle encumbrance").</summary>
        public const string SourceId = "encumbrance";

        /// <summary>Above this share the inventory is almost full (90 %).</summary>
        public const float AlmostFullRatio = 0.9f;

        /// <summary>Above this share the character is overloaded (100 %).</summary>
        public const float OverloadedRatio = 1f;

        /// <summary>Above this share the character is heavily overloaded (125 %).</summary>
        public const float HeavyRatio = 1.25f;

        /// <summary>Stage for a load and a capacity (capacity 0 or less: any load overloads heavily).</summary>
        /// <param name="load">Carried weight in kg.</param>
        /// <param name="capacity">Carry capacity in kg.</param>
        public static EncumbranceLevel LevelFor(float load, float capacity)
        {
            if (!(capacity > 0f))
            {
                return load > 0f ? EncumbranceLevel.HeavilyOverloaded : EncumbranceLevel.Normal;
            }

            float ratio = load / capacity;
            if (ratio > HeavyRatio)
            {
                return EncumbranceLevel.HeavilyOverloaded;
            }

            if (ratio > OverloadedRatio)
            {
                return EncumbranceLevel.Overloaded;
            }

            return ratio > AlmostFullRatio ? EncumbranceLevel.AlmostFull : EncumbranceLevel.Normal;
        }

        /// <summary>Additive percent modifier on move speed: overloaded −0.4 (5 → 3 m/s), heavily −0.6.</summary>
        /// <param name="level">Stage.</param>
        public static float MoveSpeedPenalty(EncumbranceLevel level)
        {
            switch (level)
            {
                case EncumbranceLevel.Overloaded: return -0.4f;
                case EncumbranceLevel.HeavilyOverloaded: return -0.6f;
                default: return 0f;
            }
        }

        /// <summary>Additive percent modifier on stamina regeneration: overloaded −0.25, heavily −0.5.</summary>
        /// <param name="level">Stage.</param>
        public static float StaminaRegenPenalty(EncumbranceLevel level)
        {
            switch (level)
            {
                case EncumbranceLevel.Overloaded: return -0.25f;
                case EncumbranceLevel.HeavilyOverloaded: return -0.5f;
                default: return 0f;
            }
        }

        /// <summary>Highest ground speed in m/s: overloaded 3, heavily 1.5, otherwise 0 (= no limit).</summary>
        /// <param name="level">Stage.</param>
        public static float MaxSpeed(EncumbranceLevel level)
        {
            switch (level)
            {
                case EncumbranceLevel.Overloaded: return 3f;
                case EncumbranceLevel.HeavilyOverloaded: return 1.5f;
                default: return 0f;
            }
        }

        /// <summary>False from overloaded on (no sprint).</summary>
        /// <param name="level">Stage.</param>
        public static bool AllowsSprint(EncumbranceLevel level)
        {
            return level < EncumbranceLevel.Overloaded;
        }

        /// <summary>False from overloaded on (only the dodge step, GDD 03 3.2 "Ueberladen").</summary>
        /// <param name="level">Stage.</param>
        public static bool AllowsRoll(EncumbranceLevel level)
        {
            return level < EncumbranceLevel.Overloaded;
        }

        /// <summary>False when heavily overloaded (no jumping, climbing, gliding).</summary>
        /// <param name="level">Stage.</param>
        public static bool AllowsJump(EncumbranceLevel level)
        {
            return level < EncumbranceLevel.HeavilyOverloaded;
        }

        /// <summary>False from overloaded on (no fast travel).</summary>
        /// <param name="level">Stage.</param>
        public static bool AllowsFastTravel(EncumbranceLevel level)
        {
            return level < EncumbranceLevel.Overloaded;
        }

        /// <summary>German name with the HUD colour of GDD 04 1.3.</summary>
        /// <param name="level">Stage.</param>
        public static string GermanName(EncumbranceLevel level)
        {
            switch (level)
            {
                case EncumbranceLevel.AlmostFull: return "Fast voll (gelb)";
                case EncumbranceLevel.Overloaded: return "Überladen (orange): max. 3 m/s, kein Sprint, nur Ausweichschritt";
                case EncumbranceLevel.HeavilyOverloaded: return "Schwer überladen (rot): max. 1,5 m/s, kein Springen – ablegen oder einlagern";
                default: return "Normal";
            }
        }
    }
}
