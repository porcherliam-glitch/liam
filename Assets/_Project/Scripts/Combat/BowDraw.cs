using System;

namespace Aetherfall.Combat
{
    /// <summary>Phase of <see cref="BowDraw"/>.</summary>
    public enum BowPhase
    {
        /// <summary>No arrow on the string.</summary>
        Idle = 0,

        /// <summary>Aimed shot: the string is drawn while the fire button is held.</summary>
        Drawing = 1,

        /// <summary>Hip shot: a quick shot that leaves by itself after 0.45 s.</summary>
        HipShot = 2
    }

    /// <summary>Values of one arrow when it leaves the bow.</summary>
    public readonly struct BowShot
    {
        /// <summary>Damage factor (drawn 0.4–1.0, hip shot 0.5).</summary>
        public readonly float DamageMultiplier;

        /// <summary>Arrow speed in m/s (drawn 35–70).</summary>
        public readonly float Speed;

        /// <summary>Spread from trembling after a long full draw, in degrees.</summary>
        public readonly float SpreadDegrees;

        /// <summary>True for a hip shot.</summary>
        public readonly bool IsHipShot;

        /// <summary>Creates the values.</summary>
        /// <param name="damageMultiplier">Damage factor.</param>
        /// <param name="speed">Speed in m/s.</param>
        /// <param name="spreadDegrees">Spread in degrees.</param>
        /// <param name="isHipShot">True for a hip shot.</param>
        public BowShot(float damageMultiplier, float speed, float spreadDegrees, bool isHipShot)
        {
            DamageMultiplier = damageMultiplier;
            Speed = speed;
            SpreadDegrees = spreadDegrees;
            IsHipShot = isHipShot;
        }
    }

    /// <summary>
    /// Draw rules of the bow (GDD 03 6.1, Vorschlag): drawing 0–0.8 s raises the damage from 40 % to 100 % and the arrow speed
    /// from 35 to 70 m/s; holding the full draw is free up to 1.5 s, then costs 5 stamina per second, and after 2.5 s the
    /// arrow trembles (spread +0.5° per second). A hip shot takes 0.45 s and does 50 % damage. Every shot costs 4 stamina.
    /// </summary>
    /// <remarks>Pure C# for EditMode tests; <c>PlayerBow</c> feeds it the buttons and the time.</remarks>
    public sealed class BowDraw
    {
        /// <summary>Time to the full draw in seconds (bow tempo 800 ms).</summary>
        public const float FullDrawSeconds = 0.8f;

        /// <summary>Duration of a hip shot in seconds.</summary>
        public const float HipShotSeconds = 0.45f;

        /// <summary>Damage factor of a barely drawn arrow.</summary>
        public const float MinDamage = 0.4f;

        /// <summary>Damage factor of a fully drawn arrow.</summary>
        public const float MaxDamage = 1f;

        /// <summary>Damage factor of a hip shot.</summary>
        public const float HipShotDamage = 0.5f;

        /// <summary>Speed of a barely drawn arrow in m/s.</summary>
        public const float MinSpeed = 35f;

        /// <summary>Speed of a fully drawn arrow in m/s.</summary>
        public const float MaxSpeed = 70f;

        /// <summary>Speed of a hip shot in m/s (Vorschlag: half drawn).</summary>
        public const float HipShotSpeed = 50f;

        /// <summary>Holding the full draw is free this long (seconds after the start of the draw).</summary>
        public const float FreeHoldSeconds = 1.5f;

        /// <summary>Stamina per second when held longer.</summary>
        public const float HoldStaminaPerSecond = 5f;

        /// <summary>The arrow starts to tremble after this many seconds.</summary>
        public const float TrembleAfterSeconds = 2.5f;

        /// <summary>Spread growth while trembling, degrees per second.</summary>
        public const float TrembleDegreesPerSecond = 0.5f;

        /// <summary>Stamina per shot.</summary>
        public const float StaminaPerShot = 4f;

        /// <summary>Current phase.</summary>
        public BowPhase Phase { get; private set; }

        /// <summary>Seconds since the draw or hip shot started.</summary>
        public float HeldSeconds { get; private set; }

        /// <summary>Draw 0–1 (hip shot: progress to the shot).</summary>
        public float Draw01
        {
            get
            {
                switch (Phase)
                {
                    case BowPhase.Drawing: return Clamp01(HeldSeconds / FullDrawSeconds);
                    case BowPhase.HipShot: return Clamp01(HeldSeconds / HipShotSeconds);
                    default: return 0f;
                }
            }
        }

        /// <summary>True while an arrow is on the string.</summary>
        public bool IsBusy => Phase != BowPhase.Idle;

        /// <summary>True once a hip shot is due.</summary>
        public bool HipShotReady => Phase == BowPhase.HipShot && HeldSeconds >= HipShotSeconds;

        /// <summary>Starts an aimed draw.</summary>
        /// <returns>False if an arrow is already on the string.</returns>
        public bool BeginDraw()
        {
            return Begin(BowPhase.Drawing);
        }

        /// <summary>Starts a hip shot.</summary>
        /// <returns>False if an arrow is already on the string.</returns>
        public bool BeginHipShot()
        {
            return Begin(BowPhase.HipShot);
        }

        /// <summary>Advances the time.</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <returns>Stamina the held draw costs in this step.</returns>
        public float Tick(float deltaTime)
        {
            if (Phase == BowPhase.Idle || deltaTime <= 0f)
            {
                return 0f;
            }

            float before = HeldSeconds;
            HeldSeconds += deltaTime;
            if (Phase != BowPhase.Drawing)
            {
                return 0f;
            }

            float charged = Math.Max(0f, HeldSeconds - Math.Max(before, FreeHoldSeconds));
            return charged * HoldStaminaPerSecond;
        }

        /// <summary>Lets the arrow go and returns its values; the bow is idle again.</summary>
        /// <returns>The shot.</returns>
        public BowShot Release()
        {
            BowShot shot;
            if (Phase == BowPhase.HipShot)
            {
                shot = new BowShot(HipShotDamage, HipShotSpeed, 0f, true);
            }
            else
            {
                float draw = Draw01;
                float spread = Math.Max(0f, HeldSeconds - TrembleAfterSeconds) * TrembleDegreesPerSecond;
                shot = new BowShot(Lerp(MinDamage, MaxDamage, draw), Lerp(MinSpeed, MaxSpeed, draw), spread, false);
            }

            Cancel();
            return shot;
        }

        /// <summary>Takes the arrow off the string without a shot (dodge, stagger, stance left).</summary>
        public void Cancel()
        {
            Phase = BowPhase.Idle;
            HeldSeconds = 0f;
        }

        private bool Begin(BowPhase phase)
        {
            if (Phase != BowPhase.Idle)
            {
                return false;
            }

            Phase = phase;
            HeldSeconds = 0f;
            return true;
        }

        private static float Clamp01(float value)
        {
            return value < 0f ? 0f : value > 1f ? 1f : value;
        }

        private static float Lerp(float from, float to, float t)
        {
            return from + (to - from) * Clamp01(t);
        }
    }
}
