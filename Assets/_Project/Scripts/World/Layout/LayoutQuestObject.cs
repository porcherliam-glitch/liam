namespace Aetherfall.World
{
    /// <summary>Placeholder of a quest object (clue, target, door ...).</summary>
    public sealed class LayoutQuestObject
    {
        /// <summary>Object id (<c>obj.</c> or <c>clue.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Id the quest counts (e.g. <c>clue.eichental.verbrannte_runen</c>), or empty.</summary>
        public string Group { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Look.</summary>
        public QuestObjectKind Kind { get; internal set; }

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Location id.</summary>
        public string LocationId { get; internal set; } = string.Empty;

        /// <summary>Quest id.</summary>
        public string QuestId { get; internal set; } = string.Empty;
    }
}
