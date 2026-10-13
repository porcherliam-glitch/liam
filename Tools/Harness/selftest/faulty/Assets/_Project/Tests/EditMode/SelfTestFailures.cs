using System;
using System.Threading.Tasks;
using Aetherfall.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Aetherfall.Tests.EditMode
{
    public sealed class SelfTestFailures
    {
        [Test]
        public void Add_ReturnsSum()
        {
            Assert.AreEqual(5, Calculator.Add(2, 3));
        }

        [Test]
        public void Add_DeliberatelyWrong()
        {
            Assert.AreEqual(4, Calculator.Add(1, 2), "SELF-TEST: deliberate failure");
        }

        [Test]
        public void TouchesUnityRuntime()
        {
            Assert.Greater(Time.deltaTime, -1f);
        }

        [Test]
        public async Task AwaitsTheSameAwaitableTwice()
        {
            Awaitable awaitable = Awaitable.NextFrameAsync();
            await awaitable;
            await awaitable;
        }

        [Test]
        public void ExpectsUnityLog()
        {
            LogAssert.Expect(LogType.Error, "boom");
        }
    }
}
