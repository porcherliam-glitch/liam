using System;
using System.Globalization;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer overlay (IMGUI, bottom left) for the combat test (architecture 14.3 "Zustand", "KI"): health, stamina and
    /// stability of the player, its combat state, the locked target (health, poise, AI state), whether the player counts as
    /// "in combat", the last 5 hits (damage, critical, zone, defense) and buttons "Gegner neu spawnen", "Spieler heilen" and
    /// "Schadenszahlen an/aus".
    /// </summary>
    /// <remarks>
    /// <para>Hidden until F3 is pressed (<see cref="DevOverlaySwitch"/>, architecture 14.3): the player-facing interface is the UI
    /// Toolkit UI (Aetherfall.UI.Screens); this overlay is a developer tool.</para>
    /// <para>GameObject: "CombatOverlay" in the test ground (the test ground menu sets the references). Active only in the
    /// editor and in development builds. The player brain is read through <see cref="ICombatDebugSource"/>, so DevTools does
    /// not need the Player assembly. Texts are rebuilt at most ten times per second; the hit list follows
    /// <see cref="ICombatService.HitLanded"/> (subscribed in OnEnable/OnDisable).</para>
    /// <para>The mouse is locked while playing: press Esc (pause) to click the buttons.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CombatDebugOverlay : MonoBehaviour
    {
        private const int HitHistory = 5;
        private const float ReferenceHeight = 1080f;
        private const float PanelWidth = 430f;
        private const float RefreshInterval = 0.1f;

        [Tooltip("Kampf-Wurzel des Spielers (Combatant am Objekt „Player“).")]
        [SerializeField] private Combatant player = null;

        [Tooltip("Gegnergruppe der Arena (für den Knopf „Gegner neu spawnen“).")]
        [SerializeField] private EnemySpawner spawner = null;

        [Tooltip("Schadenszahlen (optional, für den Knopf an/aus).")]
        [SerializeField] private FloatingDamageNumbers damageNumbers = null;

        [Tooltip("Overlay beim Start aufgeklappt anzeigen.")]
        [SerializeField] private bool startExpanded = true;

        [Tooltip("Zusätzliche Skalierung. Ab 1080 Pixeln Bildschirmhöhe wird automatisch mitskaliert.")]
        [Range(0.5f, 3f)] [SerializeField] private float uiScale = 1f;

        [Tooltip("Abstand zur linken unteren Ecke in Referenz-Pixeln.")]
        [SerializeField] private Vector2 marginBottomLeft = new Vector2(10f, 10f);

        private readonly string[] _hits = new string[HitHistory];
        private ICombatService _service;
        private ICombatDebugSource _playerBrain;
        private bool _subscribed;
        private bool _expanded;
        private int _hitCount;
        private int _hitNext;
        private float _nextRefresh;
        private string _playerText = string.Empty;
        private string _stateText = string.Empty;
        private string _targetText = string.Empty;
        private string _combatText = string.Empty;
        private string _actionText = string.Empty;

        private static bool IsAvailableInThisBuild
        {
            get
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD || AETHERFALL_DEV
                return true;
#else
                return false;
#endif
            }
        }

        private void Awake()
        {
            if (!IsAvailableInThisBuild)
            {
                enabled = false;
                return;
            }

            _expanded = startExpanded;
            if (player != null)
            {
                player.TryGetComponent(out _playerBrain);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters; all exceptions are handled here.
            if (!enabled)
            {
                return;
            }

            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _service);
                if (_service == null)
                {
                    _actionText = "Kein Kampf-Dienst: CombatInstaller fehlt in der BootConfig (Testgelände neu erstellen).";
                }

                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "CombatDebugOverlay could not resolve ICombatService.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed)
            {
                _service.HitLanded -= OnHitLanded;
                _subscribed = false;
            }
        }

        private void Subscribe()
        {
            if (_service == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _service.HitLanded += OnHitLanded;
            _subscribed = true;
        }

        private void Update()
        {
            DevOverlaySwitch.PollToggleKey();
            float now = Time.unscaledTime;
            if (now < _nextRefresh)
            {
                return;
            }

            _nextRefresh = now + RefreshInterval;
            RefreshTexts();
        }

        private void RefreshTexts()
        {
            if (player == null)
            {
                _playerText = "Spieler: (kein Combatant zugewiesen)";
                return;
            }

            Health health = player.Health;
            CharacterStatsComponent stats = player.Stats;
            string staminaText = stats != null
                ? "   Ausdauer " + Floor(stats.Stamina.Current) + "/" + Floor(stats.Stamina.Max) + (stats.Stamina.IsExhausted ? " erschöpft" : string.Empty)
                : string.Empty;
            string stability = stats != null ? "   Standfestigkeit " + Floor(stats.Stats.Get(StatId.Poise)) : string.Empty;
            _playerText = "Spieler: LP " + (health != null ? Floor(health.Current) + "/" + Floor(health.Max) : "–") + staminaText + stability +
                          (health != null && health.IsInvulnerable ? "   unverwundbar" : string.Empty);
            _stateText = "Zustand: " + (_playerBrain != null ? _playerBrain.DebugStateText : "–");
            _combatText = _service != null ? (_service.InCombat ? "Im Kampf (Speichern gesperrt)" : "Nicht im Kampf") : string.Empty;

            Combatant target = _playerBrain != null ? _playerBrain.FocusTarget : null;
            _targetText = target != null ? DescribeTarget(target) : "Ziel: keins (Lock-On: R3, mittlere Maustaste oder T)";
        }

        private static string DescribeTarget(Combatant target)
        {
            Health health = target.Health;
            PoiseMeter poise = target.Poise;
            string text = "Ziel: " + target.CombatantId + "\n  LP " + (health != null ? Floor(health.Current) + "/" + Floor(health.Max) : "–") +
                          (poise != null ? "   Haltung " + Floor(poise.Buildup) + "/" + Floor(poise.Max) + (poise.IsStunned ? " GEBROCHEN" : string.Empty) : string.Empty);
            if (target.TryGetComponent(out ICombatDebugSource brain))
            {
                text += "\n  " + brain.DebugStateText;
            }

            return text;
        }

        private void OnHitLanded(HitReport report)
        {
            if (report.Defense == DefenseOutcome.Ignored)
            {
                return;
            }

            string attacker = report.Attacker != null ? report.Attacker.CombatantId : "?";
            string target = report.Target != null ? report.Target.CombatantId : "?";
            string line = attacker + " → " + target + ": ";
            switch (report.Defense)
            {
                case DefenseOutcome.Evaded:
                    line += "ausgewichen (I-Frames)";
                    break;
                case DefenseOutcome.Parried:
                    line += "PARIERT";
                    break;
                default:
                    line += report.Damage.ToString(CultureInfo.InvariantCulture) + (report.IsCritical ? " KRIT" : string.Empty) + ", " + ZoneText(report.Zone) +
                            (report.Defense == DefenseOutcome.Blocked ? ", geblockt" : string.Empty) +
                            (report.Poise == PoiseOutcome.Broken ? ", HALTUNG GEBROCHEN" : string.Empty) +
                            (report.Stagger != StaggerKind.None ? ", " + CombatStateText.Stagger(report.Stagger) : string.Empty) +
                            (report.Killed ? ", tot" : string.Empty);
                    break;
            }

            _hits[_hitNext] = line;
            _hitNext = (_hitNext + 1) % HitHistory;
            _hitCount = Math.Min(HitHistory, _hitCount + 1);
        }

        private void OnGUI()
        {
            if (!DevOverlaySwitch.IsVisible)
            {
                return;
            }

            float scale = uiScale * Mathf.Max(1f, Screen.height / ReferenceHeight);
            Matrix4x4 previousMatrix = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            try
            {
                float height = Screen.height / scale;
                if (!_expanded)
                {
                    if (GUI.Button(new Rect(marginBottomLeft.x, height - marginBottomLeft.y - 26f, 170f, 26f), "Kampf-Overlay"))
                    {
                        _expanded = true;
                    }

                    return;
                }

                const float panelHeight = 330f;
                GUILayout.BeginArea(new Rect(marginBottomLeft.x, height - marginBottomLeft.y - panelHeight, PanelWidth, panelHeight));
                GUILayout.BeginVertical(GUI.skin.box);
                DrawPanel();
                GUILayout.EndVertical();
                GUILayout.EndArea();
            }
            finally
            {
                GUI.matrix = previousMatrix;
            }
        }

        private void DrawPanel()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Kampf (Debug)");
            if (GUILayout.Button("Zuklappen", GUILayout.Width(90f)))
            {
                _expanded = false;
            }

            GUILayout.EndHorizontal();
            GUILayout.Label(_playerText);
            GUILayout.Label(_stateText);
            if (_combatText.Length > 0)
            {
                GUILayout.Label(_combatText);
            }

            GUILayout.Label(_targetText);
            GUILayout.Label("Letzte Treffer:");
            for (int i = 0; i < _hitCount; i++)
            {
                int index = (_hitNext - 1 - i + HitHistory) % HitHistory;
                GUILayout.Label("  " + _hits[index]);
            }

            GUILayout.BeginHorizontal();
            GUI.enabled = spawner != null;
            if (GUILayout.Button("Gegner neu spawnen"))
            {
                spawner.RespawnAll();
                _actionText = "Gegner zurückgesetzt.";
            }

            GUI.enabled = player != null && player.Health != null;
            if (GUILayout.Button("Spieler heilen"))
            {
                HealPlayer();
            }

            GUI.enabled = damageNumbers != null;
            if (GUILayout.Button(damageNumbers != null && damageNumbers.ShowNumbers ? "Zahlen aus" : "Zahlen an"))
            {
                damageNumbers.ShowNumbers = !damageNumbers.ShowNumbers;
            }

            GUI.enabled = true;
            GUILayout.EndHorizontal();
            if (_actionText.Length > 0)
            {
                GUILayout.Label(_actionText);
            }
        }

        private void HealPlayer()
        {
            Health health = player.Health;
            if (health.IsDead)
            {
                _actionText = "Spieler ist tot – er erscheint nach 3 s am Startpunkt.";
                return;
            }

            health.Heal(health.Max);
            if (player.Stats != null)
            {
                player.Stats.Stamina.Refill();
            }

            _actionText = "Spieler geheilt (LP und Ausdauer voll).";
        }

        private static string ZoneText(HitZone zone)
        {
            switch (zone)
            {
                case HitZone.Head: return "Kopf";
                case HitZone.WeakPoint: return "Schwachpunkt";
                case HitZone.Limb: return "Glied";
                default: return "Körper";
            }
        }

        private static string Floor(float value)
        {
            return Math.Floor(value).ToString("0", CultureInfo.InvariantCulture);
        }
    }
}
