using Aetherfall.Data;
using Aetherfall.Inventory;
using UnityEngine;

namespace Aetherfall.Classes
{
    /// <summary>
    /// A starting class as content (GDD 03 11.2): krieger and magier in the slice. Start attributes, starting kit and the texts
    /// of the class choice. Lives in <c>Assets/_Project/Data/Classes/</c>; the <see cref="ClassInstaller"/> lists them.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Charakter/Klasse", fileName = "Klasse", order = 40)]
    public sealed class ClassDefinition : ScriptableObject, IContentIdProvider
    {
        [Tooltip("ID der Klasse, z. B. class.krieger.")]
        [SerializeField] private string classId = "class.neu";

        [Tooltip("Name in der Klassenwahl.")]
        [SerializeField] private string displayName = "Neue Klasse";

        [Tooltip("Ein Satz zur Klassenfantasie (GDD 03 11.2), z. B. „Ich stehe, wo andere fallen.“")]
        [SerializeField] private string motto = "";

        [Tooltip("Wie sich die Klasse spielt (kurz, für die Klassenwahl).")]
        [TextArea(2, 5)] [SerializeField] private string description = "";

        [Header("Startattribute (Summe 66)")]
        [Range(1f, 30f)] [SerializeField] private float strength = 11f;
        [Range(1f, 30f)] [SerializeField] private float dexterity = 11f;
        [Range(1f, 30f)] [SerializeField] private float intelligence = 11f;
        [Range(1f, 30f)] [SerializeField] private float wisdom = 11f;
        [Range(1f, 30f)] [SerializeField] private float constitution = 11f;
        [Range(1f, 30f)] [SerializeField] private float charisma = 11f;

        [Header("Startausrüstung")]
        [Tooltip("Startausrüstung eines neuen Spiels mit dieser Klasse.")]
        [SerializeField] private StartingEquipment startingEquipment = null;

        /// <summary>Class id.</summary>
        public string ClassId => classId ?? string.Empty;

        /// <inheritdoc />
        public string ContentId => ClassId;

        /// <summary>Builds the plain data.</summary>
        public ClassSpec CreateSpec()
        {
            return new ClassSpec(ClassId, displayName, motto, description,
                new[] { strength, dexterity, intelligence, wisdom, constitution, charisma },
                startingEquipment != null ? startingEquipment.CreateKit() : StartingKit.Empty);
        }
    }
}
