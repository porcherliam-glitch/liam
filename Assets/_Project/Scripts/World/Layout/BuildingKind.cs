namespace Aetherfall.World
{
    /// <summary>Type of a building (JSON <c>kind</c>).</summary>
    public enum BuildingKind
    {
        /// <summary><c>house</c>: Dwelling house (Wohnhaus).</summary>
        House = 0,

        /// <summary><c>smithy</c>: Smithy with chimney and forge (Schmiede).</summary>
        Smithy = 1,

        /// <summary><c>tavern</c>: Tavern or inn (Taverne, Gasthaus).</summary>
        Tavern = 2,

        /// <summary><c>mill</c>: Water mill with wheel (Muehle).</summary>
        Mill = 3,

        /// <summary><c>barn</c>: Barn (Scheune).</summary>
        Barn = 4,

        /// <summary><c>chapel</c>: Chapel with bell tower (Kapelle).</summary>
        Chapel = 5,

        /// <summary><c>ruin</c>: Destroyed house, only wall stumps (zerstoertes Haus).</summary>
        Ruin = 6,

        /// <summary><c>guardpost</c>: Guard post (Wachposten).</summary>
        Guardpost = 7
    }
}
