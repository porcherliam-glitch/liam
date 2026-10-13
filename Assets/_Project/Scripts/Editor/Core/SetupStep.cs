using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Base class of the steps a) to f) of the project setup window. A step evaluates its checklist
    /// (<see cref="Refresh"/>, read-only) and performs its work (<see cref="Run"/>, idempotent: running it again on a
    /// finished project changes nothing). Destructive actions must ask the user before they happen.
    /// </summary>
    /// <remarks>
    /// Steps are serializable fields of the window, so their options (check boxes, text fields, foldouts) survive
    /// domain reloads. Runtime-only state (requests, checklist) is rebuilt by <see cref="Refresh"/>.
    /// </remarks>
    [Serializable]
    internal abstract class SetupStep
    {
        [SerializeField] private bool expanded = true;

        private List<SetupCheckItem> _items;
        private SetupStatus _status = SetupStatus.Unknown;

        /// <summary>Letter of the step in the window and the guide (a–f).</summary>
        public abstract string Letter { get; }

        /// <summary>German title.</summary>
        public abstract string Title { get; }

        /// <summary>German description of what the step does.</summary>
        public abstract string Description { get; }

        /// <summary>German label of the run button.</summary>
        public virtual string RunButtonLabel => "Ausführen";

        /// <summary>True while asynchronous work (e.g. a Package Manager request) is running.</summary>
        public virtual bool IsBusy => false;

        /// <summary>Whether the details of the step are shown in the window.</summary>
        public bool Expanded
        {
            get => expanded;
            set => expanded = value;
        }

        /// <summary>Checklist of the last <see cref="Refresh"/>.</summary>
        public IReadOnlyList<SetupCheckItem> Items => _items ?? (_items = new List<SetupCheckItem>());

        /// <summary>Combined status of the last <see cref="Refresh"/>.</summary>
        public SetupStatus Status => _status;

        /// <summary>Re-evaluates the checklist. Read-only; never changes the project.</summary>
        public void Refresh()
        {
            var items = new List<SetupCheckItem>();
            try
            {
                CollectItems(items);
            }
            catch (Exception exception)
            {
                items.Add(new SetupCheckItem("Prüfung fehlgeschlagen", SetupStatus.Unknown, exception.GetType().Name + ": " + exception.Message));
            }

            _items = items;
            _status = SetupStatuses.Combine(items);
        }

        /// <summary>Forgets cached information (e.g. the package list), so the next <see cref="Refresh"/> reads it again.</summary>
        public virtual void Invalidate()
        {
        }

        /// <summary>Performs the step. Must be idempotent and ask before destructive actions.</summary>
        /// <param name="log">Protocol for every action.</param>
        public abstract void Run(SetupLog log);

        /// <summary>Draws step-specific options (IMGUI) between description and checklist. Default: nothing.</summary>
        public virtual void DrawOptions()
        {
        }

        /// <summary>Called when the window is enabled (also after every domain reload).</summary>
        /// <param name="log">Protocol of the window.</param>
        public virtual void OnWindowEnabled(SetupLog log)
        {
        }

        /// <summary>Called when the window is disabled or closed: release callbacks and requests.</summary>
        public virtual void OnWindowDisabled()
        {
        }

        /// <summary>Adds the checklist items of this step.</summary>
        /// <param name="items">List to fill.</param>
        protected abstract void CollectItems(List<SetupCheckItem> items);
    }
}
