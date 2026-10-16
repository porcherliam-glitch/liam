using System;
using System.Collections.Generic;
using System.IO;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.Player;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Day and night (S35, task list "Tag/Nacht"): jumps the clock to the morning, the golden hour, dusk, night (moon, lit windows,
    /// a fire for the stealth AI), saves and loads at night, rests until morning, and walks into the crypt at night and back. At
    /// each moment it checks sun or moon, ambient light, the light factor of the stealth AI and the windows, and photographs it.
    /// </summary>
    public static partial class PlayTour
    {
        private static readonly List<DayPhaseChanged> PhaseEvents = new List<DayPhaseChanged>();
        private static float _morningLuminance = -1f;
        private static bool _phaseSubscribed;

        private static void BuildDayNightPlan()
        {
            Steps.Enqueue(StartDayNight);
            Steps.Enqueue(TimeStep("tn_01_vormittag", 10.0, ViewOverview, CheckMorningLight));
            Steps.Enqueue(TimeStep("tn_02_goldene_stunde", 18 + 10 / 60.0, ViewOverview, CheckGoldenHour));
            Steps.Enqueue(TimeStep("tn_03_daemmerung", 20 + 40 / 60.0, ViewOverview, CheckDusk));
            Steps.Enqueue(TimeStep("tn_04_nacht", 22.0, ViewOverview, CheckNight));
            Steps.Enqueue(CheckNightLuminance);
            Steps.Enqueue(StandByAFire);

            // A quick save at night must load as night, even after the clock moved on.
            Steps.Enqueue(MapQuickSave);
            Steps.Enqueue(() => _mapSaveDone || Fail(Elapsed > 30.0, "Schnellspeichern wurde nicht fertig."));
            Steps.Enqueue(() => JumpTo(12.0));
            Steps.Enqueue(MapLoadAndWait());
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(CheckNightAfterLoad);

            // Rest until the morning (ten hours at once): the next frame shows the day.
            Steps.Enqueue(RestUntilMorning);
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(CheckAfterRest);
            Steps.Enqueue(() => Capture("tn_06_nach_rast", ViewOverview));
            Steps.Enqueue(TimeStep("tn_07_morgen", 5.75, ViewOverview, CheckEarlyMorning));

            // The crypt at night: dim daylight at the exits, its own darkness; back outside the night again.
            Steps.Enqueue(() => JumpTo(22.0));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(HurtPlayer);
            Steps.Enqueue(UsePortal);
            Steps.Enqueue(WaitForSceneChange);
            Steps.Enqueue(() => Wait(3.0));
            Steps.Enqueue(CheckCryptAtNight);
            Steps.Enqueue(() => !_portalUsed || Capture("tn_08_gruft_nacht", null));
            Steps.Enqueue(UsePortal);
            Steps.Enqueue(WaitForSceneChange);
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(CheckBackOutside);
            Steps.Enqueue(() => !_portalUsed || Capture("tn_09_zurueck", ViewOverview));
            Steps.Enqueue(EndDayNight);
        }

        private static bool StartDayNight()
        {
            PhaseEvents.Clear();
            _morningLuminance = -1f;
            if (!_phaseSubscribed && Services.Locator.TryGet(out IEventBus bus))
            {
                bus.Subscribe<DayPhaseChanged>(OnDayPhase);
                _phaseSubscribed = true;
            }

            if (!Services.Locator.TryGet(out IDayNightService _))
            {
                return Fail(true, "Kein IDayNightService (DayNightInstaller fehlt in der BootConfig).");
            }

            return true;
        }

        private static bool EndDayNight()
        {
            if (_phaseSubscribed && Services.Locator.TryGet(out IEventBus bus))
            {
                bus.Unsubscribe<DayPhaseChanged>(OnDayPhase);
            }

            _phaseSubscribed = false;
            Note("Phasenwechsel im Rundgang: " + PhaseEvents.Count + ".");
            return true;
        }

        private static void OnDayPhase(DayPhaseChanged evt)
        {
            PhaseEvents.Add(evt);
        }

        /// <summary>Jumps the clock to an hour of the day, waits until the light shows it, checks and photographs it.</summary>
        private static Func<bool> TimeStep(string picture, double hour, Func<Transform, Pose> view, Func<string> check)
        {
            int phase = 0;
            return () =>
            {
                switch (phase)
                {
                    case 0:
                        JumpTo(hour);
                        phase = 1;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 1.0)
                        {
                            return false;
                        }

                        string problem = check();
                        if (problem.Length > 0)
                        {
                            return Fail(true, picture + ": " + problem);
                        }

                        phase = 2;
                        return false;
                    default:
                        return Capture(picture, view);
                }
            };
        }

        private static bool JumpTo(double hour)
        {
            IGameClock clock = Services.Locator.Get<IGameClock>();
            double now = clock.TotalGameMinutes % GameCalendar.MinutesPerDay;
            double wait = (hour * 60.0 - now + GameCalendar.MinutesPerDay) % GameCalendar.MinutesPerDay;

            // Less than an hour past the target (the tour starts at 10:02): stay, instead of skipping a whole day and the moon phase.
            if (wait > 0.01 && wait < GameCalendar.MinutesPerDay - 60.0)
            {
                clock.AdvanceHours((float)(wait / 60.0), "debug.tagnacht");
            }

            return true;
        }

        private static string CheckMorningLight()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            if (rig == null || !rig.HasApplied)
            {
                return "Das Tag-Nacht-Rig der Szene ist nicht angemeldet oder hat noch kein Licht gezeigt.";
            }

            Vector3 euler = rig.Sun.transform.rotation.eulerAngles;
            Note("10:00 – " + Describe(rig, service) + ", Sonne " + euler.ToString("F1") + ".");
            if (service.Phase != DayPhase.Day)
            {
                return "Phase " + service.Phase + " statt Tag.";
            }

            if (Mathf.Abs(Mathf.DeltaAngle(euler.x, 42.1f)) > 1.5f || Mathf.Abs(Mathf.DeltaAngle(euler.y, 324f)) > 1.5f)
            {
                return "Die Sonne steht nicht bei Euler(42,1; 324).";
            }

            return LitWindows(rig) == 0 ? ExpectFactor(service, 1f) : "Fenster leuchten am Vormittag.";
        }

        private static string CheckGoldenHour()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            Note("18:10 – " + Describe(rig, service) + ".");
            if (Mathf.Abs(rig.Sun.intensity - 1.3f) > 0.05f || !Close(rig.Sun.color, Hex("#FFD49A")))
            {
                return "Die Sonne ist nicht die goldene Stunde des Layouts (" + rig.Sun.intensity.ToString("0.00") + ").";
            }

            return Close(RenderSettings.ambientSkyColor, Hex("#9FB7D3")) ? string.Empty : "Das Umgebungslicht ist nicht das des Layouts.";
        }

        private static string CheckDusk()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            int lit = LitWindows(rig);
            Note("20:40 – " + Describe(rig, service) + ", " + lit + " Häuser mit Licht, Himmel ×" + rig.LastSample.SkyExposure.ToString("0.00") + ".");
            if (service.Phase != DayPhase.Evening)
            {
                return "Phase " + service.Phase + " statt Abend.";
            }

            if (rig.LastSample.MainLightIntensity >= 0.05f)
            {
                return "In der Dämmerungslücke brennt noch ein Hauptlicht (" + rig.LastSample.MainLightIntensity.ToString("0.00") + ").";
            }

            return lit >= 3 ? ExpectFactor(service, 0.7f) : "Nur " + lit + " Häuser haben Licht in den Fenstern.";
        }

        private static string CheckNight()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            DayNightSample sample = rig.LastSample;
            Note("22:00 – " + Describe(rig, service) + ", Mond " + sample.MainLightIntensity.ToString("0.000") + " in " +
                 sample.MainLightElevation.ToString("0") + "°, Spiegelung " + RenderSettings.reflectionIntensity.ToString("0.00") + ".");
            if (service.Phase != DayPhase.Night || !PhaseEvents.Exists(e => e.Previous == DayPhase.Evening && e.Current == DayPhase.Night))
            {
                return "Kein Wechsel Abend → Nacht.";
            }

            if (!sample.MainLightIsMoon || Mathf.Abs(sample.MainLightIntensity - 0.22f) > 0.01f || !Close(rig.Sun.color, Hex("#9DB4E8")))
            {
                return "Das Hauptlicht ist nicht der Vollmond (Tag 1).";
            }

            if (!Close(RenderSettings.ambientSkyColor, Hex("#2C3E66")) || RenderSettings.reflectionIntensity > 0.26f)
            {
                return "Umgebungslicht oder Spiegelung sind nicht nächtlich.";
            }

            return ExpectFactor(service, 0.4f);
        }

        private static bool CheckNightLuminance()
        {
            float morning = Luminance("tn_01_vormittag");
            float night = Luminance("tn_04_nacht");
            if (morning <= 0f || night < 0f)
            {
                Note("Helligkeit: Bilder fehlen, nicht verglichen.");
                return true;
            }

            float share = night / morning;
            Note("Helligkeit der Bilder: Vormittag " + morning.ToString("0.000") + ", Nacht " + night.ToString("0.000") + " (" +
                 (share * 100f).ToString("0") + " %).");
            return Fail(share < 0.03f || share > 0.35f, "Die Nacht ist nicht dunkel, aber lesbar (3–35 % der Vormittagshelligkeit).") || true;
        }

        private static bool StandByAFire()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            WorldLightSource fire = null;
            foreach (WorldLightSource source in Object.FindObjectsByType<WorldLightSource>(FindObjectsInactive.Exclude))
            {
                if (source.FollowsDayCycle && source.IsLit && source.gameObject.name == "Feuerlicht")
                {
                    fire = source;
                    break;
                }
            }

            if (fire == null)
            {
                return Fail(true, "Kein brennendes Lagerfeuer in der Szene.");
            }

            Vector3 at = fire.Position + new Vector3(3f, 0f, 0f);
            PlaceOnGround(new Vector3(at.x, 0f, at.z), Vector3.left);
            PlayerMotor player = FindPlayer();
            float factor = service.LightFactorAt(player.transform.position + Vector3.up * 1.2f);
            Note("Am Lagerfeuer (" + fire.transform.parent.name + ", 3 m) um " + service.HourOfDay.ToString("0.00") + " h: Lichtwert " +
                 factor.ToString("0.0") + ", Feuer " + fire.Light.intensity.ToString("0.0") + " (×" + rig.LastSample.LocalLightScale.ToString("0.00") + ").");
            return Fail(Mathf.Abs(factor - 0.9f) > 0.001f, "Am Feuer ist der Lichtwert nicht 0,9.") || true;
        }

        private static bool CheckNightAfterLoad()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            if (rig == null)
            {
                return Fail(Elapsed > 5.0, "Nach dem Laden ist kein Tag-Nacht-Rig angemeldet.");
            }

            Note("Nach dem Laden: " + Describe(rig, service) + ".");
            return Fail(service.Phase != DayPhase.Night || !rig.LastSample.MainLightIsMoon, "Nach dem Laden ist es nicht wieder Nacht.") || true;
        }

        private static bool RestUntilMorning()
        {
            PhaseEvents.Clear();
            IGameClock clock = Services.Locator.Get<IGameClock>();
            JumpTo(22.0);
            PhaseEvents.Clear();
            clock.AdvanceHours(10f, "rest.tagnacht");
            return true;
        }

        private static bool CheckAfterRest()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            Note("Nach der Rast bis 8 Uhr: " + Describe(rig, service) + ", Phasenwechsel " + PhaseEvents.Count + ".");
            bool skipped = PhaseEvents.Count == 2 && PhaseEvents.TrueForAll(e => e.Skipped) && PhaseEvents[1].Current == DayPhase.Day;
            return Fail(service.Phase != DayPhase.Day || rig.Sun.intensity <= 1f || !skipped,
                       "Nach der Rast ist nicht sofort Tag (oder die Phasenwechsel fehlen).") || true;
        }

        private static string CheckEarlyMorning()
        {
            DayNightSceneRig rig = Rig(out IDayNightService service);
            DayNightSample sample = rig.LastSample;
            Note("05:45 – " + Describe(rig, service) + ", Sonne aus " + sample.SunAzimuth.ToString("0") + "°.");
            if (service.Phase != DayPhase.Morning || sample.MainLightIsMoon || sample.MainLightIntensity > 0.35f)
            {
                return "Kein flacher Morgen (Phase " + service.Phase + ", Licht " + sample.MainLightIntensity.ToString("0.00") + ").";
            }

            return Mathf.Abs(Mathf.DeltaAngle(sample.SunAzimuth, 93f)) < 2f ? ExpectFactor(service, 0.7f) : "Die Sonne geht nicht im Osten auf.";
        }

        private static bool CheckCryptAtNight()
        {
            if (!_portalUsed)
            {
                return true;
            }

            DayNightSceneRig rig = Rig(out IDayNightService service);
            if (rig == null || rig.Mode != DayNightMode.Indoor)
            {
                return Fail(Elapsed > 5.0, "In der Gruft ist kein Rig für drinnen angemeldet.");
            }

            Note("Gruft um " + service.HourOfDay.ToString("0.0") + " h: Umgebungslicht " + RenderSettings.ambientMode + ", Nebel " +
                 RenderSettings.fogDensity.ToString("0.000") + ", Tageslicht " + rig.LastSample.Daylight.ToString("0.00") + ", Lichtwert " +
                 service.LightFactorAt(Vector3.zero).ToString("0.0") + ".");
            return Fail(RenderSettings.ambientMode == AmbientMode.Trilight || rig.LastSample.Daylight > 0.1f || service.LightFactorAt(Vector3.zero) < 0.999f,
                "Die Gruft übernimmt das Nachtlicht des Tals oder ihr Tageslicht ist nicht gedimmt.") || true;
        }

        private static bool CheckBackOutside()
        {
            if (!_portalUsed)
            {
                return true;
            }

            DayNightSceneRig rig = Rig(out IDayNightService service);
            if (rig == null || rig.Mode != DayNightMode.Outdoor || !rig.HasApplied)
            {
                return Fail(Elapsed > 5.0, "Zurück im Tal ist das Rig für draußen nicht aktiv.");
            }

            Note("Zurück im Tal: " + Describe(rig, service) + ".");
            return Fail(!Close(RenderSettings.ambientSkyColor, Hex("#2C3E66")) || !rig.LastSample.MainLightIsMoon,
                "Zurück im Tal ist die Nacht nicht wieder da.") || true;
        }

        private static DayNightSceneRig Rig(out IDayNightService service)
        {
            Services.Locator.TryGet(out service);
            var dayNight = service as DayNightService;
            return dayNight != null ? dayNight.Current as DayNightSceneRig : null;
        }

        private static string Describe(DayNightSceneRig rig, IDayNightService service)
        {
            if (rig == null)
            {
                return "kein Rig";
            }

            DayNightSample sample = rig.LastSample;
            return "Phase " + service.Phase + ", " + (sample.MainLightIsMoon ? "Mond" : "Sonne") + " " + sample.MainLightIntensity.ToString("0.00") +
                   ", Umgebung #" + ColorUtility.ToHtmlStringRGB(RenderSettings.ambientSkyColor) + ", Lichtwert " + PlayerFactor(service).ToString("0.0");
        }

        private static string ExpectFactor(IDayNightService service, float outside)
        {
            // Next to a lit fire the night factor is 0.9: compare with what the player's place really offers.
            float factor = PlayerFactor(service);
            PlayerMotor player = FindPlayer();
            bool nearFire = player != null && Services.Locator.TryGet(out ILightSourceRegistry sources) &&
                            sources.AnyLitWithin(player.transform.position + Vector3.up * 1.2f);
            float expected = nearFire && outside < DayNightMath.NearLightFactor ? DayNightMath.NearLightFactor : outside;
            return Mathf.Abs(factor - expected) < 0.001f ? string.Empty : "Lichtwert " + factor.ToString("0.0") + " statt " + expected.ToString("0.0") + ".";
        }

        private static float PlayerFactor(IDayNightService service)
        {
            PlayerMotor player = FindPlayer();
            return player != null && service != null ? service.LightFactorAt(player.transform.position + Vector3.up * 1.2f) : 1f;
        }

        private static int LitWindows(DayNightSceneRig rig)
        {
            int lit = 0;
            foreach (WindowLights home in rig.Windows)
            {
                if (home != null && home.IsLit)
                {
                    lit++;
                }
            }

            return lit;
        }

        private static float Luminance(string picture)
        {
            string file = Path.Combine(_outputFolder, picture + ".png");
            if (!File.Exists(file))
            {
                return -1f;
            }

            var texture = new Texture2D(2, 2);
            try
            {
                if (!texture.LoadImage(File.ReadAllBytes(file)))
                {
                    return -1f;
                }

                Color32[] pixels = texture.GetPixels32();
                double sum = 0d;
                int count = 0;
                for (int i = 0; i < pixels.Length; i += 7)
                {
                    sum += (0.2126 * pixels[i].r + 0.7152 * pixels[i].g + 0.0722 * pixels[i].b) / 255d;
                    count++;
                }

                return count > 0 ? (float)(sum / count) : -1f;
            }
            finally
            {
                Object.DestroyImmediate(texture);
            }
        }

        private static bool Close(Color a, Color b)
        {
            return Mathf.Abs(a.r - b.r) < 0.03f && Mathf.Abs(a.g - b.g) < 0.03f && Mathf.Abs(a.b - b.b) < 0.03f;
        }

        private static Color Hex(string html)
        {
            return ColorUtility.TryParseHtmlString(html, out Color color) ? color : Color.magenta;
        }
    }
}
