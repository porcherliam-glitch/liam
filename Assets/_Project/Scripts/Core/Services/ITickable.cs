namespace Aetherfall.Core
{
    /// <summary>
    /// Service that needs a per-frame update. All registered tickables are updated by the central
    /// <see cref="TickRunner"/> instead of many individual <c>Update()</c> methods (architecture 4.1, 15.2 rule 14).
    /// </summary>
    public interface ITickable
    {
        /// <summary>
        /// Called once per frame after the boot completed, in registration order.
        /// A tickable that throws is logged and not ticked again in this session.
        /// </summary>
        /// <param name="deltaTime">Scaled frame time in seconds (0 while the game is paused).</param>
        void Tick(float deltaTime);
    }
}
