namespace Aetherfall.Combat
{
    /// <summary>Row of the hit feel checklist (GDD 03 4.11) that a hit belongs to.</summary>
    public enum HitFeedbackKind
    {
        /// <summary>No feedback (evaded, ignored).</summary>
        None = 0,

        /// <summary>Light hit: 60 ms, no shake.</summary>
        LightHit = 1,

        /// <summary>Combo finisher: 80 ms, shake 0.02 · 0.12 s.</summary>
        ComboFinisher = 2,

        /// <summary>Heavy hit: 90 ms, shake 0.04 · 0.18 s.</summary>
        HeavyHit = 3,

        /// <summary>Critical or charged II: 110 ms, shake 0.06 · 0.22 s.</summary>
        CriticalHit = 4,

        /// <summary>Perfect parry: 120 ms, shake 0.03 · 0.10 s.</summary>
        PerfectParry = 5,

        /// <summary>Poise break: 120 ms, shake 0.07 · 0.25 s.</summary>
        PoiseBreak = 6,

        /// <summary>Finisher: no hitstop, shake 0.05 at the climax.</summary>
        Finisher = 7,

        /// <summary>Blocked: 50 ms, shake 0.02.</summary>
        Blocked = 8,

        /// <summary>Guard break: 100 ms, shake 0.06.</summary>
        GuardBreak = 9,

        /// <summary>Player hit, light: 40 ms, shake 0.03 · 0.12 s.</summary>
        PlayerHitLight = 10,

        /// <summary>Player hit, heavy: 70 ms, shake 0.08 · 0.30 s.</summary>
        PlayerHitHeavy = 11
    }
}
