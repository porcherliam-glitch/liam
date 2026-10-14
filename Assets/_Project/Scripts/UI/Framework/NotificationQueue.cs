using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The message queue of GDD 05 1.7 (pure logic): three classes with their own screen positions, maximum counts and
    /// durations; merging of the same item, currency or experience within 3 s (the timer restarts); reading time; overflow
    /// handling (loot messages are condensed to "+12 Gegenstaende", milestones and progress are never lost); buffering in
    /// menus, dialogues and cutscenes; milestones wait until 3 s after combat (except level-up and warnings); filter option;
    /// history of the last 50 messages.
    /// </summary>
    /// <remarks>
    /// The view (UI.Screens) reads <see cref="Visible"/> and rebuilds its elements when <see cref="Revision"/> changes. The
    /// caller passes real time (<c>now</c>, seconds) and unscaled frame time, so messages also count down while paused –
    /// but while <see cref="IsSuppressed"/> nothing new is shown.
    /// </remarks>
    public sealed class NotificationQueue
    {
        private readonly List<ActiveNotification> _pending = new List<ActiveNotification>(NotificationRules.MaxQueued + 4);
        private readonly List<ActiveNotification>[] _visible =
        {
            new List<ActiveNotification>(1), new List<ActiveNotification>(2), new List<ActiveNotification>(5)
        };

        private readonly Queue<string> _history = new Queue<string>(NotificationRules.HistorySize);
        private int _nextId = 1;
        private bool _inCombat;
        private double _combatEndedAt = double.NegativeInfinity;
        private float _durationFactor = 1f;

        /// <summary>Changes whenever the visible messages change (new, merged, expired).</summary>
        public int Revision { get; private set; }

        /// <summary>Filter option (GDD 05 1.7): All / Important / Minimal.</summary>
        public NotificationFilter Filter { get; set; } = NotificationFilter.All;

        /// <summary>Duration factor option 1 / 1.5 / 2.</summary>
        public float DurationFactor
        {
            get => _durationFactor;
            set => _durationFactor = float.IsNaN(value) || value < 0.5f ? 1f : Math.Min(3f, value);
        }

        /// <summary>True while messages are buffered (menu, pause, dialogue, cutscene, loading).</summary>
        public bool IsSuppressed { get; private set; }

        /// <summary>Number of waiting messages.</summary>
        public int PendingCount => _pending.Count;

        /// <summary>The last messages, oldest first (texts at the time they were queued).</summary>
        public IEnumerable<string> History => _history;

        /// <summary>Messages on screen of one class, oldest first (P2 stacks with the newest at the bottom).</summary>
        /// <param name="priority">Class.</param>
        public IReadOnlyList<ActiveNotification> Visible(NotificationPriority priority)
        {
            return _visible[(int)priority];
        }

        /// <summary>Buffers (true) or releases (false) messages; visible ones stay until they expire.</summary>
        /// <param name="suppressed">True in menus, dialogues, cutscenes and while loading.</param>
        public void SetSuppressed(bool suppressed)
        {
            IsSuppressed = suppressed;
        }

        /// <summary>Reports the combat state (CombatStateChanged).</summary>
        /// <param name="inCombat">True while in combat.</param>
        /// <param name="now">Real time in seconds.</param>
        public void SetInCombat(bool inCombat, double now)
        {
            if (_inCombat && !inCombat)
            {
                _combatEndedAt = now;
            }

            _inCombat = inCombat;
        }

        /// <summary>Queues a message (or merges it into a visible or waiting one of the same key).</summary>
        /// <param name="notification">Message.</param>
        /// <param name="now">Real time in seconds.</param>
        public void Enqueue(in Notification notification, double now)
        {
            string historyText = NotificationRules.FormatText(notification.Kind, notification.Text, notification.Amount);
            AddHistory(historyText);
            if (!NotificationRules.Passes(Filter, notification.Priority))
            {
                return;
            }

            if (NotificationRules.IsMergeable(notification.Kind) && notification.MergeKey.Length > 0 &&
                TryMerge(notification, now))
            {
                return;
            }

            var entry = new ActiveNotification(_nextId++, notification, now);
            Format(entry);
            _pending.Add(entry);
            if (_pending.Count > NotificationRules.MaxQueued)
            {
                CondenseLoot(now, false);
            }
        }

        /// <summary>Counts down visible messages and shows waiting ones where there is room.</summary>
        /// <param name="now">Real time in seconds.</param>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        public void Update(double now, float deltaTime)
        {
            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            for (int p = 0; p < _visible.Length; p++)
            {
                List<ActiveNotification> list = _visible[p];
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    list[i].Remaining -= dt;
                    if (list[i].Remaining <= 0f)
                    {
                        list.RemoveAt(i);
                        Revision++;
                    }
                }
            }

            if (IsSuppressed || _pending.Count == 0)
            {
                return;
            }

            CondenseLoot(now, true);
            bool milestonesWait = _inCombat || now - _combatEndedAt < NotificationRules.AfterCombatDelaySeconds;
            for (int i = 0; i < _pending.Count; i++)
            {
                ActiveNotification entry = _pending[i];
                List<ActiveNotification> target = _visible[(int)entry.Priority];
                if (target.Count >= NotificationRules.MaxVisible(entry.Priority))
                {
                    continue;
                }

                if (entry.Priority == NotificationPriority.Milestone && milestonesWait && !NotificationRules.ShowsDuringCombat(entry.Kind))
                {
                    continue;
                }

                _pending.RemoveAt(i);
                i--;
                entry.Remaining = entry.Duration;
                entry.LastMergedAt = now;
                target.Add(entry);
                Revision++;
            }
        }

        /// <summary>Removes all waiting and visible messages (e.g. back to the main menu). The history stays.</summary>
        public void Clear()
        {
            _pending.Clear();
            for (int p = 0; p < _visible.Length; p++)
            {
                _visible[p].Clear();
            }

            _inCombat = false;
            _combatEndedAt = double.NegativeInfinity;
            Revision++;
        }

        private bool TryMerge(in Notification notification, double now)
        {
            List<ActiveNotification> visible = _visible[(int)notification.Priority];
            for (int i = visible.Count - 1; i >= 0; i--)
            {
                ActiveNotification entry = visible[i];
                if (CanMerge(entry, notification, now))
                {
                    entry.Amount += notification.Amount;
                    entry.LastMergedAt = now;
                    Format(entry);
                    entry.Remaining = entry.Duration;
                    Revision++;
                    return true;
                }
            }

            for (int i = _pending.Count - 1; i >= 0; i--)
            {
                ActiveNotification entry = _pending[i];
                if (CanMerge(entry, notification, now))
                {
                    entry.Amount += notification.Amount;
                    entry.LastMergedAt = now;
                    Format(entry);
                    return true;
                }
            }

            return false;
        }

        private static bool CanMerge(ActiveNotification entry, in Notification notification, double now)
        {
            return entry.Kind == notification.Kind && entry.Priority == notification.Priority &&
                   string.Equals(entry.MergeKey, notification.MergeKey, StringComparison.Ordinal) &&
                   now - entry.LastMergedAt <= NotificationRules.MergeWindowSeconds;
        }

        private void CondenseLoot(double now, bool onlyStale)
        {
            // Overflow (onlyStale false): all waiting loot messages become one summary. Release after buffering (true): loot
            // messages older than 30 s become one summary (GDD 05 1.7).
            int count = 0;
            int firstIndex = -1;
            for (int i = 0; i < _pending.Count; i++)
            {
                ActiveNotification entry = _pending[i];
                if (entry.Priority != NotificationPriority.Loot || entry.Kind == NotificationKind.Summary ||
                    (onlyStale && now - entry.CreatedAt < NotificationRules.StaleLootSeconds))
                {
                    continue;
                }

                count += entry.Kind == NotificationKind.Item ? Math.Max(1, entry.Amount) : 1;
                if (firstIndex < 0)
                {
                    firstIndex = i;
                }

                _pending.RemoveAt(i);
                i--;
            }

            if (count == 0)
            {
                return;
            }

            ActiveNotification summary = null;
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Kind == NotificationKind.Summary)
                {
                    summary = _pending[i];
                    break;
                }
            }

            if (summary == null)
            {
                var data = new Notification(NotificationPriority.Loot, NotificationKind.Summary, string.Empty, string.Empty, 0, string.Empty);
                summary = new ActiveNotification(_nextId++, data, now);
                _pending.Insert(Math.Max(0, Math.Min(firstIndex, _pending.Count)), summary);
            }

            summary.Amount += count;
            Format(summary);
        }

        private void Format(ActiveNotification entry)
        {
            entry.DisplayText = NotificationRules.FormatText(entry.Kind, entry.BaseText, entry.Amount);
            entry.Duration = NotificationRules.Duration(entry.Priority, entry.Kind, entry.DisplayText.Length, _durationFactor);
        }

        private void AddHistory(string text)
        {
            if (_history.Count >= NotificationRules.HistorySize)
            {
                _history.Dequeue();
            }

            _history.Enqueue(text);
        }
    }
}
