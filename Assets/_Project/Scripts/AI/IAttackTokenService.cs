namespace Aetherfall.AI
{
    /// <summary>
    /// Attack tokens per target (§20.2 "greifen nicht alle gleichzeitig an", architecture 11.10, GDD 03 9.3): an enemy may
    /// start an attack only while it holds a token; without one it circles and threatens. Budget Normal 2 melee + 2 ranged,
    /// cost Normal 1 / Elite 2 / Champion 3; after giving a token back the same enemy waits 1.0 s; between two attack starts
    /// of different enemies on the same target lie at least 0.6 s.
    /// </summary>
    /// <remarks>Agents are identified by id strings (architecture 11.10 names an <c>AIAgent</c>; ids keep the service pure and testable).</remarks>
    public interface IAttackTokenService
    {
        /// <summary>Tries to take tokens for an attack on <paramref name="targetId"/>.</summary>
        /// <param name="targetId">Id of the target (e.g. <c>player</c>).</param>
        /// <param name="agentId">Unique id of the enemy.</param>
        /// <param name="cost">Token cost (Normal 1).</param>
        /// <param name="kind">Melee or ranged budget.</param>
        /// <returns>True if the enemy holds the tokens now (also if it already held them).</returns>
        bool TryAcquire(string targetId, string agentId, int cost, TokenKind kind = TokenKind.Melee);

        /// <summary>
        /// Asks to start an attack now (GDD 03 9.3 "Takt"): allowed while the enemy holds tokens on the target and the last
        /// attack start on that target lies at least the minimum interval (0.6 s) back; then this start is recorded.
        /// </summary>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="agentId">Unique id of the enemy.</param>
        /// <returns>True if the enemy may start its attack in this frame.</returns>
        bool TryBeginAttack(string targetId, string agentId);

        /// <summary>Gives the tokens of an enemy back (attack finished, stunned, dead, leash).</summary>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="agentId">Unique id of the enemy.</param>
        void Release(string targetId, string agentId);

        /// <summary>Free tokens on a target.</summary>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="kind">Budget.</param>
        int Available(string targetId, TokenKind kind);

        /// <summary>True if the enemy currently holds tokens on the target.</summary>
        /// <param name="targetId">Id of the target.</param>
        /// <param name="agentId">Unique id of the enemy.</param>
        bool Holds(string targetId, string agentId);
    }
}
