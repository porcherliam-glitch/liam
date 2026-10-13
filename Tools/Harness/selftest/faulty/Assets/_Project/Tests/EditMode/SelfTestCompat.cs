using System;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    public sealed class SelfTestCompat
    {
        [Test]
        public void UsesApisMissingInUnity()
        {
            object value = new object();
            ArgumentNullException.ThrowIfNull(value);
            Assert.Multiple(() =>
            {
                Assert.IsNotNull(value);
            });
        }
    }
}
