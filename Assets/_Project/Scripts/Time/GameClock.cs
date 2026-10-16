using System;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// The two clocks of architecture 4.6 in one service: the active playtime (<see cref="IPlaytimeClock"/>: runs in Playing,
    /// Menu, Dialogue, Cutscene and Building) and the game clock (<see cref="IGameClock"/>: runs only in Playing and Building,
    /// table 4.4). Saves both in section <c>time</c>, writes the playtime into the save header and sends
    /// <c>TimeOfDayChanged</c> for every new game minute and <c>DayPhaseChanged</c> when the phase of the day changes (S35;
    /// with <c>Skipped</c> during <see cref="AdvanceHours"/>, never on loading). Pure C# service, ticked with real time.
    /// </summary>
    public sealed class GameClock : Saveable<PlaytimeDto>, IPlaytimeClock, IGameClock, IUnscaledTickable, ISaveHeaderContributor
    {
        /// <summary>Save key of the section (table 9.2).</summary>
        public const string Key = "time";

        /// <summary>Load order of the section (table 9.2).</summary>
        public const int Order = 10;

        private const float MaxAdvanceHours = 7f * 24f;

        private readonly IGameStateService _gameState;
        private readonly IEventBus _bus;
        private double _seconds;
        private double _gameMinutes = GameCalendar.StartMinutes;
        private float _dayLength = GameCalendar.DefaultRealSecondsPerDay;
        private long _lastMinute = (long)GameCalendar.StartMinutes;
        private DayPhase _phase = GameCalendar.PhaseOf((int)(GameCalendar.StartMinutes / 60));
        private bool _skipping;

        /// <summary>Creates the clock: playtime 0, day 1 at 10:00.</summary>
        /// <param name="gameState">Game state service (decides which counter runs).</param>
        /// <param name="bus">Event bus for <c>TimeOfDayChanged</c> (may be null in tests).</param>
        public GameClock(IGameStateService gameState, IEventBus bus) : base(Key, Order)
        {
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            _bus = bus;
        }

        /// <inheritdoc />
        public double PlaytimeSeconds => _seconds;

        /// <inheritdoc />
        public bool IsRunning => GameStateRules.IsPlaytimeRunning(_gameState.Current);

        /// <inheritdoc />
        public bool IsClockRunning => GameStateRules.IsGameClockRunning(_gameState.Current);

        /// <inheritdoc />
        public GameDateTime Now => GameDateTime.FromTotalMinutes(_gameMinutes);

        /// <inheritdoc />
        public double TotalGameMinutes => _gameMinutes;

        /// <inheritdoc />
        public float RealSecondsPerGameDay => _dayLength;

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return;
            }

            if (IsRunning)
            {
                _seconds += deltaTime;
            }

            if (IsClockRunning)
            {
                _gameMinutes += GameCalendar.GameMinutesFor(deltaTime, _dayLength);
                long minute = (long)Math.Floor(_gameMinutes);
                if (minute != _lastMinute)
                {
                    // A long frame may skip minutes: one event for the newest minute is enough (watches compare hours).
                    _lastMinute = minute;
                    Publish(Now);
                }
            }
        }

        /// <inheritdoc />
        public void SetDayLength(float realSeconds)
        {
            _dayLength = GameCalendar.ClampDayLength(realSeconds);
        }

        /// <inheritdoc />
        public void AdvanceHours(float hours, string reasonId)
        {
            if (!(hours > 0f))
            {
                return;
            }

            float clamped = Math.Min(hours, MaxAdvanceHours);
            double end = _gameMinutes + clamped * 60.0;
            double next = Math.Floor(_gameMinutes / 60.0) * 60.0 + 60.0;
            _skipping = true;
            try
            {
                while (next <= end)
                {
                    // One event per skipped full hour (architecture 4.6: "gebündelt").
                    _gameMinutes = next;
                    Publish(Now);
                    next += 60.0;
                }

                _gameMinutes = end;
                _lastMinute = (long)Math.Floor(_gameMinutes);
                Publish(Now);
            }
            finally
            {
                _skipping = false;
            }

            Log.Info(LogCategory.Core, "Game clock +" + clamped.ToString("0.##") + " h (" + (reasonId ?? "?") + "): " + Now + ".");
        }

        /// <inheritdoc />
        public void Contribute(SaveHeader header)
        {
            header.PlaytimeSeconds = _seconds;
        }

        /// <summary>Formats seconds as "h:mm:ss" (debug display; the UI formats "23:41 h" itself).</summary>
        /// <param name="seconds">Seconds.</param>
        public static string Format(double seconds)
        {
            var time = TimeSpan.FromSeconds(Math.Max(0.0, seconds));
            return ((int)time.TotalHours).ToString() + ":" + time.Minutes.ToString("00") + ":" + time.Seconds.ToString("00");
        }

        /// <inheritdoc />
        protected override PlaytimeDto Capture()
        {
            return new PlaytimeDto { PlaytimeSeconds = _seconds, TotalGameMinutes = _gameMinutes, RealSecondsPerGameDay = _dayLength };
        }

        /// <inheritdoc />
        protected override void Restore(PlaytimeDto data, in LoadContext ctx)
        {
            _seconds = data != null && data.PlaytimeSeconds > 0.0 ? data.PlaytimeSeconds : 0.0;
            _gameMinutes = data != null && data.TotalGameMinutes >= 0.0 ? data.TotalGameMinutes : GameCalendar.StartMinutes;
            _dayLength = GameCalendar.ClampDayLength(data != null ? data.RealSecondsPerGameDay : GameCalendar.DefaultRealSecondsPerDay);
            _lastMinute = (long)Math.Floor(_gameMinutes);

            // A loaded game starts in its phase: no DayPhaseChanged for the jump of the load.
            _phase = Now.Phase;
            Publish(Now);
        }

        private void Publish(GameDateTime now)
        {
            DayPhase previous = _phase;
            _phase = now.Phase;
            if (_bus == null)
            {
                return;
            }

            // The events count days from 0 (architecture 4.3); the clock shows them from 1.
            var changed = new TimeOfDayChanged(now.Day - 1, now.Hour, now.Minute, now.Phase);
            _bus.Publish(in changed);
            if (now.Phase != previous)
            {
                var phase = new DayPhaseChanged(now.Day - 1, previous, now.Phase, _skipping);
                _bus.Publish(in phase);
            }
        }
    }
}
