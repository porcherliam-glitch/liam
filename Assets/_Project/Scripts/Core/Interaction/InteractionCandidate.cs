namespace Aetherfall.Core
{
    /// <summary>
    /// Plain data of one interaction candidate for <see cref="InteractionSelector"/>: position, priority and availability.
    /// Floats instead of <c>Vector3</c>, so the selection runs and is tested outside of Unity.
    /// </summary>
    public readonly struct InteractionCandidate
    {
        /// <summary>World X of the interaction point.</summary>
        public readonly float X;

        /// <summary>World Y of the interaction point.</summary>
        public readonly float Y;

        /// <summary>World Z of the interaction point.</summary>
        public readonly float Z;

        /// <summary>Priority (<see cref="IInteractable.InteractionPriority"/>); higher wins.</summary>
        public readonly int Priority;

        /// <summary>False if the object cannot be used right now (<see cref="IInteractable.CanInteract"/>); never selected.</summary>
        public readonly bool Available;

        /// <summary>Creates a candidate.</summary>
        /// <param name="x">World X.</param>
        /// <param name="y">World Y.</param>
        /// <param name="z">World Z.</param>
        /// <param name="priority">Priority.</param>
        /// <param name="available">True if usable now.</param>
        public InteractionCandidate(float x, float y, float z, int priority, bool available)
        {
            X = x;
            Y = y;
            Z = z;
            Priority = priority;
            Available = available;
        }
    }
}
