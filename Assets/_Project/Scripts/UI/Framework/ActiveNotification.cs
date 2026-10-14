namespace Aetherfall.UI.Framework
{
    /// <summary>A message in the queue or on screen (<see cref="NotificationQueue"/>). Read-only for views.</summary>
    public sealed class ActiveNotification
    {
        internal ActiveNotification(int id, in Notification data, double createdAt)
        {
            Id = id;
            Priority = data.Priority;
            Kind = data.Kind;
            BaseText = data.Text;
            MergeKey = data.MergeKey;
            Amount = data.Amount;
            Accent = data.Accent;
            CreatedAt = createdAt;
            LastMergedAt = createdAt;
        }

        /// <summary>Unique id (increasing); views use it to keep their elements.</summary>
        public int Id { get; }

        /// <summary>Class.</summary>
        public NotificationPriority Priority { get; }

        /// <summary>Kind.</summary>
        public NotificationKind Kind { get; internal set; }

        /// <summary>Base text (item name, currency name, free text).</summary>
        public string BaseText { get; internal set; }

        /// <summary>Merge key (empty = never merged).</summary>
        public string MergeKey { get; internal set; }

        /// <summary>Summed amount.</summary>
        public int Amount { get; internal set; }

        /// <summary>Accent suffix for the style (e.g. <c>rarity-epic</c>).</summary>
        public string Accent { get; internal set; }

        /// <summary>Text shown on screen (formatted by the queue).</summary>
        public string DisplayText { get; internal set; } = string.Empty;

        /// <summary>Real time the message was queued.</summary>
        public double CreatedAt { get; }

        /// <summary>Real time of the last merge (start of the 3 s merge window).</summary>
        public double LastMergedAt { get; internal set; }

        /// <summary>Total display duration in seconds.</summary>
        public float Duration { get; internal set; }

        /// <summary>Remaining display time in seconds (only while visible).</summary>
        public float Remaining { get; internal set; }

        /// <summary>Remaining share from 1 (just shown) to 0 (about to disappear).</summary>
        public float RemainingNormalized => Duration > 0f ? Remaining / Duration : 0f;
    }
}
