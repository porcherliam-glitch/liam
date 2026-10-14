using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Turns a condition of the Conditions system into a world object state (architecture 7.5 "spaeter … Tueren"): while the
    /// condition holds, the gate id has the state 1, otherwise 0. Doors (trigger "Objektzustand"), state interactables
    /// (requirement) and <see cref="ActivateOnState"/> react to it. Example: the seal stone can only be taken in quest stage
    /// s60 (<c>AllOf(QuestStageReached s60, Not(QuestStageReached s70_belassen))</c>).
    /// </summary>
    /// <remarks>GameObject: any always active object in the scene; the condition is chosen in the inspector (type menu).</remarks>
    [DisallowMultipleComponent]
    public sealed class ConditionGate : WorldStateBehaviour
    {
        [Tooltip("ID des Tors, z. B. gate.eichental.gruft_siegelstein. Zustand 1 = Bedingung erfüllt.")]
        [SerializeField] private string gateId = "gate.neu";

        [Tooltip("Bedingung (leer = immer erfüllt).")]
        [SerializeReference] private Condition condition = null;

        private IConditionWatcher _watcher;
        private IServiceLocator _locator;
        private int _watchId;

        /// <summary>Gate id.</summary>
        public string GateId => gateId ?? string.Empty;

        /// <summary>The condition (may be null).</summary>
        public Condition Condition => condition;

        /// <summary>True while the condition holds.</summary>
        public bool IsOpen => IsReady && Store.GetState(GateId) == WorldObjectStates.Done;

        /// <summary>Sets the condition (generator, tests).</summary>
        /// <param name="value">New condition.</param>
        public void SetCondition(Condition value)
        {
            condition = value;
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            _locator = Services.Locator;
            if (_locator == null || !_locator.TryGet(out _watcher))
            {
                Log.Warning(LogCategory.World, "ConditionGate '" + GateId + "': no IConditionWatcher registered; the condition is checked once.");
                Apply(EvaluateOnce());
            }
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            if (_watchId > 0 && _watcher != null)
            {
                Apply(_watcher.IsMet(_watchId));
            }
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (_watcher == null || _watchId > 0)
            {
                return;
            }

            var ctx = ConditionContext.ForPlayer(_locator, GateId);
            _watchId = _watcher.Watch(condition, in ctx, Apply);
            Apply(_watcher.IsMet(_watchId));
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (_watcher != null && _watchId > 0)
            {
                _watcher.Unwatch(_watchId);
            }

            _watchId = 0;
        }

        private bool EvaluateOnce()
        {
            if (_locator == null)
            {
                return false;
            }

            var ctx = ConditionContext.ForPlayer(_locator, GateId);
            return ConditionEvaluator.IsMet(condition, in ctx);
        }

        private void Apply(bool met)
        {
            if (IsReady)
            {
                Store.SetState(GateId, met ? WorldObjectStates.Done : WorldObjectStates.Initial);
            }
        }
    }
}
