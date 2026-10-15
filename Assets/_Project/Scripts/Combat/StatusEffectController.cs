using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Status effects of one fighter as pure logic (GDD 03 7, Technik/02 S25): eight build-up bars with threshold
    /// <c>100 × (1 + Res ÷ 100)</c>, decay 10 per second after 2 s without new build-up, +50 resistance for 10 s after a
    /// trigger (stun: 10 s immunity), bosses +50 per trigger for the whole fight; the environment states "Nass" and "Ölig"
    /// scale the build-up; the Aether corruption bar (GDD 01 A3) with its stages and the overflow at 100.
    /// </summary>
    /// <remarks>
    /// <para>Running effects: burning (6 s, share of max health per second), poison (12 s, up to 3 stacks), bleeding (10 s,
    /// instant share), stun (helpless, +20 % damage taken; bosses immune, the owner turns the build-up into poise damage),
    /// freezing (bar ≥ 50 chilled, 100 frozen; bosses only slowed), shock (interrupt, 5 s aftermath), curse (20 s, up to
    /// 3 stacks). The owner (<see cref="Combatant"/>) applies the damage of <see cref="Tick"/> to its health and reacts to
    /// <see cref="Triggered"/> (stun the brain, flee, interrupt).</para>
    /// <para>Allocation-free after construction. Times are local combat time (0 during hitstop).</para>
    /// </remarks>
    public sealed class StatusEffectController
    {
        /// <summary>Base threshold of every bar.</summary>
        public const float BaseThreshold = 100f;

        /// <summary>Seconds without new build-up before a bar starts to fall.</summary>
        public const float DecayDelaySeconds = 2f;

        /// <summary>Fall of a bar per second after the delay.</summary>
        public const float DecayPerSecond = 10f;

        /// <summary>Extra resistance against the same effect after a trigger (stun: full immunity).</summary>
        public const float PostTriggerResistance = 50f;

        /// <summary>How long the extra resistance lasts.</summary>
        public const float PostTriggerSeconds = 10f;

        /// <summary>Extra resistance a boss keeps per trigger of the same effect.</summary>
        public const float BossResistancePerTrigger = 50f;

        /// <summary>Duration of burning.</summary>
        public const float BurningSeconds = 6f;

        /// <summary>Duration of poison.</summary>
        public const float PoisonSeconds = 12f;

        /// <summary>Duration of bleeding.</summary>
        public const float BleedingSeconds = 10f;

        /// <summary>Duration of the curse.</summary>
        public const float CurseSeconds = 20f;

        /// <summary>Aftermath of a shock (regeneration −50 %).</summary>
        public const float ShockSeconds = 5f;

        /// <summary>Stagger of a shock.</summary>
        public const float ShockStaggerSeconds = 0.8f;

        /// <summary>Slow of a boss instead of freezing.</summary>
        public const float BossFreezeSlowSeconds = 4f;

        /// <summary>Bar value from which freezing chills (tempo −20 %).</summary>
        public const float ChilledThreshold = 50f;

        /// <summary>Largest stack of poison and curse.</summary>
        public const int MaxStacks = 3;

        /// <summary>Wet lasts this long after the source ends.</summary>
        public const float WetSeconds = 20f;

        /// <summary>Oily lasts this long.</summary>
        public const float OilySeconds = 15f;

        /// <summary>Corruption falls this fast per second in Aether density 0.</summary>
        public const float CorruptionDecayPerSecond = 2f;

        /// <summary>Top of the corruption bar.</summary>
        public const float CorruptionMax = 100f;

        /// <summary>Duration of the overflow "Überflutet".</summary>
        public const float FloodedSeconds = 20f;

        /// <summary>Share of max health lost per second while flooded.</summary>
        public const float FloodedFractionPerSecond = 0.02f;

        /// <summary>Where the bar falls to after the overflow.</summary>
        public const float FloodedFallback = 60f;

        /// <summary>Share of max health an enemy loses when its corruption bursts.</summary>
        public const float BurstFraction = 0.1f;

        /// <summary>Stun of the corruption burst.</summary>
        public const float BurstStunSeconds = 2f;

        /// <summary>Radius of the corruption burst in metres.</summary>
        public const float BurstRadius = 3f;

        private const int Count = 8;

        private readonly float[] _buildup = new float[Count];
        private readonly float[] _sinceBuildup = new float[Count];
        private readonly float[] _remaining = new float[Count];
        private readonly float[] _postResistance = new float[Count];
        private readonly float[] _bossResistance = new float[Count];
        private readonly int[] _stacks = new int[Count];
        private StatusSettings _settings;
        private int _immuneMask;
        private float _pendingBleed;
        private bool _pendingBurst;

        /// <summary>Creates the controller.</summary>
        /// <param name="settings">Rules of this kind of fighter.</param>
        public StatusEffectController(in StatusSettings settings)
        {
            _settings = settings;
            for (int i = 0; i < Count; i++)
            {
                _sinceBuildup[i] = float.PositiveInfinity;
            }
        }

        /// <summary>Rules in use.</summary>
        public StatusSettings Settings => _settings;

        /// <summary>Replaces the rules (enemy type known after construction); bars, effects and subscribers stay.</summary>
        /// <param name="settings">New rules.</param>
        public void Configure(in StatusSettings settings)
        {
            _settings = settings;
        }

        /// <summary>Makes the owner immune to an effect (undead: poison and bleeding; constructs; "immun" is its own trait).</summary>
        /// <param name="effect">Effect.</param>
        /// <param name="immune">True = immune.</param>
        public void SetImmune(StatusEffectId effect, bool immune)
        {
            int bit = 1 << (int)effect;
            _immuneMask = immune ? _immuneMask | bit : _immuneMask & ~bit;
            if (immune)
            {
                Cure(effect);
            }
        }

        /// <summary>True if the owner is immune to the effect.</summary>
        /// <param name="effect">Effect.</param>
        public bool IsImmune(StatusEffectId effect)
        {
            return (_immuneMask & (1 << (int)effect)) != 0;
        }

        /// <summary>Resistance from stats and gear (player: 1.5 × E(Weisheit) + equipment; 0–200).</summary>
        public float ExternalResistance { get; set; }

        /// <summary>Aether density of the surroundings, 0–3 (GDD 01 A3: +0.2 / +1 / +3 corruption per second).</summary>
        public float AetherDensity { get; set; }

        /// <summary>True for Aether-corrupted enemies: no corruption bar.</summary>
        public bool CorruptionImmune { get; set; }

        /// <summary>Corruption bar 0–100.</summary>
        public float Corruption { get; private set; }

        /// <summary>Seconds of the overflow left (player).</summary>
        public float FloodedRemaining { get; private set; }

        /// <summary>Seconds of "Nass" left.</summary>
        public float WetRemaining { get; private set; }

        /// <summary>Seconds of "Ölig" left.</summary>
        public float OilyRemaining { get; private set; }

        /// <summary>True while wet.</summary>
        public bool IsWet => WetRemaining > 0f;

        /// <summary>True while oily.</summary>
        public bool IsOily => OilyRemaining > 0f;

        /// <summary>True while stunned by the status effect (not the poise break).</summary>
        public bool IsStunned => _remaining[(int)StatusEffectId.Stun] > 0f;

        /// <summary>True while burning.</summary>
        public bool IsBurning => _remaining[(int)StatusEffectId.Burning] > 0f;

        /// <summary>True while frozen solid (bosses never).</summary>
        public bool IsFrozen => !_settings.IsBoss && _remaining[(int)StatusEffectId.Freezing] > 0f;

        /// <summary>True while chilled (bar at or above 50, frozen, or a boss's slow): tempo −20 %.</summary>
        public bool IsChilled => _buildup[(int)StatusEffectId.Freezing] >= ChilledThreshold || _remaining[(int)StatusEffectId.Freezing] > 0f;

        /// <summary>True while any effect is running.</summary>
        public bool HasActiveEffect
        {
            get
            {
                for (int i = 0; i < Count; i++)
                {
                    if (_remaining[i] > 0f)
                    {
                        return true;
                    }
                }

                return false;
            }
        }

        /// <summary>Factor on incoming damage: stunned +20 % (GDD 03 7.2).</summary>
        public float IncomingDamageMultiplier => IsStunned ? 1.2f : 1f;

        /// <summary>Factor on stamina and mana regeneration: shock aftermath −50 %, corruption stage "Durchdrungen" −10 % stamina (applied by the owner).</summary>
        public float RegenMultiplier => _remaining[(int)StatusEffectId.Shock] > 0f ? 0.5f : 1f;

        /// <summary>Factor on received healing: poison −50 %, corruption stages −5/−10/−15 %.</summary>
        public float HealingMultiplier
        {
            get
            {
                float factor = _remaining[(int)StatusEffectId.Poison] > 0f ? 0.5f : 1f;
                switch (Stage)
                {
                    case CorruptionStage.Touched: return factor * 0.95f;
                    case CorruptionStage.Permeated: return factor * 0.9f;
                    case CorruptionStage.Marked: return factor * 0.85f;
                    default: return factor;
                }
            }
        }

        /// <summary>Bonus on Aether damage from the corruption stage (+5 / +10 / +15 / +25 %).</summary>
        public float AetherDamageBonus
        {
            get
            {
                switch (Stage)
                {
                    case CorruptionStage.Touched: return 0.05f;
                    case CorruptionStage.Permeated: return 0.1f;
                    case CorruptionStage.Marked: return 0.15f;
                    case CorruptionStage.Flooded: return 0.25f;
                    default: return 0f;
                }
            }
        }

        /// <summary>Stage of the corruption bar.</summary>
        public CorruptionStage Stage
        {
            get
            {
                if (FloodedRemaining > 0f)
                {
                    return CorruptionStage.Flooded;
                }

                if (Corruption >= 75f)
                {
                    return CorruptionStage.Marked;
                }

                if (Corruption >= 50f)
                {
                    return CorruptionStage.Permeated;
                }

                return Corruption >= 25f ? CorruptionStage.Touched : CorruptionStage.Pure;
            }
        }

        /// <summary>Raised when an effect triggers (the bar reached its threshold).</summary>
        public event Action<StatusEffectId> Triggered;

        /// <summary>Raised when a running effect ends.</summary>
        public event Action<StatusEffectId> Ended;

        /// <summary>Build-up of one bar.</summary>
        /// <param name="effect">Effect.</param>
        public float Buildup(StatusEffectId effect)
        {
            return _buildup[(int)effect];
        }

        /// <summary>True while the effect runs.</summary>
        /// <param name="effect">Effect.</param>
        public bool IsActive(StatusEffectId effect)
        {
            return _remaining[(int)effect] > 0f;
        }

        /// <summary>Seconds the effect still runs.</summary>
        /// <param name="effect">Effect.</param>
        public float Remaining(StatusEffectId effect)
        {
            return _remaining[(int)effect];
        }

        /// <summary>Stacks of a running effect (poison, curse up to 3; others 0 or 1).</summary>
        /// <param name="effect">Effect.</param>
        public int Stacks(StatusEffectId effect)
        {
            return _stacks[(int)effect];
        }

        /// <summary>Resistance against one effect right now (base + stats + after-trigger + boss growth).</summary>
        /// <param name="effect">Effect.</param>
        public float Resistance(StatusEffectId effect)
        {
            int i = (int)effect;
            float resistance = _settings.BaseResistance + Math.Max(0f, ExternalResistance) + _bossResistance[i];
            if (_postResistance[i] > 0f && effect != StatusEffectId.Stun)
            {
                resistance += PostTriggerResistance;
            }

            return resistance;
        }

        /// <summary>Threshold of one bar: <c>100 × (1 + Res ÷ 100)</c>.</summary>
        /// <param name="effect">Effect.</param>
        public float Threshold(StatusEffectId effect)
        {
            return BaseThreshold * (1f + Resistance(effect) / 100f);
        }

        /// <summary>Bar 0–1 relative to its threshold.</summary>
        /// <param name="effect">Effect.</param>
        public float Normalized(StatusEffectId effect)
        {
            float threshold = Threshold(effect);
            return threshold > 0f ? Math.Min(1f, _buildup[(int)effect] / threshold) : 0f;
        }

        /// <summary>Applies the build-up of a hit to every bar (corruption goes to its own bar).</summary>
        /// <param name="buildup">Build-up of the hit.</param>
        public void Apply(in StatusBuildup buildup)
        {
            if (buildup.IsEmpty)
            {
                return;
            }

            for (int i = 0; i < Count; i++)
            {
                var effect = (StatusEffectId)i;
                float amount = buildup.Get(effect);
                if (amount > 0f)
                {
                    Add(effect, amount);
                }
            }
        }

        /// <summary>
        /// Adds build-up to one bar (environment factors applied) and triggers the effect when the threshold is reached.
        /// Aether corruption goes to the corruption bar. A boss ignores stun build-up here (the owner turns it into poise damage).
        /// </summary>
        /// <param name="effect">Effect.</param>
        /// <param name="amount">Build-up.</param>
        /// <returns>True if the effect triggered now.</returns>
        public bool Add(StatusEffectId effect, float amount)
        {
            if (!(amount > 0f))
            {
                return false;
            }

            if (effect == StatusEffectId.AetherCorruption)
            {
                return AddCorruption(amount);
            }

            int i = (int)effect;
            if (IsImmune(effect) || (effect == StatusEffectId.Stun && (_settings.IsBoss || _postResistance[i] > 0f)))
            {
                // GDD 03 7.2: bosses are immune to the stun; after a stun 10 s of immunity.
                return false;
            }

            _buildup[i] += amount * EnvironmentFactor(effect);
            _sinceBuildup[i] = 0f;
            if (_buildup[i] < Threshold(effect))
            {
                return false;
            }

            Trigger(effect);
            return true;
        }

        /// <summary>Adds corruption (Aether ability +2, hit of a corrupted enemy +5, crystal +5, rift seal +30).</summary>
        /// <param name="amount">Corruption.</param>
        /// <returns>True if the bar reached 100 now.</returns>
        public bool AddCorruption(float amount)
        {
            if (CorruptionImmune || !(amount > 0f) || FloodedRemaining > 0f)
            {
                return false;
            }

            Corruption = Math.Min(CorruptionMax, Corruption + amount);
            if (Corruption < CorruptionMax)
            {
                return false;
            }

            if (_settings.IsPlayer)
            {
                FloodedRemaining = FloodedSeconds;
            }
            else
            {
                _pendingBurst = true;
            }

            Action<StatusEffectId> triggered = Triggered;
            if (triggered != null)
            {
                triggered(StatusEffectId.AetherCorruption);
            }

            return true;
        }

        /// <summary>Sets the corruption bar (loading a save, shrine → 0, potion −50).</summary>
        /// <param name="value">New value 0–100.</param>
        public void SetCorruption(float value)
        {
            Corruption = value < 0f ? 0f : value > CorruptionMax ? CorruptionMax : value;
            if (Corruption < CorruptionMax)
            {
                FloodedRemaining = 0f;
                _pendingBurst = false;
            }
        }

        /// <summary>Makes the fighter wet (water, rain): burning build-up × 0.5, shock × 1.5, freezing × 2; running burning ends.</summary>
        /// <param name="seconds">Duration (20 s after leaving the water).</param>
        public void MakeWet(float seconds)
        {
            WetRemaining = Math.Max(WetRemaining, seconds);
            if (IsBurning)
            {
                End(StatusEffectId.Burning);
            }

            _buildup[(int)StatusEffectId.Burning] = 0f;
        }

        /// <summary>Makes the fighter oily (oil puddle, flask): burning build-up × 2, a fire hit explodes.</summary>
        /// <param name="seconds">Duration (15 s).</param>
        public void MakeOily(float seconds)
        {
            OilyRemaining = Math.Max(OilyRemaining, seconds);
        }

        /// <summary>A roll shortens burning by 1.5 s (GDD 03 7.2).</summary>
        /// <param name="seconds">Seconds to take off.</param>
        public void ShortenBurning(float seconds)
        {
            int i = (int)StatusEffectId.Burning;
            if (_remaining[i] > 0f)
            {
                _remaining[i] -= seconds;
                if (_remaining[i] <= 0f)
                {
                    End(StatusEffectId.Burning);
                }
            }
        }

        /// <summary>Ends a running effect at once (antidote, water, stun break-free).</summary>
        /// <param name="effect">Effect.</param>
        public void Cure(StatusEffectId effect)
        {
            if (_remaining[(int)effect] > 0f)
            {
                End(effect);
            }

            _buildup[(int)effect] = 0f;
        }

        /// <summary>Advances every bar and effect; returns the damage due this frame.</summary>
        /// <param name="deltaTime">Local combat time in seconds.</param>
        /// <param name="maxHealth">Max health of the owner (shares of it).</param>
        public StatusTick Tick(float deltaTime, float maxHealth)
        {
            if (!(deltaTime > 0f))
            {
                return StatusTick.None;
            }

            float burn = 0f;
            float poison = 0f;
            for (int i = 0; i < Count; i++)
            {
                var effect = (StatusEffectId)i;
                if (_remaining[i] > 0f)
                {
                    float step = Math.Min(deltaTime, _remaining[i]);
                    if (effect == StatusEffectId.Burning)
                    {
                        burn += maxHealth * _settings.BurnFractionPerSecond * step;
                    }
                    else if (effect == StatusEffectId.Poison)
                    {
                        poison += maxHealth * _settings.PoisonFractionPerSecond * _stacks[i] * step;
                    }

                    _remaining[i] -= deltaTime;
                    if (_remaining[i] <= 0f)
                    {
                        End(effect);
                    }
                }

                if (_postResistance[i] > 0f)
                {
                    _postResistance[i] = Math.Max(0f, _postResistance[i] - deltaTime);
                }

                _sinceBuildup[i] += deltaTime;
                float decaying = Math.Min(deltaTime, _sinceBuildup[i] - DecayDelaySeconds);
                if (decaying > 0f && _buildup[i] > 0f)
                {
                    _buildup[i] = Math.Max(0f, _buildup[i] - DecayPerSecond * decaying);
                }
            }

            WetRemaining = Math.Max(0f, WetRemaining - deltaTime);
            OilyRemaining = Math.Max(0f, OilyRemaining - deltaTime);

            float bleed = _pendingBleed * maxHealth;
            _pendingBleed = 0f;
            float corruptionDamage = TickCorruption(deltaTime, maxHealth);
            bool burst = _pendingBurst;
            if (burst)
            {
                _pendingBurst = false;
                Corruption = 0f;
            }

            return new StatusTick(burn + bleed, poison, corruptionDamage, burst);
        }

        /// <summary>Forgets every bar, effect and state; the corruption stays (respawn, load).</summary>
        public void ClearEffects()
        {
            for (int i = 0; i < Count; i++)
            {
                if (_remaining[i] > 0f)
                {
                    _remaining[i] = 0f;
                    _stacks[i] = 0;
                }

                _buildup[i] = 0f;
                _sinceBuildup[i] = float.PositiveInfinity;
                _postResistance[i] = 0f;
                _bossResistance[i] = 0f;
            }

            WetRemaining = 0f;
            OilyRemaining = 0f;
            _pendingBleed = 0f;
            _pendingBurst = false;
        }

        private float TickCorruption(float deltaTime, float maxHealth)
        {
            if (CorruptionImmune)
            {
                return 0f;
            }

            if (FloodedRemaining > 0f)
            {
                float step = Math.Min(deltaTime, FloodedRemaining);
                FloodedRemaining -= deltaTime;
                if (FloodedRemaining <= 0f)
                {
                    FloodedRemaining = 0f;
                    Corruption = FloodedFallback;
                }

                return maxHealth * FloodedFractionPerSecond * step;
            }

            float density = AetherDensity;
            if (density >= 3f)
            {
                AddCorruption(3f * deltaTime);
            }
            else if (density >= 2f)
            {
                AddCorruption(1f * deltaTime);
            }
            else if (density >= 1f)
            {
                AddCorruption(0.2f * deltaTime);
            }
            else if (Corruption > 0f)
            {
                Corruption = Math.Max(0f, Corruption - CorruptionDecayPerSecond * deltaTime);
            }

            return 0f;
        }

        private float EnvironmentFactor(StatusEffectId effect)
        {
            switch (effect)
            {
                case StatusEffectId.Burning:
                    return (IsWet ? 0.5f : 1f) * (IsOily ? 2f : 1f);
                case StatusEffectId.Shock:
                    return IsWet ? 1.5f : 1f;
                case StatusEffectId.Freezing:
                    return IsWet ? 2f : 1f;
                default:
                    return 1f;
            }
        }

        private void Trigger(StatusEffectId effect)
        {
            int i = (int)effect;
            _buildup[i] = 0f;
            _postResistance[i] = PostTriggerSeconds;
            if (_settings.IsBoss)
            {
                _bossResistance[i] += BossResistancePerTrigger;
            }

            bool stackable = effect == StatusEffectId.Poison || effect == StatusEffectId.Curse;
            _stacks[i] = stackable ? Math.Min(MaxStacks, _stacks[i] + 1) : 1;
            switch (effect)
            {
                case StatusEffectId.Burning:
                    _remaining[i] = BurningSeconds;
                    break;
                case StatusEffectId.Poison:
                    _remaining[i] = PoisonSeconds;
                    break;
                case StatusEffectId.Bleeding:
                    _remaining[i] = BleedingSeconds;
                    break;
                case StatusEffectId.Stun:
                    _remaining[i] = _settings.StunSeconds;
                    break;
                case StatusEffectId.Freezing:
                    _remaining[i] = _settings.IsBoss ? BossFreezeSlowSeconds : _settings.FreezeSeconds;
                    break;
                case StatusEffectId.Shock:
                    _remaining[i] = ShockSeconds;
                    break;
                case StatusEffectId.Curse:
                    _remaining[i] = CurseSeconds;
                    break;
            }

            if (effect == StatusEffectId.Bleeding)
            {
                // The instant share is a share of max health; Tick turns it into damage.
                _pendingBleed = _settings.BleedFraction;
            }

            Action<StatusEffectId> triggered = Triggered;
            if (triggered != null)
            {
                triggered(effect);
            }
        }

        private void End(StatusEffectId effect)
        {
            int i = (int)effect;
            _remaining[i] = 0f;
            _stacks[i] = 0;
            Action<StatusEffectId> ended = Ended;
            if (ended != null)
            {
                ended(effect);
            }
        }
    }
}
