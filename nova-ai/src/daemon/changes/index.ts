// Barrel of the change journal (part of the tools module). Re-exported by src/daemon/tools/index.ts.
// Public API: createChangeJournal (ChangeJournal contract) and the dependency-free unifiedDiff helper.
export { createChangeJournal, type ChangeJournalOptions, type JournalCrashStage } from './journal';
export { unifiedDiff } from './diff';
