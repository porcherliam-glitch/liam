using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// The timed self-buffs of a caster (GDD 03 6.4, column "Selbstverstärkung"): one slot per <see cref="AbilityBuffKind"/>
    /// with remaining time, strength and a status build-up (Glutmantel: burning of the aura; Eispanzer: freezing for attackers).
    /// Casting a buff again refreshes it. Pure C#; the owner applies the stat changes when <see cref="Started"/> and
    /// <see cref="Ended"/> fire.
    /// </summary>
    public sealed class AbilityBuffs
    {
        private const int KindCount = 4;
        private readonly float[] _remaining = new float[KindCount];
        private readonly float[] _value = new float[KindCount];
        private readonly float[] _buildup = new float[KindCount];

        /// <summary>Raised when a buff starts (not when it is refreshed).</summary>
        public event Action<AbilityBuffKind> Started;

        /// <summary>Raised when a buff runs out or is cleared.</summary>
        public event Action<AbilityBuffKind> Ended;

        /// <summary>True while the buff runs.</summary>
        /// <param name="kind">Buff.</param>
        public bool IsActive(AbilityBuffKind kind)
        {
            int index = (int)kind;
            return index > 0 && index < KindCount && _remaining[index] > 0f;
        }

        /// <summary>Seconds left (0 if it does not run).</summary>
        /// <param name="kind">Buff.</param>
        public float Remaining(AbilityBuffKind kind)
        {
            int index = (int)kind;
            return index > 0 && index < KindCount ? _remaining[index] : 0f;
        }

        /// <summary>Strength of a running buff (0 if it does not run).</summary>
        /// <param name="kind">Buff.</param>
        public float Value(AbilityBuffKind kind)
        {
            return IsActive(kind) ? _value[(int)kind] : 0f;
        }

        /// <summary>Status build-up of a running buff (0 if it does not run).</summary>
        /// <param name="kind">Buff.</param>
        public float Buildup(AbilityBuffKind kind)
        {
            return IsActive(kind) ? _buildup[(int)kind] : 0f;
        }

        /// <summary>Starts or refreshes a buff.</summary>
        /// <param name="kind">Buff (None is ignored).</param>
        /// <param name="seconds">Duration.</param>
        /// <param name="value">Strength.</param>
        /// <param name="buildup">Status build-up (aura, attackers).</param>
        public void Start(AbilityBuffKind kind, float seconds, float value, float buildup)
        {
            int index = (int)kind;
            if (index <= 0 || index >= KindCount || !(seconds > 0f))
            {
                return;
            }

            bool wasActive = _remaining[index] > 0f;
            _remaining[index] = seconds;
            _value[index] = Math.Max(0f, value);
            _buildup[index] = Math.Max(0f, buildup);
            if (!wasActive)
            {
                Started?.Invoke(kind);
            }
        }

        /// <summary>Lets the buffs run out.</summary>
        /// <param name="deltaTime">Seconds.</param>
        public void Tick(float deltaTime)
        {
            float dt = Math.Max(0f, deltaTime);
            for (int i = 1; i < KindCount; i++)
            {
                if (_remaining[i] <= 0f)
                {
                    continue;
                }

                _remaining[i] -= dt;
                if (_remaining[i] <= 0f)
                {
                    _remaining[i] = 0f;
                    Ended?.Invoke((AbilityBuffKind)i);
                }
            }
        }

        /// <summary>Ends every buff (death, respawn, loading).</summary>
        public void Clear()
        {
            for (int i = 1; i < KindCount; i++)
            {
                if (_remaining[i] > 0f)
                {
                    _remaining[i] = 0f;
                    Ended?.Invoke((AbilityBuffKind)i);
                }
            }
        }
    }
}
