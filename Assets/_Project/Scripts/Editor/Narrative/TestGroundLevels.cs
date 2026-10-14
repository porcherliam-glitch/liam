namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// The levels of the test ground in one place (guides 05, 06 and 09): the player is a warrior of level 10 like the example
    /// of GDD 03 8.3, the starting equipment and the chests have item level 10, the wolves level 8, and the test quests are
    /// made for level 10. The menu "Aetherfall > Testgelaende erstellen" (German menu text) writes these numbers into the
    /// scene, the item assets and the field "Startstufe neues Spiel (nur Test)" of the ProgressionInstaller.
    /// </summary>
    /// <remarks>
    /// <para>Lives next to <see cref="TestGroundQuestLibrary"/> because the EditMode tests need it without the package
    /// dependent test ground assembly. The tests check that everything the test ground hands out can be equipped at
    /// <see cref="PlayerStartLevel"/> (GDD 04 2.4: player level ≥ item level − 3).</para>
    /// <para>The real game starts at level 1 (GDD 03 12). Before the mini slice the start level of the ProgressionInstaller
    /// must go back to 1 (docs/Status.md).</para>
    /// </remarks>
    public static class TestGroundLevels
    {
        /// <summary>Level of the player in a new game on the test ground (warrior of GDD 03 8.3).</summary>
        public const int PlayerStartLevel = 10;

        /// <summary>Area level of the test ground: item level of the starting equipment and of the chest loot (GDD 04 4.1).</summary>
        public const int AreaLevel = 10;

        /// <summary>Level of the arena wolves (GDD 03 8.3: grey wolf level 8); also the item level of their loot.</summary>
        public const int WolfLevel = 8;
    }
}
