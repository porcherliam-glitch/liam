namespace Aetherfall.World
{
    /// <summary>
    /// When the windows of a house glow (S35): in the evening from <c>eveningFrom</c> until <c>closeHour</c> (24 = midnight) and in
    /// the morning from <c>morningFrom</c> until <c>morningUntil</c>. Pure logic.
    /// </summary>
    public static class WindowLightRules
    {
        /// <summary>True if the windows glow at an hour.</summary>
        /// <param name="hour">Hour of the day (fractional).</param>
        /// <param name="eveningFrom">Evening light on.</param>
        /// <param name="closeHour">Evening light off (24 = midnight; later values reach into the next day).</param>
        /// <param name="morningFrom">Morning light on.</param>
        /// <param name="morningUntil">Morning light off.</param>
        public static bool IsLit(double hour, double eveningFrom, double closeHour, double morningFrom, double morningUntil)
        {
            double close = closeHour >= 24d ? closeHour - 24d : closeHour;
            return InWindow(hour, eveningFrom, close) || InWindow(hour, morningFrom, morningUntil);
        }

        /// <summary>True if an hour lies in a window that may reach across midnight (from 22 to 2).</summary>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="from">Start (inclusive).</param>
        /// <param name="to">End (exclusive).</param>
        public static bool InWindow(double hour, double from, double to)
        {
            if (from == to)
            {
                return false;
            }

            return from < to ? hour >= from && hour < to : hour >= from || hour < to;
        }
    }
}
