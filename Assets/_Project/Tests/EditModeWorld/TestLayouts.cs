using System.Text;
using Aetherfall.World;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Small synthetic layouts for reader and validator tests: a valid 200 × 200 m frame with replaceable lists.</summary>
    public static class TestLayouts
    {
        /// <summary>A building that fits the frame.</summary>
        public const string House = "{ \"id\": \"obj.test.haus\", \"name\": \"Haus\", \"kind\": \"house\", \"state\": \"intact\", " +
                                    "\"position\": [0, 0], \"yaw\": 0, \"size\": [8, 4, 10], \"roof\": \"gable\", \"roofPitch\": 45 }";

        /// <summary>A brook along z = 30 from west to east.</summary>
        public const string Brook = "{ \"id\": \"bach.test\", \"name\": \"Testbach\", \"width\": 4, \"bank\": 2, \"depth\": 1.2, " +
                                    "\"waterDepth\": 0.5, \"points\": [[-100, 30], [100, 30]] }";

        /// <summary>The single location of the frame.</summary>
        public const string Location = "{ \"id\": \"loc.test.platz\", \"name\": \"Platz\", \"kind\": \"poi\", \"shape\": \"circle\", " +
                                       "\"center\": [0, -20], \"radius\": 10 }";

        /// <summary>Builds a layout JSON text.</summary>
        /// <param name="buildings">JSON array of buildings.</param>
        /// <param name="rivers">JSON array of rivers.</param>
        /// <param name="locations">JSON array of locations.</param>
        /// <param name="extra">Further members (without leading comma), e.g. <c>"chests": [ … ]</c>.</param>
        /// <param name="features">JSON array of terrain features.</param>
        /// <param name="schemaVersion">Schema version.</param>
        /// <param name="playerStart">Player start position as [x, z].</param>
        public static string Build(string buildings = "[]", string rivers = "[]", string locations = "[" + Location + "]", string extra = null,
            string features = "[]", int schemaVersion = RegionLayoutReader.SupportedSchemaVersion, string playerStart = "[0, -20]")
        {
            var palette = new StringBuilder();
            string[] names = LayoutPalette.RequiredNames;
            for (int i = 0; i < names.Length; i++)
            {
                palette.Append(i == 0 ? string.Empty : ", ").Append('"').Append(names[i]).Append("\": \"#808080\"");
            }

            return "{\n" +
                   "  \"schemaVersion\": " + schemaVersion + ",\n" +
                   "  \"layoutId\": \"layout.test.frame\", \"regionId\": \"region.test\", \"name\": \"Test\", \"worldSpaceId\": \"worldspace.test.frame\",\n" +
                   "  \"terrain\": { \"size\": 256, \"heightmapResolution\": 129, \"alphamapResolution\": 128, \"maxHeight\": 40, \"baseHeight\": 5,\n" +
                   "    \"playableBounds\": { \"min\": [-100, -100], \"max\": [100, 100] }, \"features\": " + features + " },\n" +
                   "  \"palette\": { " + palette + " },\n" +
                   "  \"lighting\": { \"sunAzimuth\": 240, \"sunElevation\": 30, \"sunColor\": \"#FFFFFF\", \"sunIntensity\": 1, " +
                   "\"ambientSky\": \"#FFFFFF\", \"ambientEquator\": \"#FFFFFF\", \"ambientGround\": \"#FFFFFF\", \"fogColor\": \"#FFFFFF\", " +
                   "\"fogDensity\": 0.002, \"skyTop\": \"#FFFFFF\", \"skyHorizon\": \"#FFFFFF\" },\n" +
                   "  \"rivers\": " + rivers + ",\n" +
                   "  \"buildings\": " + buildings + ",\n" +
                   "  \"locations\": " + locations + ",\n" +
                   (extra != null ? "  " + extra + ",\n" : string.Empty) +
                   "  \"playerStart\": { \"position\": " + playerStart + ", \"yaw\": 0 }\n" +
                   "}";
        }

        /// <summary>Reads and validates a layout text.</summary>
        /// <param name="json">JSON text.</param>
        /// <param name="report">Receives the findings.</param>
        public static RegionLayout Load(string json, out LayoutReport report)
        {
            report = new LayoutReport();
            return RegionLayoutValidator.ReadAndValidate(json, report);
        }

        /// <summary>True if a finding with this severity mentions the text.</summary>
        /// <param name="report">Report.</param>
        /// <param name="severity">Severity.</param>
        /// <param name="text">Part of path or message.</param>
        public static bool Has(LayoutReport report, LayoutIssueSeverity severity, string text)
        {
            for (int i = 0; i < report.Issues.Count; i++)
            {
                LayoutIssue issue = report.Issues[i];
                if (issue.Severity == severity && (issue.Path.Contains(text) || issue.Message.Contains(text)))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
