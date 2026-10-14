using System;
using Aetherfall.Stats;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Experience and level of the player (GDD 03 12, §11.3, architecture 3.3 no. 14): experience curve, level 1–80, one
    /// attribute point and one skill point per level, distributing attribute points (stat modifiers with the source
    /// <see cref="ProgressionRules.AttributeSourceId"/>), extra skill points of special quests and experience from kills.
    /// Registered by <see cref="ProgressionInstaller"/>.
    /// </summary>
    /// <remarks>
    /// Global events (architecture 4.3): <c>XpGained</c> for every gain, <c>LevelUp</c> once per reached level. Loading a save
    /// sends none of them; the local C# event <see cref="Changed"/> (UI, player bridge) is raised after every change including
    /// loads. Main thread only.
    /// </remarks>
    public interface IProgressionService
    {
        /// <summary>Raised after every change of experience, level, points or the bound stats (also after loading).</summary>
        event Action Changed;

        /// <summary>Counter that grows with every change (cheap "did anything change" check for views).</summary>
        int Revision { get; }

        /// <summary>The experience curve.</summary>
        XpCurve Curve { get; }

        /// <summary>Current level (1 … <see cref="MaxLevel"/>).</summary>
        int Level { get; }

        /// <summary>Highest level.</summary>
        int MaxLevel { get; }

        /// <summary>True at the highest level (experience no longer counts until paragon exists).</summary>
        bool IsMaxLevel { get; }

        /// <summary>Experience collected in the current level.</summary>
        int XpIntoLevel { get; }

        /// <summary>Experience needed from the current level to the next (0 at the max level).</summary>
        int XpForNextLevel { get; }

        /// <summary>Total experience (all levels).</summary>
        int TotalXp { get; }

        /// <summary>Progress in the current level, 0 … 1 (1 at the max level).</summary>
        float LevelProgress01 { get; }

        /// <summary>Attribute points that can be distributed.</summary>
        int UnspentAttributePoints { get; }

        /// <summary>Skill points that can be spent in the skill trees (the trees follow later).</summary>
        int UnspentSkillPoints { get; }

        /// <summary>The player's stats bound by <see cref="AttachPlayerStats"/>, or null.</summary>
        StatCollection PlayerStats { get; }

        /// <summary>Attribute points distributed to an attribute (all time).</summary>
        /// <param name="attribute">One of the six attributes.</param>
        int GetSpentPoints(StatId attribute);

        /// <summary>Attribute points of an attribute that can still be taken back (spent since the last <see cref="LockAllocation"/>).</summary>
        /// <param name="attribute">One of the six attributes.</param>
        int GetRefundablePoints(StatId attribute);

        /// <summary>Adds experience (level-ups included). Sends <c>XpGained</c> and <c>LevelUp</c>.</summary>
        /// <param name="amount">Experience (0 or less = nothing).</param>
        /// <param name="sourceId">Source (enemy type, quest id, <c>debug</c>).</param>
        /// <returns>The experience that counted (0 at the max level).</returns>
        int AddXp(int amount, string sourceId);

        /// <summary>
        /// Adds experience given as level share (GDD 02 4.1 "0,5 Lv"): share × XP_next(reference level). A reference level of 0
        /// or less uses the current level.
        /// </summary>
        /// <param name="share">Level share, e.g. 0.5.</param>
        /// <param name="referenceLevel">Reference level, 0 = current level.</param>
        /// <param name="sourceId">Source.</param>
        /// <returns>The experience that counted.</returns>
        int AddXpLevelShare(float share, int referenceLevel, string sourceId);

        /// <summary>Adds skill points (special quests and secrets, GDD 03 12.2).</summary>
        /// <param name="amount">Points (0 or less = nothing).</param>
        /// <param name="sourceId">Source for logs.</param>
        void AddSkillPoints(int amount, string sourceId);

        /// <summary>True if one more point can go to the attribute now.</summary>
        /// <param name="attribute">One of the six attributes.</param>
        /// <param name="reason">German reason if not.</param>
        bool CanSpendAttributePoint(StatId attribute, out string reason);

        /// <summary>Distributes one attribute point (free point, hard cap 60 for base value plus points).</summary>
        /// <param name="attribute">One of the six attributes.</param>
        bool TrySpendAttributePoint(StatId attribute);

        /// <summary>Takes back one point spent since the last <see cref="LockAllocation"/> (GDD 03 11.9 "bis zum Schliessen des Menues").</summary>
        /// <param name="attribute">One of the six attributes.</param>
        bool TryRefundAttributePoint(StatId attribute);

        /// <summary>Makes the distributed points final (the character page closes).</summary>
        void LockAllocation();

        /// <summary>Binds the player's stats: level and distributed points are applied (and kept up to date).</summary>
        /// <param name="stats">Player stats.</param>
        void AttachPlayerStats(StatCollection stats);

        /// <summary>Removes the progression modifiers from the stats and unbinds them (player destroyed).</summary>
        /// <param name="stats">The stats passed to <see cref="AttachPlayerStats"/>.</param>
        void DetachPlayerStats(StatCollection stats);
    }
}
