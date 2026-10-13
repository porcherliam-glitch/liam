using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Items;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Puts loot into the scene (<see cref="ILootSpawner"/>, architecture 11.6 "Loot im Spiel gepoolt (Pickup-Layer)"): a pool of
    /// <see cref="Pickup"/>s (small cubes in the rarity colour, gold in gold colour, trigger collider on the layer Pickup),
    /// scattered around the drop position, each with a beam from the <see cref="LootBeamPool"/>.
    /// </summary>
    /// <remarks>
    /// GameObject: "Loot" in the gameplay scene (the test ground menu creates it with the materials). Registers itself with
    /// <see cref="ILootService"/> in <c>Start</c> and unregisters in <c>OnDestroy</c>; without it, loot goes straight into
    /// the bag. Pickups are created on demand and reused (no Instantiate per drop after warm-up).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class LootWorldSpawner : MonoBehaviour, ILootSpawner
    {
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        [Tooltip("Strahlen-Pool (LootBeamPool, meist am selben Objekt).")]
        [SerializeField] private LootBeamPool beams = null;

        [Tooltip("Material der Beute-Würfel (URP Lit). Die Farbe kommt je Seltenheit per MaterialPropertyBlock.")]
        [SerializeField] private Material pickupMaterial = null;

        [Tooltip("Layer der Beute (Architektur 2.8: 16 „Pickup“). Der Spieler sucht Beute auf diesem Layer.")]
        [Range(0, 31)] [SerializeField] private int pickupLayer = 16;

        [Tooltip("Radius, in dem mehrere Beutestücke um den Fundort verteilt werden (Meter).")]
        [Range(0f, 3f)] [SerializeField] private float scatterRadius = 1.1f;

        [Tooltip("So viele Beute-Objekte werden beim Start vorbereitet (der Pool wächst bei Bedarf).")]
        [Range(0, 128)] [SerializeField] private int warmUpCount = 24;

        private readonly List<Pickup> _free = new List<Pickup>();
        private readonly List<Pickup> _active = new List<Pickup>();
        private ILootService _loot;
        private IItemCatalog _catalog;
        private MaterialPropertyBlock _block;
        private Pcg32Random _ids;

        /// <summary>Pickups lying in the world.</summary>
        public IReadOnlyList<Pickup> ActivePickups => _active;

        /// <inheritdoc />
        public void SpawnDrops(IReadOnlyList<LootDrop> drops, Vector3 origin, string sourceId)
        {
            if (drops == null || _loot == null)
            {
                return;
            }

            for (int i = 0; i < drops.Count; i++)
            {
                Spawn(drops[i], ScatterPosition(origin, i, drops.Count), sourceId);
            }
        }

        /// <inheritdoc />
        public void ClearAll()
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                Release(_active[i]);
            }
        }

        /// <summary>Returns a pickup to the pool (collected, expired, cleared).</summary>
        /// <param name="pickup">Pickup.</param>
        public void Release(Pickup pickup)
        {
            if (pickup == null || !_active.Remove(pickup))
            {
                return;
            }

            if (beams != null)
            {
                beams.Release(pickup.BeamIndex, pickup);
            }

            pickup.BeamIndex = -1;
            pickup.Deactivate();
            pickup.gameObject.SetActive(false);
            _free.Add(pickup);
        }

        private void Awake()
        {
            _block = new MaterialPropertyBlock();
            _ids = new Pcg32Random((ulong)DateTime.UtcNow.Ticks, 11UL);
            for (int i = 0; i < warmUpCount; i++)
            {
                _free.Add(CreatePickup());
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _loot = await Services.WaitForAsync<ILootService>(destroyCancellationToken);
                if (Services.Locator.TryGet(out IInventoryService inventory))
                {
                    _catalog = inventory.Catalog;
                }

                _loot.RegisterSpawner(this);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot (no InventoryInstaller: loot is not spawned).
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Data, exception, "LootWorldSpawner could not resolve ILootService.");
            }
        }

        private void OnDestroy()
        {
            if (_loot != null)
            {
                _loot.UnregisterSpawner(this);
            }
        }

        private void Spawn(in LootDrop drop, Vector3 position, string sourceId)
        {
            Pickup pickup = _free.Count > 0 ? TakeFree() : CreatePickup();
            Transform pickupTransform = pickup.transform;
            ItemRarity rarity = drop.IsCurrency ? ItemRarity.Common : drop.Item.Rarity;
            float size = drop.IsCurrency ? 0.2f : 0.3f;
            pickupTransform.SetPositionAndRotation(position + Vector3.up * (size * 0.5f + 0.02f), Quaternion.Euler(0f, _ids.Range(0f, 360f), 0f));
            pickupTransform.localScale = new Vector3(size, size, size);
            ApplyColor(pickup, drop.IsCurrency ? new Color(1f, 0.82f, 0.25f, 1f) : ToColor(RarityRules.Color(rarity)));
            bool expires = drop.IsCurrency || RarityRules.Rank(rarity) <= RarityRules.Rank(ItemRarity.Uncommon);
            pickup.Setup(this, _loot, drop, sourceId, "rt." + ItemInstanceIds.Create(_ids), Title(drop), expires);
            pickup.gameObject.SetActive(true);
            pickup.BeamIndex = beams != null && !drop.IsCurrency ? beams.Acquire(rarity, position, pickup) : -1;
            _active.Add(pickup);
        }

        private string Title(in LootDrop drop)
        {
            if (drop.IsCurrency)
            {
                return drop.Amount + " " + CurrencyIds.GermanName(drop.CurrencyId);
            }

            ItemSpec spec = null;
            if (_catalog != null)
            {
                _catalog.TryGetItem(drop.Item.ItemId, out spec);
            }

            string title = ItemTexts.Title(spec, drop.Item);
            return spec != null && spec.IsEquipment ? title + " (" + RarityRules.GermanName(drop.Item.Rarity) + ")" : title;
        }

        private Pickup TakeFree()
        {
            int last = _free.Count - 1;
            Pickup pickup = _free[last];
            _free.RemoveAt(last);
            return pickup;
        }

        private Pickup CreatePickup()
        {
            GameObject visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.name = "Pickup";
            visual.layer = pickupLayer;
            visual.transform.SetParent(transform, false);
            if (visual.TryGetComponent(out Collider solid))
            {
                Destroy(solid);
            }

            SphereCollider trigger = visual.AddComponent<SphereCollider>();
            trigger.isTrigger = true;
            trigger.radius = 1.2f;
            if (pickupMaterial != null && visual.TryGetComponent(out Renderer visualRenderer))
            {
                visualRenderer.sharedMaterial = pickupMaterial;
            }

            Pickup pickup = visual.AddComponent<Pickup>();
            visual.SetActive(false);
            return pickup;
        }

        private void ApplyColor(Pickup pickup, Color color)
        {
            if (!pickup.TryGetComponent(out Renderer pickupRenderer))
            {
                return;
            }

            _block.SetColor(BaseColorId, color);
            _block.SetColor(ColorId, color);
            pickupRenderer.SetPropertyBlock(_block);
        }

        private Vector3 ScatterPosition(Vector3 origin, int index, int count)
        {
            if (count <= 1 || scatterRadius <= 0f)
            {
                return origin;
            }

            // Golden angle spiral: even spread for any count, no two drops on top of each other.
            float angle = index * 2.39996323f;
            float radius = scatterRadius * Mathf.Sqrt((index + 0.5f) / count);
            return origin + new Vector3(Mathf.Cos(angle) * radius, 0f, Mathf.Sin(angle) * radius);
        }

        private static Color ToColor(RarityColor rgb)
        {
            return new Color(rgb.R / 255f, rgb.G / 255f, rgb.B / 255f, 1f);
        }
    }
}
