using System;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Combinable traits of a quest (GDD 02, 2.1 "Merkmale"; tag <c>notfall</c> from 9.1). Values are stored in assets:
    /// never renumber.
    /// </summary>
    [Flags]
    public enum QuestTraits
    {
        /// <summary>No trait.</summary>
        None = 0,

        /// <summary>Hidden (<c>versteckt</c>): no giver symbol, found by exploring.</summary>
        Hidden = 1,

        /// <summary>Time-limited (<c>zeitlich_begrenzt</c>): has a deadline.</summary>
        TimeLimited = 2,

        /// <summary>Part of a chain (<c>kette</c>).</summary>
        Chain = 4,

        /// <summary>Emergency (<c>notfall</c>): allows deadlines under 2 game days (validator W10).</summary>
        Emergency = 8
    }
}
