namespace Aetherfall.World
{
    /// <summary>
    /// Counts the colliders of the player inside an area (pure logic of <see cref="AreaTrigger"/>): the area is entered when the
    /// first collider comes in and left when the last one goes out, so a player with several colliders or a collider that
    /// touches the border twice sends <c>AreaEntered</c> only once per visit.
    /// </summary>
    public sealed class AreaPresence
    {
        private int _count;

        /// <summary>True while at least one collider of the player is inside.</summary>
        public bool IsInside => _count > 0;

        /// <summary>A collider of the player came in.</summary>
        /// <returns>True if this is the start of a visit (send <c>AreaEntered</c>).</returns>
        public bool Enter()
        {
            _count++;
            return _count == 1;
        }

        /// <summary>A collider of the player went out.</summary>
        /// <returns>True if the visit ended.</returns>
        public bool Exit()
        {
            if (_count == 0)
            {
                return false;
            }

            _count--;
            return _count == 0;
        }

        /// <summary>Forgets every collider (the trigger was disabled, the player respawned elsewhere).</summary>
        public void Reset()
        {
            _count = 0;
        }
    }
}
