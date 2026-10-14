namespace Aetherfall.Quests
{
    /// <summary>
    /// Stable text ids of <see cref="QuestStatus"/> in saves (architecture 9.3: <c>"status": "active"</c>). Never rename a value.
    /// </summary>
    public static class QuestStatusIds
    {
        /// <summary>Text of <see cref="QuestStatus.Active"/>.</summary>
        public const string Active = "active";

        /// <summary>Text of <see cref="QuestStatus.Completed"/>.</summary>
        public const string Completed = "completed";

        /// <summary>Text of <see cref="QuestStatus.Failed"/>.</summary>
        public const string Failed = "failed";

        /// <summary>Text of <see cref="QuestStatus.Locked"/>.</summary>
        public const string Locked = "locked";

        /// <summary>Text of a status.</summary>
        /// <param name="status">Status.</param>
        public static string ToId(QuestStatus status)
        {
            switch (status)
            {
                case QuestStatus.Active:
                    return Active;
                case QuestStatus.Completed:
                    return Completed;
                case QuestStatus.Failed:
                    return Failed;
                case QuestStatus.Locked:
                    return Locked;
                default:
                    return string.Empty;
            }
        }

        /// <summary>Parses a saved status (only states that have an instance).</summary>
        /// <param name="id">Text.</param>
        /// <param name="status">Status.</param>
        public static bool TryParse(string id, out QuestStatus status)
        {
            switch (id)
            {
                case Active:
                    status = QuestStatus.Active;
                    return true;
                case Completed:
                    status = QuestStatus.Completed;
                    return true;
                case Failed:
                    status = QuestStatus.Failed;
                    return true;
                case Locked:
                    status = QuestStatus.Locked;
                    return true;
                default:
                    status = QuestStatus.Unknown;
                    return false;
            }
        }
    }
}
