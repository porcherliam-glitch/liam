using System;

namespace Aetherfall.Combat
{
    /// <summary>Phase of an ability cast.</summary>
    public enum AbilityPhase
    {
        /// <summary>No cast (the cooldown may still run).</summary>
        Ready = 0,

        /// <summary>Wind-up before the effect.</summary>
        Windup = 1,

        /// <summary>Recovery after the effect.</summary>
        Recovery = 2
    }

    /// <summary>Why an ability cannot start.</summary>
    public enum AbilityRefusal
    {
        /// <summary>It can start.</summary>
        None = 0,

        /// <summary>Not learned yet.</summary>
        Locked = 1,

        /// <summary>The cooldown runs.</summary>
        Cooldown = 2,

        /// <summary>The character is busy (attack, dodge, stagger, in the air, another cast).</summary>
        Busy = 3,

        /// <summary>Too little mana.</summary>
        NotEnoughMana = 4,

        /// <summary>No target in range (the chain lightning needs one).</summary>
        NoTarget = 5
    }

    /// <summary>
    /// Time line of one ability (architecture 11.5 <c>AbilityRunner</c>): wind-up → effect → recovery, then the cooldown. The
    /// owner asks <see cref="TryStart"/>, calls <see cref="Tick"/> every frame and applies the effect (mana, hits) in the frame
    /// in which <see cref="Tick"/> returns true. Pure C#.
    /// </summary>
    public sealed class AbilityRunner
    {
        private float _elapsed;

        /// <summary>Creates the runner.</summary>
        /// <param name="spec">Ability data.</param>
        public AbilityRunner(AbilitySpec spec)
        {
            Spec = spec ?? throw new ArgumentNullException(nameof(spec));
        }

        /// <summary>Ability data.</summary>
        public AbilitySpec Spec { get; }

        /// <summary>Factor on the mana cost of the spec (GDD 03 6.3: grows with the level, set by the owner; default 1).</summary>
        public float CostFactor { get; set; } = 1f;

        /// <summary>Mana cost now: the cost of the spec × <see cref="CostFactor"/>.</summary>
        public float ManaCost => Spec.ManaCost * Math.Max(0f, CostFactor);

        /// <summary>Current phase.</summary>
        public AbilityPhase Phase { get; private set; }

        /// <summary>Seconds until the ability can be used again.</summary>
        public float CooldownRemaining { get; private set; }

        /// <summary>Share of the cooldown still to run, 1 right after the effect, 0 when ready.</summary>
        public float Cooldown01 => Spec.CooldownSeconds > 0f ? Math.Min(1f, CooldownRemaining / Spec.CooldownSeconds) : 0f;

        /// <summary>True during wind-up and recovery.</summary>
        public bool IsCasting => Phase != AbilityPhase.Ready;

        /// <summary>Checks whether the ability could start now.</summary>
        /// <param name="unlocked">True if the ability is learned.</param>
        /// <param name="idle">True if the character is free to act (no attack, dodge, stagger; on the ground).</param>
        /// <param name="mana">Mana of the caster.</param>
        public AbilityRefusal Check(bool unlocked, bool idle, float mana)
        {
            if (!unlocked)
            {
                return AbilityRefusal.Locked;
            }

            if (IsCasting || !idle)
            {
                return AbilityRefusal.Busy;
            }

            if (CooldownRemaining > 0f)
            {
                return AbilityRefusal.Cooldown;
            }

            return mana >= ManaCost ? AbilityRefusal.None : AbilityRefusal.NotEnoughMana;
        }

        /// <summary>Starts the wind-up if <see cref="Check"/> allows it.</summary>
        /// <param name="unlocked">True if the ability is learned.</param>
        /// <param name="idle">True if the character is free to act.</param>
        /// <param name="mana">Mana of the caster.</param>
        /// <param name="refusal">Why it did not start.</param>
        /// <returns>True if the wind-up started.</returns>
        public bool TryStart(bool unlocked, bool idle, float mana, out AbilityRefusal refusal)
        {
            refusal = Check(unlocked, idle, mana);
            if (refusal != AbilityRefusal.None)
            {
                return false;
            }

            Phase = AbilityPhase.Windup;
            _elapsed = 0f;
            return true;
        }

        /// <summary>Advances the time line and the cooldown.</summary>
        /// <param name="deltaTime">Seconds (local combat time).</param>
        /// <returns>True in the frame in which the effect happens (end of the wind-up); the cooldown starts then.</returns>
        public bool Tick(float deltaTime)
        {
            float dt = Math.Max(0f, deltaTime);
            CooldownRemaining = Math.Max(0f, CooldownRemaining - dt);
            if (Phase == AbilityPhase.Ready)
            {
                return false;
            }

            _elapsed += dt;
            if (Phase == AbilityPhase.Windup)
            {
                if (_elapsed < Spec.WindupSeconds)
                {
                    return false;
                }

                Phase = AbilityPhase.Recovery;
                CooldownRemaining = Spec.CooldownSeconds;
                return true;
            }

            if (_elapsed >= Spec.WindupSeconds + Spec.RecoverySeconds)
            {
                Phase = AbilityPhase.Ready;
            }

            return false;
        }

        /// <summary>Cancels a wind-up (hit, dodge, menu): no effect, no cooldown. The recovery is left as it is.</summary>
        public void Cancel()
        {
            if (Phase == AbilityPhase.Windup)
            {
                Phase = AbilityPhase.Ready;
            }
        }

        /// <summary>Back to ready without cooldown (respawn, loaded game).</summary>
        public void Reset()
        {
            Phase = AbilityPhase.Ready;
            CooldownRemaining = 0f;
            _elapsed = 0f;
        }
    }
}
