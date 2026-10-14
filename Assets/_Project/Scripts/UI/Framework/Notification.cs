namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// One on-screen message request (architecture 4.9 <c>ShowToast</c>, GDD 05 1.7). Use the factories; the text is
    /// formatted by <see cref="NotificationQueue"/> from the base text and the amount, so merged messages stay correct.
    /// </summary>
    public readonly struct Notification
    {
        /// <summary>Class P0–P2.</summary>
        public readonly NotificationPriority Priority;

        /// <summary>Kind (merging and text format).</summary>
        public readonly NotificationKind Kind;

        /// <summary>Base text: item name, currency name or free text.</summary>
        public readonly string Text;

        /// <summary>Messages with the same key are merged within 3 s (item id, currency id); empty = never merged.</summary>
        public readonly string MergeKey;

        /// <summary>Amount (items, gold, experience, new level).</summary>
        public readonly int Amount;

        /// <summary>
        /// Style suffix for the colour accent, e.g. <c>rarity-epic</c> (USS class <c>af-toast--rarity-epic</c>); empty = none.
        /// </summary>
        public readonly string Accent;

        /// <summary>Creates a message; prefer the factories.</summary>
        /// <param name="priority">Class.</param>
        /// <param name="kind">Kind.</param>
        /// <param name="text">Base text.</param>
        /// <param name="mergeKey">Merge key or empty.</param>
        /// <param name="amount">Amount.</param>
        /// <param name="accent">Accent suffix or empty.</param>
        public Notification(NotificationPriority priority, NotificationKind kind, string text, string mergeKey, int amount, string accent)
        {
            Priority = priority;
            Kind = kind;
            Text = text ?? string.Empty;
            MergeKey = mergeKey ?? string.Empty;
            Amount = amount;
            Accent = accent ?? string.Empty;
        }

        /// <summary>Picked-up item (P2): "Wolfsfell", merged to "Wolfsfell ×3".</summary>
        /// <param name="itemName">Display name.</param>
        /// <param name="itemId">Item id (merge key).</param>
        /// <param name="amount">Amount picked up.</param>
        /// <param name="accent">Rarity accent such as <c>rarity-rare</c>, or empty.</param>
        public static Notification Item(string itemName, string itemId, int amount, string accent)
        {
            return new Notification(NotificationPriority.Loot, NotificationKind.Item, itemName, "item:" + itemId, amount, accent);
        }

        /// <summary>Currency change (P2): "+23 Gold"; summed within 3 s.</summary>
        /// <param name="currencyName">Display name, e.g. "Gold".</param>
        /// <param name="currencyId">Currency id (merge key).</param>
        /// <param name="delta">Change (negative for spending).</param>
        public static Notification Currency(string currencyName, string currencyId, int delta)
        {
            return new Notification(NotificationPriority.Loot, NotificationKind.Currency, currencyName, "currency:" + currencyId, delta, "currency");
        }

        /// <summary>Experience (P2): "+50 EP"; summed within 3 s.</summary>
        /// <param name="amount">Experience points.</param>
        public static Notification Experience(int amount)
        {
            return new Notification(NotificationPriority.Loot, NotificationKind.Experience, string.Empty, "xp", amount, "xp");
        }

        /// <summary>Level-up banner (P0, 3 s).</summary>
        /// <param name="newLevel">New level.</param>
        public static Notification LevelUp(int newLevel)
        {
            return new Notification(NotificationPriority.Milestone, NotificationKind.LevelUp, string.Empty, string.Empty, newLevel, "levelup");
        }

        /// <summary>Critical warning banner (P0, shown at once even in combat).</summary>
        /// <param name="text">Text.</param>
        public static Notification Warning(string text)
        {
            return new Notification(NotificationPriority.Milestone, NotificationKind.Warning, text, string.Empty, 0, "warning");
        }

        /// <summary>Free text message.</summary>
        /// <param name="priority">Class.</param>
        /// <param name="text">Text.</param>
        /// <param name="accent">Accent suffix or empty.</param>
        public static Notification Message(NotificationPriority priority, string text, string accent = "")
        {
            return new Notification(priority, NotificationKind.Message, text, string.Empty, 0, accent);
        }
    }
}
