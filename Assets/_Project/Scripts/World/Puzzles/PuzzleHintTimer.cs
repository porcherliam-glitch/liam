using System;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Hint after a while without progress (GDD 01 6.7 and GDD 02 11.7: "Nach 120 s ohne Fortschritt gibt Maren (falls in der
    /// Gruppe) einen Hinweis"). Without a companion (Mini-Slice) the puzzle shows its fairness hint instead (inscription glows,
    /// soot marks light up). Counts only while the player is near and the puzzle unsolved; progress restarts the count and hides
    /// the hint. Pure logic.
    /// </summary>
    public sealed class PuzzleHintTimer
    {
        private float _elapsed;

        /// <summary>Creates the timer.</summary>
        /// <param name="seconds">Seconds without progress until the hint (0 or less = never).</param>
        public PuzzleHintTimer(float seconds)
        {
            Seconds = seconds;
        }

        /// <summary>Seconds without progress until the hint.</summary>
        public float Seconds { get; }

        /// <summary>True while the hint is shown.</summary>
        public bool IsHintShown { get; private set; }

        /// <summary>True after <see cref="Stop"/> (puzzle solved): never counts again.</summary>
        public bool IsStopped { get; private set; }

        /// <summary>Seconds counted since the last progress.</summary>
        public float Elapsed => _elapsed;

        /// <summary>Counts time.</summary>
        /// <param name="deltaTime">Seconds (scaled game time).</param>
        /// <param name="playerNear">True while the player is in the puzzle room.</param>
        /// <returns>True exactly when the hint becomes due.</returns>
        public bool Tick(float deltaTime, bool playerNear)
        {
            if (IsStopped || IsHintShown || !(Seconds > 0f) || !playerNear || !(deltaTime > 0f))
            {
                return false;
            }

            _elapsed += deltaTime;
            if (_elapsed < Seconds)
            {
                return false;
            }

            IsHintShown = true;
            return true;
        }

        /// <summary>The player made progress: hide the hint and count again.</summary>
        public void NotifyProgress()
        {
            _elapsed = 0f;
            IsHintShown = false;
        }

        /// <summary>The puzzle is solved: hide the hint for good.</summary>
        public void Stop()
        {
            IsStopped = true;
            IsHintShown = false;
            _elapsed = 0f;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "PuzzleHintTimer(" + Math.Round(_elapsed, 1) + "/" + Seconds + " s, shown " + IsHintShown + ")";
        }
    }
}
