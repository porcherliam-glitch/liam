namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A door, gate or portcullis standing in an opening. <see cref="Axis"/> <c>x</c>: the door spans along x (it closes a
    /// passage running north–south); <c>z</c>: it spans along z.
    /// </summary>
    public sealed class DungeonDoor
    {
        /// <summary>Kind: stone gate that slides into the floor.</summary>
        public const string StoneGate = "stone_gate";

        /// <summary>Kind: secret door that looks like the wall.</summary>
        public const string HiddenWall = "hidden_wall";

        /// <summary>Kind: door with a seal for the light puzzle.</summary>
        public const string SealDoor = "seal_door";

        /// <summary>Kind: iron grate that slides up.</summary>
        public const string Portcullis = "portcullis";

        /// <summary>Id, e.g. <c>door.eichental.gruft_tor</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Kind (see the constants).</summary>
        public string Kind { get; set; } = StoneGate;

        /// <summary>Centre on x.</summary>
        public float X { get; set; }

        /// <summary>Centre on z.</summary>
        public float Z { get; set; }

        /// <summary>Floor height; NaN = from the grid.</summary>
        public float Y { get; set; } = float.NaN;

        /// <summary><c>x</c> or <c>z</c>: the axis the door spans along.</summary>
        public string Axis { get; set; } = "x";

        /// <summary>Width in metres.</summary>
        public float Width { get; set; } = 2f;

        /// <summary>Height in metres.</summary>
        public float Height { get; set; } = 3f;

        /// <summary>Initial state in a new game.</summary>
        public bool StartsOpen { get; set; }

        /// <summary>What opens (or, for <c>arena</c>, closes) the door.</summary>
        public DungeonTrigger OpensOn { get; set; } = new DungeonTrigger();

        /// <summary>True if the door spans along x.</summary>
        public bool SpansX => Axis == "x";

        /// <summary>True for the known kinds.</summary>
        public bool IsKnownKind => Kind == StoneGate || Kind == HiddenWall || Kind == SealDoor || Kind == Portcullis;
    }
}
