namespace Aetherfall.AI
{
    /// <summary>An enemy (or later animal, companion) ticked by the central <see cref="IAIManager"/> instead of its own Update.</summary>
    public interface IAIAgent
    {
        /// <summary>Advances perception, brain and movement by one frame.</summary>
        /// <param name="deltaTime">Scaled frame time (0 while paused).</param>
        void TickAI(float deltaTime);
    }
}
