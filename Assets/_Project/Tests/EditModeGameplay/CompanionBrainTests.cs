using Aetherfall.AI;
using Aetherfall.Companions;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// The defensive companion (Maren, GDD 03 13.1): stays at her post until recruited, follows behind and to the side of the
    /// player, catches up and appears next to him from afar, fights only chosen targets near the player, waits on command,
    /// does nothing while down.
    /// </summary>
    [TestFixture]
    public sealed class CompanionBrainTests
    {
        private static CompanionSenses Senses(float selfX, float selfZ)
        {
            return new CompanionSenses
            {
                Self = new FlatPoint(selfX, selfZ),
                Player = new FlatPoint(0f, 0f),
                PlayerYaw = 0f,
                Joined = true,
                AttackReady = true
            };
        }

        [Test]
        public void NotRecruited_StaysAtHerPost()
        {
            CompanionSenses senses = Senses(40f, 40f);
            senses.Joined = false;

            CompanionDecision decision = new CompanionBrain().Decide(senses);

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Stand));
        }

        [Test]
        public void FollowSpot_IsBehindAndBesideThePlayer()
        {
            FlatPoint right = CompanionBrain.FollowSpot(new FlatPoint(0f, 0f), 0f, 1);
            FlatPoint left = CompanionBrain.FollowSpot(new FlatPoint(0f, 0f), 0f, -1);
            FlatPoint turned = CompanionBrain.FollowSpot(new FlatPoint(0f, 0f), 90f, 1);

            Assert.That(right.Z, Is.EqualTo(-CompanionBrain.BehindDistance).Within(1e-4f), "behind (player looks along +Z)");
            Assert.That(right.X, Is.EqualTo(CompanionBrain.SideDistance).Within(1e-4f));
            Assert.That(left.X, Is.EqualTo(-CompanionBrain.SideDistance).Within(1e-4f));
            Assert.That(turned.X, Is.EqualTo(-CompanionBrain.BehindDistance).Within(1e-4f), "player looks along +X: behind is −X");
        }

        [Test]
        public void FarBehind_RunsToTheFollowSpot_OnHerSide()
        {
            CompanionDecision decision = new CompanionBrain().Decide(Senses(-3f, -8f));

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Move));
            Assert.That(decision.Speed, Is.GreaterThan(3f));
            Assert.That(decision.Destination.X, Is.LessThan(0f), "she is left behind the player, so she takes the left spot");
        }

        [Test]
        public void AtTheFollowSpot_StandsStill()
        {
            CompanionDecision decision = new CompanionBrain().Decide(Senses(CompanionBrain.SideDistance, -CompanionBrain.BehindDistance));

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Stand));
        }

        [Test]
        public void VeryFarAway_AppearsNextToThePlayer()
        {
            CompanionDecision decision = new CompanionBrain().Decide(Senses(200f, 0f));

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Teleport));
            Assert.That(decision.Destination.DistanceTo(new FlatPoint(0f, 0f)), Is.LessThan(4f));
        }

        [Test]
        public void TargetInReach_Attacks_TargetFurther_RunsToIt()
        {
            var brain = new CompanionBrain();
            CompanionSenses senses = Senses(1f, -2f);
            senses.HasTarget = true;
            senses.Target = new FlatPoint(1f, 4f);

            CompanionDecision chase = brain.Decide(senses);
            senses.Self = new FlatPoint(1f, 2.5f);
            CompanionDecision attack = brain.Decide(senses);

            Assert.That(chase.Move, Is.EqualTo(CompanionMove.Move));
            Assert.That(chase.FaceTarget, Is.True);
            Assert.That(attack.StartAttack, Is.True);
            Assert.That(attack.Move, Is.EqualTo(CompanionMove.Stand));
        }

        [Test]
        public void TargetFarFromThePlayer_IsNotChased()
        {
            CompanionSenses senses = Senses(1f, -2f);
            senses.HasTarget = true;
            senses.Target = new FlatPoint(0f, 20f);

            CompanionDecision decision = new CompanionBrain().Decide(senses);

            Assert.That(decision.StartAttack, Is.False);
            Assert.That(decision.FaceTarget, Is.False, "she keeps following instead");
        }

        [Test]
        public void Waiting_StaysEvenWhenThePlayerIsFarAway()
        {
            CompanionSenses senses = Senses(60f, 0f);
            senses.Waiting = true;

            CompanionDecision decision = new CompanionBrain().Decide(senses);

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Stand));
        }

        [Test]
        public void Downed_DoesNothing()
        {
            CompanionSenses senses = Senses(1f, -6f);
            senses.Downed = true;
            senses.HasTarget = true;
            senses.Target = new FlatPoint(1f, -5f);

            CompanionDecision decision = new CompanionBrain().Decide(senses);

            Assert.That(decision.Move, Is.EqualTo(CompanionMove.Stand));
            Assert.That(decision.StartAttack, Is.False);
        }
    }
}
