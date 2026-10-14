using System;
using System.Collections.Generic;
using Aetherfall.Minigames;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Minigames
{
    /// <summary>Dice game "Krähenwurf" (GDD 04 10.3): scoring, turns, losing a roll, all five dice again, winning, opponent.</summary>
    [TestFixture]
    public sealed class CrowThrowTests
    {
        [TestCase(new[] { 1 }, 100)]
        [TestCase(new[] { 5 }, 50)]
        [TestCase(new[] { 1, 1, 1 }, 1000)]
        [TestCase(new[] { 2, 2, 2 }, 200)]
        [TestCase(new[] { 6, 6, 6 }, 600)]
        [TestCase(new[] { 1, 2, 3, 4, 5 }, 500)]
        [TestCase(new[] { 1, 1, 1, 1 }, 1100)]
        [TestCase(new[] { 5, 5, 5, 5, 5 }, 600)]
        [TestCase(new[] { 2, 2, 2, 5 }, 250)]
        [TestCase(new[] { 2 }, -1)]
        [TestCase(new[] { 1, 3 }, -1)]
        public void Score_FollowsTheRulesOfGdd04(int[] faces, int expected)
        {
            Assert.That(CrowThrowScoring.Score(faces), Is.EqualTo(expected));
        }

        [Test]
        public void Best_TakesEveryScoringDie_OrNothing()
        {
            var indices = new List<int>();

            Assert.That(CrowThrowScoring.Best(new[] { 1, 3, 5, 2, 2 }, indices), Is.EqualTo(150));
            Assert.That(indices, Is.EqualTo(new[] { 0, 2 }));
            Assert.That(CrowThrowScoring.Best(new[] { 3, 3, 3, 1, 4 }, indices), Is.EqualTo(400));
            Assert.That(CrowThrowScoring.Best(new[] { 2, 3, 4, 6, 6 }, indices), Is.EqualTo(0));
            Assert.That(indices, Is.Empty);
        }

        [Test]
        public void Turn_SetAsideRollOnAndBank()
        {
            var game = new CrowThrowGame(new ScriptedDice(1, 2, 2, 3, 6, 5, 2, 3, 4));

            Assert.That(game.Roll(), Is.True);
            Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.Choose));
            Assert.That(game.Bank(), Is.False, "first set dice aside");
            Assert.That(game.TrySetAside(new[] { 1 }, out string reason), Is.False, "a 2 scores nothing");
            Assert.That(reason, Does.StartWith("Nur Würfel"));
            Assert.That(game.TrySetAside(new[] { 0 }, out reason), Is.True, reason);
            Assert.That(game.TurnPoints, Is.EqualTo(100));

            Assert.That(game.Roll(), Is.True);
            Assert.That(game.Faces, Is.EqualTo(new[] { 1, 5, 2, 3, 4 }), "die 0 stayed aside, the others were rolled again");
            Assert.That(game.TrySetAside(new[] { 1 }, out reason), Is.True, reason);
            Assert.That(game.Bank(), Is.True);

            Assert.That(game.Score(CrowThrowGame.Player), Is.EqualTo(150));
            Assert.That(game.Current, Is.EqualTo(CrowThrowGame.Opponent));
            Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.AwaitRoll));
        }

        [Test]
        public void RollWithoutPoints_LosesTheTurnPoints()
        {
            var game = new CrowThrowGame(new ScriptedDice(1, 2, 3, 4, 6, 2, 3, 4, 6));
            game.Roll();
            Assert.That(game.TrySetAside(new[] { 0 }, out _), Is.True);

            game.Roll();

            Assert.That(game.TurnPoints, Is.EqualTo(0));
            Assert.That(game.Score(CrowThrowGame.Player), Is.EqualTo(0));
            Assert.That(game.Current, Is.EqualTo(CrowThrowGame.Opponent));
            Assert.That(game.LastEvent, Does.StartWith("Kein Punkt"));
        }

        [Test]
        public void AllFiveScored_RollsAllFiveAgain()
        {
            var game = new CrowThrowGame(new ScriptedDice(1, 1, 1, 5, 5, 2, 2, 2, 3, 4));
            game.Roll();
            Assert.That(game.TrySetAside(new[] { 0, 1, 2, 3, 4 }, out string reason), Is.True, reason);
            Assert.That(game.TurnPoints, Is.EqualTo(1100));

            game.Roll();

            Assert.That(game.Faces, Is.EqualTo(new[] { 2, 2, 2, 3, 4 }));
            Assert.That(game.IsAside(0), Is.False);
            Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.Choose));
        }

        [Test]
        public void ReachingTheTarget_WinsTheGame()
        {
            // Player: 1,1,1,1,1 → 1,200; opponent busts; player: 1,1,1,5,5 → 1,100 → 2,300 ≥ 2,000.
            var game = new CrowThrowGame(new ScriptedDice(1, 1, 1, 1, 1, 2, 3, 4, 6, 6, 1, 1, 1, 5, 5));
            game.Roll();
            Assert.That(game.TrySetAside(new[] { 0, 1, 2, 3, 4 }, out _), Is.True);
            game.Bank();
            game.Roll();
            Assert.That(game.Current, Is.EqualTo(CrowThrowGame.Player), "the opponent rolled nothing");

            game.Roll();
            Assert.That(game.TrySetAside(new[] { 0, 1, 2, 3, 4 }, out _), Is.True);
            game.Bank();

            Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.Finished));
            Assert.That(game.Winner, Is.EqualTo(CrowThrowGame.Player));
            Assert.That(game.Roll(), Is.False);
        }

        [Test]
        public void Opponent_BanksWithEnoughPoints_AndRollsOnWithFew()
        {
            var game = new CrowThrowGame(new ScriptedDice(1, 2, 3, 4, 6, 2, 3, 4, 6, 5, 1, 1, 1, 2, 2));
            game.Roll();
            game.TrySetAside(new[] { 0 }, out _);
            game.Roll();
            Assert.That(game.Current, Is.EqualTo(CrowThrowGame.Opponent));

            game.Roll();
            var best = new List<int>();
            Assert.That(game.BestSelection(best), Is.EqualTo(1050));
            Assert.That(game.TrySetAside(best, out string reason), Is.True, reason);
            Assert.That(game.OpponentWantsToBank(), Is.True, "1,050 points");
        }

        [Test]
        public void StepOpponent_RollsSetsAsideAndBanks_ThenItIsThePlayersTurn()
        {
            // Player busts; opponent rolls 1,1,1,5,2 (1,050 points) and banks.
            var game = new CrowThrowGame(new ScriptedDice(2, 3, 4, 6, 6, 1, 1, 1, 5, 2));
            game.Roll();
            Assert.That(game.StepOpponent(), Is.True, "roll");
            Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.Choose));
            Assert.That(game.StepOpponent(), Is.True, "set aside");
            Assert.That(game.TurnPoints, Is.EqualTo(1050));
            Assert.That(game.StepOpponent(), Is.True, "bank");

            Assert.That(game.Score(CrowThrowGame.Opponent), Is.EqualTo(1050));
            Assert.That(game.Current, Is.EqualTo(CrowThrowGame.Player));
            Assert.That(game.StepOpponent(), Is.False, "not the opponent's turn");
        }

        [Test]
        public void StepOpponent_PlaysWholeGamesToTheEnd()
        {
            for (ulong seed = 1; seed <= 20; seed++)
            {
                var game = new CrowThrowGame(new Pcg32Random(seed));
                var pick = new List<int>();
                for (int step = 0; step < 5000 && game.Phase != CrowThrowPhase.Finished; step++)
                {
                    if (game.Current == CrowThrowGame.Opponent)
                    {
                        Assert.That(game.StepOpponent(), Is.True);
                    }
                    else if (game.Phase == CrowThrowPhase.AwaitRoll)
                    {
                        Assert.That(game.Roll(), Is.True);
                    }
                    else
                    {
                        game.BestSelection(pick);
                        Assert.That(game.TrySetAside(pick, out string reason), Is.True, reason);
                        game.Bank();
                    }
                }

                Assert.That(game.Phase, Is.EqualTo(CrowThrowPhase.Finished), "seed " + seed);
                Assert.That(game.Score(game.Winner), Is.GreaterThanOrEqualTo(CrowThrowGame.Target));
            }
        }

        private sealed class ScriptedDice : IRandom
        {
            private readonly Queue<int> _faces;

            public ScriptedDice(params int[] faces)
            {
                _faces = new Queue<int>(faces);
            }

            public int Range(int minInclusive, int maxExclusive)
            {
                if (_faces.Count == 0)
                {
                    throw new InvalidOperationException("No scripted dice left.");
                }

                return _faces.Dequeue();
            }

            public uint NextUInt()
            {
                return 0;
            }

            public float NextFloat()
            {
                return 0f;
            }

            public double NextDouble()
            {
                return 0.0;
            }

            public float Range(float min, float max)
            {
                return min;
            }
        }
    }
}
