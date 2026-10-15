using Aetherfall.GameTime;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Time of day under the compass ("Erdtag · 10:05"): the player sees when the NPCs work, eat or sleep (GDD 01 7.1;
    /// the minimap with the day symbol follows later, GDD 05 1.2). Updates only when the minute changes.
    /// </summary>
    public sealed class HudClockView
    {
        private readonly Label _label;
        private readonly IGameClock _clock;
        private int _shown = -1;

        /// <summary>Creates the view.</summary>
        /// <param name="label">Label "hud-clock" (may be null: then the view does nothing).</param>
        /// <param name="clock">Game clock (may be null: the label stays hidden).</param>
        public HudClockView(Label label, IGameClock clock)
        {
            _label = label;
            _clock = clock;
            UiElementUtility.SetDisplayed(_label, _label != null && _clock != null);
        }

        /// <summary>Shows the current time if the minute changed.</summary>
        public void Tick()
        {
            if (_label == null || _clock == null)
            {
                return;
            }

            GameDateTime now = _clock.Now;
            int minute = now.Day * 1440 + now.Hour * 60 + now.Minute;
            if (minute == _shown)
            {
                return;
            }

            _shown = minute;
            UiElementUtility.SetText(_label, Text(now));
        }

        /// <summary>Text of a moment, e.g. "Erdtag · 10:05".</summary>
        /// <param name="now">Moment.</param>
        public static string Text(GameDateTime now)
        {
            return GameCalendar.WeekdayName(now.Weekday) + " · " + now.ClockText;
        }
    }
}
