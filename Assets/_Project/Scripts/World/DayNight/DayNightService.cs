using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Default <see cref="IDayNightService"/> (S35): reads the game time every frame and shows it in every registered scene
    /// whenever it moved by <see cref="DayNightMath.ApplyStepMinutes"/> (about 1 s of real time), and at once when a scene comes
    /// or goes or the active scene changes — so a rest, a fast travel or a load jumps to the new light without a fade. Nothing
    /// changes while the clock stands. Holds no save state: the light follows from the game minutes alone.
    /// </summary>
    public sealed class DayNightService : IDayNightService, IUnscaledTickable
    {
        private static readonly DayNightSunPath DefaultPath = new DayNightSunPath();

        private readonly IGameTimeSource _time;
        private readonly ILightSourceRegistry _sources;
        private readonly List<IDayNightEnvironment> _environments = new List<IDayNightEnvironment>();
        private IDayNightEnvironment _current;
        private double _lastApplied = double.NaN;
        private bool _dirty = true;

        /// <summary>Creates the service.</summary>
        /// <param name="time">Game time.</param>
        /// <param name="sources">Registered fires and lamps (null: none count).</param>
        public DayNightService(IGameTimeSource time, ILightSourceRegistry sources)
        {
            _time = time ?? throw new ArgumentNullException(nameof(time));
            _sources = sources;
        }

        /// <inheritdoc />
        public double HourOfDay => DayNightMath.HourOfDay(_time.TotalGameMinutes);

        /// <inheritdoc />
        public int MoonDay => DayNightMath.MoonDay(_time.TotalGameMinutes);

        /// <inheritdoc />
        public DayPhase Phase => DayPhaseRules.Of((int)Math.Floor(HourOfDay));

        /// <inheritdoc />
        public bool IsNight => Phase == DayPhase.Night;

        /// <inheritdoc />
        public float Daylight
        {
            get
            {
                DayNightProfile profile = _current != null ? _current.Profile : null;
                return DayNightMath.Daylight(DayNightMath.SunElevation(HourOfDay, profile != null ? profile.SunPath : DefaultPath));
            }
        }

        /// <summary>The environment of the active scene, or null (tests, tools).</summary>
        public IDayNightEnvironment Current => _current;

        /// <summary>Game minutes of the last time the light was shown (NaN before the first time).</summary>
        public double LastAppliedMinutes => _lastApplied;

        /// <inheritdoc />
        public float LightFactorAt(Vector3 position)
        {
            IDayNightEnvironment current = _current;
            if (current == null)
            {
                return DayNightMath.DayFactor;
            }

            if (current.Mode == DayNightMode.Indoor)
            {
                return Mathf.Clamp01(current.IndoorLightFactor);
            }

            float factor = DayNightMath.LightFactor(Phase);
            if (factor < DayNightMath.NearLightFactor && _sources != null && _sources.AnyLitWithin(position))
            {
                factor = DayNightMath.NearLightFactor;
            }

            return factor;
        }

        /// <inheritdoc />
        public void RegisterEnvironment(IDayNightEnvironment environment)
        {
            if (environment != null && !_environments.Contains(environment))
            {
                _environments.Add(environment);
                _dirty = true;
                _current = FindCurrent();
            }
        }

        /// <inheritdoc />
        public void UnregisterEnvironment(IDayNightEnvironment environment)
        {
            if (_environments.Remove(environment))
            {
                _dirty = true;
                _current = FindCurrent();
            }
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            IDayNightEnvironment current = FindCurrent();
            if (!ReferenceEquals(current, _current))
            {
                // Another scene became the active one: its light at once.
                _current = current;
                _dirty = true;
            }

            if (_environments.Count == 0)
            {
                return;
            }

            double now = _time.TotalGameMinutes;
            if (!_dirty && !double.IsNaN(_lastApplied) && Math.Abs(now - _lastApplied) < DayNightMath.ApplyStepMinutes)
            {
                return;
            }

            Apply(now);
        }

        private void Apply(double totalMinutes)
        {
            double hour = DayNightMath.HourOfDay(totalMinutes);
            int moonDay = DayNightMath.MoonDay(totalMinutes);
            DayNightProfile lastProfile = null;
            DayNightSample sample = default;
            for (int i = 0; i < _environments.Count; i++)
            {
                IDayNightEnvironment environment = _environments[i];
                DayNightProfile profile = environment != null ? environment.Profile : null;
                if (profile == null)
                {
                    continue;
                }

                // One evaluation per profile (Eichental and the crypt share theirs).
                if (!ReferenceEquals(profile, lastProfile))
                {
                    sample = profile.Evaluate(hour, moonDay);
                    lastProfile = profile;
                }

                environment.Apply(in sample);
            }

            _lastApplied = totalMinutes;
            _dirty = false;
        }

        private IDayNightEnvironment FindCurrent()
        {
            // The last registered environment of the active scene wins (a scene that just loaded).
            for (int i = _environments.Count - 1; i >= 0; i--)
            {
                IDayNightEnvironment environment = _environments[i];
                if (environment != null && environment.IsInActiveScene)
                {
                    return environment;
                }
            }

            return null;
        }
    }
}
