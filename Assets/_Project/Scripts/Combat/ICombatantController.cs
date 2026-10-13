namespace Aetherfall.Combat
{
    /// <summary>
    /// The brain behind a <see cref="Combatant"/> (player combat controller, enemy controller, training dummy): decides how
    /// incoming hits are met, provides the damage profile of its own attacks and reacts to resolved hits. Registered with
    /// <see cref="Combatant.SetController"/> in <c>Awake</c>.
    /// </summary>
    public interface ICombatantController
    {
        /// <summary>Block values while the guard is up.</summary>
        BlockSpec ActiveBlock { get; }

        /// <summary>
        /// How an incoming hit meets this combatant (i-frames, parry, block). Called before the damage calculation; a parry
        /// starts the counter window.
        /// </summary>
        /// <param name="hit">The hit.</param>
        /// <param name="bearing">Signed angle between this combatant's facing and the attacker (0 = from the front).</param>
        DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing);

        /// <summary>Base damage, weights and poise value of an own attack.</summary>
        /// <param name="attack">The attack whose hit window opens.</param>
        AttackProfile GetAttackProfile(AttackSpec attack);

        /// <summary>
        /// The hit was resolved (damage applied): apply block stamina, stability or stun reactions and knockback.
        /// </summary>
        /// <param name="report">The report so far.</param>
        /// <returns>Stagger reaction of a combatant with stability (player), otherwise <see cref="StaggerKind.None"/>.</returns>
        StaggerKind OnHitResolved(in HitReport report);

        /// <summary>This combatant's attack was parried perfectly by <paramref name="defender"/>: it is opened for a counter.</summary>
        /// <param name="defender">The parrying combatant.</param>
        void OnParriedBy(Combatant defender);
    }
}
