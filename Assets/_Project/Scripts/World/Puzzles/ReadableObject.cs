using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Something the player can read or inspect (GDD 02 11.7: inscription at the gate, wall reliefs, the tablet of the oath,
    /// Fenn's note): shows its text for a while (world text child until the reading window of the UI exists), writes
    /// "read" (1) under its id and publishes <c>ClueInspected</c> when a clue id is set (quest objective "Untersuche").
    /// </summary>
    /// <remarks>
    /// GameObject: the readable object with a trigger collider on the layer Interactable; <see cref="textDisplay"/> is a child
    /// with a 3D text (generator: TextMesh), off at start. A <see cref="HintHighlight"/> on the same object lets a puzzle
    /// highlight it.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class ReadableObject : WorldStateBehaviour, IInteractable
    {
        [Tooltip("Stabile ID, z. B. obj.eichental.gruft_tor_inschrift.")]
        [SerializeField] private string objectId = "obj.neu.inschrift";

        [Tooltip("Hinweis-ID für das Ereignis ClueInspected (leer = keins), z. B. clue.eichental.gruft_wandrelief_1.")]
        [SerializeField] private string clueId = string.Empty;

        [Tooltip("Hinweistext, z. B. „Lesen: Inschrift“.")]
        [SerializeField] private string prompt = "Lesen";

        [Tooltip("Der Text (wird angezeigt und ins Log geschrieben).")]
        [TextArea(2, 6)] [SerializeField] private string text = string.Empty;

        [Tooltip("Kind-Objekt mit dem 3D-Text (aus, bis gelesen wird).")]
        [SerializeField] private GameObject textDisplay = null;

        [Tooltip("So lange bleibt der Text sichtbar (Sekunden).")]
        [Range(1f, 60f)] [SerializeField] private float showSeconds = 10f;

        private float _timer = -1f;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Clue id (may be empty).</summary>
        public string ClueId => clueId ?? string.Empty;

        /// <summary>The text.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>True while the text is shown.</summary>
        public bool IsShowing => _timer >= 0f;

        /// <inheritdoc />
        public string InteractionObjectId => ObjectId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Read;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => 4;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return isActiveAndEnabled;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!isActiveAndEnabled)
            {
                return false;
            }

            Show();
            if (IsReady)
            {
                Store.SetState(ObjectId, WorldObjectStates.Done);
            }

            if (EventBus != null && ClueId.Length > 0)
            {
                var inspected = new ClueInspected(ClueId);
                EventBus.Publish(in inspected);
            }

            Log.Info(LogCategory.World, "Read '" + ObjectId + "': " + Text);
            return true;
        }

        /// <inheritdoc />
        protected override string MarkerId => ClueId.Length > 0 ? ClueId : ObjectId;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
        }

        private void Awake()
        {
            if (textDisplay != null)
            {
                textDisplay.SetActive(false);
            }
        }

        private void Update()
        {
            if (_timer < 0f)
            {
                return;
            }

            _timer -= Time.deltaTime;
            if (_timer < 0f && textDisplay != null)
            {
                textDisplay.SetActive(false);
            }
        }

        private void Show()
        {
            _timer = showSeconds;
            if (textDisplay != null)
            {
                textDisplay.SetActive(true);
            }
        }
    }
}
