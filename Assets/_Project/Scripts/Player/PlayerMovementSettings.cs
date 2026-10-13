using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Tuning asset of the player movement (GDD 03 3.1, data-driven per P1). Lives in
    /// <c>Assets/_Project/Settings/Player/PlayerMovementSettings.asset</c> and is referenced by <see cref="PlayerMotor"/>.
    /// Default values are the GDD values; values marked "Vorschlag" are proposals of this step.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Spieler/Bewegungs-Einstellungen", fileName = "PlayerMovementSettings", order = 0)]
    public sealed class PlayerMovementSettings : ScriptableObject
    {
        [Header("Geschwindigkeiten (m/s)")]
        [Tooltip("Gehen: Stick unter 50 % bzw. Feststelltaste (GDD 03 3.1: 2,0 m/s).")]
        [Min(0.1f)] [SerializeField] private float walkSpeed = 2.0f;

        [Tooltip("Laufen: Stick ab 50 % bzw. WASD (GDD 03 3.1: 5,0 m/s, Kanon).")]
        [Min(0.1f)] [SerializeField] private float runSpeed = 5.0f;

        [Tooltip("Sprinten (GDD 03 3.1: 7,0 m/s, Kanon). Kostet Ausdauer (siehe unten).")]
        [Min(0.1f)] [SerializeField] private float sprintSpeed = 7.0f;

        [Tooltip("Schleichen (GDD 03 3.1: 1,8 m/s).")]
        [Min(0.1f)] [SerializeField] private float sneakSpeed = 1.8f;

        [Tooltip("Stick-Auslenkung, ab der gelaufen statt gegangen wird (GDD 03 1.5: 50 %).")]
        [Range(0.1f, 1f)] [SerializeField] private float runInputThreshold = 0.5f;

        [Header("Beschleunigung und Drehung")]
        [Tooltip("Zeit von 0 auf Laufgeschwindigkeit in Sekunden (GDD 03 3.1: 0,15 s).")]
        [Min(0.01f)] [SerializeField] private float accelerationTime = 0.15f;

        [Tooltip("Zeit von Laufgeschwindigkeit bis zum Stillstand in Sekunden (GDD 03 3.1: 0,12 s).")]
        [Min(0.01f)] [SerializeField] private float decelerationTime = 0.12f;

        [Tooltip("Drehrate beim Gehen und Laufen in Grad pro Sekunde (GDD 03 3.1: 720).")]
        [Min(1f)] [SerializeField] private float turnRate = 720f;

        [Tooltip("Drehrate beim Sprinten in Grad pro Sekunde (GDD 03 3.1: 540).")]
        [Min(1f)] [SerializeField] private float sprintTurnRate = 540f;

        [Header("Springen und Fallen")]
        [Tooltip("Sprunghöhe aus dem Stand in Metern (GDD 03 3.1: 1,2 m).")]
        [Min(0f)] [SerializeField] private float jumpHeight = 1.2f;

        [Tooltip("Schwerkraft beim Steigen in g (GDD 03 3.1: 1,0 g).")]
        [Min(0.1f)] [SerializeField] private float risingGravityScale = 1.0f;

        [Tooltip("Schwerkraft beim Fallen in g (GDD 03 3.1: 1,6 g – kurzer, knackiger Sprungbogen).")]
        [Min(0.1f)] [SerializeField] private float fallingGravityScale = 1.6f;

        [Tooltip("Höchste Fallgeschwindigkeit in m/s (GDD 03 3.1: 40 m/s).")]
        [Min(1f)] [SerializeField] private float maxFallSpeed = 40f;

        [Tooltip("Luftkontrolle als Anteil der Bodenbeschleunigung (GDD 03 3.1: 40 %; Richtung korrigieren ja, umkehren nein).")]
        [Range(0f, 1f)] [SerializeField] private float airControl = 0.4f;

        [Tooltip("Coyote-Time: so lange nach dem Verlassen einer Kante darf noch gesprungen werden, in Sekunden (GDD 03 3.1: 0,12 s).")]
        [Range(0f, 0.5f)] [SerializeField] private float coyoteTime = 0.12f;

        [Tooltip("Sprungpuffer: so lange vor der Landung gedrückt, wird der Sprung bei der Landung ausgeführt, in Sekunden (GDD 03 3.1: 0,15 s).")]
        [Range(0f, 0.5f)] [SerializeField] private float jumpBufferTime = 0.15f;

        [Header("Gelände")]
        [Tooltip("Steilster begehbarer Hang in Grad (GDD 03 3.1: bis 45°). Der CharacterController bekommt diesen Wert plus 0,5° als Slope Limit, damit eine Rampe mit genau diesem Winkel sicher begehbar bleibt.")]
        [Range(1f, 89f)] [SerializeField] private float walkableSlopeAngle = 45f;

        [Tooltip("Ab dieser Hangneigung rutscht die Figur ab, in Grad (GDD 03 3.1: ab 50°).")]
        [Range(1f, 89f)] [SerializeField] private float slideStartAngle = 50f;

        [Tooltip("Höchste Rutschgeschwindigkeit an zu steilen Hängen in m/s (Vorschlag: 12).")]
        [Min(0.5f)] [SerializeField] private float maxSlideSpeed = 12f;

        [Tooltip("Höchste Stufe, die ohne Springen genommen wird, in Metern (Vorschlag: 0,3 m). Wird als Step Offset des CharacterControllers gesetzt.")]
        [Range(0f, 1f)] [SerializeField] private float stepOffset = 0.3f;

        [Tooltip("Leichter Druck nach unten, damit die Figur Hänge und Treppen hinab am Boden bleibt, in m/s (Vorschlag: 2).")]
        [Min(0f)] [SerializeField] private float groundStickSpeed = 2f;

        [Header("Ausdauer (GDD 03, 3.1 und 4.3)")]
        [Tooltip("Ausdauerkosten beim Sprinten pro Sekunde (GDD 03: 12). Braucht eine CharacterStatsComponent am Spieler, sonst ist die Ausdauer unbegrenzt.")]
        [Min(0f)] [SerializeField] private float sprintStaminaPerSecond = 12f;

        [Tooltip("So viel Ausdauer braucht es, um einen Sprint zu beginnen (GDD 03: 10). Nach dem Erschöpfen sprintet die Figur erst wieder, wenn so viel regeneriert ist.")]
        [Min(0f)] [SerializeField] private float sprintStartMinimumStamina = 10f;

        [Tooltip("Ausdauerkosten eines Sprungs (GDD 03: 10). Springen geht, solange die Ausdauer über 0 ist.")]
        [Min(0f)] [SerializeField] private float jumpStaminaCost = 10f;

        /// <summary>Steepest walkable slope in degrees (also the CharacterController slope limit).</summary>
        public float WalkableSlopeAngle => walkableSlopeAngle;

        /// <summary>Highest step without jumping in metres (CharacterController step offset).</summary>
        public float StepOffset => stepOffset;

        /// <summary>Creates the plain tuning data for <see cref="PlayerMovementModel"/>.</summary>
        public PlayerMovementTuning CreateTuning()
        {
            return new PlayerMovementTuning
            {
                WalkSpeed = walkSpeed,
                RunSpeed = runSpeed,
                SprintSpeed = sprintSpeed,
                SneakSpeed = sneakSpeed,
                RunInputThreshold = runInputThreshold,
                AccelerationTime = accelerationTime,
                DecelerationTime = decelerationTime,
                TurnRate = turnRate,
                SprintTurnRate = sprintTurnRate,
                JumpHeight = jumpHeight,
                Gravity = PlayerMovementTuning.StandardGravity,
                RisingGravityScale = risingGravityScale,
                FallingGravityScale = fallingGravityScale,
                MaxFallSpeed = maxFallSpeed,
                AirControl = airControl,
                CoyoteTime = coyoteTime,
                JumpBufferTime = jumpBufferTime,
                WalkableSlopeAngle = walkableSlopeAngle,
                SlideStartAngle = Mathf.Max(slideStartAngle, walkableSlopeAngle),
                MaxSlideSpeed = maxSlideSpeed,
                StepOffset = stepOffset,
                GroundStickSpeed = groundStickSpeed,
                SprintStaminaPerSecond = sprintStaminaPerSecond,
                SprintStartMinimumStamina = sprintStartMinimumStamina,
                JumpStaminaCost = jumpStaminaCost
            };
        }
    }
}
