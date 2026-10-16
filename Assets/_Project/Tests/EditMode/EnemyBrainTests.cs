using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// AI state machine of the wolf (GDD 03 9.1–9.5): guard/patrol, suspicious, combat with circling, token and telegraph,
    /// search, return (leash 40 m, 8 s unreachable), flight, stun and death. The enemy stands at the origin looking along
    /// +Z (yaw 0); the anchor is the origin.
    /// </summary>
    [TestFixture]
    public sealed class EnemyBrainTests
    {
        private const float Step = 0.1f;

        private AttackTokenService _tokens;

        [SetUp]
        public void SetUp()
        {
            _tokens = new AttackTokenService();
        }

        private static EnemyBrainSettings CreateSettings(bool guard = true, float fleeBelow = 0f)
        {
            AttackSpec bite = AttackSpec.Create("biss", 0.45f, 0.15f, 0.45f);
            bite.Kind = AttackKind.Enemy;
            return new EnemyBrainSettings
            {
                Guard = guard,
                FleeHealthFraction = fleeBelow,
                Attacks = new[] { new EnemyAttackOption { Attack = bite, MinRange = 0f, MaxRange = 2.2f, MaxAngle = 30f, Cooldown = 1.5f } }
            };
        }

        private EnemyBrain CreateBrain(EnemyBrainSettings settings = null, string id = "wolf_1", FlatPoint[] patrol = null)
        {
            return new EnemyBrain(settings ?? CreateSettings(), _tokens, id, new SequenceRandom(0f), new FlatPoint(0f, 0f), patrol);
        }

        private static EnemySenses Senses(float targetX, float targetZ, PerceptionStance stance = PerceptionStance.Walk, bool visible = true,
            float selfX = 0f, float selfZ = 0f, float light = 1f)
        {
            return new EnemySenses
            {
                TargetLight = light,
                HasTarget = true,
                Self = new FlatPoint(selfX, selfZ),
                SelfYaw = 0f,
                Target = new FlatPoint(targetX, targetZ),
                TargetVisible = visible,
                TargetStance = stance,
                TargetReachable = true,
                HealthFraction = 1f
            };
        }

        private static EnemySenses NoTarget(float selfX = 0f, float selfZ = 0f)
        {
            return new EnemySenses { Self = new FlatPoint(selfX, selfZ), HealthFraction = 1f };
        }

        private void Run(EnemyBrain brain, EnemySenses senses, float seconds)
        {
            int steps = (int)System.Math.Round(seconds / Step);
            for (int i = 0; i < steps; i++)
            {
                _tokens.Tick(Step);
                brain.Tick(Step, senses);
            }
        }

        private static void HitBy(EnemyBrain brain, EnemySenses senses)
        {
            senses.WasHitByTarget = true;
            brain.Tick(Step, senses);
        }

        private EnemyBrain CreateAttackingBrain()
        {
            EnemyBrain brain = CreateBrain();
            EnemySenses close = Senses(0f, 2f, PerceptionStance.Combat);
            HitBy(brain, close);
            brain.Tick(Step, close);
            brain.Tick(Step, close);
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Attack), "Setup: the wolf attacks.");
            return brain;
        }

        [Test]
        public void WithoutPatrolRoute_StartsAsGuardAndStandsStill()
        {
            EnemyBrain brain = CreateBrain();

            brain.Tick(Step, NoTarget());

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Guard));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Stop));
            Assert.That(brain.IsEngaged, Is.False);
        }

        [Test]
        public void Patrol_WalksFromWaypointToWaypoint()
        {
            var route = new[] { new FlatPoint(10f, 0f), new FlatPoint(10f, 10f) };
            EnemyBrain brain = CreateBrain(CreateSettings(false), "wolf_1", route);

            brain.Tick(Step, NoTarget());
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Patrol));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Walk));
            Assert.That(brain.Intent.Destination.X, Is.EqualTo(10f));
            Assert.That(brain.Intent.Destination.Z, Is.EqualTo(0f));

            brain.Tick(Step, NoTarget(10f, 0.5f));
            Assert.That(brain.Intent.Destination.Z, Is.EqualTo(10f), "Next waypoint after arriving.");
        }

        [Test]
        public void Guard_AwayFromAnchor_WalksBack()
        {
            EnemyBrain brain = CreateBrain();

            brain.Tick(Step, NoTarget(5f, 0f));

            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Walk));
            Assert.That(brain.Intent.Destination.X, Is.EqualTo(0f));
        }

        [Test]
        public void Senses_DefaultToDaylight_AndClampTheLight()
        {
            Assert.That(new EnemySenses().TargetLight, Is.EqualTo(1f));
            var senses = new EnemySenses { TargetLight = 1.5f };
            Assert.That(senses.TargetLight, Is.EqualTo(1f));
            senses.TargetLight = 0.4f;
            Assert.That(senses.TargetLight, Is.EqualTo(0.4f).Within(1e-6f));
        }

        [Test]
        public void AtNight_SneakingInSight_IsNoticedMuchLater()
        {
            // GDD 03 9.2: light 0.4 at night, about 15 per second at 5 m while sneaking (combat after about 6.5 s).
            EnemyBrain day = CreateBrain();
            Run(day, Senses(0f, 5f, PerceptionStance.Sneak), 1f);
            EnemyBrain night = CreateBrain();
            Run(night, Senses(0f, 5f, PerceptionStance.Sneak, light: 0.4f), 1f);

            Assert.That(night.Detection, Is.EqualTo(day.Detection * 0.4f).Within(0.5f));
            Assert.That(night.State, Is.EqualTo(EnemyStateId.Guard), "at day it is suspicious after 0.8 s, at night not yet");

            Run(night, Senses(0f, 5f, PerceptionStance.Sneak, light: 0.4f), 1.1f);
            Assert.That(night.State, Is.EqualTo(EnemyStateId.Suspicious), "suspicious after about 2 s");
        }

        [Test]
        public void SneakingInSight_SuspiciousAfterAboutOneSecond_CombatAfterAboutThree()
        {
            // GDD 03 9.2 example: 38 per second at 5 m while sneaking.
            EnemyBrain brain = CreateBrain();
            EnemySenses sneaking = Senses(0f, 5f, PerceptionStance.Sneak);

            Run(brain, sneaking, 0.7f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Guard));

            Run(brain, sneaking, 0.2f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Suspicious));
            Assert.That(brain.Intent.FaceTarget, Is.True, "Turns towards the stimulus.");

            Run(brain, sneaking, 1.6f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Suspicious));

            Run(brain, sneaking, 0.2f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
            Assert.That(brain.IsEngaged, Is.True);
        }

        [Test]
        public void RunningClose_IsNoticedAtOnce()
        {
            EnemyBrain brain = CreateBrain();

            brain.Tick(Step, Senses(2f, -1f, PerceptionStance.Run));

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
        }

        [Test]
        public void SneakingCloseBehind_IsNotNoticedAtOnce()
        {
            EnemyBrain brain = CreateBrain();

            brain.Tick(Step, Senses(0f, -2.4f, PerceptionStance.Sneak));

            Assert.That(brain.State, Is.Not.EqualTo(EnemyStateId.Combat));
        }

        [Test]
        public void SprintingBehind_IsHeard()
        {
            EnemyBrain brain = CreateBrain();

            brain.Tick(Step, Senses(0f, -12f, PerceptionStance.Sprint));

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Suspicious));
            Assert.That(brain.Detection, Is.EqualTo(40f).Within(1e-3f));
        }

        [Test]
        public void WalkingFarBehind_StaysUnnoticed()
        {
            EnemyBrain brain = CreateBrain();

            Run(brain, Senses(0f, -15f, PerceptionStance.Walk), 3f);

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Guard));
            Assert.That(brain.Detection, Is.EqualTo(0f));
        }

        [Test]
        public void Suspicious_WithoutStimulus_SearchesAfterThreeSeconds_ThenReturns()
        {
            EnemyBrain brain = CreateBrain();
            brain.Tick(Step, Senses(0f, -12f, PerceptionStance.Sprint));
            EnemySenses gone = Senses(0f, -40f, PerceptionStance.Still, false);

            Run(brain, gone, 2.9f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Suspicious));

            Run(brain, gone, 0.3f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Search));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Walk));
            Assert.That(brain.Intent.Destination.Z, Is.EqualTo(-12f), "Goes to the last known position.");

            // The wolf has walked to the search point (12 m from its anchor) and searches there for 20 s.
            EnemySenses searching = Senses(0f, -40f, PerceptionStance.Still, false, 0f, -12f);
            Run(brain, searching, 20f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return));

            brain.Tick(Step, searching);
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Run));
            Assert.That(brain.Intent.Destination.Z, Is.EqualTo(0f), "Runs back to the anchor.");

            brain.Tick(Step, NoTarget());
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Guard), "Anchor reached.");
        }

        [Test]
        public void HitWhileGuarding_FightsAtOnce()
        {
            EnemyBrain brain = CreateBrain();

            HitBy(brain, Senses(0f, -20f, PerceptionStance.Still, false));

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
            Assert.That(brain.Detection, Is.EqualTo(100f));
        }

        [Test]
        public void Combat_FarTarget_RunsThenCirclesInTheRing()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 15f));

            brain.Tick(Step, Senses(0f, 15f));
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Approach));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Run));

            // Without token the wolf circles in 4-7 m (here the token is taken by another wolf).
            Assert.That(_tokens.TryAcquire("player", "wolf_other", 1), Is.True);
            brain.Tick(Step, Senses(0f, 6f));
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Circle));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Circle));
            Assert.That(brain.Intent.RingDistance, Is.EqualTo(5.5f).Within(1e-4f));
            Assert.That(brain.Intent.FaceTarget, Is.True);
        }

        [Test]
        public void Attack_NeedsTokenAndTelegraphsBeforeTheHit()
        {
            var window = new RecordingHitWindow();
            var brain = new EnemyBrain(CreateSettings(), _tokens, "wolf_1", new SequenceRandom(0f), new FlatPoint(0f, 0f), null, window);
            EnemySenses close = Senses(0f, 2f, PerceptionStance.Combat);
            HitBy(brain, close);

            brain.Tick(Step, close);
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Engage));
            Assert.That(brain.HasToken, Is.True);

            brain.Tick(Step, close);
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Attack));
            Assert.That(brain.IsTelegraphing, Is.True, "Wind-up = visible telegraph.");
            Assert.That(brain.Intent.FaceTarget, Is.True);
            Assert.That(window.Opened, Is.Empty);

            Run(brain, close, 0.5f);
            Assert.That(window.Opened.Count, Is.EqualTo(1), "Bite hits after the wind-up of 0.45 s.");
            Assert.That(brain.IsTelegraphing, Is.False);
        }

        [Test]
        public void AfterTheAttack_RetreatsGivesTokenBackAndCircles()
        {
            EnemyBrain brain = CreateAttackingBrain();
            EnemySenses close = Senses(0f, 2f, PerceptionStance.Combat);

            Run(brain, close, 1.2f);
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Retreat));
            Assert.That(brain.HasToken, Is.False);
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Retreat));

            Run(brain, close, 0.9f);
            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Circle));
            Assert.That(brain.HasToken, Is.False, "Bite on cooldown and reacquire delay: no new token yet.");
        }

        [Test]
        public void ThreeWolves_NeverMoreThanTwoAttackAndStartsAreSpaced()
        {
            var brains = new List<EnemyBrain>
            {
                CreateBrain(null, "wolf_1"), CreateBrain(null, "wolf_2"), CreateBrain(null, "wolf_3")
            };
            EnemySenses close = Senses(0f, 2f, PerceptionStance.Combat);
            var starts = new List<float>();
            var attacking = new bool[brains.Count];
            foreach (EnemyBrain brain in brains)
            {
                HitBy(brain, close);
            }

            float time = 0f;
            for (int step = 0; step < 60; step++)
            {
                time += Step;
                _tokens.Tick(Step);
                for (int i = 0; i < brains.Count; i++)
                {
                    brains[i].Tick(Step, close);
                    bool isAttacking = brains[i].CombatPhase == EnemyCombatPhase.Attack;
                    if (isAttacking && !attacking[i])
                    {
                        starts.Add(time);
                    }

                    attacking[i] = isAttacking;
                }

                Assert.That(_tokens.HolderCount("player"), Is.LessThanOrEqualTo(2));
            }

            Assert.That(starts.Count, Is.GreaterThanOrEqualTo(2));
            for (int i = 1; i < starts.Count; i++)
            {
                Assert.That(starts[i] - starts[i - 1], Is.GreaterThanOrEqualTo(0.6f - 1e-3f), "At least 0.6 s between attack starts.");
            }
        }

        [Test]
        public void TwoWolvesAtDifferentDistances_StartsAreSpacedNotOnlyTheGrants()
        {
            // Wolf A gets the token first but must run in from 5 m; wolf B gets it 0.6 s later and stands in range (2 m).
            // GDD 03 9.3: at least 0.6 s between two attack starts, not only between two token grants.
            var target = new FlatPoint(0f, 10f);
            var selves = new[] { new FlatPoint(0f, 5f), new FlatPoint(0f, 8f) };
            var brains = new[] { CreateBrain(null, "wolf_a"), CreateBrain(null, "wolf_b") };
            var attacking = new bool[brains.Length];
            var starts = new List<float>();
            for (int i = 0; i < brains.Length; i++)
            {
                HitBy(brains[i], Senses(target.X, target.Z, PerceptionStance.Combat, true, selves[i].X, selves[i].Z));
            }

            float time = 0f;
            for (int step = 0; step < 25; step++)
            {
                time += Step;
                _tokens.Tick(Step);
                for (int i = 0; i < brains.Length; i++)
                {
                    brains[i].Tick(Step, Senses(target.X, target.Z, PerceptionStance.Combat, true, selves[i].X, selves[i].Z));
                    if (brains[i].Intent.Mode == EnemyMoveMode.Run)
                    {
                        // Runs straight at the target (+Z).
                        selves[i] = new FlatPoint(selves[i].X, System.Math.Min(selves[i].Z + brains[i].Intent.Speed * Step, target.Z - 1f));
                    }

                    bool isAttacking = brains[i].CombatPhase == EnemyCombatPhase.Attack;
                    if (isAttacking && !attacking[i])
                    {
                        starts.Add(time);
                    }

                    attacking[i] = isAttacking;
                }
            }

            Assert.That(starts.Count, Is.GreaterThanOrEqualTo(2), "Both wolves attack.");
            for (int i = 1; i < starts.Count; i++)
            {
                Assert.That(starts[i] - starts[i - 1], Is.GreaterThanOrEqualTo(0.6f - 1e-3f), "At least 0.6 s between two attack starts.");
            }
        }

        [Test]
        public void Pounce_CoversItsLungeDistance_AndTracksTheTargetInTheWindup()
        {
            // Data like Wolf_Sprungangriff: 0.65 s wind-up, 0.3 s active, 4 m lunge from 3-6 m (guide 05, 7.4).
            AttackSpec pounce = AttackSpec.Create("sprung", 0.65f, 0.3f, 0.95f);
            pounce.Kind = AttackKind.Enemy;
            pounce.LungeDistance = 4f;
            var settings = new EnemyBrainSettings
            {
                Guard = true,
                Attacks = new[] { new EnemyAttackOption { Attack = pounce, MinRange = 3f, MaxRange = 6f, MaxAngle = 25f, Cooldown = 2f } }
            };
            EnemyBrain brain = CreateBrain(settings);
            EnemySenses ring = Senses(0f, 5.5f, PerceptionStance.Combat);
            HitBy(brain, ring);
            const float frame = 1f / 60f;
            int guard = 0;
            while (brain.CombatPhase != EnemyCombatPhase.Attack && guard++ < 120)
            {
                _tokens.Tick(frame);
                brain.Tick(frame, ring);
            }

            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Attack), "Setup: the wolf pounces.");
            float distance = 0f;
            bool tracksInWindup = true;
            bool lungedInWindup = false;
            while (brain.CombatPhase == EnemyCombatPhase.Attack && guard++ < 400)
            {
                _tokens.Tick(frame);
                brain.Tick(frame, ring);
                if (brain.Intent.Mode == EnemyMoveMode.Lunge)
                {
                    distance += brain.Intent.Speed * frame;
                    if (brain.IsTelegraphing)
                    {
                        lungedInWindup = true;
                        tracksInWindup &= brain.Intent.FaceTarget;
                    }
                }
            }

            Assert.That(distance, Is.EqualTo(4f).Within(0.1f), "The pounce covers the 4 m of its data.");
            Assert.That(lungedInWindup, Is.True, "The lunge starts in the second half of the wind-up, as for the player.");
            Assert.That(tracksInWindup, Is.True, "The telegraph keeps facing the target until the hit.");
        }

        [Test]
        public void ProtectedTarget_CancelsTheWindupAndGivesTheTokenBack()
        {
            EnemyBrain brain = CreateAttackingBrain();
            EnemySenses protectedTarget = Senses(0f, 2f, PerceptionStance.Combat);
            protectedTarget.TargetProtected = true;

            brain.Tick(Step, protectedTarget);

            Assert.That(brain.CombatPhase, Is.EqualTo(EnemyCombatPhase.Circle));
            Assert.That(brain.CurrentAttack, Is.Null);
            Assert.That(brain.HasToken, Is.False);
        }

        [Test]
        public void Leash_MoreThanFortyMetresFromAnchor_Returns()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 10f));

            brain.Tick(Step, Senses(45f, 0f, PerceptionStance.Run, true, 39f, 0f));
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));

            brain.Tick(Step, Senses(45f, 0f, PerceptionStance.Run, true, 41f, 0f));
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return));

            brain.Tick(Step, Senses(45f, 0f, PerceptionStance.Run, true, 41f, 0f));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Run));
            Assert.That(brain.Intent.Destination.X, Is.EqualTo(0f));
            Assert.That(brain.RegenPerSecond, Is.EqualTo(0.1f), "Regenerates 10 % per second while returning.");
            Assert.That(brain.IsEngaged, Is.False);
        }

        [Test]
        public void Return_IgnoresStimuliButFightsWhenHitAgain()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 10f));
            EnemySenses far = Senses(45f, 0f, PerceptionStance.Sprint, true, 41f, 0f);
            brain.Tick(Step, far);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return));

            Run(brain, Senses(20f, 0f, PerceptionStance.Sprint, true, 18f, 0f), 1f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return), "Close and running, but still returning.");

            HitBy(brain, Senses(20f, 0f, PerceptionStance.Sprint, true, 18f, 0f));
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
        }

        [Test]
        public void UnreachableForEightSeconds_Returns()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 20f));
            EnemySenses onRock = Senses(0f, 20f);
            onRock.TargetReachable = false;

            Run(brain, onRock, 7.8f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));

            Run(brain, onRock, 0.3f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return));
        }

        [Test]
        public void FiveSecondsWithoutSight_Searches()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 20f));
            EnemySenses hidden = Senses(0f, 20f, PerceptionStance.Still, false);

            Run(brain, hidden, 4.8f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));

            Run(brain, hidden, 0.3f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Search));
            Assert.That(brain.LastKnownPosition.Z, Is.EqualTo(20f));
        }

        [Test]
        public void TargetGone_Returns()
        {
            EnemyBrain brain = CreateBrain();
            HitBy(brain, Senses(0f, 5f));

            brain.Tick(Step, NoTarget());

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return));
        }

        [Test]
        public void LowHealth_FleesOnceThenReturns()
        {
            EnemyBrain brain = CreateBrain(CreateSettings(true, 0.25f));
            EnemySenses hurt = Senses(0f, 20f, PerceptionStance.Run, true, 10f, 0f);
            hurt.HealthFraction = 0.2f;
            HitBy(brain, hurt);

            brain.Tick(Step, hurt);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Flee));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Flee));
            Assert.That(brain.HasToken, Is.False);

            Run(brain, hurt, 3.1f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Return), "Player more than 8 m away.");

            HitBy(brain, hurt);
            brain.Tick(Step, hurt);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat), "Flees only once.");
        }

        [Test]
        public void Fleeing_Cornered_FightsAgain()
        {
            EnemyBrain brain = CreateBrain(CreateSettings(true, 0.25f));
            EnemySenses hurt = Senses(0f, 20f, PerceptionStance.Run, true, 10f, 0f);
            hurt.HealthFraction = 0.2f;
            HitBy(brain, hurt);
            brain.Tick(Step, hurt);
            EnemySenses cornered = Senses(12f, 0f, PerceptionStance.Run, true, 10f, 0f);
            cornered.HealthFraction = 0.2f;

            Run(brain, cornered, 3.1f);

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
        }

        [Test]
        public void PoiseBreak_StunsCancelsAttackAndAllowsFinisher()
        {
            EnemyBrain brain = CreateAttackingBrain();
            EnemySenses close = Senses(0f, 2f, PerceptionStance.Combat);

            brain.NotifyStunned(3f, true);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Stunned));
            Assert.That(brain.CurrentAttack, Is.Null);
            Assert.That(brain.HasToken, Is.False);
            Assert.That(brain.StunAllowsFinisher, Is.True);
            Assert.That(brain.IsEngaged, Is.True);

            brain.NotifyStunned(1.2f, false);
            Assert.That(brain.StunRemaining, Is.EqualTo(3f), "A parry opening does not shorten a poise break.");

            Run(brain, close, 2.9f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Stunned));
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Stop));

            Run(brain, close, 0.2f);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Combat));
        }

        [Test]
        public void ParryOpening_DoesNotAllowFinisher()
        {
            EnemyBrain brain = CreateAttackingBrain();

            brain.NotifyStunned(1.2f, false);

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Stunned));
            Assert.That(brain.StunAllowsFinisher, Is.False);
        }

        [Test]
        public void Kill_ReleasesTokenAndStopsThinking()
        {
            EnemyBrain brain = CreateAttackingBrain();
            var changes = new List<EnemyStateId>();
            brain.StateChanged += (from, to) => changes.Add(to);

            brain.Kill();
            brain.Tick(Step, Senses(0f, 2f, PerceptionStance.Combat));

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Dead));
            Assert.That(brain.HasToken, Is.False);
            Assert.That(brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Stop));
            Assert.That(changes, Is.EqualTo(new[] { EnemyStateId.Dead }));

            brain.NotifyStunned(3f, true);
            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Dead));
        }

        [Test]
        public void Reset_ReturnsToGuardWithZeroDetection()
        {
            EnemyBrain brain = CreateAttackingBrain();

            brain.Reset();

            Assert.That(brain.State, Is.EqualTo(EnemyStateId.Guard));
            Assert.That(brain.Detection, Is.EqualTo(0f));
            Assert.That(brain.HasToken, Is.False);
        }

        [Test]
        public void InvalidSettings_Throw()
        {
            var settings = new EnemyBrainSettings();

            Assert.That(() => CreateBrain(settings), Throws.ArgumentException);
        }
    }
}
