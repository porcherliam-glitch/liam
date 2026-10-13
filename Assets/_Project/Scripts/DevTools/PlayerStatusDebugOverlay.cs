using System;
using System.Globalization;
using System.IO;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer overlay (IMGUI, mouse only) for the stats and save step: shows health, stamina, mana and playtime of the
    /// player, the values that equipment changes (armor, attack, poise, armor class, move speed, load, luck, gold), whether
    /// saving is allowed, the last save and load result, and offers the buttons "Schnellspeichern",
    /// "Schnellladen", "10 Schaden", "Heilen" and "Speicherordner oeffnen".
    /// </summary>
    /// <remarks>
    /// <para>GameObject: "PlayerStatusOverlay" in the test ground (the test ground menu adds it and sets the references to
    /// the player). Active only in the editor and in development builds; in release builds it disables itself.</para>
    /// <para>The mouse is locked while playing: press Esc (pause) to click the buttons. Texts are rebuilt at most ten
    /// times per second. Services are resolved once in <c>Start</c>.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerStatusDebugOverlay : MonoBehaviour
    {
        private const float ReferenceHeight = 1080f;
        private const float PanelWidth = 360f;
        private const float DebugDamage = 10f;
        private const float RefreshInterval = 0.1f;
        private const string DamageSourceId = "debug.overlay";

        [Tooltip("Lebenspunkte des Spielers (DamageableComponent am Objekt „Player“).")]
        [SerializeField] private DamageableComponent playerHealth = null;

        [Tooltip("Werte des Spielers mit Ausdauer und Mana (CharacterStatsComponent am Objekt „Player“).")]
        [SerializeField] private CharacterStatsComponent playerStats = null;

        [Tooltip("Ausrüstungs-Brücke der Figur (Angriffswert aus der angelegten Waffe). Optional.")]
        [SerializeField] private Aetherfall.Player.PlayerEquipment playerEquipment = null;

        [Tooltip("Overlay beim Start aufgeklappt anzeigen.")]
        [SerializeField] private bool startExpanded = true;

        [Tooltip("Zusätzliche Skalierung. Ab 1080 Pixeln Bildschirmhöhe wird automatisch mitskaliert.")]
        [Range(0.5f, 3f)]
        [SerializeField] private float uiScale = 1f;

        [Tooltip("Abstand zur rechten oberen Ecke in Referenz-Pixeln (bezogen auf 1080 Pixel Bildschirmhöhe).")]
        [SerializeField] private Vector2 marginTopRight = new Vector2(10f, 10f);

        private ISaveManager _saves;
        private IPlaytimeClock _playtime;
        private IInventoryService _inventory;
        private bool _expanded;
        private float _nextRefresh;
        private string _healthText = string.Empty;
        private string _staminaText = string.Empty;
        private string _manaText = string.Empty;
        private string _gearText = string.Empty;
        private string _playtimeText = string.Empty;
        private string _allowedText = string.Empty;
        private string _lastSaveText = string.Empty;
        private string _lastLoadText = string.Empty;
        private string _folderText = string.Empty;
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
                IServiceLocator locator = Services.Locator;
                if (locator != null)
                {
                    locator.TryGet(out _saves);
                    locator.TryGet(out _playtime);
                    locator.TryGet(out _inventory);
                }

                if (_saves == null)
                {
                    _actionText = "Kein Speichersystem: SaveInstaller fehlt in der BootConfig (Testgelände neu erstellen).";
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "PlayerStatusDebugOverlay could not resolve its services.");
            }
        }

        private void Update()
        {
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
            if (playerHealth != null)
            {
                Health health = playerHealth.Health;
                ResourcePool pool = health.Pool;
                _healthText = "LP: " + Round(health.Current) + " / " + Round(health.Max) +
                              (health.IsDead ? "   TOT" : string.Empty) +
                              (health.IsInvulnerable ? "   unverwundbar" : string.Empty) +
                              (!health.IsDead && !pool.IsFull ? "   (Regeneration nach 8 s ohne Schaden, jetzt " + Seconds(pool.TimeSinceSpend) + ")" : string.Empty);
            }
            else
            {
                _healthText = "LP: (keine DamageableComponent zugewiesen)";
            }

            if (playerStats != null)
            {
                ResourcePool stamina = playerStats.Stamina;
                _staminaText = "Ausdauer: " + Round(stamina.Current) + " / " + Round(stamina.Max) +
                               (stamina.IsExhausted ? "   erschöpft (" + stamina.ExhaustedRemaining.ToString("0.0", CultureInfo.InvariantCulture) + " s)" : string.Empty) +
                               (stamina.HasAtLeast(10f) && !stamina.IsExhausted ? "   Sprint möglich" : "   kein Sprint-Start (unter 10)");
                ResourcePool mana = playerStats.Mana;
                _manaText = "Mana: " + Round(mana.Current) + " / " + Round(mana.Max);
            }
            else
            {
                _staminaText = "Ausdauer: (keine CharacterStatsComponent zugewiesen)";
                _manaText = string.Empty;
            }

            _gearText = DescribeGear();
            _playtimeText = _playtime != null
                ? "Spielzeit: " + PlaytimeClock.Format(_playtime.PlaytimeSeconds) + (_playtime.IsRunning ? string.Empty : "  (angehalten)")
                : "Spielzeit: (GameTimeInstaller fehlt)";

            if (_saves == null)
            {
                _allowedText = "Speichern: kein Speichersystem";
                _lastSaveText = string.Empty;
                _lastLoadText = string.Empty;
                _folderText = string.Empty;
                return;
            }

            _allowedText = _saves.IsSaveAllowed(out string reason)
                ? "Speichern: erlaubt"
                : "Speichern: gesperrt – " + SaveReasonKeys.ToGermanText(reason);
            _lastSaveText = DescribeSave(_saves.LastSaveResult);
            _lastLoadText = DescribeLoad(_saves.LastLoadResult);
            _folderText = "Ordner: " + _saves.SaveDirectory;
        }

        private void OnGUI()
        {
            float scale = uiScale * Mathf.Max(1f, Screen.height / ReferenceHeight);
            Matrix4x4 previousMatrix = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            try
            {
                float x = Screen.width / scale - PanelWidth - marginTopRight.x;
                if (!_expanded)
                {
                    if (GUI.Button(new Rect(Screen.width / scale - 170f - marginTopRight.x, marginTopRight.y, 170f, 26f), "Spieler-Overlay"))
                    {
                        _expanded = true;
                    }

                    return;
                }

                float availableHeight = Mathf.Max(100f, Screen.height / scale - marginTopRight.y - 10f);
                GUILayout.BeginArea(new Rect(x, marginTopRight.y, PanelWidth, availableHeight));
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
            GUILayout.Label("Spieler & Speichern (Debug)");
            if (GUILayout.Button("Zuklappen", GUILayout.Width(90f)))
            {
                _expanded = false;
            }

            GUILayout.EndHorizontal();
            GUILayout.Label(_healthText);
            GUILayout.Label(_staminaText);
            if (_manaText.Length > 0)
            {
                GUILayout.Label(_manaText);
            }

            if (_gearText.Length > 0)
            {
                GUILayout.Label(_gearText);
            }

            GUILayout.Label(_playtimeText);
            GUILayout.Space(4f);
            GUILayout.Label(_allowedText);
            if (_lastSaveText.Length > 0)
            {
                GUILayout.Label(_lastSaveText);
            }

            if (_lastLoadText.Length > 0)
            {
                GUILayout.Label(_lastLoadText);
            }

            GUILayout.Space(4f);
            GUILayout.BeginHorizontal();
            GUI.enabled = _saves != null && !_saves.IsBusy;
            if (GUILayout.Button("Schnellspeichern (F5)"))
            {
                RunQuickSave();
            }

            if (GUILayout.Button("Schnellladen (F9)"))
            {
                RunQuickLoad();
            }

            GUI.enabled = true;
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUI.enabled = playerHealth != null;
            if (GUILayout.Button("10 Schaden"))
            {
                DealDebugDamage();
            }

            if (GUILayout.Button("Heilen"))
            {
                HealFully();
            }

            GUI.enabled = true;
            GUILayout.EndHorizontal();

            GUI.enabled = _saves != null;
            if (GUILayout.Button("Speicherordner öffnen"))
            {
                OpenSaveFolder();
            }

            GUI.enabled = true;
            if (_folderText.Length > 0)
            {
                GUILayout.Label(_folderText);
            }

            if (_actionText.Length > 0)
            {
                GUILayout.Label(_actionText);
            }

            GUILayout.Label("Maus: im Spiel erst Esc drücken (Pause), dann klicken.");
        }

        private string DescribeGear()
        {
            if (playerStats == null)
            {
                return string.Empty;
            }

            StatCollection stats = playerStats.Stats;
            string text = "Rüstung " + Round(stats.Get(StatId.Armor)) + "   Standfestigkeit " + Round(stats.Get(StatId.Poise)) +
                          "   Tempo " + Round(stats.Get(StatId.MoveSpeed) * 100f) + " %";
            if (playerEquipment != null)
            {
                text += "\nAngriff " + Round(playerEquipment.AttackDisplay) + " (Waffenschaden " + Round(playerEquipment.WeaponDamage) + ")   " +
                        ArmorRules.GermanName(playerEquipment.ArmorClass);
            }

            if (_inventory != null)
            {
                EncumbranceState load = _inventory.PlayerEncumbrance;
                text += "\nTraglast " + ItemTexts.Kilograms(load.Load) + " / " + ItemTexts.Kilograms(load.Capacity) + " – " +
                        EncumbranceRules.GermanName(load.Level) + "\nGold " + _inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold) +
                        "   Glück " + stats.Get(StatId.Luck).ToString("0.#", CultureInfo.InvariantCulture) + "   Inventar: Tab";
            }

            return text;
        }

        private void DealDebugDamage()
        {
            DamageOutcome outcome = playerHealth.ApplyDamage(new DamageInfo(DebugDamage, DamageSourceId));
            _actionText = outcome.WasApplied
                ? "10 Schaden: " + Round(outcome.Applied) + " LP abgezogen" + (outcome.Killed ? " – Spieler ist tot (Heilen belebt wieder)." : ".")
                : "10 Schaden ignoriert: " + outcome.IgnoredReason;
            RefreshTexts();
        }

        private void HealFully()
        {
            Health health = playerHealth.Health;
            if (health.IsDead)
            {
                health.Revive(1f);
                _actionText = "Wiederbelebt mit vollen LP.";
            }
            else
            {
                float healed = health.Heal(health.Max);
                _actionText = "Geheilt: +" + Round(healed) + " LP.";
            }

            RefreshTexts();
        }

        private void OpenSaveFolder()
        {
            try
            {
                string folder = _saves.SaveDirectory;
                Directory.CreateDirectory(folder);
                Application.OpenURL(new Uri(folder).AbsoluteUri);
                _actionText = "Ordner geöffnet: " + folder;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException || exception is UriFormatException)
            {
                _actionText = "Ordner konnte nicht geöffnet werden: " + exception.Message;
            }
        }

        private async void RunQuickSave()
        {
            // async void: fire-and-forget adapter of a button click; all exceptions are handled here.
            try
            {
                _actionText = "Speichere …";
                SaveResult result = await _saves.QuickSaveAsync(destroyCancellationToken);
                _actionText = result.Success ? "Schnellspeichern fertig." : "Schnellspeichern fehlgeschlagen.";
                RefreshTexts();
            }
            catch (OperationCanceledException)
            {
                // Play Mode ended.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "Quick save from the overlay failed.");
            }
        }

        private async void RunQuickLoad()
        {
            // async void: fire-and-forget adapter of a button click; all exceptions are handled here.
            try
            {
                _actionText = "Lade …";
                LoadResult result = await _saves.QuickLoadAsync(destroyCancellationToken);
                _actionText = result.Success ? "Schnellladen fertig." : "Schnellladen fehlgeschlagen.";
                RefreshTexts();
            }
            catch (OperationCanceledException)
            {
                // Play Mode ended.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "Quick load from the overlay failed.");
            }
        }

        private static string DescribeSave(SaveResult result)
        {
            if (!result.HasValue)
            {
                return "Letztes Speichern: –";
            }

            string time = result.FinishedUtc.ToLocalTime().ToString("HH:mm:ss", CultureInfo.InvariantCulture);
            return result.Success
                ? "Letztes Speichern: OK – " + result.SlotId + " um " + time
                : "Letztes Speichern: FEHLER um " + time + " – " + SaveReasonKeys.ToGermanText(result.ReasonKey) +
                  (result.Message.Length > 0 ? " (" + result.Message + ")" : string.Empty);
        }

        private static string DescribeLoad(LoadResult result)
        {
            if (!result.HasValue)
            {
                return "Letztes Laden: –";
            }

            string time = result.FinishedUtc.ToLocalTime().ToString("HH:mm:ss", CultureInfo.InvariantCulture);
            return result.Success
                ? "Letztes Laden: OK – " + result.SlotId + " (v" + result.SaveVersion + (result.LoadedFromBackup ? ", aus Sicherung" : string.Empty) + ") um " + time
                : "Letztes Laden: FEHLER um " + time + " – " + SaveReasonKeys.ToGermanText(result.ReasonKey) +
                  (result.Message.Length > 0 ? " (" + result.Message + ")" : string.Empty);
        }

        private static string Round(float value)
        {
            // GDD 03 10.3: values are kept unrounded and displayed rounded down.
            return Math.Floor(value).ToString("0", CultureInfo.InvariantCulture);
        }

        private static string Seconds(float value)
        {
            return float.IsInfinity(value) ? "–" : value.ToString("0.0", CultureInfo.InvariantCulture) + " s";
        }
    }
}
