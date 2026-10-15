using System;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.WorldState;
using UnityEngine;

namespace Aetherfall.Companions
{
    /// <summary>
    /// A campfire to rest at (GDD 01 10.4, architecture 4.6 "Warten/Schlafen"): "Rasten" lets the time pass - in the evening
    /// and at night until 8:00 in the morning, in the day three hours. If a companion is with the player and one of her
    /// campfire talks is due, she starts it after the rest (Maren: the first time she rests with the player, the second after
    /// the crypt).
    /// </summary>
    /// <remarks>
    /// GameObject: the campfire with a trigger collider on the interaction layer. Not in combat.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CampfireRest : MonoBehaviour, IInteractable
    {
        private const float DayRestHours = 3f;
        private const int MorningHour = 8;

        [Tooltip("Objekt-ID (Ereignisse, Protokoll).")]
        [SerializeField] private string objectId = "obj.eichental.lagerfeuer";

        [Tooltip("Begleiter-ID für die Lagerfeuer-Gespräche.")]
        [SerializeField] private string companionId = "npc.begleiter.maren_falkenried";

        [Tooltip("Dialog der Lagerfeuer-Gespräche (verzweigt selbst nach dem Zähler).")]
        [SerializeField] private string talkDialogueId = "dlg.eichental.maren_lagerfeuer";

        [Tooltip("Welt-Wert: Zahl der geführten Lagerfeuer-Gespräche.")]
        [SerializeField] private string talksFlag = "flag.begleiter.maren.lagerfeuer";

        [Tooltip("Welt-Flag: größer als 0 = das zweite Gespräch ist fällig (nach der Gruft).")]
        [SerializeField] private string secondTalkFlag = "";

        [Tooltip("So viele Gespräche gibt es.")]
        [Range(1, 6)] [SerializeField] private int talkCount = 2;

        private IGameClock _clock;
        private IWorldState _world;
        private IDialogueService _dialogue;
        private IGameStateService _gameState;
        private IEventBus _bus;

        /// <summary>Number of rests so far (tools).</summary>
        public int Rests { get; private set; }

        /// <inheritdoc />
        public string InteractionObjectId => objectId ?? string.Empty;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Use;

        /// <inheritdoc />
        public string InteractionPrompt => "Rasten";

        /// <inheritdoc />
        public int InteractionPriority => 4;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position + Vector3.up * 0.6f;

        /// <summary>Hours a rest would last now: until 8:00 in the evening and at night, else three hours.</summary>
        /// <param name="hour">Hour 0 … 23.</param>
        /// <param name="minute">Minute 0 … 59.</param>
        public static float RestHours(int hour, int minute)
        {
            bool night = hour >= 18 || hour < 5;
            if (!night)
            {
                return DayRestHours;
            }

            double until = GameCalendar.MinutesUntil(hour * 60 + minute, MorningHour);
            return (float)(until / 60.0);
        }

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return isActiveAndEnabled && _clock != null && !context.InCombat && (_gameState == null || _gameState.Current == GameState.Playing);
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            GameDateTime before = _clock.Now;
            float hours = RestHours(before.Hour, before.Minute);
            _clock.AdvanceHours(hours, "rest.campfire");
            Rests++;
            if (_bus != null)
            {
                var rested = new RestCompleted(objectId, hours, _clock.Now.Hour, _clock.Now.Minute);
                _bus.Publish(in rested);
            }

            TryStartTalk();
            return true;
        }

        private void TryStartTalk()
        {
            if (_world == null || _dialogue == null || string.IsNullOrEmpty(talkDialogueId))
            {
                return;
            }

            string party = CompanionLoyalty.InPartyFlag(companionId);
            if (!_world.IsDefined(party) || _world.GetInt(party) <= 0 || !_world.IsDefined(talksFlag))
            {
                return;
            }

            int done = _world.GetInt(talksFlag);
            bool due = done == 0 || (done < talkCount && !string.IsNullOrEmpty(secondTalkFlag) && _world.IsDefined(secondTalkFlag) &&
                                     _world.GetInt(secondTalkFlag) > 0);
            if (due && !_dialogue.TryStart(new DialogueStartRequest(talkDialogueId, companionId, string.Empty, objectId)))
            {
                Log.Warning(LogCategory.World, "Campfire talk '" + talkDialogueId + "' could not start.");
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _clock);
                locator.TryGet(out _world);
                locator.TryGet(out _dialogue);
                locator.TryGet(out _gameState);
                locator.TryGet(out _bus);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "CampfireRest could not resolve its services.");
            }
        }
    }
}
