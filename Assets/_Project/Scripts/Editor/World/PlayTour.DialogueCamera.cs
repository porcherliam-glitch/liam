using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.Cinematics;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using Aetherfall.Quests;
using Unity.Cinemachine;
using UnityEngine;
using Object = UnityEngine.Object;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The dialogue camera (S58, part of <c>-tourMode zwischensequenz</c>): a conversation with Hollmann from n200 opens on the
    /// two-shot, cuts to the shot over the player's shoulder, shows the reverse shot at the choice and the shot again for his
    /// answer, then blends back to the game camera; Hedda's first line ("Nah") is a close-up. The tour photographs every setup and
    /// checks the 180° rule (all dialogue cameras on one side), the fields of view and the cut log (at least 1.5 s apart, one cut
    /// per line).
    /// </summary>
    public static partial class PlayTour
    {
        private const string HollmannId = "npc.eichental.bauer_hollmann";
        private const string HollmannDialogue = "dlg.eichental.hollmann";
        private const string HeddaId = "npc.eichental.dorfvorsteherin_hedda";
        private const string HeddaDialogue = "dlg.eichental.hedda";

        private static readonly List<int> DialogueSides = new List<int>();
        private static Vector3 _partnerFeet;
        private static bool _partnerFound;

        private static void BuildDialogueCameraPlan()
        {
            Steps.Enqueue(StartTourDialogue(HollmannId, HollmannDialogue, "n200"));
            Steps.Enqueue(() => Wait(0.8));
            Steps.Enqueue(DialogueShotStep("z11_dialog_eroeffnung", DialogueSetup.Wide));
            Steps.Enqueue(WaitForSetup(DialogueSetup.Shot));
            Steps.Enqueue(() => Wait(0.3));
            Steps.Enqueue(DialogueShotStep("z12_dialog_schuss", DialogueSetup.Shot));
            Steps.Enqueue(ContinueTourDialogue);
            Steps.Enqueue(() => Wait(0.5));
            Steps.Enqueue(ContinueTourDialogue);
            Steps.Enqueue(WaitForSetup(DialogueSetup.ReverseShot));
            Steps.Enqueue(() => Wait(0.3));
            Steps.Enqueue(DialogueShotStep("z13_dialog_gegenschuss", DialogueSetup.ReverseShot));
            Steps.Enqueue(() => ChooseTourOption(1));
            Steps.Enqueue(WaitForSetup(DialogueSetup.Shot));
            Steps.Enqueue(() => Wait(0.3));
            Steps.Enqueue(DialogueShotStep("z14_dialog_antwort", DialogueSetup.Shot));
            Steps.Enqueue(CheckCutLog);
            Steps.Enqueue(ContinueTourDialogue);
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(CheckBackToTheGameCamera);
            Steps.Enqueue(() => Capture("z15_nach_dialog", null));

            // Hedda stands at the Dorfplatz from stage s20 on (before that her conversation is switched off).
            Steps.Enqueue(() => SetPrologueStage("s20"));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(StartTourDialogue(HeddaId, HeddaDialogue, "n200"));
            Steps.Enqueue(WaitForSetup(DialogueSetup.Close));
            Steps.Enqueue(() => Wait(0.3));
            Steps.Enqueue(CheckCloseUp);
            Steps.Enqueue(() => !_partnerFound || Capture("z16_dialog_nah", null));
            Steps.Enqueue(EndTourDialogue);
            Steps.Enqueue(() => Wait(0.5));
            Steps.Enqueue(CheckHeddaLeftAfterTheConversation);
        }

        private static bool SetPrologueStage(string stageId)
        {
            bool set = Services.Locator.TryGet(out IQuestService quests) && quests.TrySetStage(Q.Prologue, stageId, TourSource);
            Note("Prolog auf Stufe " + stageId + " gesetzt: " + set + ".");
            return true;
        }

        private static IDialogueCameraDirector DialogueCamera()
        {
            return Services.Locator != null && Services.Locator.TryGet(out IDialogueCameraDirector director) ? director : null;
        }

        /// <summary>Places the player 2.2 m in front of the NPC, facing it, and starts the conversation at a node.</summary>
        private static Func<bool> StartTourDialogue(string npcId, string dialogueId, string startNode)
        {
            int phase = 0;
            return () =>
            {
                if (phase == 0)
                {
                    NpcInteractable npc = Object.FindObjectsByType<NpcInteractable>(FindObjectsInactive.Exclude).FirstOrDefault(n => n.NpcId == npcId && n.isActiveAndEnabled);
                    _partnerFound = npc != null;
                    if (npc == null)
                    {
                        Note("Hinweis: " + npcId + " steht gerade nicht in der Welt – Dialogkamera dort nicht geprüft.");
                        return true;
                    }

                    _partnerFeet = npc.transform.position;
                    Vector3 front = npc.transform.forward;
                    front.y = 0f;
                    Vector3 stand = _partnerFeet + (front.sqrMagnitude > 0.01f ? front.normalized : Vector3.forward) * 2.2f;
                    PlaceOnGround(stand, _partnerFeet - stand);
                    DialogueSides.Clear();
                    phase = 1;
                    return false;
                }

                if (phase == 1)
                {
                    // One more frame: the game camera follows the player to the new place first.
                    phase = 2;
                    return false;
                }

                if (!Services.Locator.TryGet(out IDialogueService dialogues) ||
                    !dialogues.TryStart(new DialogueStartRequest(dialogueId, npcId, startNode, TourSource)))
                {
                    return Fail(true, "Gespräch " + dialogueId + " ab " + startNode + " ließ sich nicht starten.");
                }

                Note("Gespräch " + dialogueId + " ab " + startNode + " gestartet (Dialogkamera).");
                return true;
            };
        }

        private static Func<bool> WaitForSetup(DialogueSetup setup)
        {
            return () =>
            {
                if (!_partnerFound)
                {
                    return true;
                }

                IDialogueCameraDirector director = DialogueCamera();
                if (director != null && director.Current.Active && director.Current.Setup == setup)
                {
                    return true;
                }

                return Fail(Elapsed > 6.0, "Die Dialogkamera wechselte nicht zu " + setup + " (jetzt " +
                                           (director != null && director.Current.Active ? director.Current.Setup.ToString() : "aus") + ").");
            };
        }

        /// <summary>Checks the live setup, the live dialogue camera and its side, then photographs it.</summary>
        private static Func<bool> DialogueShotStep(string name, DialogueSetup expected)
        {
            bool checkedOnce = false;
            return () =>
            {
                if (!_partnerFound)
                {
                    return true;
                }

                if (!checkedOnce)
                {
                    checkedOnce = true;
                    IDialogueCameraDirector director = DialogueCamera();
                    Camera main = Camera.main;
                    CinemachineBrain brain = main != null ? main.GetComponent<CinemachineBrain>() : null;
                    string live = brain != null && brain.ActiveVirtualCamera != null ? brain.ActiveVirtualCamera.Name : "–";
                    PlayerMotorPosition(out Vector3 player);
                    int side = main != null
                        ? DialogueFraming.SideOf(new CinePoint(main.transform.position.x, main.transform.position.y, main.transform.position.z),
                            new CinePoint(player.x, player.y, player.z), new CinePoint(_partnerFeet.x, _partnerFeet.y, _partnerFeet.z))
                        : 0;
                    DialogueSides.Add(side);
                    Note(name + ": Einstellung " + (director != null ? director.Current.Setup.ToString() : "?") + ", Kamera " + live + ", Seite " + side +
                         ", Sichtfeld " + (main != null ? main.fieldOfView.ToString("0") : "?") + "°.");
                    Fail(director == null || director.Current.Setup != expected, name + ": erwartet " + expected + ".");
                    Fail(!live.StartsWith("CM_Dialog", StringComparison.Ordinal), name + ": es führt " + live + " statt einer Dialogkamera.");
                    Fail(main != null && (main.fieldOfView < 31.5f || main.fieldOfView > 40.5f), name + ": Sichtfeld außerhalb 32–40°.");
                }

                return Capture(name, null);
            };
        }

        private static bool ContinueTourDialogue()
        {
            if (!_partnerFound)
            {
                return true;
            }

            return Services.Locator.TryGet(out IDialogueService dialogues) && dialogues.Continue() ||
                   Fail(true, "Weiter im Gespräch ging nicht (Zustand " + (dialogues != null ? dialogues.View.State.ToString() : "?") + ").");
        }

        private static bool ChooseTourOption(int index)
        {
            if (!_partnerFound)
            {
                return true;
            }

            return Services.Locator.TryGet(out IDialogueService dialogues) && dialogues.Choose(index) ||
                   Fail(true, "Antwort " + (index + 1) + " ließ sich nicht wählen.");
        }

        private static bool EndTourDialogue()
        {
            if (Services.Locator.TryGet(out IDialogueService dialogues) && dialogues.IsRunning)
            {
                dialogues.ForceEnd(TourSource);
            }

            return true;
        }

        /// <summary>Talking to Hedda at s20 moved the quest to s25: her Dorfplatz placeholder leaves once the conversation is over.</summary>
        private static bool CheckHeddaLeftAfterTheConversation()
        {
            if (!_partnerFound)
            {
                return true;
            }

            NpcInteractable partner = Object.FindObjectsByType<NpcInteractable>(FindObjectsInactive.Include)
                .FirstOrDefault(n => n.NpcId == HeddaId && Vector3.Distance(n.transform.position, _partnerFeet) < 0.5f);
            bool left = partner != null && !partner.gameObject.activeInHierarchy;
            Note("Nach dem Gespräch mit Hedda: Platzhalter am Dorfplatz " + (left ? "weg (Stufe s25)" : "noch da") + ".");
            return Fail(!left, "Hedda am Dorfplatz verschwand nach dem Gespräch nicht.") || true;
        }

        private static bool CheckCutLog()
        {
            IDialogueCameraDirector director = DialogueCamera();
            if (!_partnerFound || director == null)
            {
                return true;
            }

            IReadOnlyList<DialogueCutRecord> cuts = director.Cuts;
            Note("Schnitte im Gespräch: " + string.Join(", ", cuts.Select(c => c.ToString())) + ".");
            for (int i = 1; i < cuts.Count; i++)
            {
                Fail(cuts[i].Time - cuts[i - 1].Time < 1.5 - 1e-6, "Zwei Schnitte weniger als 1,5 s auseinander: " + cuts[i - 1] + " / " + cuts[i] + ".");
                // Entry 0 is the opening two-shot, not a cut: the first real cut may come in the same line.
                Fail(i > 1 && cuts[i].Beat == cuts[i - 1].Beat, "Zwei Schnitte in einer Zeile: " + cuts[i] + ".");
            }

            bool oneSide = DialogueSides.Count > 0 && DialogueSides.All(s => s != 0 && s == DialogueSides[0]);
            return Fail(!oneSide, "Die Dialogkameras stehen nicht alle auf einer Seite (180°-Regel): " + string.Join(", ", DialogueSides) + ".") || true;
        }

        private static bool CheckBackToTheGameCamera()
        {
            if (!_partnerFound)
            {
                return true;
            }

            IDialogueCameraDirector director = DialogueCamera();
            Camera main = Camera.main;
            CinemachineBrain brain = main != null ? main.GetComponent<CinemachineBrain>() : null;
            string live = brain != null && brain.ActiveVirtualCamera != null ? brain.ActiveVirtualCamera.Name : "–";
            Fail(director != null && director.Current.Active, "Die Dialogkamera ist nach dem Gespräch noch an.");
            Fail(live != "CM_Explore", "Nach dem Gespräch führt " + live + " statt CM_Explore.");
            Note("Nach dem Gespräch: Zustand " + _gameState.Current + ", Kamera " + live + ".");
            return true;
        }

        private static bool CheckCloseUp()
        {
            if (!_partnerFound)
            {
                return true;
            }

            Camera main = Camera.main;
            if (main == null)
            {
                return Fail(true, "Keine Kamera für die Nahaufnahme.");
            }

            Vector3 head = _partnerFeet + Vector3.up * (float)DialogueCameraRules.HeadHeight;
            float distance = Vector3.Distance(main.transform.position, head);
            CinemachineBrain brain = main.GetComponent<CinemachineBrain>();
            Aetherfall.Cinematics.Playback.DialogueCameraRig rig = Object.FindAnyObjectByType<Aetherfall.Cinematics.Playback.DialogueCameraRig>();
            string live = brain != null && brain.ActiveVirtualCamera != null ? brain.ActiveVirtualCamera.Name : "–";
            string rigCamera = rig != null && rig.Live != null ? rig.Live.name + " bei " + Vector3.Distance(rig.Live.transform.position, head).ToString("0.00") + " m" : "keine";
            Note("Nahaufnahme: " + distance.ToString("0.00") + " m vom Kopf, Sichtfeld " + main.fieldOfView.ToString("0") + "°, Kamera " + live +
                 (brain != null && brain.IsBlending ? " (Blende läuft)" : string.Empty) + ", Rig: " + rigCamera + ".");

            // GDD 02: whoever speaks stays until the conversation ends (Hedda's s20 placeholder must not vanish at "Mit Hedda sprechen").
            NpcInteractable partner = Object.FindObjectsByType<NpcInteractable>(FindObjectsInactive.Include)
                .FirstOrDefault(n => n.NpcId == HeddaId && Vector3.Distance(n.transform.position, _partnerFeet) < 0.5f);
            Fail(partner == null || !partner.gameObject.activeInHierarchy, "Hedda verschwand mitten im Gespräch.");
            Fail(Mathf.Abs(distance - (float)DialogueCameraRules.CloseDistance) > 0.15f, "Die Nahaufnahme steht nicht 0,9 m vor dem Kopf.");
            return Fail(Mathf.Abs(main.fieldOfView - (float)DialogueCameraRules.CloseFieldOfView) > 1f, "Die Nahaufnahme hat nicht 32° Sichtfeld.") || true;
        }

        private static void PlayerMotorPosition(out Vector3 position)
        {
            Aetherfall.Player.PlayerMotor player = FindPlayer();
            position = player != null ? player.transform.position : Vector3.zero;
        }
    }
}
