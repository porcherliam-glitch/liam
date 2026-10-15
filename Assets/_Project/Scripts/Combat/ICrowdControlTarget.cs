namespace Aetherfall.Combat
{
    /// <summary>
    /// A fighter that warrior techniques can control (GDD 03 11.4): stagger (Schildschlag, Kriegsschrei), knock down
    /// (Fußfeger), pull (Wirbelklinge: Sog), taunt (Spott). Implemented by the controllers of enemies and bosses; the ability caster finds it on the
    /// <see cref="Combatant"/>'s GameObject.
    /// </summary>
    public interface ICrowdControlTarget
    {
        /// <summary>True for bosses and large enemies: they are never knocked down or staggered by techniques.</summary>
        bool IsLarge { get; }

        /// <summary>True for normal enemies (not elite, champion or boss): only they stagger from a war cry.</summary>
        bool IsNormalRank { get; }

        /// <summary>Interrupts the fighter for a moment.</summary>
        /// <param name="seconds">Duration.</param>
        void Stagger(float seconds);

        /// <summary>Knocks the fighter down.</summary>
        /// <param name="seconds">Duration on the ground.</param>
        void KnockDown(float seconds);

        /// <summary>Pulls the fighter towards a point (Wirbelklinge: Sog), stopping a metre before it.</summary>
        /// <param name="towards">Point to pull to (the caster).</param>
        /// <param name="distance">Metres at most.</param>
        void Pull(UnityEngine.Vector3 towards, float distance);

        /// <summary>The fighter attacks <paramref name="source"/> for a while (taunt).</summary>
        /// <param name="source">Who taunts.</param>
        /// <param name="seconds">Duration.</param>
        void Taunt(Combatant source, float seconds);
    }
}
