using System;
using System.Collections.Generic;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Shows the messages of the <see cref="NotificationQueue"/> (Toasts.uxml): P0 banner top centre, P1 right, P2 loot stack
    /// right centre (GDD 05 1.7), plus the save indicator in the bottom right corner (rotating Aether diamond, GDD 05 1.2).
    /// </summary>
    /// <remarks>
    /// Message elements are ToastEntry.uxml instances that are reused; the view rebuilds only when the queue revision
    /// changes. The save indicator stays visible for at least <see cref="MinSaveIndicatorSeconds"/>, so short saves are seen.
    /// </remarks>
    public sealed class ToastView
    {
        /// <summary>Minimum time the save indicator stays visible (s).</summary>
        public const float MinSaveIndicatorSeconds = 0.8f;

        private const float SaveIndicatorDegreesPerSecond = 180f;

        private static readonly NotificationPriority[] Priorities =
        {
            NotificationPriority.Milestone, NotificationPriority.Progress, NotificationPriority.Loot
        };

        private readonly NotificationQueue _queue;
        private readonly VisualTreeAsset _entryAsset;
        private readonly VisualElement[] _containers = new VisualElement[3];
        private readonly List<string>[] _shownClasses = { new List<string>(), new List<string>(), new List<string>() };
        private readonly VisualElement _saveIndicator;
        private readonly VisualElement _saveIcon;
        private int _revision = -1;
        private float _progressTop = float.NaN;
        private float _saveVisibleFor;
        private float _saveAngle;

        /// <summary>Binds the view to the toast document.</summary>
        /// <param name="root">Root of the toast document.</param>
        /// <param name="entryAsset">ToastEntry.uxml.</param>
        /// <param name="queue">Message queue of the UI manager.</param>
        public ToastView(VisualElement root, VisualTreeAsset entryAsset, NotificationQueue queue)
        {
            if (root == null)
            {
                throw new ArgumentNullException(nameof(root));
            }

            if (entryAsset == null)
            {
                throw new ArgumentNullException(nameof(entryAsset));
            }

            _entryAsset = entryAsset;
            _queue = queue ?? throw new ArgumentNullException(nameof(queue));
            UiElementUtility.ApplyTexts(root);
            _containers[0] = root.Q<VisualElement>("toast-p0");
            _containers[1] = root.Q<VisualElement>("toast-p1");
            _containers[2] = root.Q<VisualElement>("toast-p2");
            _saveIndicator = root.Q<VisualElement>("save-indicator");
            _saveIcon = root.Q<VisualElement>("save-indicator-icon");
            UiElementUtility.SetDisplayed(_saveIndicator, false);
        }

        /// <summary>Default top of the P1 column (Toasts.uss) in panel coordinates.</summary>
        public const float DefaultProgressTop = 200f;

        /// <summary>Distance of the P2 loot stack below the top of the P1 column (Toasts.uss: 420 − 200).</summary>
        public const float LootBelowProgress = 220f;

        /// <summary>Gap between the quest tracker and the P1 column.</summary>
        public const float GapBelowTracker = 16f;

        /// <summary>
        /// Moves the P1 column below the quest tracker of the HUD (GDD 05 1.7: P1 "rechts unter der Questanzeige") and the P2
        /// stack with it; never above their USS positions.
        /// </summary>
        /// <param name="trackerBottom">Lower edge of the tracker in panel coordinates, 0 if hidden.</param>
        public void SetProgressTop(float trackerBottom)
        {
            float top = float.IsNaN(trackerBottom) || trackerBottom <= 0f ? DefaultProgressTop : Math.Max(DefaultProgressTop, trackerBottom + GapBelowTracker);
            if (!float.IsNaN(_progressTop) && Math.Abs(_progressTop - top) < 1f)
            {
                return;
            }

            _progressTop = top;
            if (_containers[1] != null)
            {
                _containers[1].style.top = top;
            }

            if (_containers[2] != null)
            {
                _containers[2].style.top = top + LootBelowProgress;
            }
        }

        /// <summary>Updates messages and the save indicator.</summary>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <param name="saving">True while the save manager writes.</param>
        public void Tick(float deltaTime, bool saving)
        {
            if (_queue.Revision != _revision)
            {
                _revision = _queue.Revision;
                for (int i = 0; i < Priorities.Length; i++)
                {
                    Rebuild(i, _queue.Visible(Priorities[i]));
                }
            }

            if (saving)
            {
                _saveVisibleFor = MinSaveIndicatorSeconds;
            }
            else if (_saveVisibleFor > 0f)
            {
                _saveVisibleFor -= deltaTime;
            }

            bool visible = _saveVisibleFor > 0f;
            UiElementUtility.SetDisplayed(_saveIndicator, visible);
            if (visible && _saveIcon != null)
            {
                _saveAngle = (_saveAngle + SaveIndicatorDegreesPerSecond * deltaTime) % 360f;
                _saveIcon.style.rotate = new Rotate(new Angle(45f + _saveAngle, AngleUnit.Degree));
            }
        }

        private void Rebuild(int slot, IReadOnlyList<ActiveNotification> entries)
        {
            VisualElement container = _containers[slot];
            if (container == null)
            {
                return;
            }

            while (container.childCount < entries.Count)
            {
                _entryAsset.CloneTree(container);
                _shownClasses[slot].Add(string.Empty);
            }

            for (int i = 0; i < container.childCount; i++)
            {
                VisualElement element = container[i];
                bool used = i < entries.Count;
                UiElementUtility.SetDisplayed(element, used);
                if (!used)
                {
                    continue;
                }

                ActiveNotification entry = entries[i];
                UiElementUtility.SetText(element.Q<Label>("toast-text"), entry.DisplayText);
                string accentClass = "af-toast--p" + slot + (entry.Accent.Length > 0 ? " af-toast--" + entry.Accent : string.Empty);
                if (!string.Equals(_shownClasses[slot][i], accentClass, StringComparison.Ordinal))
                {
                    _shownClasses[slot][i] = accentClass;
                    element.ClearClassList();
                    element.AddToClassList("af-toast");
                    element.AddToClassList("af-toast--p" + slot);
                    if (entry.Accent.Length > 0)
                    {
                        element.AddToClassList("af-toast--" + entry.Accent);
                    }
                }
            }
        }
    }
}
