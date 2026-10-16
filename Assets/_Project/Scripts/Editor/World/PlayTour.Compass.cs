using System;
using System.Collections.Generic;
using System.Text;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Compass markers (S60, task list "Weltkarte und Erkundung"): logs what the compass shows (focus target with distance,
    /// tracked quests, search areas, places, "?") and photographs it. A focus target the quest markers know must be on the
    /// strip — in front, or pinned to the edge when it lies behind the player.
    /// </summary>
    public static partial class PlayTour
    {
        private static readonly List<CompassCandidate> CompassScratch = new List<CompassCandidate>();

        private static Func<bool> CheckCompass(string picture)
        {
            bool checkedSlots = false;
            return () =>
            {
                UIRoot root = Object.FindAnyObjectByType<UIRoot>();
                if (root == null || root.CompassMarkers == null || root.QuestMarkers == null)
                {
                    return Fail(Elapsed > 3.0, "Kein Kompass (UIRoot ist nicht bereit).");
                }

                if (!checkedSlots)
                {
                    if (Elapsed < 0.6)
                    {
                        // A few HUD frames, so the markers follow the current camera.
                        return false;
                    }

                    CompassScratch.Clear();
                    root.QuestMarkers.Collect(CompassScratch);
                    IReadOnlyList<CompassSlot> slots = root.CompassMarkers.Slots;
                    Note("Kompass: " + DescribeCompass(slots) + "; Questziele bekannt: " + CompassScratch.Count + ".");
                    bool focusKnown = CompassScratch.Exists(c => c.Kind == CompassMarkerKind.FocusQuest);
                    bool focusShown = false;
                    for (int i = 0; i < slots.Count; i++)
                    {
                        focusShown |= slots[i].Kind == CompassMarkerKind.FocusQuest;
                    }

                    if (focusKnown && !focusShown)
                    {
                        return Fail(true, "Der Kompass zeigt das Ziel der Fokus-Quest nicht.");
                    }

                    checkedSlots = true;
                    return false;
                }

                return Capture(picture, null);
            };
        }

        private static string DescribeCompass(IReadOnlyList<CompassSlot> slots)
        {
            if (slots.Count == 0)
            {
                return "keine Markierungen";
            }

            var text = new StringBuilder();
            text.Append(slots.Count).Append(" Markierungen (");
            for (int i = 0; i < slots.Count; i++)
            {
                CompassSlot slot = slots[i];
                if (i > 0)
                {
                    text.Append(", ");
                }

                text.Append(KindName(slot.Kind));
                if (slot.Label.Length > 0 && slot.Kind != CompassMarkerKind.UnknownPlace)
                {
                    text.Append(" „").Append(slot.Label).Append('“');
                }

                text.Append(' ').Append(CompassMarkerSelector.FormatDistance(slot.Distance));
                if (slot.AtEdge)
                {
                    text.Append(" am Rand");
                }

                if (slot.Stacked > 1)
                {
                    text.Append(" ×").Append(slot.Stacked);
                }
            }

            return text.Append(')').ToString();
        }

        private static string KindName(CompassMarkerKind kind)
        {
            switch (kind)
            {
                case CompassMarkerKind.FocusQuest:
                    return "Fokus";
                case CompassMarkerKind.TrackedQuest:
                    return "Quest";
                case CompassMarkerKind.SearchArea:
                    return "Suchgebiet";
                case CompassMarkerKind.Place:
                    return "Ort";
                case CompassMarkerKind.UnknownPlace:
                    return "?";
                default:
                    return kind.ToString();
            }
        }
    }
}
