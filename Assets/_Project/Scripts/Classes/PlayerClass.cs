using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Classes
{
    /// <summary>
    /// Gives the player figure the class of the game (GDD 03 11.2): the six start attributes as base values (distributed points
    /// stay as modifiers of the progression on top), full health and mana at the start of a new game, and the clothes of the
    /// class (the mage wears a dark blue robe instead of the warrior's gambeson).
    /// </summary>
    /// <remarks>GameObject: the player root in the scenes of the slice (not the test ground, which keeps its test values).</remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerClass : MonoBehaviour
    {
        [Tooltip("Werte der Figur. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Lebenspunkte. Leer = DamageableComponent am selben GameObject.")]
        [SerializeField] private DamageableComponent health = null;

        [Tooltip("Renderer der Figur, deren Kleidung die Klasse färbt.")]
        [SerializeField] private Renderer[] figure = new Renderer[0];

        [Tooltip("Kleidung je Klasse: Material-Plätze des Modells (z. B. Krieger_Wams) und ihr Ersatz.")]
        [SerializeField] private ClassLook[] looks = new ClassLook[0];

        private IClassService _classes;
        private Material[][] _original;
        private bool _subscribed;

        /// <summary>Id of the class shown, or empty.</summary>
        public string AppliedClassId { get; private set; } = string.Empty;

        private void Awake()
        {
            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (health == null)
            {
                TryGetComponent(out health);
            }

            _original = new Material[figure.Length][];
            for (int i = 0; i < figure.Length; i++)
            {
                _original[i] = figure[i] != null ? figure[i].sharedMaterials : new Material[0];
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (!Services.Locator.TryGet(out _classes))
                {
                    return;
                }

                Subscribe();
                Apply(_classes.Current, false);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerClass could not resolve the class service.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed && _classes != null)
            {
                _classes.Changed -= Apply;
                _subscribed = false;
            }
        }

        private void Subscribe()
        {
            if (!_subscribed && _classes != null && isActiveAndEnabled)
            {
                _classes.Changed += Apply;
                _subscribed = true;
            }
        }

        private void Apply(ClassSpec spec, bool newGame)
        {
            if (spec == null || stats == null)
            {
                return;
            }

            StatCollection collection = stats.Stats;
            for (int i = 0; i < ClassSpec.AttributeOrder.Length; i++)
            {
                collection.SetBase(ClassSpec.AttributeOrder[i], spec.Attributes[i]);
            }

            collection.FlushChanges();
            if (newGame)
            {
                // A new game starts rested: the class changed the maximum values.
                if (health != null && health.Health != null)
                {
                    health.Heal(health.Health.Max);
                }

                stats.Mana.Restore(stats.Mana.Max);
                stats.Stamina.Restore(stats.Stamina.Max);
            }

            ApplyLook(spec.Id);
            AppliedClassId = spec.Id;
        }

        private void ApplyLook(string classId)
        {
            ClassLook look = null;
            for (int i = 0; i < looks.Length; i++)
            {
                if (looks[i] != null && looks[i].ClassId == classId)
                {
                    look = looks[i];
                }
            }

            for (int r = 0; r < figure.Length; r++)
            {
                Renderer renderer = figure[r];
                if (renderer == null)
                {
                    continue;
                }

                Material[] materials = (Material[])_original[r].Clone();
                for (int m = 0; m < materials.Length && look != null; m++)
                {
                    Material replacement = look.Replacement(materials[m] != null ? materials[m].name : string.Empty);
                    if (replacement != null)
                    {
                        materials[m] = replacement;
                    }
                }

                renderer.sharedMaterials = materials;
            }
        }
    }
}
