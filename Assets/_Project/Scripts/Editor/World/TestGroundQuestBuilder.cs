using Aetherfall.EditorTools.Narrative;
using Aetherfall.Player;
using Aetherfall.Quests;
using Aetherfall.Stats;
using Aetherfall.World;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Quest part of the test ground (guide 09): the notice board "Anschlagtafel" (<see cref="QuestBoard"/>, gives both test
    /// quests and takes the wolf fur back) north-west of the spawn, the location zone "Uebungsplatz" (German name,
    /// <see cref="AreaTrigger"/> with <c>loc.test.uebungsplatz</c>) around the training dummy, and the player's link to the
    /// progression (<see cref="PlayerProgression"/>: level and attribute points on the stats). Called by
    /// <see cref="TestGroundSceneBuilder"/> after the items part.
    /// </summary>
    public static class TestGroundQuestBuilder
    {
        private const float ZoneSize = 8f;
        private const float ZoneHeight = 3f;

        /// <summary>Builds the board, the zone and the player link.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="materials">Test materials.</param>
        /// <param name="interactableLayer">Interactable layer or −1.</param>
        /// <param name="triggerVolumeLayer">TriggerVolume layer or −1.</param>
        /// <param name="playerLayer">Player layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="labelFont">Font of the signs (may be null).</param>
        /// <param name="report">Protocol.</param>
        public static void Build(GameObject player, TestGroundMaterials materials, int interactableLayer, int triggerVolumeLayer, int playerLayer,
            int environmentLayer, Font labelFont, TestGroundReport report)
        {
            BuildNoticeBoard(materials, interactableLayer, environmentLayer, labelFont, report);
            BuildTrainingGround(triggerVolumeLayer, playerLayer, materials, labelFont, report);
            PlayerProgression progression = player.AddComponent<PlayerProgression>();
            TestGroundFields.SetReference(progression, "stats", player.GetComponent<CharacterStatsComponent>(), report);
            report.Info("Spieler: PlayerProgression (Level und verteilte Attributpunkte wirken auf die Werte, GDD 03 12).");
        }

        private static void BuildNoticeBoard(TestGroundMaterials materials, int interactableLayer, int environmentLayer, Font labelFont,
            TestGroundReport report)
        {
            Material wood = TestGroundAssets.EnsureMaterial("TestNoticeBoard", new Color(0.5f, 0.34f, 0.2f), report);
            Material paper = TestGroundAssets.EnsureMaterial("TestPaper", new Color(0.93f, 0.9f, 0.8f), report);
            Material glint = TestGroundAssets.EnsureMaterial("TestQuestGlint", new Color(1f, 0.85f, 0.3f), report);

            var board = new GameObject("Anschlagtafel");
            board.transform.position = TestGroundPaths.NoticeBoardPosition;
            Vector3 towardsSpawn = -new Vector3(board.transform.position.x, 0f, board.transform.position.z);
            board.transform.rotation = towardsSpawn.sqrMagnitude > 0.01f ? Quaternion.LookRotation(towardsSpawn.normalized, Vector3.up) : Quaternion.identity;

            Part(board.transform, "Pfosten links", PrimitiveType.Cylinder, new Vector3(-0.85f, 1.1f, 0f), new Vector3(0.12f, 1.1f, 0.12f), wood, environmentLayer, true);
            Part(board.transform, "Pfosten rechts", PrimitiveType.Cylinder, new Vector3(0.85f, 1.1f, 0f), new Vector3(0.12f, 1.1f, 0.12f), wood, environmentLayer, true);
            Part(board.transform, "Tafel", PrimitiveType.Cube, new Vector3(0f, 1.55f, 0f), new Vector3(1.8f, 1.1f, 0.08f), wood, environmentLayer, true);
            Part(board.transform, "Dach", PrimitiveType.Cube, new Vector3(0f, 2.22f, 0f), new Vector3(2.1f, 0.12f, 0.35f), wood, environmentLayer, true);
            Part(board.transform, "Aushang 1", PrimitiveType.Cube, new Vector3(-0.4f, 1.6f, 0.05f), new Vector3(0.45f, 0.6f, 0.01f), paper, environmentLayer, false);
            Part(board.transform, "Aushang 2", PrimitiveType.Cube, new Vector3(0.35f, 1.5f, 0.05f), new Vector3(0.4f, 0.5f, 0.01f), paper, environmentLayer, false);

            // GDD 02 7.6: objects that give quests glitter like loot instead of showing "!".
            var marker = new GameObject("Glitzern");
            marker.transform.SetParent(board.transform, false);
            Part(marker.transform, "Funke 1", PrimitiveType.Sphere, new Vector3(-0.4f, 2.55f, 0.1f), new Vector3(0.16f, 0.16f, 0.16f), glint, environmentLayer, false);
            Part(marker.transform, "Funke 2", PrimitiveType.Sphere, new Vector3(0.1f, 2.7f, 0.1f), new Vector3(0.22f, 0.22f, 0.22f), glint, environmentLayer, false);
            Part(marker.transform, "Funke 3", PrimitiveType.Sphere, new Vector3(0.5f, 2.5f, 0.1f), new Vector3(0.12f, 0.12f, 0.12f), glint, environmentLayer, false);
            marker.SetActive(false);

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(board.transform, false);
            trigger.layer = interactableLayer >= 0 ? interactableLayer : 0;
            BoxCollider box = trigger.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = new Vector3(0f, 1.2f, 0.2f);
            box.size = new Vector3(2.2f, 2.4f, 1.0f);

            QuestBoard logic = board.AddComponent<QuestBoard>();
            TestGroundFields.SetString(logic, "boardId", TestGroundQuestLibrary.BoardId, report);
            TestGroundFields.SetString(logic, "displayName", "Anschlagtafel", report);
            TestGroundFields.SetReference(logic, "availableMarker", marker, report);
            Label(board.transform, "Anschlagtafel (E / A: lesen)", new Vector3(0f, 3.1f, 0f), labelFont, 0.04f);
            report.Info("Anschlagtafel bei (" + TestGroundPaths.NoticeBoardPosition.x + " | " + TestGroundPaths.NoticeBoardPosition.z + "): bietet die Test-Quests " +
                        "„Wolfsjagd im Testgelände“ und „Die Bewährungsprobe“ an und nimmt das Wolfsfell zurück (glitzert, solange es etwas zu tun gibt).");
        }

        private static void BuildTrainingGround(int triggerVolumeLayer, int playerLayer, TestGroundMaterials materials, Font labelFont, TestGroundReport report)
        {
            var zone = new GameObject("Uebungsplatz");
            zone.transform.position = TestGroundCombatBuilder.DummyPosition;
            zone.layer = triggerVolumeLayer >= 0 ? triggerVolumeLayer : 0;
            BoxCollider box = zone.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = new Vector3(0f, ZoneHeight * 0.5f, 0f);
            box.size = new Vector3(ZoneSize, ZoneHeight, ZoneSize);

            // A kinematic body makes sure the CharacterController of the player raises the trigger messages.
            Rigidbody body = zone.AddComponent<Rigidbody>();
            body.isKinematic = true;
            body.useGravity = false;

            AreaTrigger area = zone.AddComponent<AreaTrigger>();
            TestGroundFields.SetString(area, "areaId", TestGroundQuestLibrary.TrainingGroundId, report);
            TestGroundFields.SetInt(area, "playerLayers", playerLayer >= 0 ? 1 << playerLayer : 1 << TestGroundPaths.PlayerLayerIndex, report);

            float half = ZoneSize * 0.5f;
            Vector3[] corners = { new Vector3(-half, 0.3f, -half), new Vector3(half, 0.3f, -half), new Vector3(-half, 0.3f, half), new Vector3(half, 0.3f, half) };
            for (int i = 0; i < corners.Length; i++)
            {
                Part(zone.transform, "Ecke " + (i + 1), PrimitiveType.Cylinder, corners[i], new Vector3(0.15f, 0.3f, 0.15f), materials.Dummy, 0, false);
            }

            Label(zone.transform, "Übungsplatz", new Vector3(half, 1.2f, half), labelFont, 0.035f);
            report.Info("Orts-Zone „Uebungsplatz“ (" + TestGroundQuestLibrary.TrainingGroundId + ", 8 × 8 m um die Trainingspuppe, Layer " +
                        (triggerVolumeLayer >= 0 ? triggerVolumeLayer.ToString() : "Default") + "): sendet AreaEntered für „Gehe zu Ort“.");
        }

        private static void Part(Transform parent, string name, PrimitiveType shape, Vector3 localPosition, Vector3 localScale, Material material, int layer,
            bool keepCollider)
        {
            GameObject part = GameObject.CreatePrimitive(shape);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            part.layer = layer;
            if (!keepCollider && part.TryGetComponent(out Collider collider))
            {
                Object.DestroyImmediate(collider);
            }

            if (material != null && part.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }

        private static void Label(Transform parent, string text, Vector3 localPosition, Font font, float characterSize)
        {
            if (font == null)
            {
                return;
            }

            var label = new GameObject("Label " + text);
            label.transform.SetParent(parent, false);
            label.transform.localPosition = localPosition;

            // Readable from the spawn point like the other signs: the text faces away from the origin (TextMesh reads along +Z).
            Vector3 position = label.transform.position;
            var flat = new Vector3(position.x, 0f, position.z);
            label.transform.rotation = flat.sqrMagnitude > 0.01f ? Quaternion.LookRotation(flat.normalized, Vector3.up) : Quaternion.identity;
            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = font;
            mesh.fontSize = 64;
            mesh.characterSize = characterSize;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = Color.white;
            if (label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = WorldTextMaterial.For(font);
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }
    }
}
