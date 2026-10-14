using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Base of the scene components that keep their state in <see cref="IWorldObjectStateStore"/> (puzzles, doors, levers,
    /// plates, cages, rewards): waits in <c>Start</c> for the boot, resolves the store and the event bus once
    /// (<see cref="WorldStateAccess"/>), subscribes to the store's events while enabled and calls <see cref="OnStoreReady"/>,
    /// <see cref="OnStateChanged"/> and <see cref="OnStatesReplaced"/> (after loading: re-apply without animation).
    /// </summary>
    public abstract class WorldStateBehaviour : MonoBehaviour
    {
        private bool _subscribed;

        /// <summary>The store (null until <see cref="IsReady"/>).</summary>
        protected IWorldObjectStateStore Store { get; private set; }

        /// <summary>The event bus (null before the boot or in tests).</summary>
        protected IEventBus EventBus { get; private set; }

        /// <summary>True after the services were resolved.</summary>
        protected bool IsReady => Store != null;

        /// <summary>Called once when the store is ready (apply the saved state without animation).</summary>
        protected abstract void OnStoreReady();

        /// <summary>Called after a state changed while playing.</summary>
        /// <param name="id">Object id whose state changed.</param>
        protected virtual void OnStateChanged(string id)
        {
        }

        /// <summary>Called after all states were replaced (load, new game): re-apply without animation.</summary>
        protected virtual void OnStatesReplaced()
        {
        }

        /// <summary>Subscribe to global events here (called while enabled and ready).</summary>
        protected virtual void SubscribeEvents()
        {
        }

        /// <summary>Unsubscribe the global events of <see cref="SubscribeEvents"/>.</summary>
        protected virtual void UnsubscribeEvents()
        {
        }

        /// <summary>Unity Start: waits for the boot, then resolves the services.</summary>
        protected virtual async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                EventBus = WorldStateAccess.ResolveEventBus();
                Store = WorldStateAccess.ResolveStore(GetType().Name + " '" + name + "'");
                OnStoreReady();
                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, GetType().Name + " '" + name + "' could not start.");
            }
        }

        /// <summary>Unity OnEnable.</summary>
        protected virtual void OnEnable()
        {
            Subscribe();
        }

        /// <summary>Unity OnDisable.</summary>
        protected virtual void OnDisable()
        {
            if (!_subscribed)
            {
                return;
            }

            Store.StateChanged -= HandleStateChanged;
            Store.StatesReplaced -= HandleStatesReplaced;
            UnsubscribeEvents();
            _subscribed = false;
        }

        private void Subscribe()
        {
            if (_subscribed || Store == null || !isActiveAndEnabled)
            {
                return;
            }

            Store.StateChanged += HandleStateChanged;
            Store.StatesReplaced += HandleStatesReplaced;
            SubscribeEvents();
            _subscribed = true;
        }

        private void HandleStateChanged(string id)
        {
            OnStateChanged(id);
        }

        private void HandleStatesReplaced()
        {
            OnStatesReplaced();
        }
    }
}
