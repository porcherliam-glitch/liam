using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Climbing (GDD 03 3.3, task list S48) at the Wachturm Grauwacht: up the ladder, over the rest point and the pale rock,
    /// the vines and over the edge onto the crow's nest; then a climb jump, the empty stamina (shaking, fall), letting go and
    /// climbing down. The input reader is paused, the tour moves the stick itself.
    /// </summary>
    public static partial class PlayTour
    {
        private static Transform _tower;

        private static void EnqueueClimbing()
        {
            Steps.Enqueue(() => FindTower());
            Steps.Enqueue(GrabLadder());
            Steps.Enqueue(ClimbUntil(8f, "Fels"));
            Steps.Enqueue(() => Capture("q21_klettern", ViewClimber));
            Steps.Enqueue(ClimbToTheTop());
            Steps.Enqueue(() => Capture("q22_kraehennest", ViewFromNest));
            Steps.Enqueue(GrabLadder());
            Steps.Enqueue(ClimbUntil(7.5f, "Fels"));
            Steps.Enqueue(ClimbJump());
            Steps.Enqueue(RunOutOfStamina());
            Steps.Enqueue(GrabLadder());
            Steps.Enqueue(ClimbUntil(2.2f, "Leiter"));
            Steps.Enqueue(ClimbDown());
            Steps.Enqueue(GrabLadder());
            Steps.Enqueue(LetGo());
            Steps.Enqueue(() => EndClimbing());
        }

        private static bool FindTower()
        {
            ClimbSurface ladder = Object.FindObjectsByType<ClimbSurface>(FindObjectsInactive.Exclude).FirstOrDefault(s => s.Kind == ClimbSurfaceKind.Ladder);
            if (ladder == null)
            {
                return Fail(true, "Der Wachturm mit der Leiter fehlt.");
            }

            _tower = ladder.transform.parent;
            PlayerMotor player = FindPlayer();
            player.GetComponent<PlayerInputReader>().enabled = false;
            Note("Wachturm „" + _tower.name + "“ gefunden, " + Object.FindObjectsByType<ClimbSurface>(FindObjectsInactive.Exclude).Length +
                 " Kletterflächen. Der Rundgang führt den Stick jetzt selbst.");
            return true;
        }

        private static bool EndClimbing()
        {
            PlayerMotor player = FindPlayer();
            player.GetComponent<PlayerInputReader>().enabled = true;
            Stamina().Refill();
            return true;
        }

        private static ResourcePool Stamina()
        {
            return FindPlayer().GetComponent<CharacterStatsComponent>().Stamina;
        }

        private static float HeightOnTower()
        {
            return FindPlayer().transform.position.y - _tower.position.y;
        }

        /// <summary>Moves the stick: x right, y forward relative to the camera (on the wall: up).</summary>
        private static void Stick(float x, float y, bool jump = false, bool letGo = false)
        {
            var input = new PlayerMovementInput { MoveX = x, MoveY = y, JumpPressed = jump, LetGoPressed = letGo };
            FindPlayer().SubmitInput(in input);
        }

        /// <summary>Pushes the stick towards a world direction (relative to the camera the motor uses).</summary>
        private static void StickToward(Vector3 direction)
        {
            PlayerMotor player = FindPlayer();
            var camera = new SerializedObject(player).FindProperty("cameraTransform").objectReferenceValue as Transform;
            float yaw = camera != null ? camera.eulerAngles.y * Mathf.Deg2Rad : 0f;
            var forward = new Vector3(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));
            var right = new Vector3(forward.z, 0f, -forward.x);
            direction.y = 0f;
            direction.Normalize();
            Stick(Vector3.Dot(direction, right), Vector3.Dot(direction, forward));
        }

        /// <summary>Stands 2 m in front of the ladder and walks into it until the character climbs.</summary>
        private static Func<bool> GrabLadder()
        {
            bool placed = false;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                if (!placed)
                {
                    Stamina().Refill();
                    Vector3 front = _tower.position + _tower.forward * (3f + 2f);
                    PlaceOnGround(front, -_tower.forward);
                    placed = true;
                    _stepStart = EditorApplication.timeSinceStartup;
                    return false;
                }

                if (!player.IsClimbing)
                {
                    StickToward(-_tower.forward);
                    return Fail(Elapsed > 4.0, "Der Spieler greift die Leiter nicht (Abstand " +
                                               Vector3.Distance(player.transform.position, _tower.position).ToString("0.0") + " m zur Turmmitte).");
                }

                Note("Leiter gegriffen (" + player.ClimbSurface.Kind + ", Höhe " + HeightOnTower().ToString("0.0") + " m).");
                return Fail(player.ClimbSurface.Kind != ClimbSurfaceKind.Ladder, "Die erste Fläche ist keine Leiter.") || true;
            };
        }

        /// <summary>Climbs up until the feet are <paramref name="height"/> metres above the base.</summary>
        private static Func<bool> ClimbUntil(float height, string where)
        {
            return () =>
            {
                PlayerMotor player = FindPlayer();
                if (!player.IsClimbing)
                {
                    return Fail(true, "Der Spieler ist von der Wand gefallen (" + player.LastClimbExit + ", Höhe " + HeightOnTower().ToString("0.0") + " m).");
                }

                if (HeightOnTower() < height)
                {
                    Stick(0f, 1f);
                    return Fail(Elapsed > 15.0, "Der Spieler kommt nicht auf " + height + " m (" + HeightOnTower().ToString("0.0") + " m).");
                }

                Note("Auf " + HeightOnTower().ToString("0.0") + " m (" + where + "): Fläche " + player.ClimbSurface.Kind +
                     (player.ClimbSurface.RestPoint ? " (Rastpunkt)" : string.Empty) + ", Ausdauer " + Stamina().Current.ToString("0") + ".");
                return true;
            };
        }

        /// <summary>Climbs the rest of the route and over the edge onto the deck.</summary>
        private static Func<bool> ClimbToTheTop()
        {
            var kinds = new HashSet<string>();
            float lowest = float.MaxValue;
            float staminaStart = -1f;
            double started = 0.0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                ResourcePool stamina = Stamina();
                if (staminaStart < 0f)
                {
                    staminaStart = stamina.Current;
                    started = EditorApplication.timeSinceStartup;
                }

                if (player.IsClimbing)
                {
                    kinds.Add(player.ClimbSurface.Kind + (player.ClimbSurface.RestPoint ? " (Rast)" : string.Empty));
                    lowest = Mathf.Min(lowest, stamina.Current);
                    Stick(0f, 1f);
                    return Fail(Elapsed > 25.0, "Der Spieler kommt nicht oben an (" + HeightOnTower().ToString("0.0") + " m).");
                }

                float height = HeightOnTower();
                Note("Oben: " + player.LastClimbExit + " nach " + (EditorApplication.timeSinceStartup - started).ToString("0.0") + " s, Höhe " +
                     height.ToString("0.0") + " m, Flächen " + string.Join(", ", kinds) + ", Ausdauer " + staminaStart.ToString("0") + " → " +
                     lowest.ToString("0") + ".");
                return Fail(player.LastClimbExit != ClimbExit.TopOut, "Kein Überklettern der Kante (" + player.LastClimbExit + ").") ||
                       Fail(height < 15.5f, "Der Spieler steht nicht auf der Plattform.") ||
                       Fail(!kinds.Contains("Vines"), "Die Ranken wurden nicht beklettert.") ||
                       Fail(staminaStart - lowest < 20f, "Klettern kostet kaum Ausdauer.") || true;
            };
        }

        /// <summary>A climb jump upwards: 1.8 m for 20 stamina.</summary>
        private static Func<bool> ClimbJump()
        {
            float from = 0f;
            float staminaBefore = 0f;
            int phase = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                switch (phase)
                {
                    case 0:
                        from = HeightOnTower();
                        staminaBefore = Stamina().Current;
                        Stick(0f, 1f, jump: true);
                        phase = 1;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 0.8)
                        {
                            return false;
                        }

                        float gained = HeightOnTower() - from;
                        float spent = staminaBefore - Stamina().Current;
                        Note("Klettersprung: " + gained.ToString("0.00") + " m höher, " + spent.ToString("0") + " Ausdauer.");
                        return Fail(!player.IsClimbing, "Nach dem Klettersprung hängt der Spieler nicht mehr.") ||
                               Fail(gained < 1.5f || gained > 2.1f, "Der Klettersprung ist nicht 1,8 m hoch.") ||
                               Fail(spent < ClimbModel.JumpStamina - 0.5f, "Der Klettersprung kostet keine 20 Ausdauer.") || true;
                }

                return true;
            };
        }

        /// <summary>Stamina 0 on the rock: the hands shake for a second, then the character falls and lands.</summary>
        private static Func<bool> RunOutOfStamina()
        {
            int phase = 0;
            bool shook = false;
            double emptied = 0.0;
            double fell = 0.0;
            float height = 0f;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                switch (phase)
                {
                    case 0:
                        Stamina().SetCurrent(0f);
                        emptied = EditorApplication.timeSinceStartup;
                        height = HeightOnTower();
                        phase = 1;
                        _stepStart = emptied;
                        return false;
                    case 1:
                        if (player.IsClimbing)
                        {
                            shook |= player.IsClimbShaking;
                            Stick(0f, 1f);
                            return Fail(Elapsed > 4.0, "Ohne Ausdauer hält sich der Spieler ewig.");
                        }

                        fell = EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        if (player.Model.IsAirborne || !player.Model.IsGrounded)
                        {
                            return Fail(Elapsed > 8.0, "Der Spieler landet nicht.");
                        }

                        Note("Ausdauer leer auf " + height.ToString("0.0") + " m: Zittern " + shook + ", Absturz nach " + (fell - emptied).ToString("0.0") +
                             " s (" + player.LastClimbExit + "), gelandet auf " + HeightOnTower().ToString("0.0") + " m.");
                        return Fail(!shook, "Die Hände zittern nicht.") ||
                               Fail(player.LastClimbExit != ClimbExit.Exhausted, "Der Absturz kommt nicht von der Erschöpfung.") ||
                               Fail(fell - emptied < 0.9, "Der Absturz kommt ohne Warnung.") || true;
                }
            };
        }

        /// <summary>Climbs down the ladder until the character stands on the ground again.</summary>
        private static Func<bool> ClimbDown()
        {
            return () =>
            {
                PlayerMotor player = FindPlayer();
                if (player.IsClimbing)
                {
                    Stick(0f, -1f);
                    return Fail(Elapsed > 6.0, "Der Spieler kommt die Leiter nicht hinunter (" + HeightOnTower().ToString("0.0") + " m).");
                }

                Note("Hinuntergeklettert: " + player.LastClimbExit + " auf " + HeightOnTower().ToString("0.0") + " m.");
                return Fail(player.LastClimbExit != ClimbExit.Ground, "Der Abstieg endet nicht am Boden (" + player.LastClimbExit + ").") || true;
            };
        }

        /// <summary>The dodge button lets go of the ladder.</summary>
        private static Func<bool> LetGo()
        {
            bool pressed = false;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                if (!pressed)
                {
                    Stick(0f, 0f, letGo: true);
                    pressed = true;
                    return false;
                }

                if (player.IsClimbing)
                {
                    return Fail(Elapsed > 2.0, "Ausweichen lässt die Leiter nicht los.");
                }

                Note("Losgelassen: " + player.LastClimbExit + ".");
                return Fail(player.LastClimbExit != ClimbExit.LetGo, "Das Ende ist kein Loslassen (" + player.LastClimbExit + ").") || true;
            };
        }

        private static Pose ViewClimber(Transform player)
        {
            Vector3 p = player.position + Vector3.up * 1f;
            return Look(p + _tower.forward * 7f + _tower.right * 3f - Vector3.up * 1.5f, p);
        }

        private static Pose ViewFromNest(Transform player)
        {
            Vector3 p = player.position + Vector3.up * 1.4f;
            return Look(p + _tower.forward * 5f + _tower.right * 4f + Vector3.up * 3f, p - Vector3.up * 0.5f);
        }
    }
}
