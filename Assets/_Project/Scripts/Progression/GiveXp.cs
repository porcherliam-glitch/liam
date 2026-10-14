using System;
using System.Globalization;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Action "Erfahrung geben" (architecture 7.7 <c>GiveXp</c>, §6.4): gives the player a fixed amount of experience or a level
    /// share (GDD 02 4.1: rewards are written as "0,5 Lv" and converted with the curve of GDD 03 12.3, so they stay in their
    /// band when the curve changes). The source (quest id) goes with the event <c>XpGained</c>.
    /// </summary>
    /// <remarks>
    /// <para>Reference level of a level share: the recommended level of the content (field "Bezugslevel"); 0 = the player's
    /// level at the moment of the reward. Example: 0.5 Lv at level 3 = 0.5 × 610 = 305 XP.</para>
    /// <para>Overlevel attenuation (GDD 02 8.4 "D", GDD 03 12.7): with a reference level the reward shrinks by 10 % per level
    /// the player is more than 3 levels above it, down to 25 % (<see cref="ProgressionRules.QuestLevelShareXp"/>). Example:
    /// 0.5 Lv at level 2 = 200 XP; a player of level 9 gets 120 XP. Fixed rewards and reference level 0 are not attenuated.</para>
    /// <para>TODO (story corridor step): main quests use their own attenuation, −10 % per level above corridor + 3, at least
    /// 50 % (GDD 03 12.7); until the corridor exists they get the attenuation above.</para>
    /// </remarks>
    [Serializable]
    [TypeMenu("Spieler/Erfahrung geben", 0)]
    public sealed class GiveXp : GameAction
    {
        [Tooltip("Fest (Erfahrungspunkte) oder Level-Anteil (z. B. 0,5 Lv).")]
        [SerializeField] private XpRewardMode mode = XpRewardMode.LevelShare;

        [Tooltip("Nur bei „Fest“: Erfahrungspunkte.")]
        [Min(0)] [SerializeField] private int amount = 0;

        [Tooltip("Nur bei „Level-Anteil“: Anteil eines Levels, z. B. 0,5 (Nebenquest bis Level 10: 0,3–0,5 Lv, GDD 02 2.2).")]
        [Min(0f)] [SerializeField] private float levelShare = 0.5f;

        [Tooltip("Nur bei „Level-Anteil“: Bezugslevel (empfohlenes Level der Quest). 0 = aktuelles Level des Spielers. " +
                 "Liegt der Spieler mehr als 3 Level darüber, gibt es 10 % weniger je Level, mindestens 25 % (GDD 02, 8.4).")]
        [Range(0, 80)] [SerializeField] private int referenceLevel = 0;

        /// <summary>Creates an empty action (level share 0.5 at the player's level).</summary>
        public GiveXp()
        {
        }

        /// <summary>Creates a fixed reward.</summary>
        /// <param name="amount">Experience points.</param>
        public GiveXp(int amount)
        {
            mode = XpRewardMode.Fixed;
            this.amount = amount;
        }

        /// <summary>Creates a level share reward.</summary>
        /// <param name="levelShare">Share of a level.</param>
        /// <param name="referenceLevel">Reference level; 0 = the player's level.</param>
        public GiveXp(float levelShare, int referenceLevel)
        {
            mode = XpRewardMode.LevelShare;
            this.levelShare = levelShare;
            this.referenceLevel = referenceLevel;
        }

        /// <summary>Mode.</summary>
        public XpRewardMode Mode => mode;

        /// <summary>Fixed experience.</summary>
        public int Amount => amount;

        /// <summary>Level share.</summary>
        public float LevelShare => levelShare;

        /// <summary>Reference level (0 = player level).</summary>
        public int ReferenceLevel => referenceLevel;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            IProgressionService progression = ctx.Get<IProgressionService>();
            if (mode == XpRewardMode.Fixed)
            {
                progression.AddXp(amount, ctx.SourceId);
            }
            else if (referenceLevel > 0)
            {
                progression.AddXp(ProgressionRules.QuestLevelShareXp(progression.Curve, levelShare, referenceLevel, progression.Level), ctx.SourceId);
            }
            else
            {
                progression.AddXpLevelShare(levelShare, 0, ctx.SourceId);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            if (mode == XpRewardMode.Fixed)
            {
                return "Erfahrung +" + amount.ToString(CultureInfo.InvariantCulture);
            }

            return "Erfahrung " + levelShare.ToString("0.##", CultureInfo.InvariantCulture).Replace('.', ',') + " Lv" +
                   (referenceLevel > 0 ? " (bei Level " + referenceLevel + ")" : string.Empty);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (mode == XpRewardMode.Fixed)
            {
                report.RequirePositive(amount, "Erfahrung");
                return;
            }

            if (levelShare <= 0f || levelShare > 2f || float.IsNaN(levelShare))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Level-Anteil " + levelShare + " liegt nicht zwischen 0 und 2.");
            }
        }
    }
}
