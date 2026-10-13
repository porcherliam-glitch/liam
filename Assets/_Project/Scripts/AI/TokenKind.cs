namespace Aetherfall.AI
{
    /// <summary>Kind of attack token (GDD 03 9.3: separate budgets for melee and ranged attackers).</summary>
    public enum TokenKind
    {
        /// <summary>Melee attackers (Normal: 2 at the same time).</summary>
        Melee = 0,

        /// <summary>Ranged attackers (Normal: 2 at the same time).</summary>
        Ranged = 1
    }
}
