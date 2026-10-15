using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Registers <see cref="IAttackTokenService"/> (<see cref="AttackTokenService"/>) and <see cref="IAIManager"/>
    /// (<see cref="AIManager"/>; architecture 4.1 step 13 "AI (Token-Manager)"). The menu "Aetherfall > Testgelaende
    /// erstellen" (German menu text) puts it into the BootConfig behind the Combat installer.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: KI", fileName = "AIInstaller", order = 111)]
    public sealed class AIInstaller : ServiceInstaller
    {
        [Tooltip("Nahkampf-Token je Ziel (GDD 03, 9.3: Geschichte 1 · Normal 2 · Schwer 3 · Albtraum 3).")]
        [Range(1, 6)] [SerializeField] private int meleeTokens = 2;

        [Tooltip("Fernkampf-Token je Ziel (Normal 2).")]
        [Range(1, 6)] [SerializeField] private int rangedTokens = 2;

        [Tooltip("Sekunden, bevor derselbe Gegner nach seinem Angriff wieder ein Token nehmen darf (1,0).")]
        [Range(0f, 5f)] [SerializeField] private float reacquireDelay = 1.0f;

        [Tooltip("Mindestabstand zwischen zwei Angriffsstarts verschiedener Gegner auf dasselbe Ziel in Sekunden (0,6).")]
        [Range(0f, 3f)] [SerializeField] private float minStartInterval = 0.6f;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IAttackTokenService), typeof(IAIManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var tokens = new AttackTokenService(meleeTokens, rangedTokens, reacquireDelay, minStartInterval);
            if (locator.TryGet(out IDifficultyService difficulty))
            {
                // GDD 03 9.7: tokens melee / ranged 1/1 Geschichte, 2/2 Normal, 3/2 Schwer, 3/3 Albtraum.
                tokens.SetBudgets(difficulty.Settings.MeleeTokens, difficulty.Settings.RangedTokens);
                difficulty.Changed += level => tokens.SetBudgets(difficulty.Settings.MeleeTokens, difficulty.Settings.RangedTokens);
            }

            registry.Register<IAttackTokenService>(tokens);
            registry.Register<IAIManager>(new AIManager());
        }
    }
}
