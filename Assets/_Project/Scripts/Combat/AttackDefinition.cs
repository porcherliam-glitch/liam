using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// One attack as data (P1 "Datengetrieben"): wind-up, hit window and recovery in seconds, hitbox shape and offset,
    /// damage and poise multipliers, stamina cost, combo window, forward impulse and hit feedback. Lives in
    /// <c>Assets/_Project/Data/Combat/Attacks/</c>; weapons (<see cref="WeaponDefinition"/>) and enemy types reference it.
    /// </summary>
    /// <remarks>
    /// There are no animations yet: the time line replaces the clip (GDD 03 3.7 "Root Motion" is replaced by the lunge).
    /// Later the hit window comes from Animation Events through the same <see cref="IHitWindowReceiver"/> (§9.8).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Angriff", fileName = "Attack", order = 10)]
    public sealed class AttackDefinition : ScriptableObject
    {
        [Tooltip("ID des Angriffs (snake_case, ohne Umlaute), z. B. attack.einhandschwert.leicht_1.")]
        [SerializeField] private string attackId = "attack.neu";

        [Tooltip("Art des Angriffs: bestimmt Abbruchregeln und Treffer-Gefühl (GDD 03, 4.4–4.11).")]
        [SerializeField] private AttackKind kind = AttackKind.Light;

        [Header("Zeitfenster (Sekunden) – ersetzt die Animation")]
        [Tooltip("Ausholen bis zum Treffer. Bei Gegnern ist das die Telegrafie (mindestens 0,4 s, GDD 03, 9.5).")]
        [Min(0f)] [SerializeField] private float windupSeconds = 0.2f;

        [Tooltip("Dauer, in der die Hitbox aktiv ist (Treffer möglich).")]
        [Min(0.01f)] [SerializeField] private float activeSeconds = 0.12f;

        [Tooltip("Erholung nach dem Treffer (Strafraum, GDD 03, 9.5).")]
        [Min(0f)] [SerializeField] private float recoverySeconds = 0.5f;

        [Tooltip("Ab dieser Zeit (ab Angriffsbeginn) nimmt die Kombo den nächsten Schlag an (GDD 03, 4.4: ab ca. 55 % des Clips).")]
        [Min(0f)] [SerializeField] private float comboWindowStartSeconds = 0.45f;

        [Tooltip("An = Ausweichen/Blocken bricht den Angriff nur in der Erholung ab (schwere Angriffe). Aus = jederzeit außer im Treffer (leichte Angriffe).")]
        [SerializeField] private bool cancelOnlyInRecovery = false;

        [Header("Wirkung")]
        [Tooltip("M_Angriff für den Schaden: leicht 1,0 · Kombo-Abschluss 1,2 · schwer 1,5 · Sprint 1,3 · Sprung 1,2 · Konter 3,0 (GDD 03, 8.2).")]
        [Min(0f)] [SerializeField] private float damageMultiplier = 1f;

        [Tooltip("M_Angriff für die Haltung: leicht 1,0 · Kombo-Abschluss 1,5 · schwer 1,5 · Sprint 1,5 · Konter 2,0 (GDD 03, 4.9).")]
        [Min(0f)] [SerializeField] private float poiseMultiplier = 1f;

        [Tooltip("Ausdauerkosten beim Start (Einhandschwert: leicht 12, schwer 24, Sprint/Sprung 18; GDD 03, 4.3/5.1).")]
        [Min(0f)] [SerializeField] private float staminaCost = 12f;

        [Tooltip("Ausdauerschaden gegen einen Block, vor der Stabilität des Schilds (GDD 03, 4.7).")]
        [Min(0f)] [SerializeField] private float staminaDamage = 20f;

        [Tooltip("An = eigene Schadensart statt der Waffen-Schadensart (z. B. Stich beim 4. Schwertschlag).")]
        [SerializeField] private bool overrideDamageType = false;

        [Tooltip("Schadensart, wenn „Override Damage Type“ an ist.")]
        [SerializeField] private DamageType damageType = DamageType.Slash;

        [Tooltip("Nicht blockbar (rote Angriffe, Greifangriffe; GDD 03, 4.7).")]
        [SerializeField] private bool unblockable = false;

        [Tooltip("Nicht parierbar (GDD 03, 4.8).")]
        [SerializeField] private bool unparryable = false;

        [Header("Hitbox (relativ zur Figur: x rechts, y oben, z vorne)")]
        [Tooltip("Form der Treffer-Abfrage: Box oder Kugel.")]
        [SerializeField] private HitboxShape shape = HitboxShape.Box;

        [Tooltip("Mittelpunkt der Hitbox relativ zur Figur in Metern.")]
        [SerializeField] private Vector3 offset = new Vector3(0f, 1f, 1.1f);

        [Tooltip("Volle Größe der Box in Metern.")]
        [SerializeField] private Vector3 size = new Vector3(1.6f, 1.2f, 1.4f);

        [Tooltip("Radius der Kugel in Metern.")]
        [Min(0.05f)] [SerializeField] private float radius = 0.8f;

        [Header("Bewegung")]
        [Tooltip("Vorwärtsschub während des Angriffs in Metern (ersetzt Root Motion; Sprintangriff 2 m, GDD 03, 4.6).")]
        [Min(0f)] [SerializeField] private float lungeDistance = 0.3f;

        [Tooltip("Rückstoß des Ziels bei einem Treffer in Metern.")]
        [Min(0f)] [SerializeField] private float knockbackDistance = 0.3f;

        [Tooltip("So weit dreht sich die Figur beim Start zum Ziel bzw. zur Stick-Richtung, in Grad (GDD 03, 4.4: 45°).")]
        [Range(0f, 180f)] [SerializeField] private float maxTurnDegrees = 45f;

        [Header("Treffer-Gefühl (0 = Wert aus der Tabelle GDD 03, 4.11)")]
        [Tooltip("Hitstop in Sekunden (eingefrorene Akteure bei einem Treffer). 0 = Tabellenwert.")]
        [Min(0f)] [SerializeField] private float hitStopSeconds = 0f;

        [Tooltip("Kamera-Wackeln: Stärke (≈ Meter). 0 = Tabellenwert.")]
        [Min(0f)] [SerializeField] private float shakeAmplitude = 0f;

        [Tooltip("Kamera-Wackeln: Dauer in Sekunden. 0 = Tabellenwert.")]
        [Min(0f)] [SerializeField] private float shakeDuration = 0f;

        /// <summary>Id of the attack.</summary>
        public string AttackId => attackId;

        /// <summary>Kind of the attack.</summary>
        public AttackKind Kind => kind;

        /// <summary>Creates the plain data for the combat logic (a new instance per call).</summary>
        public AttackSpec CreateSpec()
        {
            return new AttackSpec
            {
                Id = attackId,
                Kind = kind,
                WindupSeconds = windupSeconds,
                ActiveSeconds = Mathf.Max(0.01f, activeSeconds),
                RecoverySeconds = recoverySeconds,
                ComboWindowStartSeconds = comboWindowStartSeconds,
                CancelOnlyInRecovery = cancelOnlyInRecovery,
                DamageMultiplier = damageMultiplier,
                PoiseMultiplier = poiseMultiplier,
                StaminaCost = staminaCost,
                StaminaDamage = staminaDamage,
                OverrideDamageType = overrideDamageType,
                DamageType = damageType,
                Unblockable = unblockable,
                Unparryable = unparryable,
                Shape = shape,
                OffsetX = offset.x,
                OffsetY = offset.y,
                OffsetZ = offset.z,
                SizeX = size.x,
                SizeY = size.y,
                SizeZ = size.z,
                Radius = radius,
                LungeDistance = lungeDistance,
                KnockbackDistance = knockbackDistance,
                MaxTurnDegrees = maxTurnDegrees,
                HitStopSeconds = hitStopSeconds,
                ShakeAmplitude = shakeAmplitude,
                ShakeDuration = shakeDuration
            };
        }
    }
}
