using Aetherfall.Combat;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Poise rules of a boss that the general <see cref="PoiseMeter"/> does not cover. Pure logic.
    /// </summary>
    public static class BossPoise
    {
        /// <summary>
        /// Fills the poise after a phase change (GDD 03 9.6: "Haltung danach voll"): build-up 0, a running poise stun ends. The
        /// growth of the maximum per break (GDD 03 4.9: +25 % per break, at most +75 %) is kept, unlike
        /// <see cref="PoiseMeter.Reset"/>.
        /// </summary>
        /// <param name="poise">Poise of the boss (null does nothing).</param>
        public static void Refill(PoiseMeter poise)
        {
            if (poise == null)
            {
                return;
            }

            if (!poise.IsStunned)
            {
                // PoiseMeter has no refill that keeps the growth: a minimal stun, ended at once, sets the build-up to 0.
                poise.Stun(0.001f, false);
            }

            poise.EndStun();
        }
    }
}
