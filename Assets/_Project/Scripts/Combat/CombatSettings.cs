using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Tuning asset of the combat rules (GDD 03 3.2, 4.3–4.11; data-driven per P1, live changeable in Play Mode after a
    /// restart of the scene). Lives in <c>Assets/_Project/Settings/Combat/CombatSettings.asset</c> and is referenced by the
    /// player combat controller. Default values are the GDD values.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Kampf-Einstellungen", fileName = "CombatSettings", order = 1)]
    public sealed class CombatSettings : ScriptableObject
    {
        [Header("Eingabepuffer und Kombo (GDD 03, 4.4)")]
        [Tooltip("So lange bleibt ein gedrückter Angriff gültig, in Sekunden (GDD 03: 0,2).")]
        [Range(0f, 0.5f)] [SerializeField] private float inputBufferSeconds = 0.2f;

        [Tooltip("So lange bleiben Ausweichen und Parieren gültig (GDD 03: 0,15), damit keine Rolle ungewollt nachläuft.")]
        [Range(0f, 0.5f)] [SerializeField] private float defensiveBufferSeconds = 0.15f;

        [Tooltip("Die Kombo läuft weiter, wenn der nächste leichte Angriff so kurz nach dem Schlag kommt (GDD 03: 0,6 s).")]
        [Range(0f, 2f)] [SerializeField] private float comboResetSeconds = 0.6f;

        [Header("Blocken und Parieren (GDD 03, 4.7/4.8)")]
        [Tooltip("Parierfenster nach dem Drücken von Blocken in Sekunden (Normal 0,15; Geschichte 0,25; Schwer 0,12; Albtraum 0,10).")]
        [Range(0f, 0.5f)] [SerializeField] private float parryWindowSeconds = 0.15f;

        [Tooltip("Erneutes Drücken früher als so lange nach dem Loslassen öffnet kein neues Parierfenster (GDD 03: 0,4 s).")]
        [Range(0f, 1f)] [SerializeField] private float parryRelockSeconds = 0.4f;

        [Tooltip("Zeit für den Konter nach einer perfekten Parade (GDD 03: 1,0 s). Wie viel Haltung ein parierter Gegner " +
                 "verliert und wie lange er offen ist, steht im Gegnertyp-Asset (Data/Enemies/…: Parry Poise Loss, Parry Open Seconds).")]
        [Range(0f, 3f)] [SerializeField] private float counterWindowSeconds = 1.0f;

        [Tooltip("Bewegung beim Blocken in m/s (GDD 03, 3.1: 2,5).")]
        [Range(0.5f, 5f)] [SerializeField] private float blockMoveSpeed = 2.5f;

        [Header("Schwerer Angriff aufladen (GDD 03, 4.5)")]
        [Tooltip("Haltezeit für Stufe I in Sekunden (0,6).")]
        [Range(0.1f, 3f)] [SerializeField] private float chargeLevel1Seconds = 0.6f;

        [Tooltip("Haltezeit für Stufe II in Sekunden (1,2).")]
        [Range(0.1f, 3f)] [SerializeField] private float chargeLevel2Seconds = 1.2f;

        [Tooltip("Höchste Haltezeit, danach löst Stufe II automatisch aus (2,0).")]
        [Range(0.1f, 5f)] [SerializeField] private float chargeMaxSeconds = 2.0f;

        [Header("Ausweichrolle (GDD 03, 3.2 – Profil „leicht“)")]
        [Tooltip("Strecke der Rolle in Metern (4,2).")]
        [Range(0.5f, 8f)] [SerializeField] private float rollDistance = 4.2f;

        [Tooltip("Dauer der Rolle in Sekunden (0,55).")]
        [Range(0.1f, 2f)] [SerializeField] private float rollDuration = 0.55f;

        [Tooltip("Beginn der Unverwundbarkeit (I-Frames) in Sekunden ab Tastendruck (0,05).")]
        [Range(0f, 1f)] [SerializeField] private float rollIFrameStart = 0.05f;

        [Tooltip("Ende der Unverwundbarkeit in Sekunden ab Tastendruck (0,35).")]
        [Range(0f, 2f)] [SerializeField] private float rollIFrameEnd = 0.35f;

        [Tooltip("Ab hier kann ein Angriff, Block oder eine neue Rolle die Rolle beenden (0,40).")]
        [Range(0f, 2f)] [SerializeField] private float rollCancelFrom = 0.40f;

        [Tooltip("Ausdauerkosten der Rolle (12).")]
        [Range(0f, 50f)] [SerializeField] private float rollStamina = 12f;

        [Header("Treffer am Spieler (GDD 03, 4.3/4.9)")]
        [Tooltip("Taumeln, wenn die Standfestigkeit erreicht ist, in Sekunden (0,5).")]
        [Range(0f, 3f)] [SerializeField] private float staggerSeconds = 0.5f;

        [Tooltip("Umgeworfen bei einem Treffer mit doppelter Standfestigkeit, in Sekunden (1,2).")]
        [Range(0f, 3f)] [SerializeField] private float knockdownSeconds = 1.2f;

        [Tooltip("Deckungsbruch, wenn ein geblockter Treffer die Ausdauer auf 0 bringt, in Sekunden (1,0).")]
        [Range(0f, 3f)] [SerializeField] private float guardBreakSeconds = 1.0f;

        [Header("Finisher (GDD 03, 4.10)")]
        [Tooltip("Reichweite des Finishers in Metern (2,5).")]
        [Range(0.5f, 6f)] [SerializeField] private float finisherRange = 2.5f;

        [Tooltip("Halber Winkel vor dem Spieler in Grad (60).")]
        [Range(10f, 180f)] [SerializeField] private float finisherHalfAngle = 60f;

        [Tooltip("Schaden als Anteil der max. LP des Ziels (Normal 0,35).")]
        [Range(0f, 1f)] [SerializeField] private float finisherHealthShare = 0.35f;

        [Header("Treffer-Gefühl (GDD 03, 4.11)")]
        [Tooltip("Faktor auf alle Hitstop-Zeiten (1 = Werte aus GDD 03, 0 = kein Hitstop).")]
        [Range(0f, 3f)] [SerializeField] private float hitStopScale = 1f;

        /// <summary>Factor on all hitstop times.</summary>
        public float HitStopScale => hitStopScale;

        /// <summary>Creates the plain rules for the combat state machine.</summary>
        public CombatTuning CreateTuning()
        {
            return new CombatTuning
            {
                InputBufferSeconds = inputBufferSeconds,
                DefensiveBufferSeconds = defensiveBufferSeconds,
                ComboResetSeconds = comboResetSeconds,
                ParryWindowSeconds = parryWindowSeconds,
                ParryRelockSeconds = parryRelockSeconds,
                CounterWindowSeconds = counterWindowSeconds,
                BlockMoveSpeed = blockMoveSpeed,
                ChargeLevel1Seconds = chargeLevel1Seconds,
                ChargeLevel2Seconds = Mathf.Max(chargeLevel1Seconds, chargeLevel2Seconds),
                ChargeMaxSeconds = Mathf.Max(chargeLevel1Seconds, chargeLevel2Seconds, chargeMaxSeconds),
                Roll = new DodgeProfile(rollDistance, rollDuration, rollIFrameStart, Mathf.Max(rollIFrameStart, rollIFrameEnd),
                    rollCancelFrom, rollStamina),
                StaggerSeconds = staggerSeconds,
                KnockdownSeconds = knockdownSeconds,
                GuardBreakSeconds = guardBreakSeconds,
                FinisherRange = finisherRange,
                FinisherHalfAngle = finisherHalfAngle,
                FinisherHealthShare = finisherHealthShare
            };
        }

        /// <summary>Creates the hit feel table (GDD 03 4.11) with <see cref="HitStopScale"/> applied.</summary>
        public HitFeedbackTable CreateFeedbackTable()
        {
            var table = new HitFeedbackTable();
            if (!Mathf.Approximately(hitStopScale, 1f))
            {
                for (int i = 1; i <= (int)HitFeedbackKind.PlayerHitHeavy; i++)
                {
                    var kind = (HitFeedbackKind)i;
                    table.Set(kind, table.HitStopOf(kind) * hitStopScale, table.ShakeAmplitudeOf(kind), table.ShakeDurationOf(kind));
                }
            }

            return table;
        }
    }
}
