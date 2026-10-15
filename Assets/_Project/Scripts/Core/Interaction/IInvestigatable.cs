using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>What the detective mode reveals (GDD 02 5.1 type 18, GDD 03 1.5 "Investigate", GDD 05 3.2).</summary>
    public enum InvestigateKind
    {
        /// <summary>A clue of a quest: glows within 5 m while investigating, within 40 m in Aether sight.</summary>
        Clue = 0,

        /// <summary>A trail mark: glows within 5 m while investigating; Aether sight shows Aether trails up to 40 m.</summary>
        Trail = 1,

        /// <summary>Hidden path or platform: visible (turquoise outline) only while Aether sight is active, up to 40 m.</summary>
        AetherOnly = 2
    }

    /// <summary>
    /// Something the detective mode lights up (GDD 02 5.1: "Hinweise leuchten im Umkreis von 5 m beim Halten der
    /// Untersuchen-Taste"; GDD 03: Aether sight, radius 40 m). The player's investigator finds candidates with an overlap
    /// query (like the interactor) and calls <see cref="SetRevealed"/>.
    /// </summary>
    /// <remarks>
    /// In Core for the same reason as <see cref="IInteractable"/>: the implementers live in World, the user in Player.
    /// Implemented by MonoBehaviours with a collider on the layer Interactable or TriggerVolume; resolved with
    /// <c>GetComponentInParent</c>. Main thread only.
    /// </remarks>
    public interface IInvestigatable
    {
        /// <summary>What it is.</summary>
        InvestigateKind InvestigateKind { get; }

        /// <summary>World position for the range check.</summary>
        Vector3 InvestigatePosition { get; }

        /// <summary>False if there is nothing to find any more (clue already inspected, quest stage not active).</summary>
        bool IsWorthRevealing { get; }

        /// <summary>Turns the glow on or off.</summary>
        /// <param name="revealed">True while the detective mode shows it.</param>
        /// <param name="aetherSight">True in Aether sight (turquoise instead of gold).</param>
        void SetRevealed(bool revealed, bool aetherSight);
    }
}
