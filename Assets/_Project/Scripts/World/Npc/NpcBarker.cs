using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Short lines of a village NPC in passing (GDD 01 7.4 "Barks"): when the player comes close (trigger zone around the NPC),
    /// the NPC says a line that fits the part of the day as text above its head for a few seconds. The same line comes again
    /// at the earliest after 10 minutes, the NPC itself at most every 30 seconds, and only one NPC talks within 15 m at a
    /// time. Nobody barks during dialogues, menus or cutscenes.
    /// </summary>
    /// <remarks>
    /// GameObject: the child "Bark-Zone" of the NPC itself, with a trigger collider on the trigger layer and a kinematic
    /// rigidbody (so the player's CharacterController raises the trigger messages here). The text is a world TextMesh child of
    /// the NPC, off at first.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class NpcBarker : MonoBehaviour
    {
        private const float NpcCooldownSeconds = 30f;
        private const float HearingDistance = 15f;
        private static readonly List<NpcBarker> Speaking = new List<NpcBarker>();
        private static readonly Dictionary<string, float> LastSaidByLine = new Dictionary<string, float>();

        [Tooltip("NPC-ID (für das Protokoll).")]
        [SerializeField] private string npcId = string.Empty;

        [Tooltip("Sprüche des NPC.")]
        [SerializeField] private List<NpcBarkLine> lines = new List<NpcBarkLine>();

        [Tooltip("Text über dem Kopf (anfangs aus).")]
        [SerializeField] private TextMesh text = null;

        [Tooltip("Ebenen der Spielfigur.")]
        [SerializeField] private LayerMask playerLayers = 0;

        [Tooltip("So lange steht der Text da (Sekunden).")]
        [Range(1f, 10f)] [SerializeField] private float showSeconds = 4f;

        private readonly List<float> _lastSaid = new List<float>();
        private IEventBus _bus;
        private IGameStateService _gameState;
        private DayPhase _phase = DayPhase.Day;
        private float _hideAt = -1f;
        private float _nextAllowed;

        /// <summary>Number of lines said so far.</summary>
        public int Said { get; private set; }

        /// <summary>The line on screen right now (empty when silent).</summary>
        public string Current => _hideAt >= 0f && text != null ? text.text : string.Empty;

        /// <summary>The lines.</summary>
        public IReadOnlyList<NpcBarkLine> Lines => lines;

        /// <summary>Says a fitting line now if the rules allow it (the trigger zone does this; tools may call it).</summary>
        /// <returns>True if a line was said.</returns>
        public bool TryBark()
        {
            float now = Time.unscaledTime;
            if (text == null || now < _nextAllowed || _hideAt >= 0f || (_gameState != null && _gameState.Current != GameState.Playing) ||
                SomeoneElseTalksNearby())
            {
                return false;
            }

            SyncLastSaid();
            int index = NpcBarkRules.Pick(lines, _phase, _lastSaid, now);
            if (index < 0)
            {
                return false;
            }

            string line = lines[index].Text;
            LastSaidByLine[Key(index)] = now;
            _lastSaid[index] = now;
            _nextAllowed = now + NpcCooldownSeconds;
            _hideAt = now + showSeconds;
            text.text = "„" + line + "“";
            text.gameObject.SetActive(true);
            Speaking.Add(this);
            Said++;
            Log.Info(LogCategory.World, "Bark " + npcId + ": " + line);
            return true;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            // Play mode without domain reload: start every session silent.
            Speaking.Clear();
            LastSaidByLine.Clear();
        }

        private void Awake()
        {
            if (text != null)
            {
                text.gameObject.SetActive(false);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _gameState);
                if (Services.Locator.TryGet(out _bus))
                {
                    _bus.Subscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "NpcBarker could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            Hide();
        }

        private void OnDestroy()
        {
            _bus?.Unsubscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
            Speaking.Remove(this);
        }

        private void OnTimeOfDayChanged(TimeOfDayChanged evt)
        {
            _phase = evt.Phase;
        }

        private void OnTriggerEnter(Collider other)
        {
            if ((playerLayers.value & (1 << other.gameObject.layer)) != 0)
            {
                TryBark();
            }
        }

        private void LateUpdate()
        {
            if (_hideAt < 0f)
            {
                return;
            }

            // A conversation, a menu or a cutscene silences the line at once.
            if (Time.unscaledTime >= _hideAt || (_gameState != null && _gameState.Current != GameState.Playing))
            {
                Hide();
                return;
            }

            // The text faces the camera.
            Camera view = Camera.main;
            if (view != null && text != null)
            {
                Transform label = text.transform;
                label.rotation = Quaternion.LookRotation(label.position - view.transform.position, Vector3.up);
            }
        }

        private void Hide()
        {
            _hideAt = -1f;
            if (text != null)
            {
                text.gameObject.SetActive(false);
            }

            Speaking.Remove(this);
        }

        private bool SomeoneElseTalksNearby()
        {
            Vector3 position = transform.position;
            for (int i = Speaking.Count - 1; i >= 0; i--)
            {
                NpcBarker other = Speaking[i];
                if (other == null)
                {
                    Speaking.RemoveAt(i);
                    continue;
                }

                if (other != this && (other.transform.position - position).sqrMagnitude < HearingDistance * HearingDistance)
                {
                    return true;
                }
            }

            return false;
        }

        private void SyncLastSaid()
        {
            while (_lastSaid.Count < lines.Count)
            {
                _lastSaid.Add(-1f);
            }

            // Several copies of the same NPC (per quest phase) share what was said.
            for (int i = 0; i < lines.Count; i++)
            {
                if (LastSaidByLine.TryGetValue(Key(i), out float said))
                {
                    _lastSaid[i] = said;
                }
            }
        }

        private string Key(int index)
        {
            return npcId + "|" + (lines[index] != null ? lines[index].Text : index.ToString());
        }
    }
}
