using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Pool of loot beams (§12.5 "Visuelle Loot-Strahlen in Seltenheitsfarbe", GDD 05 1.10, GDD 04 5.8): thin vertical
    /// cylinders in the rarity colour, height by rarity (rare 1.5 m, epic 3 m, legendary 6 m, mythic 8 m, set 4 m), at most
    /// 30 at the same time. When the budget is used up, a higher rarity takes the beam of the lowest active one; lower
    /// rarities then only keep their glitter (the coloured pickup itself).
    /// </summary>
    /// <remarks>
    /// <para>GameObject: "Loot" in the gameplay scene next to <see cref="LootWorldSpawner"/> (the test ground menu adds both
    /// and assigns the unlit beam material). Beams are created once in <c>Awake</c> and only moved and coloured later
    /// (MaterialPropertyBlock, no material copies).</para>
    /// <para>Option "Strahlen ab Seltenheit" (GDD 05 4.2, default rare) is the field <see cref="MinimumRarity"/>; the options
    /// menu will set it later. TODO (VFX step): sparks, ground wave and the double beam of sets.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class LootBeamPool : MonoBehaviour
    {
        /// <summary>Beam budget of GDD 04 5.8.</summary>
        public const int DefaultMaxBeams = 30;

        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        [Tooltip("Material der Strahlen (URP Unlit, hell). Die Farbe kommt je Seltenheit per MaterialPropertyBlock.")]
        [SerializeField] private Material beamMaterial = null;

        [Tooltip("Höchstens so viele Strahlen gleichzeitig (GDD 04, 5.8: 30).")]
        [Range(1, 60)] [SerializeField] private int maxBeams = DefaultMaxBeams;

        [Tooltip("Option „Strahlen ab Seltenheit“ (GDD 05, 4.2; Standard Selten). Gewöhnlich bekommt nie einen Strahl, Ungewöhnlich nur 0,5 m Glanz.")]
        [SerializeField] private ItemRarity minimumRarity = ItemRarity.Rare;

        [Tooltip("Dicke der Strahlen in Metern.")]
        [Range(0.02f, 0.5f)] [SerializeField] private float beamWidth = 0.08f;

        private Transform[] _beams;
        private Renderer[] _renderers;
        private ItemRarity[] _rarities;
        private object[] _owners;
        private MaterialPropertyBlock _block;
        private int _active;

        /// <summary>Option "Strahlen ab Seltenheit".</summary>
        public ItemRarity MinimumRarity
        {
            get => minimumRarity;
            set => minimumRarity = value;
        }

        /// <summary>Number of beams in use.</summary>
        public int ActiveCount => _active;

        /// <summary>
        /// Takes a beam for a pickup. Returns the beam index, or −1 if the rarity gets no beam (below the option, common, or
        /// budget used up by higher rarities).
        /// </summary>
        /// <param name="rarity">Rarity of the item.</param>
        /// <param name="position">Foot point of the beam.</param>
        /// <param name="owner">Owner (the pickup); a stolen beam no longer belongs to it.</param>
        public int Acquire(ItemRarity rarity, Vector3 position, object owner)
        {
            float height = RarityRules.BeamHeight(rarity);
            if (_beams == null || height <= 0f || RarityRules.Rank(rarity) < RarityRules.Rank(minimumRarity))
            {
                return -1;
            }

            int index = FreeIndex();
            if (index < 0)
            {
                index = LowestBelow(rarity);
                if (index < 0)
                {
                    return -1;
                }

                _owners[index] = null;
                _active--;
            }

            _owners[index] = owner;
            _rarities[index] = rarity;
            Transform beam = _beams[index];
            beam.position = position + Vector3.up * (height * 0.5f);
            beam.localScale = new Vector3(beamWidth, height * 0.5f, beamWidth);
            RarityColor rgb = RarityRules.Color(rarity);
            var color = new Color(rgb.R / 255f, rgb.G / 255f, rgb.B / 255f, 1f);
            _block.SetColor(BaseColorId, color);
            _block.SetColor(ColorId, color);
            _renderers[index].SetPropertyBlock(_block);
            beam.gameObject.SetActive(true);
            _active++;
            return index;
        }

        /// <summary>Gives a beam back (only if it still belongs to <paramref name="owner"/>).</summary>
        /// <param name="index">Beam index from <see cref="Acquire"/>.</param>
        /// <param name="owner">Owner.</param>
        public void Release(int index, object owner)
        {
            if (_beams == null || index < 0 || index >= _beams.Length || !ReferenceEquals(_owners[index], owner))
            {
                return;
            }

            _owners[index] = null;
            _beams[index].gameObject.SetActive(false);
            _active--;
        }

        private void Awake()
        {
            _block = new MaterialPropertyBlock();
            _beams = new Transform[maxBeams];
            _renderers = new Renderer[maxBeams];
            _rarities = new ItemRarity[maxBeams];
            _owners = new object[maxBeams];
            for (int i = 0; i < maxBeams; i++)
            {
                GameObject beam = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                beam.name = "LootBeam " + (i + 1);
                beam.transform.SetParent(transform, false);
                if (beam.TryGetComponent(out Collider beamCollider))
                {
                    Destroy(beamCollider);
                }

                Renderer beamRenderer = beam.GetComponent<Renderer>();
                if (beamMaterial != null)
                {
                    beamRenderer.sharedMaterial = beamMaterial;
                }

                beamRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                beamRenderer.receiveShadows = false;
                beam.SetActive(false);
                _beams[i] = beam.transform;
                _renderers[i] = beamRenderer;
            }
        }

        private int FreeIndex()
        {
            for (int i = 0; i < _owners.Length; i++)
            {
                if (_owners[i] == null)
                {
                    return i;
                }
            }

            return -1;
        }

        private int LowestBelow(ItemRarity rarity)
        {
            int lowest = -1;
            for (int i = 0; i < _owners.Length; i++)
            {
                if (_owners[i] != null && RarityRules.Rank(_rarities[i]) < RarityRules.Rank(rarity) &&
                    (lowest < 0 || RarityRules.Rank(_rarities[i]) < RarityRules.Rank(_rarities[lowest])))
                {
                    lowest = i;
                }
            }

            return lowest;
        }
    }
}
