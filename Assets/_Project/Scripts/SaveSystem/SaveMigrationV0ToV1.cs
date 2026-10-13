using Aetherfall.Utilities;
using Newtonsoft.Json.Linq;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Migration v0 → v1 (architecture 9.5, example and template for later steps). Version 0 is the prototype format
    /// of the first development builds:
    /// <list type="bullet">
    /// <item>the header has no <c>format</c> field and no <c>saveVersion</c> (missing = 0),</item>
    /// <item>section <c>player</c> stores the world position as <c>"position": [x, y, z]</c>; v1 stores cell + local position
    /// (architecture 9.7: <c>cellX</c>, <c>cellZ</c>, <c>localX/Y/Z</c>, 512 m cells) plus <c>mounted</c> and
    /// <c>movementMode</c>,</item>
    /// <item>section <c>stats.player</c> calls the health <c>hp</c>; v1 calls it <c>health</c>.</item>
    /// </list>
    /// Works on the raw JSON only; the chain sets <c>header.saveVersion = 1</c> afterwards.
    /// </summary>
    public sealed class SaveMigrationV0ToV1 : ISaveMigration
    {
        /// <inheritdoc />
        public int FromVersion => 0;

        /// <inheritdoc />
        public void Apply(JObject root, MigrationContext ctx)
        {
            if (root[SaveFormat.HeaderKey] is JObject header && header["format"] == null)
            {
                header["format"] = SaveFormat.FormatId;
            }

            if (!(root[SaveFormat.SectionsKey] is JObject sections))
            {
                return;
            }

            if (sections["player"] is JObject player)
            {
                MigratePlayer(player, ctx);
            }

            if (sections["stats.player"] is JObject stats && stats["hp"] != null)
            {
                JToken hp = stats["hp"];
                stats.Remove("hp");
                stats.AddFirst(new JProperty("health", hp));
                ctx.Note("stats.player: hp renamed to health");
            }
        }

        private static void MigratePlayer(JObject player, MigrationContext ctx)
        {
            if (!(player["position"] is JArray position) || position.Count != 3)
            {
                return;
            }

            double x = position[0].Value<double>();
            double y = position[1].Value<double>();
            double z = position[2].Value<double>();
            int cellX = WorldGrid.CellIndex(x);
            int cellZ = WorldGrid.CellIndex(z);
            player.Remove("position");
            player["cellX"] = cellX;
            player["cellZ"] = cellZ;
            player["localX"] = WorldGrid.LocalCoordinate(x, cellX);
            player["localY"] = y;
            player["localZ"] = WorldGrid.LocalCoordinate(z, cellZ);
            if (player["mounted"] == null)
            {
                player["mounted"] = false;
            }

            if (player["movementMode"] == null)
            {
                player["movementMode"] = "onFoot";
            }

            ctx.Note("player: world position (" + x + ", " + y + ", " + z + ") -> cell (" + cellX + ", " + cellZ + ")");
        }
    }
}
