namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A placed object of the layout: puzzle element, interactable, lore item, chest, exit, light source part or prop. One
    /// class for all kinds keeps the file format simple; the kind decides which optional fields are used (the validator checks
    /// them). Position: <see cref="X"/>/<see cref="Z"/> on the ground plane, floor height from the grid unless <see cref="Y"/>
    /// is given, <see cref="Height"/> above that floor (wall-mounted objects).
    /// </summary>
    public sealed class DungeonObject
    {
        /// <summary>Grave slab of a sequence puzzle (pressed with Interact, springs back).</summary>
        public const string GraveSlab = "grave_slab";

        /// <summary>Lever (switches on or off).</summary>
        public const string Lever = "lever";

        /// <summary>Pressure plate (pressed while someone stands on it).</summary>
        public const string PressurePlate = "pressure_plate";

        /// <summary>Rotatable mirror with four positions.</summary>
        public const string Mirror = "mirror";

        /// <summary>Cage that can be opened (the grave robber Fenn).</summary>
        public const string Cage = "cage";

        /// <summary>The seal stone on the altar (quest choice of s60).</summary>
        public const string SealStone = "seal_stone";

        /// <summary>Guaranteed boss reward lying in the world until it is picked up (blade fragment).</summary>
        public const string Reward = "reward";

        /// <summary>Loot chest.</summary>
        public const string Chest = "chest";

        /// <summary>Exit to another scene (stairs up, escape route).</summary>
        public const string Portal = "portal";

        /// <summary>Readable inscription (fairness hint of the grave slabs).</summary>
        public const string Inscription = "inscription";

        /// <summary>Wall relief that counts as clue (objective "Untersuche").</summary>
        public const string WallRelief = "relief";

        /// <summary>Stone tablet with lore.</summary>
        public const string LoreTablet = "lore_tablet";

        /// <summary>Note with lore.</summary>
        public const string LoreNote = "lore_note";

        /// <summary>Slits of an arrow trap (wall).</summary>
        public const string TrapSlit = "trap_slit";

        /// <summary>Crack with Aether light (beam source, glow).</summary>
        public const string AetherCrack = "aether_crack";

        /// <summary>Seal on a door (beam target).</summary>
        public const string Seal = "seal";

        /// <summary>NPC placeholder.</summary>
        public const string Npc = "npc";

        /// <summary>Half column at a wall.</summary>
        public const string Column = "column";

        /// <summary>Free-standing pillar (cover).</summary>
        public const string Pillar = "pillar";

        /// <summary>Sarcophagus.</summary>
        public const string Sarcophagus = "sarcophagus";

        /// <summary>Rubble.</summary>
        public const string Rubble = "rubble";

        /// <summary>Soot marks on the floor (fairness hint of the mirrors).</summary>
        public const string Soot = "soot";

        /// <summary>Altar.</summary>
        public const string Altar = "altar";

        /// <summary>Yellow marking of a climb spot (graybox colour code, GDD 05 3.5).</summary>
        public const string ClimbMarker = "climb_marker";

        /// <summary>Id (<c>obj.*</c>, <c>prop.*</c>, <c>npc.*</c>).</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Kind (see the constants).</summary>
        public string Kind { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>X (east).</summary>
        public float X { get; set; }

        /// <summary>Z (north).</summary>
        public float Z { get; set; }

        /// <summary>Floor height; NaN = from the grid.</summary>
        public float Y { get; set; } = float.NaN;

        /// <summary>Height above the floor (wall-mounted objects).</summary>
        public float Height { get; set; }

        /// <summary>Yaw in degrees (0 = facing north).</summary>
        public float Yaw { get; set; }

        /// <summary>True if a size was given.</summary>
        public bool HasSize { get; set; }

        /// <summary>Size along the object's local x (width).</summary>
        public float SizeX { get; set; } = 1f;

        /// <summary>Size along y (height).</summary>
        public float SizeY { get; set; } = 1f;

        /// <summary>Size along the object's local z (depth).</summary>
        public float SizeZ { get; set; } = 1f;

        /// <summary>Interaction prompt (German).</summary>
        public string Prompt { get; set; } = string.Empty;

        /// <summary>Lore or dialogue text (German).</summary>
        public string Text { get; set; } = string.Empty;

        /// <summary>Clue id for the objective "Untersuche" (<c>clue.*</c>).</summary>
        public string ClueId { get; set; } = string.Empty;

        /// <summary>Chest tier: crate, wooden, iron, hidden, ornate, secret, rift.</summary>
        public string Tier { get; set; } = string.Empty;

        /// <summary>Loot table of a chest (<c>loot.*</c>).</summary>
        public string LootTable { get; set; } = string.Empty;

        /// <summary>Relief motif of a grave slab (eiche, krone, schild).</summary>
        public string Relief { get; set; } = string.Empty;

        /// <summary>Item id given or represented (<c>item.*</c>).</summary>
        public string ItemId { get; set; } = string.Empty;

        /// <summary>True for kinds the player interacts with.</summary>
        public bool IsInteractive =>
            Kind == GraveSlab || Kind == Lever || Kind == Mirror || Kind == Cage || Kind == SealStone || Kind == Reward || Kind == Chest ||
            Kind == Portal || Kind == Inscription || Kind == WallRelief || Kind == LoreTablet || Kind == LoreNote;

        /// <summary>True for kinds that hang on a wall (no floor check at their own position).</summary>
        public bool IsWallMounted =>
            Kind == Inscription || Kind == WallRelief || Kind == LoreTablet || Kind == TrapSlit || Kind == AetherCrack || Kind == Seal;

        /// <summary>True for kinds with a solid collider on the environment layer.</summary>
        public bool IsSolid => Kind == Column || Kind == Pillar || Kind == Sarcophagus || Kind == Altar || Kind == Rubble;

        /// <summary>True for kinds that carry readable text.</summary>
        public bool IsReadable => Kind == Inscription || Kind == WallRelief || Kind == LoreTablet || Kind == LoreNote;

        /// <summary>True for all known kinds.</summary>
        public bool IsKnownKind =>
            IsInteractive || Kind == PressurePlate || Kind == TrapSlit || Kind == AetherCrack || Kind == Seal || Kind == Npc || Kind == Column ||
            Kind == Pillar || Kind == Sarcophagus || Kind == Rubble || Kind == Soot || Kind == Altar || Kind == ClimbMarker;
    }
}
