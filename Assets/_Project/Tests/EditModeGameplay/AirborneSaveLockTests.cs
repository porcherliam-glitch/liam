using System;
using System.IO;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Save lock "falling, jumping" of the player (architecture 9.8, GDD 05 5.2): <see cref="AirborneSaveLock"/> fed with
    /// <see cref="PlayerMovementModel.IsAirborne"/> against a real <see cref="SaveManager"/>.
    /// </summary>
    [TestFixture]
    public sealed class AirborneSaveLockTests
    {
        private const float Dt = 0.005f;

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _gameState;
        private SaveManager _saves;
        private string _root;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _gameState = new GameStateService(_bus, new FakeTimeScaleService());
            _gameState.SwitchBase(GameState.MainMenu, "test");
            _gameState.SwitchBase(GameState.Loading, "test");
            _gameState.SwitchBase(GameState.Playing, "test");
            _root = Path.Combine(Path.GetTempPath(), "aetherfall-lock-" + Guid.NewGuid().ToString("N"));
            _saves = new SaveManager(_bus, _gameState, new SystemFileStore(), new FixedSaveLocation(_root),
                new SaveManagerSettings { UseBackgroundThread = false });
        }

        [TearDown]
        public void TearDown()
        {
            _saves.Dispose();
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, true);
            }

            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Jump_LocksSaving_UntilTheLanding()
        {
            var sim = new MovementSimulator();
            var saveLock = new AirborneSaveLock(_saves);
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            saveLock.Update(sim.Model.IsAirborne);
            Assert.That(_saves.IsSaveAllowed(out _), Is.True, "standing");

            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);
            saveLock.Update(sim.Model.IsAirborne);

            Assert.That(_saves.IsSaveAllowed(out string reason), Is.False);
            Assert.That(reason, Is.EqualTo(SaveReasonKeys.Falling));
            Assert.That(SaveReasonKeys.ToGermanText(reason), Does.Contain("Fallen"));
            SaveResult refused = _saves.Save(SaveRequest.Quick());
            Assert.That(refused.Success, Is.False);
            Assert.That(refused.ReasonKey, Is.EqualTo("save.blocked.falling"));
            Assert.That(Directory.Exists(_root), Is.False, "nothing written in the air");

            int steps = 0;
            while (!sim.Model.IsGrounded && steps < 600)
            {
                sim.Step(MovementSimulator.Move(0f, 0f), Dt);
                saveLock.Update(sim.Model.IsAirborne);
                steps++;
            }

            Assert.That(sim.Model.IsGrounded, Is.True);
            Assert.That(saveLock.IsLocked, Is.False);
            Assert.That(_saves.IsSaveAllowed(out _), Is.True, "allowed again after the landing");
        }

        [Test]
        public void Lock_ComesBackAfterTheSaveManagerDroppedItsLocks_AndReleaseRemovesIt()
        {
            var saveLock = new AirborneSaveLock(_saves);
            saveLock.Update(true);
            _saves.NewGame(default);
            Assert.That(_saves.IsSaveAllowed(out _), Is.True, "a new game drops all locks");

            saveLock.Update(true);
            Assert.That(_saves.IsSaveAllowed(out string reason), Is.False, "renewed in the next frame");
            Assert.That(reason, Is.EqualTo(SaveReasonKeys.Falling));

            saveLock.Release();
            Assert.That(saveLock.IsLocked, Is.False);
            Assert.That(_saves.IsSaveAllowed(out _), Is.True);
            Assert.Throws<ArgumentNullException>(() => new AirborneSaveLock(null));
        }
    }
}
