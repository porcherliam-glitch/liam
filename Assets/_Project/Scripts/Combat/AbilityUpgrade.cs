using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// A change to one ability from the skill tree (GDD 03 11.3, node type "Upgrade"): more targets (Eislanze, Kettenblitz), a
    /// larger radius (Feuerball), more hits (Wirbelklinge: Klingensturm), a pull (Wirbelklinge: Sog), other stamina costs.
    /// Pure C#.
    /// </summary>
    public sealed class AbilityUpgrade
    {
        /// <summary>Extra targets: a projectile pierces one more, a chain jumps once more.</summary>
        public int ExtraTargets { get; set; }

        /// <summary>Extra metres for the explosion of a projectile, an area or the strikes.</summary>
        public float ExtraRadius { get; set; }

        /// <summary>Extra hits of a cone (rotations).</summary>
        public int ExtraHits { get; set; }

        /// <summary>Metres the targets of a cone are pulled in (the larger value counts).</summary>
        public float PullDistance { get; set; }

        /// <summary>Change of the stamina cost.</summary>
        public float StaminaCostDelta { get; set; }

        /// <summary>True if it changes nothing.</summary>
        public bool IsEmpty => ExtraTargets == 0 && ExtraRadius == 0f && ExtraHits == 0 && PullDistance == 0f && StaminaCostDelta == 0f;

        /// <summary>Adds another upgrade of the same ability.</summary>
        /// <param name="other">Upgrade.</param>
        public void Add(AbilityUpgrade other)
        {
            if (other == null)
            {
                return;
            }

            ExtraTargets += other.ExtraTargets;
            ExtraRadius += other.ExtraRadius;
            ExtraHits += other.ExtraHits;
            PullDistance = Math.Max(PullDistance, other.PullDistance);
            StaminaCostDelta += other.StaminaCostDelta;
        }

        /// <summary>The ability with this upgrade (a copy; the base data stays unchanged).</summary>
        /// <param name="spec">Base data.</param>
        public AbilitySpec ApplyTo(AbilitySpec spec)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            AbilitySpec result = spec.Clone();
            switch (result.Kind)
            {
                case AbilityKind.Projectile:
                    result.MaxTargets = Math.Max(1, result.MaxTargets + ExtraTargets);
                    if (result.ExplosionRadius > 0f)
                    {
                        result.ExplosionRadius = Math.Max(0.5f, result.ExplosionRadius + ExtraRadius);
                    }

                    break;
                case AbilityKind.Chain:
                    result.ChainTargets = Math.Max(1, result.ChainTargets + ExtraTargets);
                    break;
                case AbilityKind.GroundArea:
                case AbilityKind.Strikes:
                case AbilityKind.Shout:
                    result.AreaRadius = Math.Max(0.5f, result.AreaRadius + ExtraRadius);
                    break;
                case AbilityKind.Cone:
                    result.Range = Math.Max(0.5f, result.Range + ExtraRadius);
                    result.Repeats = Math.Max(1, result.Repeats + ExtraHits);
                    result.PullDistance = Math.Max(result.PullDistance, PullDistance);
                    break;
            }

            result.StaminaCost = Math.Max(0f, result.StaminaCost + StaminaCostDelta);
            return result;
        }
    }
}
