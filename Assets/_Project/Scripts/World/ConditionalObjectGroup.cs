using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Shows its child objects only while a condition holds (§14.4 "places change through quests", GDD 01 6.5), e.g. the
    /// fire of the burning village "Brand (Prolog)": embers, glow lights and smoke are visible while the prologue quest is not
    /// completed; afterwards Eichental is ruin and ash. The <see cref="IConditionWatcher"/> re-evaluates the condition when the
    /// world state changes and after loading.
    /// </summary>
    /// <remarks>
    /// GameObject: an empty group whose direct children are switched on and off (the group itself stays active). Without a
    /// condition, or before the boot finished, the children stay as built. Created by "Aetherfall > Eichental erstellen".
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class ConditionalObjectGroup : MonoBehaviour
    {
        [Tooltip("Phase, zu der die Gruppe gehört (nur zur Übersicht), z. B. prolog.")]
        [SerializeField] private string phaseId = "prolog";

        [Tooltip("Die Kind-Objekte sind sichtbar, solange diese Bedingung gilt. Leer = immer sichtbar.")]
        [SerializeReference] private Condition visibleWhile;

        private IConditionWatcher _watcher;
        private IServiceLocator _services;
        private Action<bool> _onChanged;
        private int _watchId;

        /// <summary>Phase id (documentation, e.g. <c>prolog</c>).</summary>
        public string PhaseId => phaseId ?? string.Empty;

        /// <summary>Condition for showing the children (null = always).</summary>
        public Condition VisibleWhile => visibleWhile;

        /// <summary>True if the children are currently shown (the first child decides).</summary>
        public bool ChildrenVisible => transform.childCount == 0 || transform.GetChild(0).gameObject.activeSelf;

        private void Awake()
        {
            _onChanged = SetChildrenVisible;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            if (visibleWhile == null)
            {
                return;
            }

            try
            {
                _watcher = await Services.WaitForAsync<IConditionWatcher>(destroyCancellationToken);
                _services = Services.Locator;
                Watch();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "ConditionalObjectGroup '" + name + "' could not watch its condition.");
            }
        }

        private void OnEnable()
        {
            Watch();
        }

        private void OnDisable()
        {
            if (_watchId > 0 && _watcher != null)
            {
                _watcher.Unwatch(_watchId);
                _watchId = 0;
            }
        }

        private void Watch()
        {
            if (_watchId > 0 || _watcher == null || visibleWhile == null || !isActiveAndEnabled)
            {
                return;
            }

            var ctx = ConditionContext.ForPlayer(_services, "world:" + name);
            _watchId = _watcher.Watch(visibleWhile, ctx, _onChanged);
            SetChildrenVisible(_watcher.IsMet(_watchId));
        }

        private void SetChildrenVisible(bool visible)
        {
            for (int i = 0; i < transform.childCount; i++)
            {
                GameObject child = transform.GetChild(i).gameObject;
                if (child.activeSelf != visible)
                {
                    child.SetActive(visible);
                }
            }
        }
    }
}
