using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>
    /// Composition AND / OR / NOT / "n of m" / always / never (architecture 7.2): truth tables, empty lists, empty entries
    /// (count as false), short-circuit evaluation, nested trees, descriptions and the safe evaluation helpers.
    /// </summary>
    [TestFixture]
    public sealed class ConditionLogicTests
    {
        private LogCapture _log;
        private SwitchBoard _board;
        private ConditionContext _ctx;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _board = new SwitchBoard();
            var services = new ServiceLocator();
            services.Register(_board);
            _ctx = ConditionContext.ForPlayer(services, "quest.test.logik");
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        [TestCase(false, false, false)]
        [TestCase(true, false, false)]
        [TestCase(false, true, false)]
        [TestCase(true, true, true)]
        public void AllOf_TruthTable(bool a, bool b, bool expected)
        {
            _board.Set("a", a);
            _board.Set("b", b);
            Assert.That(new AllOf(new SwitchIsOn("a"), new SwitchIsOn("b")).Evaluate(_ctx), Is.EqualTo(expected));
        }

        [TestCase(false, false, false)]
        [TestCase(true, false, true)]
        [TestCase(false, true, true)]
        [TestCase(true, true, true)]
        public void AnyOf_TruthTable(bool a, bool b, bool expected)
        {
            _board.Set("a", a);
            _board.Set("b", b);
            Assert.That(new AnyOf(new SwitchIsOn("a"), new SwitchIsOn("b")).Evaluate(_ctx), Is.EqualTo(expected));
        }

        [Test]
        public void Not_Negates()
        {
            _board.Set("a", true);
            Assert.That(new Not(new SwitchIsOn("a")).Evaluate(_ctx), Is.False);
            _board.Set("a", false);
            Assert.That(new Not(new SwitchIsOn("a")).Evaluate(_ctx), Is.True);
        }

        [Test]
        public void EmptyLists_AllHolds_AnyDoesNot()
        {
            Assert.That(new AllOf().Evaluate(_ctx), Is.True, "architecture 7.2: empty AND holds");
            Assert.That(new AnyOf().Evaluate(_ctx), Is.False, "empty OR never holds");
            Assert.That(new Always().Evaluate(_ctx), Is.True);
            Assert.That(new Never().Evaluate(_ctx), Is.False);
        }

        [Test]
        public void NullEntries_CountAsFalse_AndWarn()
        {
            Assert.That(new AllOf(new Always(), null).Evaluate(_ctx), Is.False);
            Assert.That(new AnyOf(null, new Always()).Evaluate(_ctx), Is.True);
            Assert.That(new Not(null).Evaluate(_ctx), Is.True, "NOT of an empty entry (false) holds");
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "Empty condition"), Is.True);
        }

        [Test]
        public void AllOf_StopsAtFirstFalse_AnyOf_StopsAtFirstTrue()
        {
            _board.Set("a", false);
            new AllOf(new SwitchIsOn("a"), new SwitchIsOn("b"), new SwitchIsOn("c")).Evaluate(_ctx);
            Assert.That(_board.Evaluations, Is.EqualTo(1));

            _board.Evaluations = 0;
            _board.Set("a", true);
            new AnyOf(new SwitchIsOn("a"), new SwitchIsOn("b")).Evaluate(_ctx);
            Assert.That(_board.Evaluations, Is.EqualTo(1));
        }

        [TestCase(0, false)]
        [TestCase(1, false)]
        [TestCase(2, true)]
        [TestCase(3, true)]
        public void AtLeastNOf_CountsTrueEntries(int trueEntries, bool expected)
        {
            for (int i = 0; i < 3; i++)
            {
                _board.Set("s" + i, i < trueEntries);
            }

            var condition = new AtLeastNOf(2, new SwitchIsOn("s0"), new SwitchIsOn("s1"), new SwitchIsOn("s2"));
            Assert.That(condition.Evaluate(_ctx), Is.EqualTo(expected));
        }

        [Test]
        public void AtLeastNOf_StopsWhenTheResultIsCertain()
        {
            _board.Set("s0", false);
            _board.Set("s1", false);
            new AtLeastNOf(3, new SwitchIsOn("s0"), new SwitchIsOn("s1"), new SwitchIsOn("s2")).Evaluate(_ctx);
            Assert.That(_board.Evaluations, Is.EqualTo(1), "after one false entry 3 of 3 is impossible");
        }

        [Test]
        public void NestedTree_EvaluatesLikeTheFormula()
        {
            // (a AND NOT b) OR (at least 1 of [c])
            var tree = new AnyOf(new AllOf(new SwitchIsOn("a"), new Not(new SwitchIsOn("b"))), new AtLeastNOf(1, new SwitchIsOn("c")));
            _board.Set("a", true);
            Assert.That(tree.Evaluate(_ctx), Is.True);
            _board.Set("b", true);
            Assert.That(tree.Evaluate(_ctx), Is.False);
            _board.Set("c", true);
            Assert.That(tree.Evaluate(_ctx), Is.True);
        }

        [Test]
        public void Describe_ShowsTheStructure()
        {
            var tree = new AllOf(new SwitchIsOn("a"), new Not(new SwitchIsOn("b")));
            Assert.That(tree.Describe(), Is.EqualTo("(Schalter a UND NICHT Schalter b)"));
            Assert.That(new AnyOf(new SwitchIsOn("a"), null).Describe(), Is.EqualTo("(Schalter a ODER ?)"));
            Assert.That(new AtLeastNOf(2, new Always()).Describe(), Does.StartWith("mindestens 2 von"));
            Assert.That(new AllOf().ToString(), Is.EqualTo("immer (leeres UND)"));
        }

        [Test]
        public void ConditionEvaluator_NullHolds_ExceptionCountsAsFalse()
        {
            Assert.That(ConditionEvaluator.IsMet(null, _ctx), Is.True, "no condition = no requirement");
            Assert.That(ConditionEvaluator.Evaluate(null, _ctx), Is.False);
            Assert.That(ConditionEvaluator.IsMet(new ThrowingCondition(), _ctx), Is.False);
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1), "the exception is logged");
            Assert.That(_log.Sink.Dump(), Does.Contain("quest.test.logik"), "with the source id");
        }

        [Test]
        public void AllOf_WithThrowingEntry_IsFalseButDoesNotThrow()
        {
            Assert.That(new AllOf(new Always(), new ThrowingCondition()).Evaluate(_ctx), Is.False);
            Assert.That(new AnyOf(new ThrowingCondition(), new Always()).Evaluate(_ctx), Is.True);
        }
    }
}
