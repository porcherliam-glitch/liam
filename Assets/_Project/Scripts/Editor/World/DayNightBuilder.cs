using System.Collections.Generic;
using System.IO;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Day and night in the generated scenes (S35): bakes the <c>dayCycle</c> block of the layout file into the region's
    /// <see cref="DayNightProfile"/> (written only when a value changed, so a second run leaves the asset alone), adds the rig
    /// "Tag und Nacht" (outdoors: sun, sky, fires, windows; indoors: the daylight at the exits) and marks fires as
    /// <see cref="WorldLightSource"/> and the windows of homes as <see cref="WindowLights"/>. Editor only.
    /// </summary>
    public static class DayNightBuilder
    {
        /// <summary>Name of the rig object.</summary>
        public const string RigName = "Tag und Nacht";

        /// <summary>Bakes the profile of a layout (null if the layout has no <c>dayCycle</c> block).</summary>
        /// <param name="layout">Checked layout.</param>
        /// <param name="path">Asset path of the profile.</param>
        /// <param name="report">Protocol.</param>
        public static DayNightProfile EnsureProfile(RegionLayout layout, string path, TestGroundReport report)
        {
            if (layout == null || layout.DayCycle == null)
            {
                return null;
            }

            LayoutDayCycle cycle = layout.DayCycle;
            var sunPath = new DayNightSunPath((float)cycle.Sunrise, (float)cycle.Sunset, (float)cycle.NoonElevation, (float)cycle.NightDepth,
                (float)cycle.RiseAzimuth, (float)cycle.SetAzimuth, ToColor(cycle.MoonColor), (float)cycle.MoonIntensity, (float)cycle.NewMoonFactor,
                (float)cycle.MoonShadowStrength, (float)cycle.MoonMinElevation);
            var keys = new List<DayNightKey>(cycle.Keys.Count);
            foreach (LayoutDayKey key in cycle.Keys)
            {
                keys.Add(new DayNightKey((float)key.Hour, ToColor(key.SunColor), (float)key.SunIntensity, ToColor(key.AmbientSky),
                    ToColor(key.AmbientEquator), ToColor(key.AmbientGround), ToColor(key.FogColor), (float)key.FogDensity, ToColor(key.SkyTint),
                    (float)key.SkyExposure, (float)key.Atmosphere, (float)key.SunSize, (float)key.Reflection, (float)key.LocalLights));
            }

            DayNightProfile profile = AssetDatabase.LoadAssetAtPath<DayNightProfile>(path);
            bool created = profile == null;
            if (created)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
                profile = ScriptableObject.CreateInstance<DayNightProfile>();
                profile.name = Path.GetFileNameWithoutExtension(path);
                profile.Configure(sunPath, keys);
                AssetDatabase.CreateAsset(profile, path);
                report.Info("Tag-Nacht-Profil angelegt: " + path + " (" + keys.Count + " Tageszeit-Schlüssel).");
                return profile;
            }

            // Compare with a fresh copy: an unchanged profile is not written again (no churn).
            DayNightProfile fresh = ScriptableObject.CreateInstance<DayNightProfile>();
            fresh.name = profile.name;
            fresh.Configure(sunPath, keys);
            bool same = EditorJsonUtility.ToJson(fresh) == EditorJsonUtility.ToJson(profile);
            Object.DestroyImmediate(fresh);
            if (!same)
            {
                profile.Configure(sunPath, keys);
                EditorUtility.SetDirty(profile);
                report.Info("Tag-Nacht-Profil aktualisiert: " + path + " (" + keys.Count + " Tageszeit-Schlüssel).");
            }

            return profile;
        }

        /// <summary>Bakes the Eichental profile from its layout file (for the crypt, whose daylight comes from the valley).</summary>
        /// <param name="report">Protocol.</param>
        public static DayNightProfile EnsureEichentalProfile(TestGroundReport report)
        {
            string file = Path.GetFullPath(EichentalPaths.LayoutPath);
            if (!File.Exists(file))
            {
                report.Warning("Layout-Datei fehlt: " + EichentalPaths.LayoutPath + " – kein Tag-Nacht-Profil.");
                return null;
            }

            var check = new LayoutReport();
            RegionLayout layout = RegionLayoutValidator.ReadAndValidate(File.ReadAllText(file), check);
            if (layout == null || check.HasErrors)
            {
                // Like the Eichental menu: a broken layout must not overwrite the profile the valley uses too.
                report.Warning("Eichental-Layout fehlerhaft – Tag-Nacht-Profil bleibt unverändert.");
                foreach (LayoutIssue issue in check.Issues)
                {
                    if (issue.Severity == LayoutIssueSeverity.Error)
                    {
                        report.Warning("Layout-Fehler: " + issue);
                    }
                }

                return AssetDatabase.LoadAssetAtPath<DayNightProfile>(EichentalPaths.DayNightProfilePath);
            }

            return EnsureProfile(layout, EichentalPaths.DayNightProfilePath, report);
        }

        /// <summary>Marks a light as a fire or lamp the stealth AI counts (and the rig scales with the time of day if it follows it).</summary>
        /// <param name="anchor">Object at the point that counts (player height).</param>
        /// <param name="light">The light that must burn.</param>
        /// <param name="followsDayCycle">True if the rig dims it by day.</param>
        public static WorldLightSource AddLightSource(GameObject anchor, Light light, bool followsDayCycle)
        {
            WorldLightSource source = anchor.AddComponent<WorldLightSource>();
            var serialized = new SerializedObject(source);
            serialized.FindProperty("lightComponent").objectReferenceValue = light;
            serialized.FindProperty("radius").floatValue = DayNightMath.NearLightRadius;
            serialized.FindProperty("followsDayCycle").boolValue = followsDayCycle;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return source;
        }

        /// <summary>
        /// Lets the windows of a home glow in the evening and early morning (houses until 21:30–22:30, the tavern until midnight; the
        /// times vary a little per house).
        /// </summary>
        /// <param name="building">Building root (all its renderers; only window slots are swapped).</param>
        /// <param name="seed">Seed of the building (details).</param>
        /// <param name="tavern">True for the tavern.</param>
        public static WindowLights AddWindowLights(GameObject building, int seed, bool tavern)
        {
            WindowLights windows = building.AddComponent<WindowLights>();
            var serialized = new SerializedObject(windows);
            Renderer[] renderers = building.GetComponentsInChildren<Renderer>(true);
            SerializedProperty list = serialized.FindProperty("renderers");
            list.arraySize = renderers.Length;
            for (int i = 0; i < renderers.Length; i++)
            {
                list.GetArrayElementAtIndex(i).objectReferenceValue = renderers[i];
            }

            serialized.FindProperty("eveningFrom").floatValue = 19.75f + EichentalBuildingBuilder.Jagged(seed, 9) * 0.5f;
            serialized.FindProperty("closeHour").floatValue = tavern ? 24f : 21.5f + EichentalBuildingBuilder.Jagged(seed, 10);
            serialized.FindProperty("morningFrom").floatValue = 5f + EichentalBuildingBuilder.Jagged(seed, 11) * 0.5f;
            serialized.FindProperty("morningUntil").floatValue = 6.5f;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return windows;
        }

        /// <summary>
        /// Adds the outdoor rig: the sun as main light (moon at night), the sky as template, every fire that follows the day cycle
        /// and every home with windows below the given roots.
        /// </summary>
        /// <param name="sun">Main light.</param>
        /// <param name="skyTemplate">Generated sky material.</param>
        /// <param name="profile">Day cycle of the region.</param>
        /// <param name="roots">Groups to search for fires and windows.</param>
        /// <param name="windowDark">Dark window material.</param>
        /// <param name="windowLit">Glowing window material.</param>
        /// <param name="report">Protocol.</param>
        public static DayNightSceneRig AddOutdoorRig(Light sun, Material skyTemplate, DayNightProfile profile, Transform[] roots, Material windowDark,
            Material windowLit, TestGroundReport report)
        {
            var lights = new List<Object>();
            var windows = new List<Object>();
            foreach (Transform root in roots)
            {
                if (root == null)
                {
                    continue;
                }

                foreach (WorldLightSource source in root.GetComponentsInChildren<WorldLightSource>(true))
                {
                    if (source.FollowsDayCycle && source.Light != null && !lights.Contains(source.Light))
                    {
                        lights.Add(source.Light);
                    }
                }

                foreach (WindowLights home in root.GetComponentsInChildren<WindowLights>(true))
                {
                    windows.Add(home);
                }
            }

            var rigObject = new GameObject(RigName);
            DayNightSceneRig rig = rigObject.AddComponent<DayNightSceneRig>();
            TestGroundFields.SetReference(rig, "profile", profile, report);
            TestGroundFields.SetInt(rig, "mode", (int)DayNightMode.Outdoor, report);
            TestGroundFields.SetReference(rig, "sun", sun, report);
            TestGroundFields.SetReference(rig, "skyboxTemplate", skyTemplate, report);
            TestGroundFields.SetReferences(rig, "localLights", lights.ToArray(), report);
            TestGroundFields.SetReferences(rig, "windows", windows.ToArray(), report);
            TestGroundFields.SetReference(rig, "windowDark", windowDark, report);
            TestGroundFields.SetReference(rig, "windowLit", windowLit, report);
            report.Info("Tag und Nacht: Licht folgt der Uhr (Profil " + profile.name + ", Sonne/Mond, Himmel, " + lights.Count + " Feuer, " +
                        windows.Count + " Häuser mit Fensterlicht).");
            return rig;
        }

        /// <summary>Adds the indoor rig: only the daylight at the exits follows the valley's sun; the stealth light factor stays 1.</summary>
        /// <param name="profile">Day cycle of the region outside.</param>
        /// <param name="daylightLights">Lights where daylight falls in.</param>
        /// <param name="daylightRenderers">Exit openings with the daylight material.</param>
        /// <param name="dayMaterial">Daylight material.</param>
        /// <param name="nightMaterial">Night material of the openings.</param>
        /// <param name="report">Protocol.</param>
        public static DayNightSceneRig AddIndoorRig(DayNightProfile profile, Light[] daylightLights, Renderer[] daylightRenderers, Material dayMaterial,
            Material nightMaterial, TestGroundReport report)
        {
            var rigObject = new GameObject(RigName);
            DayNightSceneRig rig = rigObject.AddComponent<DayNightSceneRig>();
            TestGroundFields.SetReference(rig, "profile", profile, report);
            TestGroundFields.SetInt(rig, "mode", (int)DayNightMode.Indoor, report);
            TestGroundFields.SetFloat(rig, "indoorLightFactor", 1f, report);
            TestGroundFields.SetReferences(rig, "daylightLights", daylightLights, report);
            TestGroundFields.SetReferences(rig, "daylightRenderers", daylightRenderers, report);
            TestGroundFields.SetReference(rig, "daylightDay", dayMaterial, report);
            TestGroundFields.SetReference(rig, "daylightNight", nightMaterial, report);
            report.Info("Tag und Nacht (drinnen): " + daylightLights.Length + " Tageslichter und " + daylightRenderers.Length +
                        " Ausgänge folgen der Sonne im Tal (Profil " + (profile != null ? profile.name : "fehlt") + ").");
            return rig;
        }

        private static Color ToColor(LayoutColor color)
        {
            return new Color((float)color.R, (float)color.G, (float)color.B);
        }
    }
}
