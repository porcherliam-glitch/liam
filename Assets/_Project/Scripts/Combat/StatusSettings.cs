namespace Aetherfall.Combat
{
    /// <summary>
    /// Rules of the status effects for one kind of fighter (GDD 03 7.1–7.2): the player, a normal enemy or a boss. Bosses
    /// burn and bleed for smaller shares, never freeze, are immune to the stun (its build-up becomes poise damage) and gain
    /// resistance with every trigger of the same effect.
    /// </summary>
    public readonly struct StatusSettings
    {
        /// <summary>Base resistance against every effect (GDD 03 7.1: Normal 0, Elite 50, Champion 100, Boss 200–400).</summary>
        public readonly float BaseResistance;

        /// <summary>Share of the max health lost per second while burning (2 %, boss 0.5 %).</summary>
        public readonly float BurnFractionPerSecond;

        /// <summary>Share of the max health lost per second while poisoned, per stack (1.5 %, boss 0.4 %).</summary>
        public readonly float PoisonFractionPerSecond;

        /// <summary>Share of the max health lost at once when bleeding triggers (8 %, boss 2 %).</summary>
        public readonly float BleedFraction;

        /// <summary>Seconds a stun lasts (2.0, player 1.2).</summary>
        public readonly float StunSeconds;

        /// <summary>Seconds a freeze lasts (2.5, player 1.5; bosses: 4 s slow instead).</summary>
        public readonly float FreezeSeconds;

        /// <summary>True for bosses: stun build-up becomes poise damage, freezing only slows, +50 resistance per trigger stays for the fight.</summary>
        public readonly bool IsBoss;

        /// <summary>True for the player: corruption has stages and the overflow of GDD 01 A3.</summary>
        public readonly bool IsPlayer;

        /// <summary>Creates the settings.</summary>
        public StatusSettings(float baseResistance, float burnFractionPerSecond, float poisonFractionPerSecond, float bleedFraction, float stunSeconds,
            float freezeSeconds, bool isBoss, bool isPlayer)
        {
            BaseResistance = baseResistance < 0f ? 0f : baseResistance;
            BurnFractionPerSecond = burnFractionPerSecond;
            PoisonFractionPerSecond = poisonFractionPerSecond;
            BleedFraction = bleedFraction;
            StunSeconds = stunSeconds;
            FreezeSeconds = freezeSeconds;
            IsBoss = isBoss;
            IsPlayer = isPlayer;
        }

        /// <summary>The player (GDD 03 7.2 player values; the resistance comes from the stats).</summary>
        public static StatusSettings Player => new StatusSettings(0f, 0.02f, 0.015f, 0.08f, 1.2f, 1.5f, false, true);

        /// <summary>A normal enemy.</summary>
        public static StatusSettings Enemy => new StatusSettings(0f, 0.02f, 0.015f, 0.08f, 2f, 2.5f, false, false);

        /// <summary>An elite enemy (resistance 50).</summary>
        public static StatusSettings Elite => new StatusSettings(50f, 0.02f, 0.015f, 0.08f, 2f, 2.5f, false, false);

        /// <summary>A champion (resistance 100).</summary>
        public static StatusSettings Champion => new StatusSettings(100f, 0.02f, 0.015f, 0.08f, 2f, 2.5f, false, false);

        /// <summary>A boss (resistance 200, smaller shares, stun immune).</summary>
        public static StatusSettings Boss => new StatusSettings(200f, 0.005f, 0.004f, 0.02f, 0f, 0f, true, false);

        /// <summary>A copy with another base resistance (enemy data).</summary>
        /// <param name="resistance">Base resistance.</param>
        public StatusSettings WithResistance(float resistance)
        {
            return new StatusSettings(resistance, BurnFractionPerSecond, PoisonFractionPerSecond, BleedFraction, StunSeconds, FreezeSeconds, IsBoss, IsPlayer);
        }
    }
}
