using Aetherfall.Combat;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="CombatStateMachine"/> (§9.8, GDD 03 3.2, 4.3–4.10): combo window and reset, input buffer, stamina stop,
    /// heavy charge levels and hyperarmor, block, parry window and relock, counter, guard break, dodge with i-frames and
    /// cancel rules, stagger, sprint/jump attack, finisher, movement limits and hit windows.
    /// </summary>
    [TestFixture]
    public sealed class CombatStateMachineTests
    {
        private const float Step = 0.01f;

        private ResourcePool _stamina;
        private RecordingHitWindow _window;
        private CombatStateMachine _machine;

        [SetUp]
        public void SetUp()
        {
            _stamina = CombatTestData.CreateStamina();
            _window = new RecordingHitWindow();
            _machine = new CombatStateMachine(CombatTuning.CreateDefault(), CombatTestData.CreateSword(), _stamina, _window, 20f);
        }

        private void Press(CombatInput input)
        {
            _machine.Tick(Step, input);
        }

        private void Run(float seconds, CombatInput held = default)
        {
            int steps = (int)System.Math.Round(seconds / Step);
            for (int i = 0; i < steps; i++)
            {
                _machine.Tick(Step, held);
            }
        }

        private void RunUntilAttackElapsed(float elapsed)
        {
            int guard = 0;
            while (_machine.AttackElapsed < elapsed - 0.0001f && _machine.State == CombatStateId.Attacking && guard++ < 1000)
            {
                _machine.Tick(Step, default);
            }
        }

        private static CombatInput Light => new CombatInput { LightPressed = true };

        [Test]
        public void LightPress_StartsFirstComboStep_AndPaysStamina()
        {
            Press(Light);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.ComboStep, Is.EqualTo(0));
            Assert.That(_machine.CurrentAttack.Id, Is.EqualTo("leicht_1"));
            Assert.That(_stamina.Current, Is.EqualTo(88f));
        }

        [Test]
        public void ComboWindow_BufferedPressBeforeTheWindow_ChainsWhenTheWindowOpens()
        {
            Press(Light);
            RunUntilAttackElapsed(0.3f);
            Press(Light);

            Assert.That(_machine.ComboStep, Is.EqualTo(0), "0.3 s is before the combo window (0.45 s)");
            RunUntilAttackElapsed(0.44f);
            Run(0.03f);

            Assert.That(_machine.ComboStep, Is.EqualTo(1));
            Assert.That(_machine.CurrentAttack.Id, Is.EqualTo("leicht_2"));
        }

        [Test]
        public void InputBuffer_PressMoreThan200MsBeforeTheWindow_IsDropped()
        {
            Press(Light);
            RunUntilAttackElapsed(0.2f);
            Press(Light);
            RunUntilAttackElapsed(0.6f);

            Assert.That(_machine.ComboStep, Is.EqualTo(0));
            Assert.That(_machine.CurrentAttack.Id, Is.EqualTo("leicht_1"));
        }

        [Test]
        public void ComboReset_NextStepWithin06SecondsAfterTheAttack_ElseFirstStep()
        {
            Press(Light);
            Run(0.9f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));

            Run(0.3f);
            Press(Light);
            Assert.That(_machine.ComboStep, Is.EqualTo(1), "within 0.6 s the combo continues");

            Run(0.9f);
            Run(0.7f);
            Press(Light);
            Assert.That(_machine.ComboStep, Is.EqualTo(0), "after 0.6 s without input the combo starts again");
        }

        [Test]
        public void Combo_FourStepsInARow_EndsWithTheComboFinisher_ThenStartsAgain()
        {
            Press(Light);
            for (int i = 1; i < 4; i++)
            {
                RunUntilAttackElapsed(0.44f);
                Press(Light);
                Run(0.02f);
                Assert.That(_machine.ComboStep, Is.EqualTo(i));
            }

            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.ComboFinisher));
            RunUntilAttackElapsed(0.44f);
            Press(Light);
            Run(0.02f);
            Assert.That(_machine.ComboStep, Is.EqualTo(0));
        }

        [Test]
        public void Stamina_EmptyPool_NoAttackStarts()
        {
            _stamina.Spend(100f);

            Press(Light);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void Stamina_ComboStopsWhenTheStaminaIsUsedUp()
        {
            _stamina.SetCurrent(20f);
            Press(Light);
            RunUntilAttackElapsed(0.44f);
            Press(Light);
            Run(0.02f);
            Assert.That(_machine.ComboStep, Is.EqualTo(1), "the second hit may use the last 8 stamina (GDD 03 4.3)");
            Assert.That(_stamina.Current, Is.EqualTo(0f));

            RunUntilAttackElapsed(0.44f);
            Press(Light);
            Run(0.02f);
            Assert.That(_machine.ComboStep, Is.EqualTo(1), "no third hit without stamina");
            Run(1f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void Heavy_TapReleasesTheUnchargedAttack()
        {
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Charging));

            Press(default);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.CurrentAttack.ChargeLevel, Is.EqualTo(0));
            Assert.That(_machine.CurrentAttack.DamageMultiplier, Is.EqualTo(1.5f));
            Assert.That(_stamina.Current, Is.EqualTo(76f));
        }

        [Test]
        public void Heavy_Hold07Seconds_ReleasesLevelOne_WithExtraStamina()
        {
            var hold = new CombatInput { HeavyHeld = true };
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Run(0.7f, hold);
            Assert.That(_machine.ChargeLevel, Is.EqualTo(1));

            Press(default);

            Assert.That(_machine.CurrentAttack.ChargeLevel, Is.EqualTo(1));
            Assert.That(_machine.CurrentAttack.DamageMultiplier, Is.EqualTo(1.9f));
            Assert.That(_machine.CurrentAttack.PoiseMultiplier, Is.EqualTo(2.0f));
            Assert.That(_stamina.Current, Is.EqualTo(70f).Within(0.001f));
        }

        [Test]
        public void Heavy_HoldingTwoSeconds_ReleasesLevelTwoAutomatically()
        {
            var hold = new CombatInput { HeavyHeld = true };
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Run(2.05f, hold);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.CurrentAttack.ChargeLevel, Is.EqualTo(2));
            Assert.That(_machine.CurrentAttack.DamageMultiplier, Is.EqualTo(2.3f));
            Assert.That(_stamina.Current, Is.EqualTo(64f).Within(0.001f));
        }

        [Test]
        public void Heavy_HyperArmorFrom03SecondsOfCharging_DoublesTheStability()
        {
            var hold = new CombatInput { HeavyHeld = true };
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Run(0.2f, hold);
            Assert.That(_machine.HasHyperArmor, Is.False);

            Run(0.15f, hold);
            Assert.That(_machine.HasHyperArmor, Is.True);
            Assert.That(_machine.ApplyPoiseDamage(25f), Is.EqualTo(StaggerKind.None), "stability 20 x 2 = 40 > 25");
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Charging));
        }

        [Test]
        public void ParryWindow_OpenFor150Ms_ThenBlock()
        {
            var hold = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Blocking));
            Assert.That(_machine.IsParryWindowOpen, Is.True);
            Run(0.1f, hold);
            Assert.That(_machine.IsParryWindowOpen, Is.True);

            Run(0.06f, hold);

            Assert.That(_machine.IsParryWindowOpen, Is.False);
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Blocked));
        }

        [Test]
        public void Parry_InTheWindow_ParriesAndOpensTheCounterWindow()
        {
            bool parried = false;
            _machine.Parried += () => parried = true;
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });

            DefenseOutcome outcome = _machine.EvaluateIncoming(10f, false, false);

            Assert.That(outcome, Is.EqualTo(DefenseOutcome.Parried));
            Assert.That(parried, Is.True);
            Assert.That(_machine.IsCounterWindowOpen, Is.True);
        }

        [Test]
        public void Block_CoversOnlyTheShieldAngle_AndNotUnblockableAttacks()
        {
            var hold = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Assert.That(_machine.EvaluateIncoming(0f, false, true), Is.EqualTo(DefenseOutcome.Blocked), "unparryable is blocked in the window");
            Run(0.2f, hold);

            Assert.That(_machine.EvaluateIncoming(70f, false, false), Is.EqualTo(DefenseOutcome.Blocked), "wooden shield covers 150 degrees");
            Assert.That(_machine.EvaluateIncoming(80f, false, false), Is.EqualTo(DefenseOutcome.Hit));
            Assert.That(_machine.EvaluateIncoming(180f, false, false), Is.EqualTo(DefenseOutcome.Hit));
            Assert.That(_machine.EvaluateIncoming(0f, true, false), Is.EqualTo(DefenseOutcome.Hit));
        }

        [Test]
        public void Parry_PressingAgainSoonerThan400MsAfterReleasing_OpensNoWindow()
        {
            var hold = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Run(0.3f, hold);
            Press(default);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));

            Run(0.2f);
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Blocking));
            Assert.That(_machine.IsParryWindowOpen, Is.False);

            Run(0.1f, hold);
            Press(default);
            Run(0.45f);
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Assert.That(_machine.IsParryWindowOpen, Is.True);
        }

        [Test]
        public void Counter_LightAttackAfterAParry_IsTheCounterWithoutStamina()
        {
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            _machine.EvaluateIncoming(0f, false, false);

            Press(new CombatInput { LightPressed = true, BlockHeld = true });

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Counter));
            Assert.That(_stamina.Current, Is.EqualTo(100f));
        }

        [Test]
        public void Counter_WindowClosesAfterOneSecond()
        {
            var hold = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            _machine.EvaluateIncoming(0f, false, false);
            Run(1.05f, hold);

            Assert.That(_machine.IsCounterWindowOpen, Is.False);
            Press(new CombatInput { LightPressed = true, BlockHeld = true });
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Light));
        }

        [Test]
        public void GuardBreak_BlockedHitEmptiesTheStamina_Staggers1Second()
        {
            _stamina.SetCurrent(10f);
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });

            StaggerKind kind = _machine.ApplyBlockedHit(15f);

            Assert.That(kind, Is.EqualTo(StaggerKind.GuardBreak));
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Staggered));
            Assert.That(_machine.StaggerRemaining, Is.EqualTo(1.0f));
            Run(1.02f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void Block_StaminaCostWithoutBreak_KeepsTheGuard_AndHalvesRegeneration()
        {
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });

            Assert.That(_machine.ApplyBlockedHit(18f), Is.EqualTo(StaggerKind.None));
            Assert.That(_stamina.Current, Is.EqualTo(82f));
            Assert.That(_stamina.RegenMultiplier, Is.EqualTo(0.5f));
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Slowed));
            Assert.That(_machine.Movement.SpeedLimit, Is.EqualTo(2.5f));

            Press(default);
            Run(0.2f);
            Assert.That(_stamina.RegenMultiplier, Is.EqualTo(1f));
        }

        [Test]
        public void Dodge_RollHasIFramesFrom50To350Ms()
        {
            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dodging));
            Assert.That(_machine.IsRoll, Is.True);
            Assert.That(_stamina.Current, Is.EqualTo(88f));
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Hit), "0 ms: before the i-frames");

            Run(0.06f);
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Evaded));
            Run(0.28f);
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Evaded), "340 ms");
            Run(0.02f);
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Hit), "360 ms: after the i-frames");
            Run(0.25f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle), "roll lasts 550 ms");
        }

        [Test]
        public void Dodge_WithoutDirection_IsTheBackStep()
        {
            Press(new CombatInput { DodgePressed = true });

            Assert.That(_machine.IsRoll, Is.False);
            Assert.That(_stamina.Current, Is.EqualTo(92f));
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Forced));
            Assert.That(_machine.Movement.ForcedSpeed, Is.EqualTo(2f / 0.35f).Within(0.001f));
        }

        [Test]
        public void Dodge_ExhaustedOrEmptyStamina_NotPossible()
        {
            _stamina.Spend(100f);
            Assert.That(_stamina.IsExhausted, Is.True);

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void Dodge_CancelsALightAttackInTheWindup()
        {
            Press(Light);
            RunUntilAttackElapsed(0.1f);

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dodging));
            Assert.That(_window.Opened.Count, Is.EqualTo(0), "cancelled before the hit window");
        }

        [Test]
        public void Dodge_InTheActivePhase_WaitsInTheBufferUntilTheRecovery()
        {
            Press(Light);
            RunUntilAttackElapsed(0.25f);

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking), "no cancel in the active phase");

            Run(0.09f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dodging), "the buffered dodge runs at the start of the recovery");
        }

        [Test]
        public void Dodge_HeavyAttackOnlyCancelsInTheRecovery()
        {
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Press(default);
            RunUntilAttackElapsed(0.2f);

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });
            Run(0.3f);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Heavy));
        }

        [Test]
        public void Buffer_DodgeOverridesABufferedAttack()
        {
            Press(Light);
            RunUntilAttackElapsed(0.22f);

            Press(new CombatInput { LightPressed = true, DodgePressed = true, HasMoveInput = true });
            Run(0.12f);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dodging));
        }

        [Test]
        public void Stability_SumWithin3Seconds_Staggers_SingleBigHit_KnocksDown()
        {
            Assert.That(_machine.ApplyPoiseDamage(12f), Is.EqualTo(StaggerKind.None));
            Run(1f);
            Assert.That(_machine.ApplyPoiseDamage(10f), Is.EqualTo(StaggerKind.Stagger));
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Staggered));
            Assert.That(_machine.StaggerRemaining, Is.EqualTo(0.5f));
            Run(0.6f);

            Assert.That(_machine.ApplyPoiseDamage(40f), Is.EqualTo(StaggerKind.Knockdown));
            Assert.That(_machine.StaggerRemaining, Is.EqualTo(1.2f));
        }

        [Test]
        public void Stagger_CancelsTheRunningAttack_AndClosesTheHitWindow()
        {
            Press(Light);
            RunUntilAttackElapsed(0.25f);
            Assert.That(_window.IsOpen, Is.True);

            _machine.ApplyPoiseDamage(30f);

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Staggered));
            Assert.That(_window.IsOpen, Is.False);
        }

        [Test]
        public void SprintAttack_AfterHalfASecondOfSprint_JumpAttack_InTheAir()
        {
            Press(new CombatInput { LightPressed = true, SprintSeconds = 0.4f });
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Light));

            _machine.Reset();
            Press(new CombatInput { LightPressed = true, SprintSeconds = 0.6f });
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Sprint));
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Locked), "the lunge starts in the second half of the wind-up");
            RunUntilAttackElapsed(0.15f);
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Forced));

            _machine.Reset();
            Press(new CombatInput { LightPressed = true, IsAirborne = true });
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Jump));
        }

        [Test]
        public void Finisher_WithATargetInRange_IsInvulnerable_AndOpensItsHitWindowOnce()
        {
            Press(new CombatInput { LightPressed = true, FinisherAvailable = true });

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Finisher));
            Assert.That(_machine.IsInvulnerable, Is.True);
            Assert.That(_stamina.Current, Is.EqualTo(100f));
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Evaded));

            Run(1.65f);
            Assert.That(_window.Opened.Count, Is.EqualTo(1));
            Assert.That(_window.Opened[0].Kind, Is.EqualTo(AttackKind.Finisher));
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void HitWindow_OpensAtTheEndOfTheWindup_AndClosesAfterTheActiveTime()
        {
            Press(Light);
            RunUntilAttackElapsed(0.19f);
            Assert.That(_window.Opened.Count, Is.EqualTo(0));

            RunUntilAttackElapsed(0.21f);
            Assert.That(_window.IsOpen, Is.True);
            Assert.That(_machine.AttackPhase, Is.EqualTo(AttackPhase.Active));

            RunUntilAttackElapsed(0.33f);
            Assert.That(_window.IsOpen, Is.False);
            Assert.That(_window.Opened.Count, Is.EqualTo(1));
            Assert.That(_window.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void Movement_AttackWithoutLungeIsLocked_IdleIsFree()
        {
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Free));
            Press(Light);
            Assert.That(_machine.Movement.Mode, Is.EqualTo(CombatMovementMode.Locked));
        }

        [Test]
        public void Kill_StopsEverything_ResetReturnsToIdle()
        {
            Press(Light);
            _machine.Kill();

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dead));
            Press(Light);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Dead));
            Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Ignored));

            _machine.Reset();
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));
        }

        [Test]
        public void Finisher_PressBufferedInTheRecovery_RunsAsFinisherWhenItExecutes()
        {
            // Guide 05, 7.1: the 4th hit breaks the poise and the next click comes at once (recovery, before the combo
            // window). The owner fills FinisherAvailable whenever NeedsFinisherCheck asks for it, like the player controller.
            Press(Light);
            for (int i = 1; i < 4; i++)
            {
                RunUntilAttackElapsed(0.44f);
                Press(Light);
                Run(0.02f);
            }

            Assert.That(_machine.ComboStep, Is.EqualTo(3));
            RunUntilAttackElapsed(0.35f);
            var press = new CombatInput { LightPressed = true };
            press.FinisherAvailable = _machine.NeedsFinisherCheck(press);
            Press(press);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking), "buffered until the combo window (0.45 s)");

            int guard = 0;
            while (_machine.State == CombatStateId.Attacking && guard++ < 100)
            {
                CombatInput frame = default;
                Assert.That(_machine.NeedsFinisherCheck(frame), Is.True, "the press still waits in the buffer");
                frame.FinisherAvailable = true;
                Press(frame);
            }

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Finisher));
            Assert.That(_machine.NeedsFinisherCheck(default), Is.False);
        }

        [Test]
        public void Block_DodgeWithoutStamina_KeepsTheGuardUp()
        {
            _stamina.Spend(100f);
            var hold = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Run(0.2f, hold);
            int changes = 0;
            _machine.StateChanged += (from, to) => changes++;

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true, BlockHeld = true });
            for (int i = 0; i < 16; i++)
            {
                Assert.That(_machine.EvaluateIncoming(0f, false, false), Is.EqualTo(DefenseOutcome.Blocked), "frame " + i);
                Press(hold);
            }

            Assert.That(changes, Is.EqualTo(0), "no switching between Blocking and Idle");
            Assert.That(_machine.Buffer.Pending, Is.EqualTo(BufferedAction.None), "the dodge that cannot be paid is dropped");
        }

        [Test]
        public void Dodge_WhileExhausted_IsDropped_SoTheNextAttackPressCounts()
        {
            _stamina.Spend(100f);
            _stamina.Restore(30f);
            Assert.That(_stamina.IsExhausted, Is.True, "Setup: stamina above 0, but still exhausted (no roll for 1.2 s).");

            Press(new CombatInput { DodgePressed = true, HasMoveInput = true });
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));

            Press(Light);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking), "an attack is not blocked by a dodge waiting in the buffer");
        }

        [Test]
        public void Parry_AfterATap_TheRelockCountsFromTheRelease()
        {
            // Tap: held for one frame; the guard stays up until the 150 ms window has passed.
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Press(default);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Blocking), "the parry window keeps the guard up");
            Run(0.15f);
            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Idle));

            Run(0.27f);
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });

            Assert.That(_machine.IsParryWindowOpen, Is.True, "0.43 s after releasing the button (GDD 03 4.8: 400 ms)");
        }

        [Test]
        public void Parry_PressBufferedDuringAnAttack_KeepsItsWindowIfReleasedBeforeItRuns()
        {
            Press(Light);
            RunUntilAttackElapsed(0.25f);
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Press(default);

            int guard = 0;
            while (_machine.State == CombatStateId.Attacking && guard++ < 50)
            {
                Press(default);
            }

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Blocking), "the buffered parry runs in the recovery");
            Assert.That(_machine.IsParryWindowOpen, Is.True, "judged at the press, not when the buffer runs");
        }

        [Test]
        public void Counter_HeavyAttackWhileStillHoldingBlock_IsTheCounter()
        {
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            _machine.EvaluateIncoming(0f, false, false);

            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true, BlockHeld = true });

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Attacking));
            Assert.That(_machine.CurrentAttack.Kind, Is.EqualTo(AttackKind.Counter));
            Assert.That(_stamina.Current, Is.EqualTo(100f));
        }

        [Test]
        public void Pause_HeldButtonsWithoutTime_KeepTheChargeAndTheGuard()
        {
            // Paused (time scale 0): the controller passes only the held buttons, with 0 s.
            var charge = new CombatInput { HeavyHeld = true };
            Press(new CombatInput { HeavyPressed = true, HeavyHeld = true });
            Run(0.4f, charge);
            for (int i = 0; i < 30; i++)
            {
                _machine.Tick(0f, charge);
            }

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Charging));
            Assert.That(_stamina.Current, Is.EqualTo(100f), "nothing released, nothing paid");

            _machine.Reset();
            var guard = new CombatInput { BlockHeld = true };
            Press(new CombatInput { BlockPressed = true, BlockHeld = true });
            Run(0.2f, guard);
            for (int i = 0; i < 30; i++)
            {
                _machine.Tick(0f, guard);
            }

            Assert.That(_machine.State, Is.EqualTo(CombatStateId.Blocking));
        }

        [Test]
        public void InvalidSetup_Throws()
        {
            WeaponSpec weapon = CombatTestData.CreateSword();
            weapon.Heavy = null;

            Assert.That(() => new CombatStateMachine(CombatTuning.CreateDefault(), weapon), Throws.ArgumentException);
        }
    }
}
