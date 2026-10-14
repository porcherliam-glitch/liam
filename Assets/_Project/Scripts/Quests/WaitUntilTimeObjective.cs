using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Warte bis Tageszeit X" (GDD 02 5.1 type 22, short code <c>WarteBis</c>): fulfilled by the first
    /// <c>TimeOfDayChanged</c> whose hour lies in the window <see cref="FromHour"/> to <see cref="ToHour"/> (end exclusive;
    /// windows over midnight like 20-6 work). Resting sends one event per skipped hour, so resting also fulfils it.
    /// </summary>
    /// <remarks>
    /// TODO (game clock step, architecture 4.6): the game clock (<c>IGameClock</c>) does not exist yet, so nothing sends
    /// <c>TimeOfDayChanged</c> in the game; tests and the debug console drive it. With the clock, <see cref="QuestObjective.OnStageStarted"/>
    /// should also check the current time at once.
    /// </remarks>
    [Serializable]
    [TypeMenu("Ziele/Warte bis Tageszeit", 8)]
    public sealed class WaitUntilTimeObjective : QuestObjective, IObjectiveListener<TimeOfDayChanged>
    {
        [Tooltip("Beginn des Zeitfensters (Stunde 0–23).")]
        [Range(0, 23)] [SerializeField] private int fromHour = 6;

        [Tooltip("Ende des Zeitfensters (Stunde 0–24, exklusiv). Kleiner als Beginn = über Mitternacht.")]
        [Range(0, 24)] [SerializeField] private int toHour = 20;

        /// <summary>Creates an empty objective.</summary>
        public WaitUntilTimeObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="fromHour">Start hour.</param>
        /// <param name="toHour">End hour (exclusive).</param>
        public WaitUntilTimeObjective(string id, int fromHour, int toHour) : base(id)
        {
            this.fromHour = fromHour;
            this.toHour = toHour;
        }

        /// <summary>Start hour.</summary>
        public int FromHour => fromHour;

        /// <summary>End hour (exclusive).</summary>
        public int ToHour => toHour;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "WarteBis";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<TimeOfDayChanged>(this);
        }

        /// <inheritdoc />
        public void Handle(in TimeOfDayChanged evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (IsInWindow(evt.Hour))
            {
                rt.Complete();
            }
        }

        /// <summary>True if the hour lies in the window.</summary>
        /// <param name="hour">Hour 0-23.</param>
        public bool IsInWindow(int hour)
        {
            if (fromHour == toHour)
            {
                return true;
            }

            return fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + fromHour.ToString("00") + "–" + toHour.ToString("00") + " Uhr)";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            if (fromHour < 0 || fromHour > 23 || toHour < 0 || toHour > 24)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "WarteBis: Stunden außerhalb von 0–24.");
            }
        }
    }
}
