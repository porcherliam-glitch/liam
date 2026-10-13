using System.Linq;
using System.Text;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Atomic writing, backups, simulated failures and quarantine (architecture 9.4, <see cref="SaveSlotStorage"/>).</summary>
    [TestFixture]
    public sealed class SaveSlotStorageTests
    {
        private const string Character = "char_01";
        private InMemoryFileStore _files;
        private SaveSlotStorage _storage;

        private static byte[] Text(string text)
        {
            return Encoding.UTF8.GetBytes(text);
        }

        [SetUp]
        public void SetUp()
        {
            _files = new InMemoryFileStore();
            _storage = new SaveSlotStorage(_files, new SavePaths("/saves"));
        }

        [Test]
        public void WriteSlot_CreatesSaveAndHeader_AndLeavesNoTempFile()
        {
            StorageWriteResult result = _storage.WriteSlot(Character, "quick_0", Text("first"), Text("head1"));

            Assert.That(result.Success, Is.True, result.Message);
            Assert.That(_files.Get("/saves/char_01/quick_0.sav"), Is.EqualTo(Text("first")));
            Assert.That(_files.Get("/saves/char_01/quick_0.head.json"), Is.EqualTo(Text("head1")));
            Assert.That(_files.Paths.Any(p => p.EndsWith(".tmp")), Is.False);
            Assert.That(_storage.HasBackup(Character, "quick_0"), Is.False, "first save has no backup");
        }

        [Test]
        public void Overwriting_KeepsThePreviousVersionAsBackup()
        {
            _storage.WriteSlot(Character, "manual_001", Text("old"), Text("h"));
            _storage.WriteSlot(Character, "manual_001", Text("new"), Text("h"));

            Assert.That(_files.Get("/saves/char_01/manual_001.sav"), Is.EqualTo(Text("new")));
            Assert.That(_files.Get("/saves/char_01/manual_001.sav.bak"), Is.EqualTo(Text("old")));
            Assert.That(_storage.TryReadBackup(Character, "manual_001", out byte[] backup), Is.True);
            Assert.That(backup, Is.EqualTo(Text("old")));
        }

        [Test]
        public void FailingWrite_LeavesThePreviousSaveUntouched()
        {
            _storage.WriteSlot(Character, "quick_0", Text("good"), Text("h"));
            _files.FailNextWrite = true;

            StorageWriteResult result = _storage.WriteSlot(Character, "quick_0", Text("newer"), Text("h"));

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.WriteFailed));
            Assert.That(result.Message, Does.Contain("disk full"));
            Assert.That(_files.Get("/saves/char_01/quick_0.sav"), Is.EqualTo(Text("good")));
            Assert.That(_files.Paths.Any(p => p.EndsWith(".tmp")), Is.False);
        }

        [Test]
        public void DamagedWrite_FailsVerification_AndLeavesThePreviousSaveUntouched()
        {
            _storage.WriteSlot(Character, "quick_0", Text("good"), Text("h"));
            _files.CorruptNextWrite = true;

            StorageWriteResult result = _storage.WriteSlot(Character, "quick_0", Text("newer save"), Text("h"));

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.VerifyFailed));
            Assert.That(_files.Get("/saves/char_01/quick_0.sav"), Is.EqualTo(Text("good")));
            Assert.That(_files.Paths.Any(p => p.EndsWith(".tmp")), Is.False);
        }

        [Test]
        public void FailingReplace_LeavesThePreviousSaveUntouched()
        {
            _storage.WriteSlot(Character, "quick_0", Text("good"), Text("h"));
            _files.FailNextReplace = true;

            StorageWriteResult result = _storage.WriteSlot(Character, "quick_0", Text("newer"), Text("h"));

            Assert.That(result.Success, Is.False);
            Assert.That(_files.Get("/saves/char_01/quick_0.sav"), Is.EqualTo(Text("good")));
            Assert.That(_files.Paths.Any(p => p.EndsWith(".tmp")), Is.False);
        }

        [Test]
        public void Quarantine_MovesTheDamagedFileIntoBeschaedigt()
        {
            _storage.WriteSlot(Character, "auto_1", Text("broken"), Text("h"));

            string first = _storage.Quarantine(Character, "auto_1", "20261013T183000Z");
            _storage.WriteSlot(Character, "auto_1", Text("broken again"), Text("h"));
            string second = _storage.Quarantine(Character, "auto_1", "20261013T183000Z");

            Assert.That(InMemoryFileStore.Normalize(first), Is.EqualTo("/saves/char_01/Beschaedigt/auto_1_20261013T183000Z.sav"));
            Assert.That(second, Is.Not.EqualTo(first), "never overwrites an earlier damaged file");
            Assert.That(_files.Get(first), Is.EqualTo(Text("broken")));
            Assert.That(_storage.HasSave(Character, "auto_1"), Is.False);
            Assert.That(_storage.Quarantine(Character, "auto_1", "x"), Is.Null, "nothing left to move");
        }

        [Test]
        public void Quarantine_KeepsTheHeaderFile_SoTheSlotIsListedAsDamaged()
        {
            _storage.WriteSlot(Character, "quick_1", Text("broken"), Text("head"));

            _storage.Quarantine(Character, "quick_1", "20261013T183000Z");

            Assert.That(_storage.HasSave(Character, "quick_1"), Is.False);
            Assert.That(_storage.HasBackup(Character, "quick_1"), Is.False);
            Assert.That(_storage.HasHead(Character, "quick_1"), Is.True, "kept for the slot list (GDD 05 5.6) and error reports");
            Assert.That(_storage.ListSlotNames(Character), Is.EqualTo(new[] { "quick_1" }));
        }

        [Test]
        public void OrphanedTempFiles_AreDeleted()
        {
            _files.Put("/saves/char_01/quick_0.sav.tmp", Text("half"));
            _files.Put("/saves/char_02/manual_001.head.json.tmp", Text("half"));
            _files.Put("/saves/char_01/quick_0.sav", Text("keep"));

            int deleted = _storage.DeleteOrphanedTempFiles();

            Assert.That(deleted, Is.EqualTo(2));
            Assert.That(_files.FileExists("/saves/char_01/quick_0.sav"), Is.True);
        }

        [Test]
        public void ListSlotNames_ReadsHeadersAndSaves()
        {
            _storage.WriteSlot(Character, "quick_0", Text("a"), Text("h"));
            _files.Put("/saves/char_01/manual_001.sav", Text("no header"));
            _files.Put("/saves/char_01/Notes.txt", Text("x"));

            Assert.That(_storage.ListSlotNames(Character), Is.EqualTo(new[] { "manual_001", "quick_0" }));
        }
    }
}
