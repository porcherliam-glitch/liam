using System;
using Aetherfall.Player;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Test helper: moves a point with <see cref="PlayerMovementModel"/> over an infinite ground plane through the origin
    /// with the normal <see cref="GroundNormal"/>, like a CharacterController that cannot sink into the ground.
    /// Pure C#, no Unity calls.
    /// </summary>
    public sealed class MovementSimulator
    {
        /// <summary>Creates a simulator standing on flat ground.</summary>
        /// <param name="tuning">Tuning; null = GDD defaults.</param>
        public MovementSimulator(PlayerMovementTuning tuning = null)
        {
            Model = new PlayerMovementModel(tuning ?? PlayerMovementTuning.CreateDefault());
            GroundNormal = MotionVector.Up;
            HasGround = true;
        }

        /// <summary>The model under test.</summary>
        public PlayerMovementModel Model { get; }

        /// <summary>Position along X.</summary>
        public float X { get; private set; }

        /// <summary>Height (world Y).</summary>
        public float Y { get; set; }

        /// <summary>Position along Z.</summary>
        public float Z { get; private set; }

        /// <summary>Normal reported while touching the ground.</summary>
        public MotionVector GroundNormal { get; set; }

        /// <summary>False simulates a hole: no ground contact at all (walked off a ledge).</summary>
        public bool HasGround { get; set; }

        /// <summary>Highest height reached since the last <see cref="ResetMaxHeight"/>.</summary>
        public float MaxHeight { get; private set; }

        /// <summary>True if the point touches the ground plane.</summary>
        public bool TouchesGround => HasGround && Y <= GroundHeight + 1e-4f;

        /// <summary>Height of the ground plane below the current position.</summary>
        public float GroundHeight => -(GroundNormal.X * X + GroundNormal.Z * Z) / GroundNormal.Y;

        /// <summary>Forgets the highest height.</summary>
        public void ResetMaxHeight()
        {
            MaxHeight = Y;
        }

        /// <summary>Runs one step and integrates the position.</summary>
        /// <param name="input">Commands.</param>
        /// <param name="deltaTime">Frame time.</param>
        public MotionVector Step(PlayerMovementInput input, float deltaTime)
        {
            var contact = new GroundContact(TouchesGround, GroundNormal);
            MotionVector velocity = Model.Step(input, contact, deltaTime);
            X += velocity.X * deltaTime;
            Y += velocity.Y * deltaTime;
            Z += velocity.Z * deltaTime;
            if (HasGround && Y < GroundHeight)
            {
                Y = GroundHeight;
            }

            MaxHeight = Math.Max(MaxHeight, Y);
            return velocity;
        }

        /// <summary>Runs <paramref name="steps"/> identical steps (presses only in the first one).</summary>
        /// <param name="input">Commands.</param>
        /// <param name="deltaTime">Frame time.</param>
        /// <param name="steps">Number of steps.</param>
        public MotionVector Run(PlayerMovementInput input, float deltaTime, int steps)
        {
            MotionVector velocity = MotionVector.Zero;
            for (int i = 0; i < steps; i++)
            {
                velocity = Step(input, deltaTime);
                input.JumpPressed = false;
                input.SprintPressed = false;
                input.SneakPressed = false;
                input.WalkTogglePressed = false;
                input.SprintSneakShared = false;
            }

            return velocity;
        }

        /// <summary>Input with only a movement vector (camera yaw 0).</summary>
        /// <param name="x">Right.</param>
        /// <param name="y">Forward.</param>
        public static PlayerMovementInput Move(float x, float y)
        {
            return new PlayerMovementInput { MoveX = x, MoveY = y };
        }
    }
}
