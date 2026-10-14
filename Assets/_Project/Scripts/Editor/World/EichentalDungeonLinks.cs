using Aetherfall.World;
using Aetherfall.World.Dungeons;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Connects the village with "Die vergessene Gruft" (guide 12, 11.2): at the crypt entrance of the layout
    /// (<c>obj.eichental.gruft_eingang</c>) a <see cref="DungeonPortal"/> ("Gruft betreten", saves before the travel) and, 4 m in
    /// front of it, the <see cref="ArrivalAnchor"/> <c>anchor.eichental.gruft_eingang</c> where both crypt exits put the player
    /// back (and save once he stands there, GDD 05 5.3).
    /// </summary>
    public static class EichentalDungeonLinks
    {
        /// <summary>Layout id of the crypt entrance.</summary>
        public const string EntranceId = "obj.eichental.gruft_eingang";

        /// <summary>Anchor in the crypt where the player arrives (gruft_layout.json, spawn.anchorId).</summary>
        public const string CryptAnchorId = "anchor.gruft.eingang";

        /// <summary>Anchor in front of the entrance (target of the crypt exits in gruft_layout.json).</summary>
        public const string VillageAnchorId = "anchor.eichental.gruft_eingang";

        /// <summary>Distance of the arrival point in front of the entrance in metres.</summary>
        public const float ArrivalDistance = 4f;

        /// <summary>Builds portal and arrival anchor; warns if the layout has no crypt entrance.</summary>
        /// <param name="layout">Village layout.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="spawnPoint">Transform of the scene's PlayerSpawnPoint (the anchor moves it on arrival).</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="parent">Parent object.</param>
        /// <param name="report">Protocol.</param>
        public static void Build(RegionLayout layout, LayoutHeightField heights, Transform spawnPoint, int interactableLayer, Transform parent,
            TestGroundReport report)
        {
            LayoutProp entrance = null;
            foreach (LayoutProp prop in layout.Props)
            {
                if (prop.Id == EntranceId)
                {
                    entrance = prop;
                    break;
                }
            }

            if (entrance == null)
            {
                report.Warning("Gruft-Eingang " + EntranceId + " fehlt im Layout – kein Portal zur Gruft.");
                return;
            }

            float x = (float)entrance.Position.X;
            float z = (float)entrance.Position.Z;
            var rotation = Quaternion.Euler(0f, (float)entrance.Yaw, 0f);
            var basePosition = new Vector3(x, (float)heights.Height(x, z), z);

            // The entrance faces along its local +Z (yaw 180 = south); the player walks up from that side.
            var portal = new GameObject("Portal Gruft (" + EntranceId + ")");
            portal.transform.SetParent(parent, false);
            portal.transform.SetPositionAndRotation(basePosition + rotation * new Vector3(0f, 1f, 1f), rotation);
            portal.layer = interactableLayer >= 0 ? interactableLayer : 0;
            BoxCollider trigger = portal.AddComponent<BoxCollider>();
            trigger.isTrigger = true;
            trigger.center = new Vector3(0f, 0.3f, 0f);
            trigger.size = new Vector3(3.4f, 2.6f, 1.6f);
            DungeonPortal dungeonPortal = portal.AddComponent<DungeonPortal>();
            TestGroundFields.SetString(dungeonPortal, "objectId", EntranceId, report);
            TestGroundFields.SetString(dungeonPortal, "prompt", "Gruft betreten", report);
            TestGroundFields.SetString(dungeonPortal, "targetSceneKey", GruftPaths.ScenePath, report);
            TestGroundFields.SetString(dungeonPortal, "targetTitle", "Die vergessene Gruft", report);
            TestGroundFields.SetString(dungeonPortal, "targetAnchorId", CryptAnchorId, report);
            TestGroundFields.SetBool(dungeonPortal, "autosaveBeforeTravel", true, report);

            Vector3 arrival = basePosition + rotation * new Vector3(0f, 0f, ArrivalDistance);
            arrival.y = (float)heights.Height(arrival.x, arrival.z);
            var anchor = new GameObject("Ankunft vor der Gruft (" + VillageAnchorId + ")");
            anchor.transform.SetParent(parent, false);
            anchor.transform.SetPositionAndRotation(arrival, rotation);
            ArrivalAnchor arrivalAnchor = anchor.AddComponent<ArrivalAnchor>();
            TestGroundFields.SetString(arrivalAnchor, "anchorId", VillageAnchorId, report);
            TestGroundFields.SetReference(arrivalAnchor, "spawnPoint", spawnPoint, report);
            TestGroundFields.SetBool(arrivalAnchor, "autosaveOnArrival", true, report);
            report.Info("Gruft angebunden: Portal am Eingang (" + x + " | " + z + ", „Gruft betreten“) und Ankunftspunkt " + VillageAnchorId + " " +
                        ArrivalDistance + " m davor.");
        }
    }
}
