using System;
using System.Collections.Generic;

namespace Aetherfall.Classes
{
    /// <summary>
    /// The class of the player (GDD 03 11; slice: krieger or magier). The class choice of the main menu sets the class of the
    /// next new game (<see cref="ChooseForNewGame"/>); a new game starts with it, a loaded game brings its own class.
    /// </summary>
    public interface IClassService
    {
        /// <summary>All classes that can be chosen, in menu order.</summary>
        IReadOnlyList<ClassSpec> Classes { get; }

        /// <summary>Class of the running game.</summary>
        ClassSpec Current { get; }

        /// <summary>Class the next new game starts with.</summary>
        ClassSpec Pending { get; }

        /// <summary>Raised when the class of the running game is set: the class, and true for a new game (fresh start values).</summary>
        event Action<ClassSpec, bool> Changed;

        /// <summary>Chooses the class of the next new game (also its starting kit).</summary>
        /// <param name="classId">Class id.</param>
        /// <returns>False for an unknown id.</returns>
        bool ChooseForNewGame(string classId);
    }
}
