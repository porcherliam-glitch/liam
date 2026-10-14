using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Turns an NPC towards the player (within the look radius) or the conversation partner and lets it glance around when
    /// idle (Unity adapter of <see cref="NpcLookModel"/>). The idle direction is the rotation at the start.
    /// </summary>
    /// <remarks>
    /// GameObject: the NPC root (next to <see cref="NpcInteractable"/>). "Look Target" is the player transform; the menu
    /// "Aetherfall > Testgelaende erstellen" sets it (no Find calls). Without it the NPC only turns towards the partner while
    /// talking. TODO (many NPCs): tick through a central runner instead of Update (rule 15.2 #14).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class NpcLookAt : MonoBehaviour
    {
        [Tooltip("Transform, das gedreht wird. Leer = dieses GameObject.")]
        [SerializeField] private Transform body = null;

        [Tooltip("Ziel zum Hinschauen (die Spielfigur). Leer = nur im Gespräch zum Gesprächspartner drehen.")]
        [SerializeField] private Transform lookTarget = null;

        [Tooltip("Abstand in Metern, ab dem der NPC zur Spielfigur schaut.")]
        [Min(0f)] [SerializeField] private float lookRadius = 4f;

        [Tooltip("Drehgeschwindigkeit in Grad pro Sekunde.")]
        [Min(1f)] [SerializeField] private float turnSpeed = NpcLookModel.DefaultTurnSpeed;

        [Tooltip("Größter Blickwinkel beim Umschauen im Leerlauf (0 = kein Umschauen).")]
        [Range(0f, 90f)] [SerializeField] private float glanceAngle = NpcLookModel.DefaultGlanceAngle;

        [Tooltip("Pause zwischen zwei Blicken zur Seite in Sekunden (von – bis).")]
        [SerializeField] private Vector2 glancePause = new Vector2(4f, 8f);

        private NpcLookModel _model;
        private bool _talking;
        private Vector3 _partnerPosition;

        /// <summary>Current look state.</summary>
        public NpcLookState State => _model != null ? _model.State : NpcLookState.Idle;

        /// <summary>The NPC faces a conversation partner until <see cref="EndConversation"/>.</summary>
        /// <param name="partnerPosition">Position of the partner (used if no look target is set).</param>
        public void BeginConversation(Vector3 partnerPosition)
        {
            _talking = true;
            _partnerPosition = partnerPosition;
        }

        /// <summary>The conversation ended.</summary>
        public void EndConversation()
        {
            _talking = false;
        }

        private void Awake()
        {
            if (body == null)
            {
                body = transform;
            }

            uint seed = (uint)name.Length * 2654435761u + 97u;
            _model = new NpcLookModel(body.eulerAngles.y, seed, turnSpeed, glanceAngle, glancePause.x, glancePause.y);
        }

        private void Update()
        {
            Vector3 position = body.position;
            bool hasTarget = lookTarget != null;
            Vector3 target = hasTarget ? lookTarget.position : _partnerPosition;
            float dx = target.x - position.x;
            float dz = target.z - position.z;
            bool inRange = hasTarget && dx * dx + dz * dz <= lookRadius * lookRadius;
            float targetYaw = NpcLookModel.YawTowards(position.x, position.z, target.x, target.z);
            float yaw = _model.Tick(Time.deltaTime, _talking, inRange, targetYaw);
            body.rotation = Quaternion.Euler(0f, yaw, 0f);
        }
    }
}
