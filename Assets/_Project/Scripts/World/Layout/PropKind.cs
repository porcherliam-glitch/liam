namespace Aetherfall.World
{
    /// <summary>Small object of the layout (JSON <c>kind</c>).</summary>
    public enum PropKind
    {
        /// <summary><c>well</c>: Well (Brunnen).</summary>
        Well = 0,

        /// <summary><c>campfire</c>: Camp fire with glow (Lagerfeuer).</summary>
        Campfire = 1,

        /// <summary><c>cart</c>: Hand cart (Karren).</summary>
        Cart = 2,

        /// <summary><c>signpost</c>: Signpost (Wegweiser).</summary>
        Signpost = 3,

        /// <summary><c>wayside_cross</c>: Wayside cross with lore plaque (Wegkreuz).</summary>
        WaysideCross = 4,

        /// <summary><c>barricade</c>: Road block of trunks or carts (Sperre).</summary>
        Barricade = 5,

        /// <summary><c>notice_board</c>: Notice board that offers quests (Anschlagtafel).</summary>
        NoticeBoard = 6,

        /// <summary><c>tent</c>: Tent (Zelt).</summary>
        Tent = 7,

        /// <summary><c>hay_bale</c>: Hay bale (Heuballen).</summary>
        HayBale = 8,

        /// <summary><c>sheep</c>: Sheep (Schaf).</summary>
        Sheep = 9,

        /// <summary><c>crate_stack</c>: Stack of crates and sacks (Kisten).</summary>
        CrateStack = 10,

        /// <summary><c>barrel</c>: Barrels (Faesser).</summary>
        Barrel = 11,

        /// <summary><c>crypt_entrance</c>: Stone portal of a crypt with stairs down (Gruft-Eingang).</summary>
        CryptEntrance = 12,

        /// <summary><c>cave_mouth</c>: Dark cave opening (Hoehleneingang).</summary>
        CaveMouth = 13,

        /// <summary><c>cairn</c>: Stone cairn (Steinmann).</summary>
        Cairn = 14,

        /// <summary><c>oil_barrel</c>: Oil barrel (Ölfass): explodes on fire, spills oil when struck (GDD 03 6.7).</summary>
        OilBarrel = 15,

        /// <summary><c>powder_keg</c>: Powder keg (Pulverfass): explodes on fire, 5 m (GDD 03 6.6 #16).</summary>
        PowderKeg = 16
    }
}
