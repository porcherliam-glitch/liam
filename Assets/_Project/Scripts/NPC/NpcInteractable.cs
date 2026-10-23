using System;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Makes an NPC talkable through the interaction system (Core: <see cref="IInteractable"/>, verb
    /// <see cref="InteractionVerbs.Talk"/>): the prompt shows "Sprechen: Harrik" (or the role while the name is unknown),
    /// interacting starts the dialogue of the NPC (the dialogue service pushes the game state <c>Dialogue</c> and locks saving).
    /// The optional <see cref="NpcLookAt"/> turns the NPC towards the player during the conversation.
    /// </summary>
    /// <remarks>
    /// GameObject: the NPC root; its collider must lie on the layer Interactable (10) so the player's interactor finds it.
    /// Waits in <c>Start</c> for the dialogue service (in the editor the boot scene may load after the test scene). Not
    /// available while a conversation runs, in combat, when the NPC is dead or hostile.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class NpcInteractable : MonoBehaviour, IInteractable
    {
        /// <summary>Default priority: NPCs win before chests and loot (Core interaction rules).</summary>
        public const int DefaultPriority = 20;

        [Tooltip("NPC-Daten (Name, Rolle, Standard-Dialog).")]
        [SerializeField] private NpcDefinition npc = null;

        [Tooltip("Anderer Dialog als der Standard-Dialog der NPC-Daten (optional).")]
        [IdRef("dlg.")] [SerializeField] private string dialogueOverride = string.Empty;

        [Tooltip("Priorität unter mehreren Zielen in Reichweite (höher gewinnt; Truhen 10, Beute 0).")]
        [SerializeField] private int priority = DefaultPriority;

        [Tooltip("Punkt für Reichweite und Winkel (z. B. Brusthöhe). Leer = dieses GameObject.")]
        [SerializeField] private Transform interactionPoint = null;

        [Tooltip("Blickverhalten (optional, am selben GameObject).")]
        [SerializeField] private NpcLookAt lookAt = null;

        private IDialogueService _dialogues;
        private IDialogueMemory _memory;
        private INpcService _npcs;
        private IEventBus _bus;
        private readonly WorldMarkerHandle _marker = new WorldMarkerHandle();
        private bool _subscribed;

        /// <summary>NPC id (empty without data).</summary>
        public string NpcId => npc != null ? npc.Id : string.Empty;

        /// <summary>Dialogue started by talking.</summary>
        public string DialogueId => !string.IsNullOrEmpty(dialogueOverride) ? dialogueOverride : npc != null ? npc.DefaultDialogueId : string.Empty;

        /// <inheritdoc />
        public string InteractionObjectId => NpcId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Talk;

        /// <inheritdoc />
        public string InteractionPrompt => NpcPromptText.For(npc != null ? npc.DisplayName : string.Empty, npc != null ? npc.RoleName : string.Empty,
            _memory != null && _memory.IsNameKnown(NpcId));

        /// <inheritdoc />
        public int InteractionPriority => priority;

        /// <inheritdoc />
        public Vector3 InteractionPosition => interactionPoint != null ? interactionPoint.position : transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            if (_dialogues == null || npc == null || string.IsNullOrEmpty(DialogueId) || context.InCombat || _dialogues.IsRunning)
            {
                return false;
            }

            return _npcs == null || (_npcs.IsAlive(NpcId) && !_npcs.IsHostile(NpcId));
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            if (!_dialogues.TryStart(new DialogueStartRequest(DialogueId, NpcId, string.Empty, "interaction")))
            {
                return false;
            }

            if (lookAt != null && _dialogues.IsRunning)
            {
                lookAt.BeginConversation(context.Position);
            }

            return true;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                if (npc == null)
                {
                    Log.Warning(LogCategory.NPC, "NpcInteractable on '" + name + "': the field 'Npc' is empty.");
                }

                _dialogues = await Services.WaitForAsync<IDialogueService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (locator != null)
                {
                    locator.TryGet(out _memory);
                    locator.TryGet(out _npcs);
                    locator.TryGet(out _bus);
                    _marker.Connect(locator);
                }

                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.NPC, exception, "NpcInteractable on '" + name + "' could not connect to the dialogue service");
            }
        }

        private void OnEnable()
        {
            // Compass and map find the NPC of "Rede mit" and "Bringe" through the marker registry.
            _marker.Show(NpcId, transform);
            Subscribe();
        }

        private void OnDisable()
        {
            _marker.Hide();
            if (!_subscribed)
            {
                return;
            }

            _bus.Unsubscribe<DialogOutcome>(OnDialogOutcome);
            _subscribed = false;
        }

        private void Subscribe()
        {
            if (_subscribed || _bus == null || !isActiveAndEnabled)
            {
                return;
            }

            _bus.Subscribe<DialogOutcome>(OnDialogOutcome);
            _subscribed = true;
        }

        private void OnDialogOutcome(DialogOutcome evt)
        {
            if (lookAt != null && evt.NpcId == NpcId)
            {
                lookAt.EndConversation();
            }
        }
    }
}
