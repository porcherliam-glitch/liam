namespace Aetherfall.Player
{
    /// <summary>Ground information of one frame for <see cref="PlayerMovementModel"/> (from the CharacterController and a ground probe).</summary>
    public readonly struct GroundContact
    {
        /// <summary>Creates the contact.</summary>
        /// <param name="isGrounded">True if the character stands on (or touches) ground below it.</param>
        /// <param name="normal">Surface normal of that ground (unit length); ignored if not grounded.</param>
        public GroundContact(bool isGrounded, MotionVector normal)
        {
            IsGrounded = isGrounded;
            Normal = normal;
        }

        /// <summary>No ground below the character (in the air).</summary>
        public static GroundContact Airborne => new GroundContact(false, MotionVector.Up);

        /// <summary>Flat ground.</summary>
        public static GroundContact Flat => new GroundContact(true, MotionVector.Up);

        /// <summary>True if the character stands on (or touches) ground below it.</summary>
        public bool IsGrounded { get; }

        /// <summary>Surface normal of the ground.</summary>
        public MotionVector Normal { get; }
    }
}
