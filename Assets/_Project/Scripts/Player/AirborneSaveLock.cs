using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.Player
{
    /// <summary>
    /// Save lock "falling, jumping" of the player (architecture 9.8: set by the Player; GDD 05 5.2: nobody saves right before
    /// a deadly fall): while the character is in the air or climbs, <see cref="ISaveManager.IsSaveAllowed"/> is false with the reason
    /// <see cref="SaveReasonKeys.Falling"/>. Covers F5, the autosave (deferred until landing) and the save menu.
    /// </summary>
    /// <remarks>
    /// Pure logic; <see cref="PlayerPersistence"/> calls <see cref="Update"/> every frame with
    /// <see cref="PlayerMotor.IsAirborne"/>. The lock is renewed every frame in the air (cheap, no allocation), so it comes
    /// back even if the save manager dropped all locks (new game). Diving comes with swimming.
    /// </remarks>
    public sealed class AirborneSaveLock
    {
        /// <summary>Blocker id at the save manager.</summary>
        public const string BlockerId = "player.airborne";

        private readonly ISaveManager _saves;

        /// <summary>Creates the lock (initially released).</summary>
        /// <param name="saves">Save manager.</param>
        public AirborneSaveLock(ISaveManager saves)
        {
            _saves = saves ?? throw new ArgumentNullException(nameof(saves));
        }

        /// <summary>True while the lock is set.</summary>
        public bool IsLocked { get; private set; }

        /// <summary>Sets or releases the lock.</summary>
        /// <param name="airborne">True while the character jumps or falls.</param>
        public void Update(bool airborne)
        {
            if (airborne)
            {
                _saves.AddBlocker(BlockerId, SaveReasonKeys.Falling);
                IsLocked = true;
            }
            else if (IsLocked)
            {
                _saves.RemoveBlocker(BlockerId);
                IsLocked = false;
            }
        }

        /// <summary>Releases the lock (player destroyed).</summary>
        public void Release()
        {
            Update(false);
        }
    }
}
