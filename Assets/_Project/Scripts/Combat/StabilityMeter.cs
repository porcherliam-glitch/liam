using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Stability of the player ("Standfestigkeit" instead of a visible poise bar, GDD 03 4.9) as pure logic: poise damage
    /// taken within the last 3 s is summed up; at least the stability → staggered 0.5 s; a single hit of at least twice the
    /// stability → knocked down 1.2 s. Hyperarmor multiplies the stability (charged heavy attacks: ×2).
    /// </summary>
    /// <remarks>Keeps the last hits in a fixed ring buffer (allocation-free). The stability comes from <c>StatId.Poise</c>.</remarks>
    public sealed class StabilityMeter
    {
        private readonly float _window;
        private readonly float[] _times;
        private readonly float[] _amounts;
        private float _clock;
        private int _next;

        /// <summary>Creates the meter.</summary>
        /// <param name="stability">Stability (GDD 03 4.9: 20 + armor class + 0.5 × E(Con)).</param>
        /// <param name="windowSeconds">Summation window (GDD 03: 3 s).</param>
        /// <param name="capacity">Number of remembered hits.</param>
        public StabilityMeter(float stability, float windowSeconds = 3f, int capacity = 16)
        {
            Stability = stability;
            _window = Math.Max(0.01f, windowSeconds);
            int size = Math.Max(1, capacity);
            _times = new float[size];
            _amounts = new float[size];
        }

        /// <summary>Stability; updated from the stats when they change.</summary>
        public float Stability { get; set; }

        /// <summary>Sum of the poise damage inside the window.</summary>
        public float RecentSum
        {
            get
            {
                float sum = 0f;
                for (int i = 0; i < _amounts.Length; i++)
                {
                    if (_amounts[i] > 0f && _clock - _times[i] <= _window)
                    {
                        sum += _amounts[i];
                    }
                }

                return sum;
            }
        }

        /// <summary>Adds poise damage of one hit and returns the reaction.</summary>
        /// <param name="poiseDamage">Poise damage of the hit.</param>
        /// <param name="hyperArmorFactor">Stability multiplier (1 = none, 2 = hyperarmor).</param>
        public StaggerKind Apply(float poiseDamage, float hyperArmorFactor = 1f)
        {
            if (!(poiseDamage > 0f))
            {
                return StaggerKind.None;
            }

            _times[_next] = _clock;
            _amounts[_next] = poiseDamage;
            _next = (_next + 1) % _amounts.Length;

            float effective = Math.Max(0f, Stability) * Math.Max(1f, hyperArmorFactor);
            if (poiseDamage >= 2f * effective)
            {
                Clear();
                return StaggerKind.Knockdown;
            }

            if (RecentSum >= effective)
            {
                Clear();
                return StaggerKind.Stagger;
            }

            return StaggerKind.None;
        }

        /// <summary>Advances the clock of the window.</summary>
        /// <param name="deltaTime">Seconds.</param>
        public void Tick(float deltaTime)
        {
            if (deltaTime > 0f)
            {
                _clock += deltaTime;
            }
        }

        /// <summary>Forgets all hits (after a stagger, on respawn).</summary>
        public void Clear()
        {
            Array.Clear(_amounts, 0, _amounts.Length);
            Array.Clear(_times, 0, _times.Length);
            _next = 0;
        }
    }
}
