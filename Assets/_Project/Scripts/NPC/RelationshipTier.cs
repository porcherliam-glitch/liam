namespace Aetherfall.NPC
{
    /// <summary>Relationship tiers (GDD 01, 7.5; GDD 02, 12.5). Values may be stored: never renumber.</summary>
    public enum RelationshipTier
    {
        /// <summary>Enemy (German "Feind"), -100 to -50: refuses help.</summary>
        Enemy = 0,

        /// <summary>Dislike (German "Abneigung"), -49 to -10: fewer options, +10 % prices.</summary>
        Dislike = 1,

        /// <summary>Neutral, -9 to +9.</summary>
        Neutral = 2,

        /// <summary>Friendly (German "Freundlich"), +10 to +49: more topics, -5 % prices.</summary>
        Friendly = 3,

        /// <summary>Trusted (German "Vertraut"), +50 to +100: favours, personal topics, -10 % prices.</summary>
        Trusted = 4
    }
}
