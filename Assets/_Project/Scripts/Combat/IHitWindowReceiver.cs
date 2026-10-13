namespace Aetherfall.Combat
{
    /// <summary>
    /// Receiver of the hit window of an attack (§9.8 "Hitboxen ueber Animation Events aktivieren und deaktivieren"). Today the
    /// time based <see cref="AttackRunner"/> calls it; later the <c>AnimationEventRelay</c> calls the same two methods from
    /// the Animation Events <c>HitboxOn</c>/<c>HitboxOff</c> (architecture 11.4), so hit registration does not change.
    /// </summary>
    public interface IHitWindowReceiver
    {
        /// <summary>The hit window of <paramref name="attack"/> opens: the hitbox starts to look for hurtboxes.</summary>
        /// <param name="attack">The running attack (shape, offset, multipliers).</param>
        void OpenHitWindow(AttackSpec attack);

        /// <summary>The hit window closes (end of the active phase, cancel, stagger, death).</summary>
        void CloseHitWindow();
    }
}
