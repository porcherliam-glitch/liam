using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Runs actions of the Conditions system once when an object reaches a state while playing (not when a save is loaded):
    /// picking up the blade fragment gives <c>item.quest.klingenfragment_eidwahrer</c>, taking the seal stone gives
    /// <c>item.quest.siegelstein_gruft</c> (GDD 02 11.7, GDD 04 guaranteed boss loot). Because the state is saved, the
    /// actions cannot run twice in one save.
    /// </summary>
    /// <remarks>GameObject: next to the <see cref="StateInteractable"/> whose id it watches; the actions are chosen in the
    /// inspector (type menu).</remarks>
    [DisallowMultipleComponent]
    public sealed class StateActions : WorldStateBehaviour
    {
        [Tooltip("ID, deren Zustand beobachtet wird, z. B. obj.eichental.gruft_klingenfragment.")]
        [SerializeField] private string watchedId = string.Empty;

        [Tooltip("Bei diesem Zustand laufen die Aktionen (1 = erledigt).")]
        [SerializeField] private int triggerState = WorldObjectStates.Done;

        [Tooltip("Aktionen (z. B. Gegenstand geben).")]
        [SerializeReference] private List<GameAction> actions = new List<GameAction>();

        private IServiceLocator _locator;

        /// <summary>Watched id.</summary>
        public string WatchedId => watchedId ?? string.Empty;

        /// <summary>The actions.</summary>
        public IReadOnlyList<GameAction> Actions => actions;

        /// <summary>Number of runs in this scene lifetime (debug, tests).</summary>
        public int RunCount { get; private set; }

        /// <summary>Adds an action (generator, tests).</summary>
        /// <param name="action">Action.</param>
        public void AddAction(GameAction action)
        {
            if (action != null)
            {
                actions.Add(action);
            }
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            _locator = Services.Locator;
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id != WatchedId || Store.GetState(id) != triggerState)
            {
                return;
            }

            if (_locator == null)
            {
                Log.Warning(LogCategory.World, "StateActions '" + WatchedId + "': no services, the actions do not run.");
                return;
            }

            var ctx = ActionContext.ForPlayer(_locator, WatchedId);
            int done = ActionRunner.Run(actions, in ctx);
            RunCount++;
            Log.Info(LogCategory.World, "StateActions '" + WatchedId + "': " + done + " of " + actions.Count + " actions ran.");
        }
    }
}
