using System;
using System.Globalization;
using Aetherfall.Combat;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Simple damage numbers for the combat test (§9.7 "Schadenszahlen optional anzeigen (abschaltbar)"): a small pool of
    /// <see cref="TextMesh"/> objects that rise above the hit point and fade (white normal, yellow critical, blue blocked,
    /// gold "Pariert!", grey "Ausgewichen"). Switchable with <see cref="ShowNumbers"/>. Placeholder until the HUD shows
    /// numbers with the rules of GDD 05 1.11.
    /// </summary>
    /// <remarks>GameObject: "DamageNumbers" in the test ground with a reference to the main camera (texts face it). Active only
    /// in the editor and in development builds. Pool size is fixed (no allocation per hit except the number text).</remarks>
    [DisallowMultipleComponent]
    public sealed class FloatingDamageNumbers : MonoBehaviour
    {
        private const int PoolSize = 16;
        private const float Lifetime = 0.9f;
        private const float RiseSpeed = 1.2f;

        [Tooltip("Schadenszahlen anzeigen (abschaltbar, §9.7).")]
        [SerializeField] private bool showNumbers = true;

        [Tooltip("Main Camera: die Zahlen drehen sich zu ihr.")]
        [SerializeField] private Transform cameraTransform = null;

        [Tooltip("Schrift der Zahlen (eingebaute Schrift; leer = keine Zahlen).")]
        [SerializeField] private Font font = null;

        private readonly TextMesh[] _texts = new TextMesh[PoolSize];
        private readonly float[] _ages = new float[PoolSize];
        private readonly Color[] _colors = new Color[PoolSize];
        private ICombatService _service;
        private bool _subscribed;
        private int _next;

        /// <summary>Show damage numbers (option).</summary>
        public bool ShowNumbers
        {
            get => showNumbers;
            set => showNumbers = value;
        }

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
            if (!IsAvailableInThisBuild || font == null)
            {
                enabled = false;
                return;
            }

            for (int i = 0; i < PoolSize; i++)
            {
                var item = new GameObject("DamageNumber " + i);
                item.transform.SetParent(transform, false);
                TextMesh text = item.AddComponent<TextMesh>();
                text.font = font;
                text.fontSize = 48;
                text.characterSize = 0.05f;
                text.anchor = TextAnchor.MiddleCenter;
                text.alignment = TextAlignment.Center;
                if (item.TryGetComponent(out MeshRenderer meshRenderer))
                {
                    meshRenderer.sharedMaterial = font.material;
                    meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }

                item.SetActive(false);
                _texts[i] = text;
                _ages[i] = Lifetime;
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
                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "FloatingDamageNumbers could not resolve ICombatService.");
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
            float deltaTime = Time.deltaTime;
            Quaternion facing = cameraTransform != null ? Quaternion.LookRotation(cameraTransform.forward, Vector3.up) : Quaternion.identity;
            for (int i = 0; i < PoolSize; i++)
            {
                TextMesh text = _texts[i];
                if (text == null || _ages[i] >= Lifetime)
                {
                    continue;
                }

                _ages[i] += deltaTime;
                Transform item = text.transform;
                if (_ages[i] >= Lifetime)
                {
                    item.gameObject.SetActive(false);
                    continue;
                }

                item.position += Vector3.up * (RiseSpeed * deltaTime);
                item.rotation = facing;
                Color color = _colors[i];
                color.a = 1f - _ages[i] / Lifetime;
                text.color = color;
            }
        }

        private void OnHitLanded(HitReport report)
        {
            if (!showNumbers || report.Defense == DefenseOutcome.Ignored)
            {
                return;
            }

            string label;
            Color color;
            switch (report.Defense)
            {
                case DefenseOutcome.Evaded:
                    label = "Ausgewichen";
                    color = new Color(0.75f, 0.75f, 0.75f);
                    break;
                case DefenseOutcome.Parried:
                    label = "Pariert!";
                    color = new Color(1f, 0.91f, 0.64f);
                    break;
                default:
                    label = report.Damage.ToString(CultureInfo.InvariantCulture) + (report.IsCritical ? "!" : string.Empty);
                    color = report.Defense == DefenseOutcome.Blocked ? new Color(0.55f, 0.75f, 1f)
                        : report.IsCritical ? new Color(1f, 0.9f, 0.2f)
                        : report.Target != null && report.Target.Team == CombatTeam.Player ? new Color(1f, 0.35f, 0.3f) : Color.white;
                    break;
            }

            int index = _next;
            _next = (_next + 1) % PoolSize;
            TextMesh text = _texts[index];
            text.text = label;
            text.color = color;
            text.transform.position = report.Point + Vector3.up * 0.4f;
            text.gameObject.SetActive(true);
            _ages[index] = 0f;
            _colors[index] = color;
        }
    }
}
