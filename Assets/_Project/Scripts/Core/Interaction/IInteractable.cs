using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Something the player can use with the Interact action (GDD 03 1.5 "Interact": A with target, E): pick up loot, open a
    /// chest, later talk to an NPC, pull a lever, open a door. The player's interactor (architecture 11.3, Aetherfall.Player)
    /// finds candidates with an overlap query on the layers Interactable and Pickup, picks the best one in front of the
    /// player (<see cref="InteractionSelector"/>), shows <see cref="InteractionPrompt"/> and calls <see cref="Interact"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>Why in Core (assembly no. 2):</b> the implementers live in Inventory (13: pickups, chests), later World (20:
    /// doors, levers, the generic <c>Interactable</c> with verb, priority and condition of architecture 11.3) and NPC (22),
    /// the user lives in Player (24). The contract must sit below all of them (rule 3.2: only lower numbers). Core is the
    /// lowest assembly they all reference and already holds the other "interface low, implementation high" contracts
    /// (architecture 3.5); it needs no package. World, Conditions or Player would be invisible to Inventory.</para>
    /// <para>Implemented by MonoBehaviours whose collider lies on the layer Interactable (10) or Pickup (16); the interactor
    /// resolves the component with <c>GetComponentInParent</c>. Calls happen on the main thread.</para>
    /// </remarks>
    public interface IInteractable
    {
        /// <summary>Stable id of the object for the <c>Interacted</c> event (e.g. <c>obj.test.truhe_holz</c>, <c>rt.…</c>).</summary>
        string InteractionObjectId { get; }

        /// <summary>Stable verb id (<see cref="InteractionVerbs"/>), e.g. <c>open</c>.</summary>
        string InteractionVerb { get; }

        /// <summary>
        /// Text of the prompt in German, e.g. "Aufheben: Wolfsfell x2" or "Oeffnen: Holztruhe" (TODO localization step:
        /// LocalizedString key instead of text).
        /// </summary>
        string InteractionPrompt { get; }

        /// <summary>Priority among candidates in range: higher wins before distance and angle (chest before loot, NPC before both).</summary>
        int InteractionPriority { get; }

        /// <summary>World position used for range and angle checks.</summary>
        Vector3 InteractionPosition { get; }

        /// <summary>True if the interaction is possible now (not opened yet, not empty, condition met).</summary>
        /// <param name="context">Who interacts, from where.</param>
        bool CanInteract(in InteractionContext context);

        /// <summary>Performs the interaction.</summary>
        /// <param name="context">Who interacts, from where.</param>
        /// <returns>True if something happened (the interactor then publishes <c>Interacted</c>).</returns>
        bool Interact(in InteractionContext context);
    }
}
