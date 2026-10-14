using Aetherfall.Combat;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Flight of projectiles (GDD 03 6.1, 6.3): straight bolts keep their line and stop exactly at the range, gravity pulls arrows
    /// down, the aim with gravity lifts the direction so the arrow arrives at the aimed height; attack data of a projectile.
    /// </summary>
    [TestFixture]
    public sealed class ProjectileFlightTests
    {
        [Test]
        public void StraightBolt_FliesAlongItsLine_AndStopsAtTheRange()
        {
            var flight = new ProjectileFlight(Vector3.zero, Vector3.forward, 30f, 0f, 25f);

            Vector3 to = flight.Step(0.5f, out Vector3 from);

            Assert.That(from, Is.EqualTo(Vector3.zero));
            Assert.That(to.z, Is.EqualTo(15f).Within(1e-4f));
            Assert.That(to.y, Is.EqualTo(0f).Within(1e-4f));
            Assert.That(flight.Expired, Is.False);

            to = flight.Step(0.5f, out _);

            Assert.That(to.z, Is.EqualTo(25f).Within(1e-3f), "the last step ends exactly at the range");
            Assert.That(flight.Travelled, Is.EqualTo(25f).Within(1e-3f));
            Assert.That(flight.Expired, Is.True);
        }

        [Test]
        public void Gravity_PullsTheProjectileDown()
        {
            var flight = new ProjectileFlight(Vector3.zero, Vector3.forward, 70f, 4.9f, 60f);
            for (int i = 0; i < 10; i++)
            {
                flight.Step(0.05f, out _);
            }

            // 0.5 s at 0.5 g: about ½ · 4.9 · 0.25 ≈ 0.61 m lower.
            Assert.That(flight.Position.y, Is.EqualTo(-0.6125f).Within(0.01f));
            Assert.That(flight.Velocity.y, Is.LessThan(0f));
        }

        [Test]
        public void AimDirection_WithGravity_ArrivesAtTheAimedHeight()
        {
            Vector3 origin = new Vector3(0f, 1.5f, 0f);
            Vector3 target = new Vector3(0f, 1.5f, 40f);
            Vector3 straight = ProjectileFlight.AimDirection(origin, target, 30f, 0f);
            Vector3 lifted = ProjectileFlight.AimDirection(origin, target, 70f, 4.9f);

            Assert.That(straight, Is.EqualTo(Vector3.forward));
            Assert.That(lifted.y, Is.GreaterThan(0f));

            var flight = new ProjectileFlight(origin, lifted, 70f, 4.9f, 60f);
            while (flight.Position.z < 40f && !flight.Expired)
            {
                flight.Step(0.01f, out _);
            }

            Assert.That(flight.Position.y, Is.EqualTo(1.5f).Within(0.15f));
        }

        [Test]
        public void ProjectileAttack_IsRecognised_AndValidated()
        {
            AttackSpec bolt = AttackSpec.Create("attack.test.geschoss", 0.2f, 0.05f, 0.3f);
            Assert.That(bolt.IsProjectile, Is.False);

            bolt.ProjectileSpeed = 30f;
            Assert.That(bolt.IsProjectile, Is.True);
            Assert.That(bolt.Validate(), Is.Empty);

            bolt.ProjectileRadius = 0f;
            Assert.That(bolt.Validate(), Does.Contain("projectile"));
        }
    }
}
