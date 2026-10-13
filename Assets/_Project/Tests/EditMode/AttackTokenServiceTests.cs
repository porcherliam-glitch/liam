using Aetherfall.AI;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Attack tokens (GDD 03 9.3): budget 2 melee / 2 ranged per target, at least 0.6 s between two attack starts on the
    /// same target, 1.0 s before the same enemy may take a token again; a champion may use up the budget alone.
    /// </summary>
    [TestFixture]
    public sealed class AttackTokenServiceTests
    {
        private const string Player = "player";

        [Test]
        public void Budget_AllowsTwoMeleeAttackers()
        {
            var tokens = new AttackTokenService();

            Assert.That(tokens.TryAcquire(Player, "wolf_1", 1), Is.True);
            tokens.Tick(0.6f);
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.True);
            tokens.Tick(0.6f);
            Assert.That(tokens.TryAcquire(Player, "wolf_3", 1), Is.False, "Third wolf keeps circling.");

            Assert.That(tokens.Available(Player, TokenKind.Melee), Is.EqualTo(0));
            Assert.That(tokens.HolderCount(Player), Is.EqualTo(2));
        }

        [Test]
        public void AttackStarts_AreAtLeastSixHundredMillisecondsApart()
        {
            var tokens = new AttackTokenService();
            tokens.TryAcquire(Player, "wolf_1", 1);

            tokens.Tick(0.5f);
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.False);

            tokens.Tick(0.1f);
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.True);
        }

        [Test]
        public void TryBeginAttack_NeedsTheToken_AndSpacesTheStartsThemselves()
        {
            // Time steps that are exact in binary floating point (0.75, 0.25, 0.5, 0.125).
            var tokens = new AttackTokenService();
            Assert.That(tokens.TryBeginAttack(Player, "wolf_1"), Is.False, "No token, no attack.");
            tokens.TryAcquire(Player, "wolf_1", 1);
            tokens.Tick(0.75f);
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.True);

            // wolf_1 had to close in and starts late; wolf_2 got its token later but could start at once.
            tokens.Tick(0.25f);
            Assert.That(tokens.TryBeginAttack(Player, "wolf_1"), Is.True);
            Assert.That(tokens.TryBeginAttack(Player, "wolf_2"), Is.False, "0 s after the last start.");

            tokens.Tick(0.5f);
            Assert.That(tokens.TryBeginAttack(Player, "wolf_2"), Is.False, "0.5 s after the last start.");

            tokens.Tick(0.125f);
            Assert.That(tokens.TryBeginAttack(Player, "wolf_2"), Is.True, "0.625 s after the last start.");
            Assert.That(tokens.TryBeginAttack(Player, "wolf_1"), Is.False, "The start of wolf_2 counts as the last start now.");
        }

        [Test]
        public void Holder_AskingAgain_KeepsItsToken()
        {
            var tokens = new AttackTokenService();
            tokens.TryAcquire(Player, "wolf_1", 1);

            Assert.That(tokens.TryAcquire(Player, "wolf_1", 1), Is.True);
            Assert.That(tokens.HolderCount(Player), Is.EqualTo(1));
            Assert.That(tokens.Holds(Player, "wolf_1"), Is.True);
        }

        [Test]
        public void Release_FreesBudgetAndBlocksSameEnemyForOneSecond()
        {
            var tokens = new AttackTokenService();
            tokens.TryAcquire(Player, "wolf_1", 1);
            tokens.Tick(0.6f);

            tokens.Release(Player, "wolf_1");

            Assert.That(tokens.Holds(Player, "wolf_1"), Is.False);
            Assert.That(tokens.Available(Player, TokenKind.Melee), Is.EqualTo(2));
            Assert.That(tokens.TryAcquire(Player, "wolf_1", 1), Is.False, "Reacquire delay 1.0 s.");
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.True, "Another wolf may attack.");

            tokens.Tick(1.0f);
            Assert.That(tokens.TryAcquire(Player, "wolf_1", 1), Is.True);
        }

        [Test]
        public void Champion_MayUseTheBudgetAlone()
        {
            var tokens = new AttackTokenService();

            Assert.That(tokens.TryAcquire(Player, "champion", 3), Is.True);
            tokens.Tick(1f);
            Assert.That(tokens.TryAcquire(Player, "wolf_1", 1), Is.False);
        }

        [Test]
        public void Elite_DoesNotFitNextToANormalEnemy()
        {
            var tokens = new AttackTokenService();
            tokens.TryAcquire(Player, "wolf_1", 1);
            tokens.Tick(1f);

            Assert.That(tokens.TryAcquire(Player, "elite", 2), Is.False);
        }

        [Test]
        public void MeleeAndRanged_HaveSeparateBudgets()
        {
            var tokens = new AttackTokenService(2, 1, 1f, 0f);
            tokens.TryAcquire(Player, "wolf_1", 1);
            tokens.TryAcquire(Player, "wolf_2", 1);

            Assert.That(tokens.TryAcquire(Player, "archer", 1, TokenKind.Ranged), Is.True);
            Assert.That(tokens.TryAcquire(Player, "archer_2", 1, TokenKind.Ranged), Is.False);
            Assert.That(tokens.Available(Player, TokenKind.Ranged), Is.EqualTo(0));
        }

        [Test]
        public void Targets_HaveTheirOwnBudgets()
        {
            var tokens = new AttackTokenService(1, 1, 1f, 0f);
            tokens.TryAcquire(Player, "wolf_1", 1);

            Assert.That(tokens.TryAcquire("companion", "wolf_2", 1), Is.True);
            Assert.That(tokens.Available("companion", TokenKind.Melee), Is.EqualTo(0));
            Assert.That(tokens.Available("nobody", TokenKind.Melee), Is.EqualTo(1));
        }

        [Test]
        public void SetBudget_ChangesTheDifficulty()
        {
            var tokens = new AttackTokenService(2, 2, 1f, 0f);
            tokens.SetBudget(TokenKind.Melee, 1);
            tokens.TryAcquire(Player, "wolf_1", 1);

            Assert.That(tokens.BudgetOf(TokenKind.Melee), Is.EqualTo(1));
            Assert.That(tokens.TryAcquire(Player, "wolf_2", 1), Is.False);
        }

        [Test]
        public void EmptyIds_AreRejected()
        {
            var tokens = new AttackTokenService();

            Assert.That(tokens.TryAcquire(string.Empty, "wolf_1", 1), Is.False);
            Assert.That(tokens.TryAcquire(Player, null, 1), Is.False);
            Assert.DoesNotThrow(() => tokens.Release("unknown", "wolf_1"));
        }
    }
}
