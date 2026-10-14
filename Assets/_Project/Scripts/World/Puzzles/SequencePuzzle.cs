using System;
using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Ordered sequence puzzle (GDD 01 6.7 "Hebel und Sequenzen"; GDD 02 11.7 "die drei Grabplatten": Eiche → Krone →
    /// Schild): elements must be used in the order of the solution. A wrong element fails the attempt and resets the progress
    /// (the slabs spring back); the right last element solves the puzzle for good. Pure logic.
    /// </summary>
    public sealed class SequencePuzzle
    {
        private readonly string[] _steps;
        private readonly List<string> _pressed = new List<string>();

        /// <summary>Creates the puzzle.</summary>
        /// <param name="steps">Element ids in the order of the solution (at least one, unique).</param>
        /// <exception cref="ArgumentException">Empty, null or duplicate steps.</exception>
        public SequencePuzzle(IReadOnlyList<string> steps)
        {
            if (steps == null || steps.Count == 0)
            {
                throw new ArgumentException("A sequence needs at least one step.", nameof(steps));
            }

            _steps = new string[steps.Count];
            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < steps.Count; i++)
            {
                string step = steps[i];
                if (string.IsNullOrEmpty(step) || !seen.Add(step))
                {
                    throw new ArgumentException("Step " + (i + 1) + " is empty or used twice.", nameof(steps));
                }

                _steps[i] = step;
            }
        }

        /// <summary>Number of steps of the solution.</summary>
        public int StepCount => _steps.Length;

        /// <summary>Right steps in the current attempt.</summary>
        public int Progress => _pressed.Count;

        /// <summary>True once solved (stays solved).</summary>
        public bool IsSolved { get; private set; }

        /// <summary>Elements pressed in the current attempt (all of them once solved).</summary>
        public IReadOnlyList<string> PressedElements => _pressed;

        /// <summary>Number of failed attempts (telemetry, debug).</summary>
        public int FailedAttempts { get; private set; }

        /// <summary>True if the id belongs to the puzzle.</summary>
        /// <param name="elementId">Element id.</param>
        public bool Contains(string elementId)
        {
            return Array.IndexOf(_steps, elementId) >= 0;
        }

        /// <summary>True if the element is pressed in the current attempt (or the puzzle is solved).</summary>
        /// <param name="elementId">Element id.</param>
        public bool IsPressed(string elementId)
        {
            return IsSolved ? Contains(elementId) : _pressed.Contains(elementId);
        }

        /// <summary>Uses an element.</summary>
        /// <param name="elementId">Element id.</param>
        /// <returns>What happened.</returns>
        public SequenceStepResult Press(string elementId)
        {
            if (IsSolved || !Contains(elementId) || _pressed.Contains(elementId))
            {
                return SequenceStepResult.Ignored;
            }

            if (!string.Equals(_steps[_pressed.Count], elementId, StringComparison.Ordinal))
            {
                _pressed.Clear();
                FailedAttempts++;
                return SequenceStepResult.Failed;
            }

            _pressed.Add(elementId);
            if (_pressed.Count < _steps.Length)
            {
                return SequenceStepResult.Progressed;
            }

            IsSolved = true;
            return SequenceStepResult.Solved;
        }

        /// <summary>Forgets the current attempt (not a solved state).</summary>
        public void ResetAttempt()
        {
            if (!IsSolved)
            {
                _pressed.Clear();
            }
        }

        /// <summary>Sets the saved state: solved with every element pressed, or unsolved without progress.</summary>
        /// <param name="solved">True if solved.</param>
        public void Restore(bool solved)
        {
            _pressed.Clear();
            IsSolved = solved;
            if (solved)
            {
                _pressed.AddRange(_steps);
            }
        }
    }
}
