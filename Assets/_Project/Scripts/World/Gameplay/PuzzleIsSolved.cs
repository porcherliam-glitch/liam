using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Condition "Raetsel geloest" (GDD 02 5.1 objective type "Raetsel"): the puzzle is stored as solved, e.g.
    /// <c>puzzle.eichental.gruft_grabplatten</c>. Holds also after loading a save. Re-evaluated on <c>PuzzleSolved</c> and
    /// <c>WorldObjectStateChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Rätsel gelöst", 3)]
    public sealed class PuzzleIsSolved : Condition
    {
        [Tooltip("Rätsel-ID, z. B. puzzle.eichental.gruft_grabplatten.")]
        [SerializeField] private string puzzleId = string.Empty;

        /// <summary>Creates an empty condition.</summary>
        public PuzzleIsSolved()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="puzzleId">Puzzle id.</param>
        public PuzzleIsSolved(string puzzleId)
        {
            this.puzzleId = puzzleId ?? string.Empty;
        }

        /// <summary>Puzzle id.</summary>
        public string PuzzleId => puzzleId;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IWorldObjectStateStore>().GetState(puzzleId) == WorldObjectStates.Done;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<PuzzleSolved>();
            triggers.On<WorldObjectStateChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Rätsel " + (string.IsNullOrEmpty(puzzleId) ? "?" : puzzleId) + " gelöst";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(puzzleId, "puzzle.", "Rätsel-ID");
        }
    }
}
