namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Autosave after an arrival through a portal (GDD 05 5.3: "nach dem Verlassen von Dungeons"; architecture 10.8): the
    /// <see cref="ArrivalAnchor"/> that took over the arrival arms it, and it requests exactly one autosave as soon as the
    /// player has been placed in the new scene (<c>PlayerSpawned</c>, sent on Loading → Playing). Pure C#.
    /// </summary>
    public sealed class ArrivalAutosave
    {
        private readonly IWorldAutosave _autosave;
        private readonly string _reason;

        /// <summary>Creates the trigger (not armed).</summary>
        /// <param name="autosave">Autosave of the world (null: never saves, e.g. without the WorldSaveInstaller).</param>
        /// <param name="reason">Reason for the log, e.g. the anchor id.</param>
        public ArrivalAutosave(IWorldAutosave autosave, string reason)
        {
            _autosave = autosave;
            _reason = string.IsNullOrEmpty(reason) ? "arrival" : reason;
        }

        /// <summary>True while it waits for the player to be placed.</summary>
        public bool IsArmed { get; private set; }

        /// <summary>The player arrives at this anchor: save once he is placed.</summary>
        /// <returns>True if armed (an autosave service exists).</returns>
        public bool Arm()
        {
            IsArmed = _autosave != null;
            return IsArmed;
        }

        /// <summary>The player was placed in the scene (<c>PlayerSpawned</c>).</summary>
        /// <returns>True if the autosave was requested now (only the first time after <see cref="Arm"/>).</returns>
        public bool NotifyPlayerSpawned()
        {
            if (!IsArmed)
            {
                return false;
            }

            IsArmed = false;
            _autosave.RequestAutosave(_reason);
            return true;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ArrivalAutosave(" + _reason + ", armed " + IsArmed + ")";
        }
    }
}
