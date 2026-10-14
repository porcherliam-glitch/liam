using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>
    /// Contexts of conditions and actions (architecture 7.3): services come through the context (the only allowed locator use
    /// in data classes), the subject defaults to the player, source and target reach every nested condition and action, and
    /// the action runner keeps the list order, survives failing and empty entries.
    /// </summary>
    [TestFixture]
    public sealed class ConditionContextTests
    {
        private LogCapture _log;
        private SwitchBoard _board;
        private ServiceLocator _services;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _board = new SwitchBoard();
            _services = new ServiceLocator();
            _services.Register(_board);
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        [Test]
        public void Subject_DefaultsToPlayer()
        {
            var ctx = new ConditionContext(_services, null, null, null);

            Assert.That(ctx.SubjectId, Is.EqualTo(SubjectIds.Player));
            Assert.That(ctx.TargetId, Is.Empty);
            Assert.That(ctx.SourceId, Is.Empty);
            Assert.That(new ActionContext(_services, string.Empty, null, "dlg.x").SubjectId, Is.EqualTo("player"));
        }

        [Test]
        public void Contexts_ConvertWithoutLosingData()
        {
            var action = new ActionContext(_services, "npc.eichental.harrik", "npc.eichental.hollmann", "dlg.eichental.verhandlung");
            ConditionContext condition = action.ToConditionContext();

            Assert.That(condition.Services, Is.SameAs(_services));
            Assert.That(condition.SubjectId, Is.EqualTo("npc.eichental.harrik"));
            Assert.That(condition.TargetId, Is.EqualTo("npc.eichental.hollmann"));
            Assert.That(condition.SourceId, Is.EqualTo("dlg.eichental.verhandlung"));
            Assert.That(condition.ToActionContext().SourceId, Is.EqualTo("dlg.eichental.verhandlung"));
        }

        [Test]
        public void NestedConditions_SeeTheSameSourceAndSubject()
        {
            var ctx = new ConditionContext(_services, "npc.eichental.harrik", string.Empty, "quest.test.kontext");
            new AllOf(new SwitchIsOn("a"), new Not(new AnyOf(new SwitchIsOn("b")))).Evaluate(ctx);

            Assert.That(_board.Sources, Is.All.EqualTo("quest.test.kontext"));
            Assert.That(_board.Subjects, Is.All.EqualTo("npc.eichental.harrik"));
            Assert.That(_board.Sources.Count, Is.EqualTo(1), "AND stops after the first false entry");
        }

        [Test]
        public void Get_WithoutLocator_ThrowsWithTheServiceName()
        {
            var ctx = new ConditionContext(null, "player", string.Empty, "quest.x");
            var ex = Assert.Throws<InvalidOperationException>(() => ctx.Get<SwitchBoard>());
            Assert.That(ex.Message, Does.Contain("SwitchBoard"));
            Assert.That(ConditionEvaluator.IsMet(new SwitchIsOn("a"), ctx), Is.False, "the evaluator turns it into false");
        }

        [Test]
        public void ActionRunner_RunsInOrder_AndContinuesAfterFailures()
        {
            var ctx = ActionContext.ForPlayer(_services, "quest.test.aktionen");
            int ok = ActionRunner.Run(new GameAction[] { new LogAction("eins"), new ThrowingAction(), null, new LogAction("zwei") }, ctx);

            Assert.That(ok, Is.EqualTo(2));
            Assert.That(_board.Log, Is.EqualTo(new[] { "eins", "zwei" }));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1), "the failing action is logged");
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "Empty action"), Is.True, "the empty entry is logged");
            Assert.That(ActionRunner.Run((GameAction[])null, ctx), Is.EqualTo(0));
        }

        [Test]
        public void ConditionalAction_RunsThenOrElse()
        {
            var ctx = ActionContext.ForPlayer(_services, "quest.test.wenn");
            var action = new ConditionalAction(new SwitchIsOn("a"), new GameAction[] { new LogAction("dann") }, new GameAction[] { new LogAction("sonst") });

            action.Execute(ctx);
            _board.Set("a", true);
            action.Execute(ctx);
            new ConditionalAction(null, new GameAction[] { new LogAction("ohne Bedingung") }).Execute(ctx);

            Assert.That(_board.Log, Is.EqualTo(new[] { "sonst", "dann", "ohne Bedingung" }));
            Assert.That(_board.Sources, Is.All.EqualTo("quest.test.wenn"), "the inner condition and actions see the same source");
        }

        [Test]
        public void ConditionalAction_ValidatesItsChildren()
        {
            var report = new ValidationReport();
            new ConditionalAction(new AllOf(null), new GameAction[] { null }).Validate(report);

            Assert.That(report.CountOf(ValidationReportExtensions.MissingTypeCode), Is.EqualTo(2));
        }
    }
}
