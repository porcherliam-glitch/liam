using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// A world object that gives quests (GDD 02 4.1 start trigger "Aushang lesen", 7.6: notice boards, letters and signs
    /// glitter instead of showing "!"): interacting starts the first quest it offers (the quest's giver id is the object id),
    /// otherwise the interaction only reports <c>Interacted</c> (verb <c>read</c>), which "Interagiere mit Objekt" objectives
    /// count - e.g. the turn-in "zur Tafel zurueck". The marker object (glitter) is shown while a quest is offered or waits for
    /// the turn-in.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the board with a trigger collider on the layer Interactable (10) for the player's interactor. The test
    /// ground menu creates "Anschlagtafel" (German name) with the id <c>obj.test.anschlagtafel</c>.</para>
    /// <para>Prompt: "Aushang lesen: {Titel}" when a quest is offered, "Melden: {Titel}" when a quest waits for the turn-in,
    /// otherwise "Lesen: {Name}". It is refreshed when the quest service changes.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class QuestBoard : MonoBehaviour, IInteractable
    {
        [Tooltip("Objekt-ID der Tafel: Questgeber-ID der Quests, die sie anbietet, und Ziel-ID für „Interagiere mit Objekt“.")]
        [SerializeField] private string boardId = "obj.test.anschlagtafel";

        [Tooltip("Anzeigename im Interaktions-Hinweis.")]
        [SerializeField] private string displayName = "Anschlagtafel";

        [Tooltip("Glitzern (Kind-Objekt), sichtbar solange ein Aushang wartet oder eine Quest hier abgegeben wird. Optional.")]
        [SerializeField] private GameObject availableMarker = null;

        [Tooltip("Vorrang vor anderen Zielen in Reichweite (Truhen 10).")]
        [SerializeField] private int priority = 20;

        private readonly List<string> _scratch = new List<string>();
        private readonly WorldMarkerHandle _marker = new WorldMarkerHandle();
        private IQuestService _quests;
        private bool _subscribed;
        private int _shownRevision = -1;
        private string _offerQuestId = string.Empty;
        private string _turnInQuestId = string.Empty;
        private string _prompt = string.Empty;

        /// <inheritdoc />
        public string InteractionObjectId => boardId ?? string.Empty;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Read;

        /// <inheritdoc />
        public string InteractionPrompt
        {
            get
            {
                Refresh(false);
                return _prompt;
            }
        }

        /// <inheritdoc />
        public int InteractionPriority => priority;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <summary>Quest offered now, or empty.</summary>
        public string OfferedQuestId => _offerQuestId;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return true;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            Refresh(true);
            if (_quests != null && _offerQuestId.Length > 0 && !_quests.TryStart(_offerQuestId, InteractionObjectId))
            {
                Log.Warning(LogCategory.Quests, "QuestBoard '" + InteractionObjectId + "': quest '" + _offerQuestId + "' could not be started.");
            }

            // Always true: the interactor then reports Interacted (verb read), which turn-in objectives count.
            return true;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                _marker.Connect(Services.Locator);
                if (!Services.Locator.TryGet(out _quests))
                {
                    Log.Warning(LogCategory.Quests, "QuestBoard '" + name + "': no IQuestService registered - the board offers nothing. Add the " +
                                                    "QuestInstaller to the BootConfig (menu Aetherfall > Testgelaende erstellen does that).");
                    return;
                }

                Subscribe();
                Refresh(true);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "QuestBoard could not connect to the quest service.");
            }
        }

        private void OnEnable()
        {
            _marker.Show(InteractionObjectId, transform);
            Subscribe();
            _shownRevision = -1;
        }

        private void OnDisable()
        {
            _marker.Hide();
            if (_subscribed && _quests != null)
            {
                _quests.Changed -= OnQuestsChanged;
            }

            _subscribed = false;
        }

        private void Subscribe()
        {
            if (_subscribed || _quests == null || !isActiveAndEnabled)
            {
                return;
            }

            _quests.Changed += OnQuestsChanged;
            _subscribed = true;
        }

        private void OnQuestsChanged()
        {
            Refresh(false);
        }

        private void Refresh(bool force)
        {
            if (_quests == null)
            {
                _prompt = "Lesen: " + displayName;
                SetMarker(false);
                return;
            }

            if (!force && _quests.Revision == _shownRevision)
            {
                return;
            }

            _shownRevision = _quests.Revision;
            _offerQuestId = QuestBoardRules.FindOffer(_quests, InteractionObjectId, _scratch);
            _turnInQuestId = _offerQuestId.Length == 0 ? QuestBoardRules.FindTurnIn(_quests, InteractionObjectId) : string.Empty;
            if (_offerQuestId.Length > 0)
            {
                _prompt = "Aushang lesen: " + QuestBoardRules.TitleOf(_quests, _offerQuestId);
            }
            else if (_turnInQuestId.Length > 0)
            {
                _prompt = "Melden: " + QuestBoardRules.TitleOf(_quests, _turnInQuestId);
            }
            else
            {
                _prompt = "Lesen: " + displayName;
            }

            SetMarker(_offerQuestId.Length > 0 || _turnInQuestId.Length > 0);
        }

        private void SetMarker(bool visible)
        {
            if (availableMarker != null && availableMarker.activeSelf != visible)
            {
                availableMarker.SetActive(visible);
            }
        }
    }
}
