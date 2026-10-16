using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.Player;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Gathering (S30, <c>-tourMode sammeln</c>): the Kräuterwiese and the rift rim in the Eichental. The tour gathers all Blutwurz,
    /// checks that the Nachtschatten bud cannot be gathered by day, gathers the Rissmoos, picks a Nachtschatten flower at night,
    /// saves and loads (the harvested state survives), and checks the regrowth rules: never while the player stands close (less
    /// than 50 m), but after a game day once the player is away, and the rare herbs after three game days.
    /// </summary>
    public static partial class PlayTour
    {
        private const string HerbPrefix = "obj.eichental.kraut_";
        private const string BloodrootItem = "item.herb.blutwurz";
        private const string RiftMossItem = "item.herb.rissmoos";
        private const string NightshadeItem = "item.herb.nachtschattenbluete";
        private static readonly Vector3 Meadow = new Vector3(-95f, 0f, 24f);
        private static readonly Vector3 LindenhainWaypoint = new Vector3(-150f, 0f, -33f);
        private static readonly Dictionary<string, int> SavedHerbs = new Dictionary<string, int>();
        private static int _herbsBefore;

        private static void BuildGatheringPlan()
        {
            Steps.Enqueue(StartGathering);
            Steps.Enqueue(() => JumpTo(10.0));
            Steps.Enqueue(() => PlaceAt(Meadow + new Vector3(0f, 0f, -6f), Meadow));
            Steps.Enqueue(() => Wait(1.5));
            Steps.Enqueue(() => Capture("sa_01_kraeuterwiese", MeadowView));
            Steps.Enqueue(() => StandBefore(HerbPrefix + "blutwurz_1"));
            Steps.Enqueue(() => Wait(0.6));
            Steps.Enqueue(() => Capture("sa_02_blutwurz", HerbView(HerbPrefix + "blutwurz_1")));

            // The first Blutwurz: prompt, yield, harvested, its marker gone.
            Steps.Enqueue(() => RememberHerbs(BloodrootItem));
            Steps.Enqueue(UseById(HerbPrefix + "blutwurz_1"));
            Steps.Enqueue(() => CheckHarvest(HerbPrefix + "blutwurz_1", BloodrootItem));
            Steps.Enqueue(() => Wait(0.4));
            Steps.Enqueue(() => Capture("sa_03_blutwurz_toast", null));
            for (int i = 2; i <= 6; i++)
            {
                Steps.Enqueue(UseById(HerbPrefix + "blutwurz_" + i));
            }

            Steps.Enqueue(() => CheckAllHarvested("blutwurz_", 6, BloodrootItem, 6, 18));

            // Nachtschatten by day: the closed bud, no prompt.
            Steps.Enqueue(() => StandBefore(HerbPrefix + "nachtschatten_1"));
            Steps.Enqueue(() => Wait(0.6));
            Steps.Enqueue(() => CheckClosedBud(HerbPrefix + "nachtschatten_1"));
            Steps.Enqueue(() => Capture("sa_04_nachtschatten_tag", HerbView(HerbPrefix + "nachtschatten_1")));

            // Rissmoos at the rim of the rift.
            Steps.Enqueue(() => StandBefore(HerbPrefix + "rissmoos_1"));
            Steps.Enqueue(() => Wait(0.6));
            Steps.Enqueue(() => Capture("sa_05_rissmoos", HerbView(HerbPrefix + "rissmoos_1")));
            Steps.Enqueue(() => RememberHerbs(RiftMossItem));
            for (int i = 1; i <= 4; i++)
            {
                Steps.Enqueue(UseById(HerbPrefix + "rissmoos_" + i));
            }

            Steps.Enqueue(() => CheckAllHarvested("rissmoos_", 4, RiftMossItem, 4, 12));

            // Night: the flower opens.
            Steps.Enqueue(() => JumpTo(22.5));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Fail(!Herb(HerbPrefix + "blutwurz_1").IsHarvested, "Blutwurz wuchs nach einem halben Tag schon nach.") || true);
            Steps.Enqueue(() => StandBefore(HerbPrefix + "nachtschatten_1"));
            Steps.Enqueue(() => Wait(0.6));
            Steps.Enqueue(() => Capture("sa_06_nachtschatten_nacht", HerbView(HerbPrefix + "nachtschatten_1")));
            Steps.Enqueue(() => RememberHerbs(NightshadeItem));
            Steps.Enqueue(UseById(HerbPrefix + "nachtschatten_1"));
            Steps.Enqueue(() => CheckHarvest(HerbPrefix + "nachtschatten_1", NightshadeItem));

            // Save and load: the harvested state survives, also after the clock moved on.
            Steps.Enqueue(RememberAllHerbs);
            Steps.Enqueue(MapQuickSave);
            Steps.Enqueue(() => _mapSaveDone || Fail(Elapsed > 30.0, "Schnellspeichern wurde nicht fertig."));
            Steps.Enqueue(() => PlaceAt(LindenhainWaypoint, Meadow));
            Steps.Enqueue(() => AdvanceGameHours(30f));
            Steps.Enqueue(() => WaitRegrown(HerbPrefix + "blutwurz_1", "nach 30 Stunden in Lindenhain"));
            Steps.Enqueue(MapLoadAndWait());
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(CheckAfterLoad);

            // The 50 m rule: close by nothing grows back, from Lindenhain it does.
            Steps.Enqueue(() => StandBefore(HerbPrefix + "blutwurz_1"));
            Steps.Enqueue(() => AdvanceGameHours(25f));
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(() => Fail(!Herb(HerbPrefix + "blutwurz_1").IsHarvested, "Blutwurz wuchs vor den Augen des Spielers nach (unter 50 m).") || true);
            Steps.Enqueue(() => PlaceAt(LindenhainWaypoint, Meadow));
            Steps.Enqueue(() => WaitRegrown(HerbPrefix + "blutwurz_1", "aus 80 m Entfernung"));
            Steps.Enqueue(() => CheckMarkers("blutwurz_", 6));

            // Morning of the third day: the rare herbs (harvested 35 and 47 game hours ago) are still gone, although the player is far away.
            Steps.Enqueue(() => AdvanceGameHours(10f));
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(CheckRareStillGone);
            Steps.Enqueue(() => StandBefore(HerbPrefix + "blutwurz_1"));
            Steps.Enqueue(() => Wait(1.5));
            Steps.Enqueue(() => Capture("sa_07_nachgewachsen", HerbView(HerbPrefix + "blutwurz_1")));

            // The rare herbs after three game days.
            Steps.Enqueue(() => PlaceAt(LindenhainWaypoint, Meadow));
            Steps.Enqueue(() => AdvanceGameHours(50f));
            Steps.Enqueue(() => WaitRegrown(HerbPrefix + "rissmoos_1", "nach drei Spieltagen"));
            Steps.Enqueue(() => WaitRegrown(HerbPrefix + "nachtschatten_1", "nach drei Spieltagen"));
            Steps.Enqueue(() => Capture("sa_08_ende", null));
        }

        private static bool CheckRareStillGone()
        {
            bool moss = Herb(HerbPrefix + "rissmoos_1").IsHarvested;
            bool shade = Herb(HerbPrefix + "nachtschatten_1").IsHarvested;
            Note("Nach anderthalb bis zwei Spieltagen: Rissmoos geerntet " + moss + ", Nachtschattenblüte geerntet " + shade + ".");
            return Fail(!moss || !shade, "Ein seltenes Kraut wuchs vor drei Spieltagen nach.") || true;
        }

        private static bool StartGathering()
        {
            if (!Services.Locator.TryGet(out IGatheringService _))
            {
                return Fail(true, "Kein IGatheringService (GatheringInstaller fehlt in der BootConfig).");
            }

            HarvestNode[] nodes = Object.FindObjectsByType<HarvestNode>(FindObjectsInactive.Exclude);
            int blood = nodes.Count(n => n.ItemId == BloodrootItem);
            int moss = nodes.Count(n => n.ItemId == RiftMossItem);
            int shade = nodes.Count(n => n.ItemId == NightshadeItem);
            Note("Sammelpunkte: " + nodes.Length + " (" + blood + " Blutwurz, " + moss + " Rissmoos, " + shade + " Nachtschattenblüte).");
            Fail(blood != 6 || moss != 4 || shade != 2, "Erwartet: 6 Blutwurz, 4 Rissmoos, 2 Nachtschattenblüte.");
            CheckMarkers("rissmoos_", 4);
            CheckMarkers("nachtschatten_", 2);
            return CheckMarkers("blutwurz_", 6);
        }

        private static HarvestNode Herb(string nodeId)
        {
            return Object.FindObjectsByType<HarvestNode>(FindObjectsInactive.Exclude).FirstOrDefault(n => n.NodeId == nodeId);
        }

        private static int HerbCount(string itemId)
        {
            return Services.Locator.TryGet(out IInventoryService inventory) ? inventory.CountOf(InventoryOwners.Player, itemId) : 0;
        }

        private static bool RememberHerbs(string itemId)
        {
            _herbsBefore = HerbCount(itemId);
            return true;
        }

        private static bool RememberAllHerbs()
        {
            SavedHerbs.Clear();
            foreach (string item in new[] { BloodrootItem, RiftMossItem, NightshadeItem })
            {
                SavedHerbs[item] = HerbCount(item);
            }

            return true;
        }

        private static bool CheckHarvest(string nodeId, string itemId)
        {
            HarvestNode node = Herb(nodeId);
            if (node == null)
            {
                return Fail(true, nodeId + " nicht gefunden.");
            }

            int gained = HerbCount(itemId) - _herbsBefore;
            string last = FindPlayer().GetComponent<PlayerInteractor>().LastInteraction;
            Note(nodeId + ": +" + gained + " (" + itemId + "), letzte Interaktion „" + last + "“, geerntet " + node.IsHarvested + ".");
            Fail(gained < 1 || gained > 3, nodeId + ": Ertrag " + gained + " statt 1–3.");
            Fail(last != InteractionVerbs.Gather + " " + nodeId, nodeId + ": Die Interaktion meldete „" + last + "“.");
            Fail(!node.IsHarvested, nodeId + " ist nach dem Sammeln nicht geerntet.");
            Transform look = node.transform.Find("Aussehen");
            return Fail(look != null && look.gameObject.activeSelf, nodeId + ": Die Pflanze ist nach dem Sammeln noch zu sehen.") || true;
        }

        private static bool CheckAllHarvested(string kind, int nodes, string itemId, int min, int max)
        {
            int harvested = Object.FindObjectsByType<HarvestNode>(FindObjectsInactive.Exclude).Count(n => n.NodeId.StartsWith(HerbPrefix + kind) && n.IsHarvested);
            int gained = HerbCount(itemId) - _herbsBefore;
            Note(kind + ": " + harvested + " von " + nodes + " geerntet, +" + gained + " " + itemId + ".");
            Fail(harvested != nodes, kind + ": nicht alle Sammelpunkte geerntet.");
            Fail(gained < min || gained > max, kind + ": Ertrag " + gained + " liegt nicht zwischen " + min + " und " + max + ".");
            return CheckMarkers(kind, 0);
        }

        private static bool CheckMarkers(string kind, int expected)
        {
            var positions = new List<Vector3>();
            if (Services.Locator.TryGet(out IWorldMarkerRegistry markers))
            {
                markers.CollectPositions(HerbPrefix + kind + "*", positions);
            }

            Note("Kompass-Marker " + kind + "*: " + positions.Count + ".");
            return Fail(positions.Count != expected, "Marker " + kind + "*: " + positions.Count + " statt " + expected + ".") || true;
        }

        private static bool CheckClosedBud(string nodeId)
        {
            HarvestNode node = Herb(nodeId);
            PlayerInteractor interactor = FindPlayer().GetComponent<PlayerInteractor>();
            Transform bud = node != null ? node.transform.Find("Knospe") : null;
            Transform bloom = node != null ? node.transform.Find("Aussehen") : null;
            Note(nodeId + " am Tag: sammelbar " + (node != null && node.IsHarvestable) + ", Ziel der Spielfigur " +
                 (interactor.CurrentTarget != null ? interactor.CurrentTarget.InteractionObjectId : "keins") + ".");
            Fail(node == null || node.IsHarvestable, nodeId + " ist am Tag sammelbar.");
            Fail(ReferenceEquals(interactor.CurrentTarget, node), nodeId + " zeigt am Tag eine Aufforderung.");
            return Fail(bud == null || !bud.gameObject.activeSelf || (bloom != null && bloom.gameObject.activeSelf),
                nodeId + ": Am Tag soll die geschlossene Knospe zu sehen sein.") || true;
        }

        private static bool CheckAfterLoad()
        {
            Fail(!Herb(HerbPrefix + "blutwurz_1").IsHarvested, "Nach dem Laden ist Blutwurz 1 nicht mehr geerntet.");
            Fail(!Herb(HerbPrefix + "nachtschatten_1").IsHarvested, "Nach dem Laden ist Nachtschatten 1 nicht mehr geerntet.");
            foreach (KeyValuePair<string, int> saved in SavedHerbs)
            {
                Fail(HerbCount(saved.Key) != saved.Value, saved.Key + ": " + HerbCount(saved.Key) + " statt " + saved.Value + " nach dem Laden.");
            }

            Note("Nach dem Laden: geerntete Sammelpunkte und Kräuter wie gespeichert.");
            return true;
        }

        private static bool WaitRegrown(string nodeId, string when)
        {
            HarvestNode node = Herb(nodeId);
            if (node != null && !node.IsHarvested)
            {
                Note(nodeId + " ist " + when + " nachgewachsen.");
                return true;
            }

            return Fail(Elapsed > 15.0, nodeId + " wuchs " + when + " nicht nach.");
        }

        private static bool AdvanceGameHours(float hours)
        {
            Services.Locator.Get<IGameClock>().AdvanceHours(hours, "debug.sammeln");
            Note("Uhr um " + hours.ToString("0") + " Stunden vorgestellt.");
            return true;
        }

        private static bool StandBefore(string nodeId)
        {
            HarvestNode node = Herb(nodeId);
            if (node == null)
            {
                return Fail(true, nodeId + " nicht gefunden.");
            }

            Vector3 front = node.transform.position + Vector3.back * 1.3f;
            return PlaceAt(front, node.transform.position);
        }

        private static bool PlaceAt(Vector3 position, Vector3 lookAt)
        {
            PlaceOnGround(position, lookAt - position);
            return true;
        }

        /// <summary>The Kräuterwiese from the south, high enough to see several plants at once.</summary>
        private static Pose MeadowView(Transform player)
        {
            float ground = player.position.y;
            return Look(new Vector3(Meadow.x, ground + 8f, Meadow.z - 28f), new Vector3(Meadow.x, ground, Meadow.z));
        }

        /// <summary>A close view of one plant from the side, so the player does not hide it.</summary>
        private static Func<Transform, Pose> HerbView(string nodeId)
        {
            return player =>
            {
                HarvestNode node = Herb(nodeId);
                if (node == null)
                {
                    return ViewBehindPlayer(player);
                }

                Vector3 plant = node.transform.position;
                Vector3 away = player.position - plant;
                away.y = 0f;
                Vector3 side = Quaternion.Euler(0f, 55f, 0f) * (away.sqrMagnitude > 0.01f ? away.normalized : Vector3.back);
                return Look(plant + side * 2.2f + Vector3.up * 1.5f, plant + Vector3.up * 0.25f);
            };
        }
    }
}
