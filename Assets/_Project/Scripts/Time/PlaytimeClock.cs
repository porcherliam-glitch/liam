using System;
using Aetherfall.Core;
using Aetherfall.SaveSystem;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// Counts the active playtime (see <see cref="IPlaytimeClock"/>), saves it in section <c>time</c> and writes it into the
    /// save header (<c>playtimeSeconds</c>, GDD 05 5.5 "Spielzeit 23:41 h"). Pure C# service, ticked with real time
    /// (<see cref="IUnscaledTickable"/>: the hub menus pause the game, but the playtime runs on, table 4.4).
    /// </summary>
    public sealed class PlaytimeClock : Saveable<PlaytimeDto>, IPlaytimeClock, IUnscaledTickable, ISaveHeaderContributor
    {
        /// <summary>Save key of the section (table 9.2).</summary>
        public const string Key = "time";

        /// <summary>Load order of the section (table 9.2).</summary>
        public const int Order = 10;

        private readonly IGameStateService _gameState;
        private double _seconds;

        /// <summary>Creates the clock at 0.</summary>
        /// <param name="gameState">Game state service (decides whether the counter runs).</param>
        public PlaytimeClock(IGameStateService gameState) : base(Key, Order)
        {
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
        }

        /// <inheritdoc />
        public double PlaytimeSeconds => _seconds;

        /// <inheritdoc />
        public bool IsRunning => GameStateRules.IsPlaytimeRunning(_gameState.Current);

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (deltaTime > 0f && IsRunning)
            {
                _seconds += deltaTime;
            }
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
            return new PlaytimeDto { PlaytimeSeconds = _seconds };
        }

        /// <inheritdoc />
        protected override void Restore(PlaytimeDto data, in LoadContext ctx)
        {
            _seconds = data != null && data.PlaytimeSeconds > 0.0 ? data.PlaytimeSeconds : 0.0;
        }
    }
}
