using System;
using System.Collections.Generic;
using Aetherfall.Classes;
using Aetherfall.Core;
using Aetherfall.Progression;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Skills
{
    /// <summary>
    /// Registers <see cref="ISkillService"/> with the skill trees of the list (Stufe A: Krieger and Magier) and its save section
    /// <c>skills</c>. Needs the classes (tree of the current class) and the progression (skill points).
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Skill-Bäume", fileName = "SkillInstaller", order = 114)]
    public sealed class SkillInstaller : ServiceInstaller
    {
        [Tooltip("Skill-Bäume, einer je Klasse.")]
        [SerializeField] private List<SkillTreeDefinition> trees = new List<SkillTreeDefinition>();

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ISkillService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IClassService), typeof(IProgressionService), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var specs = new List<SkillTree>();
            foreach (SkillTreeDefinition definition in trees)
            {
                if (definition != null)
                {
                    specs.Add(definition.CreateTree());
                }
            }

            var service = new SkillService(specs, locator.Get<IClassService>(), locator.Get<IProgressionService>());
            locator.Get<ISaveManager>().Register(new SkillSaveable(service));
            Log.Info(LogCategory.Data, "Skill trees: " + service.Trees.Count + ".");
            registry.Register<ISkillService>(service);
        }
    }
}
