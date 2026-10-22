import { describe, it, expect } from 'vitest';
import {
  failureSignature,
  parseCheckOutput,
  parseCompilerErrors,
  parseDotnetTest,
  parseEslintStylish,
  parseGenericErrors,
  parseJest,
  parseMocha,
  parseNodeTest,
  parseNunitXml,
  parsePytest,
  parseTrx,
  parseVitest,
  stripAnsi,
  toProjectRelative,
} from './parsers';

const ROOT = '/home/u/proj';
const ctx = { root: ROOT, platform: 'linux' as const };
const WIN = { root: 'C:\\Users\\Ada\\NOVA Projekte\\Calc', platform: 'win32' as const };

// Recorded with vitest 3.2.7 (CI=1, NO_COLOR=1).
const VITEST = `
 RUN  v3.2.7 ${ROOT}

 ❯ src/math.test.ts (3 tests | 1 failed | 1 skipped) 9ms
   ✓ math > adds numbers 1ms
   × math > fails numbers 7ms
     → expected 3 to be 4 // Object.is equality
   ↓ math > skipped one
 ✓ src/ok.test.ts (1 test) 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/math.test.ts > math > fails numbers
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 3

 ❯ src/math.test.ts:4:45
      2| describe('math', () => {
      3|   it('adds numbers', () => { expect(1 + 2).toBe(3); });
      4|   it('fails numbers', () => { expect(1 + 2).toBe(4); });
       |                                             ^
      5|   it.skip('skipped one', () => {});
      6| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 2 passed | 1 skipped (4)
   Start at  08:33:50
   Duration  315ms (transform 82ms, setup 0ms, collect 68ms, tests 12ms, environment 1ms, prepare 173ms)
`;

// Recorded with Node 22.22 (node --test, non-TTY → TAP).
const NODE_TAP = `TAP version 13
# Subtest: math
    # Subtest: adds
    ok 1 - adds
      ---
      duration_ms: 0.997433
      type: 'test'
      ...
    # Subtest: fails
    not ok 2 - fails
      ---
      duration_ms: 1.221898
      type: 'test'
      location: '${ROOT}/tests/a.test.mjs:5:3'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:

        3 !== 4

      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: 4
      actual: 3
      operator: 'strictEqual'
      stack: |-
        TestContext.<anonymous> (file://${ROOT}/tests/a.test.mjs:5:32)
        Test.runInAsyncScope (node:async_hooks:214:14)
        Test.run (node:internal/test_runner/test:1047:25)
      ...
    # Subtest: skipped
    ok 3 - skipped # SKIP
      ---
      duration_ms: 0.165622
      type: 'test'
      ...
    1..3
not ok 1 - math
  ---
  duration_ms: 3.906516
  type: 'suite'
  location: '${ROOT}/tests/a.test.mjs:3:1'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: top fail
not ok 2 - top fail
  ---
  duration_ms: 0.290613
  type: 'test'
  location: '${ROOT}/tests/a.test.mjs:8:1'
  failureType: 'testCodeFailure'
  error: 'boom here'
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (file://${ROOT}/tests/a.test.mjs:8:32)
    Test.runInAsyncScope (node:async_hooks:214:14)
  ...
1..2
# tests 4
# suites 1
# pass 1
# fail 2
# cancelled 0
# skipped 1
# todo 0
# duration_ms 95.993795
`;

const NODE_SPEC = `▶ math
  ✔ adds (0.674602ms)
  ✖ fails (0.799594ms)
  ﹣ skipped (0.105444ms) # SKIP
✖ math (2.538712ms)
✖ top fail (0.192928ms)
ℹ tests 4
ℹ suites 1
ℹ pass 1
ℹ fail 2
ℹ cancelled 1
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 69.266769

✖ failing tests:

test at tests/a.test.mjs:5:3
✖ fails (0.799594ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  3 !== 4

      at TestContext.<anonymous> (file://${ROOT}/tests/a.test.mjs:5:32)
      at Test.runInAsyncScope (node:async_hooks:214:14)

test at tests/a.test.mjs:8:1
✖ top fail (0.192928ms)
  Error: boom here
      at TestContext.<anonymous> (file://${ROOT}/tests/a.test.mjs:8:32)
`;

const JEST = `FAIL src/sum.test.js
  math
    ✓ subtracts (2 ms)
    ✕ adds (4 ms)

  ● math › adds

    expect(received).toBe(expected) // Object.is equality

    Expected: 4
    Received: 3

      3 | test('adds', () => {
    > 4 |   expect(1 + 2).toBe(4);
        |                 ^
      5 | });

      at Object.toBe (src/sum.test.js:4:17)
      at Promise.then.completed (node_modules/jest-circus/build/utils.js:298:28)

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 1 skipped, 5 passed, 7 total
Snapshots:   0 total
Time:        0.512 s
Ran all test suites.
`;

const PYTEST = `============================= test session starts ==============================
platform linux -- Python 3.12.1, pytest-8.0.0, pluggy-1.4.0
rootdir: ${ROOT}
collected 4 items

tests/test_calc.py .F.s                                                  [100%]

=================================== FAILURES ===================================
_________________________________ test_divide __________________________________

    def test_divide():
>       assert divide(4, 2) == 3
E       assert 2.0 == 3
E        +  where 2.0 = divide(4, 2)

tests/test_calc.py:9: AssertionError
=========================== short test summary info ============================
FAILED tests/test_calc.py::test_divide - assert 2.0 == 3
=================== 1 failed, 2 passed, 1 skipped in 0.05s ====================
`;

const DOTNET = `  Determining projects to restore...
  All projects are up-to-date for restore.
  Calc.Core -> C:\\Users\\Ada\\NOVA Projekte\\Calc\\src\\Calc.Core\\bin\\Debug\\net8.0\\Calc.Core.dll
  Calc.Core.Tests -> C:\\Users\\Ada\\NOVA Projekte\\Calc\\tests\\Calc.Core.Tests\\bin\\Debug\\net8.0\\Calc.Core.Tests.dll
Test run for C:\\Users\\Ada\\NOVA Projekte\\Calc\\tests\\Calc.Core.Tests\\bin\\Debug\\net8.0\\Calc.Core.Tests.dll (.NETCoreApp,Version=v8.0)
Microsoft (R) Test Execution Command Line Tool Version 17.11.1 (x64)
Copyright (c) Microsoft Corporation.  All rights reserved.

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.
[xUnit.net 00:00:00.50]     Calc.Core.Tests.NoteBookTests.Add_TrimsAndStoresText [FAIL]
  Failed Calc.Core.Tests.NoteBookTests.Add_TrimsAndStoresText [5 ms]
  Error Message:
   Assert.Equal() Failure: Strings differ
           ↓ (pos 5)
Expected: "Milch kaufen"
Actual:   "Milch  kaufen"
  Stack Trace:
     at Calc.Core.Tests.NoteBookTests.Add_TrimsAndStoresText() in C:\\Users\\Ada\\NOVA Projekte\\Calc\\tests\\Calc.Core.Tests\\NoteBookTests.cs:line 11
   at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)

Failed!  - Failed:     1, Passed:     4, Skipped:     0, Total:     5, Duration: 12 ms - Calc.Core.Tests.dll (net8.0)
`;

const MOCHA = `

  Calculator
    ✔ adds
    1) divides
    - pending one


  1 passing (6ms)
  1 pending
  1 failing

  1) Calculator
       divides:

      AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

2 !== 3

      + expected - actual

      -2
      +3

      at Context.<anonymous> (test/calc.test.js:9:12)
      at process.processImmediate (node:internal/timers:478:21)
`;

const UNITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<test-run id="2" testcasecount="3" result="Failed(Child)" total="3" passed="2" failed="1" inconclusive="0" skipped="0" asserts="0" engine-version="3.5.0.0" clr-version="4.0.30319.42000" start-time="2026-10-22 08:00:00Z" end-time="2026-10-22 08:00:01Z" duration="0.42">
  <test-suite type="TestSuite" id="1000" name="Calc" fullname="Calc" runstate="Runnable" testcasecount="3" result="Failed" total="3" passed="2" failed="1">
    <test-case id="1001" name="Add_IncreasesScoreAndBest" fullname="Calc.Tests.ScoreBoardTests.Add_IncreasesScoreAndBest" result="Passed" duration="0.01" />
    <test-case id="1002" name="Reset_KeepsBest" fullname="Calc.Tests.ScoreBoardTests.Reset_KeepsBest" result="Failed" duration="0.02">
      <failure>
        <message><![CDATA[  Expected: 4
  But was:  0
]]></message>
        <stack-trace><![CDATA[at Calc.Tests.ScoreBoardTests.Reset_KeepsBest () [0x00012] in C:\\Users\\Ada\\NOVA Projekte\\Calc\\Assets\\Tests\\EditMode\\GameTests.cs:23
]]></stack-trace>
      </failure>
    </test-case>
    <test-case id="1003" name="Add_RejectsNegativePoints" fullname="Calc.Tests.ScoreBoardTests.Add_RejectsNegativePoints" result="Passed" duration="0.01" />
  </test-suite>
</test-run>
`;

const TRX = `<?xml version="1.0" encoding="utf-8"?>
<TestRun id="1" name="ada 2026-10-22" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Results>
    <UnitTestResult executionId="a" testId="b" testName="Calc.Core.Tests.NoteBookTests.Toggle_Remove_ClearDone" computerName="PC" duration="00:00:00.0050000" outcome="Failed" testListId="c">
      <Output>
        <ErrorInfo>
          <Message>Assert.Equal() Failure: Values differ&#xD;
Expected: 1&#xD;
Actual:   2</Message>
          <StackTrace>   at Calc.Core.Tests.NoteBookTests.Toggle_Remove_ClearDone() in C:\\Users\\Ada\\NOVA Projekte\\Calc\\tests\\Calc.Core.Tests\\NoteBookTests.cs:line 42&#xD;
   at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)</StackTrace>
        </ErrorInfo>
      </Output>
    </UnitTestResult>
    <UnitTestResult executionId="d" testId="e" testName="Calc.Core.Tests.NoteBookTests.Add_TrimsAndStoresText" outcome="Passed" />
  </Results>
  <ResultSummary outcome="Failed">
    <Counters total="6" executed="5" passed="4" failed="1" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="1" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" />
  </ResultSummary>
</TestRun>
`;

describe('test framework parsers (recorded outputs)', () => {
  it('vitest: counts and failure location', () => {
    const r = parseVitest(VITEST, ctx)!;
    expect(r).toMatchObject({ framework: 'vitest', passed: 2, failed: 1, skipped: 1 });
    expect(r.failures).toEqual([{ file: 'src/math.test.ts', line: 4, column: 45, message: 'math > fails numbers: AssertionError: expected 3 to be 4 // Object.is equality' }]);
  });

  it('node --test TAP: counts, ignores the parent suite, file from the stack', () => {
    const r = parseNodeTest(NODE_TAP, ctx)!;
    expect(r).toMatchObject({ framework: 'node-test', passed: 1, failed: 2, skipped: 1 });
    expect(r.failures).toHaveLength(2);
    expect(r.failures[0]).toEqual({ file: 'tests/a.test.mjs', line: 5, column: 32, message: 'fails: Expected values to be strictly equal:' });
    expect(r.failures[1]).toMatchObject({ file: 'tests/a.test.mjs', line: 8, message: 'top fail: boom here' });
  });

  it('node --test spec reporter: cancelled tests count as failures', () => {
    const r = parseNodeTest(NODE_SPEC, ctx)!;
    expect(r).toMatchObject({ passed: 1, failed: 3, skipped: 1 });
    expect(r.failures.map((f) => [f.file, f.line])).toEqual([
      ['tests/a.test.mjs', 5],
      ['tests/a.test.mjs', 8],
    ]);
    expect(r.failures[0].message).toMatch(/^fails: AssertionError/);
  });

  it('jest: counts and first project frame (node_modules frames ignored)', () => {
    const r = parseJest(JEST, ctx)!;
    expect(r).toMatchObject({ passed: 5, failed: 1, skipped: 1 });
    expect(r.failures[0]).toEqual({ file: 'src/sum.test.js', line: 4, column: 17, message: 'math › adds: expect(received).toBe(expected) // Object.is equality' });
  });

  it('pytest: counts, short summary and location from the failure section', () => {
    const r = parsePytest(PYTEST, ctx)!;
    expect(r).toMatchObject({ passed: 2, failed: 1, skipped: 1 });
    expect(r.failures).toEqual([{ file: 'tests/test_calc.py', line: 9, column: null, message: 'test_divide: assert 2.0 == 3' }]);
  });

  it('dotnet test: summary line and Windows stack trace relative to the project', () => {
    const r = parseDotnetTest(DOTNET, WIN)!;
    expect(r).toMatchObject({ passed: 4, failed: 1, skipped: 0 });
    expect(r.failures[0]).toMatchObject({ file: 'tests/Calc.Core.Tests/NoteBookTests.cs', line: 11 });
    expect(r.failures[0].message).toMatch(/Add_TrimsAndStoresText: Assert\.Equal\(\) Failure/);
  });

  it('mocha: passing/failing/pending and failure block', () => {
    const r = parseMocha(MOCHA, ctx)!;
    expect(r).toMatchObject({ passed: 1, failed: 1, skipped: 1 });
    expect(r.failures[0]).toMatchObject({ file: 'test/calc.test.js', line: 9, column: 12 });
    expect(r.failures[0].message).toMatch(/^Calculator divides: AssertionError/);
  });

  it('Unity NUnit XML results', () => {
    const r = parseNunitXml(UNITY_XML, WIN)!;
    expect(r).toMatchObject({ passed: 2, failed: 1, skipped: 0 });
    expect(r.failures[0]).toMatchObject({ file: 'Assets/Tests/EditMode/GameTests.cs', line: 23, message: 'Calc.Tests.ScoreBoardTests.Reset_KeepsBest: Expected: 4' });
  });

  it('dotnet TRX results', () => {
    const r = parseTrx(TRX, WIN)!;
    expect(r).toMatchObject({ passed: 4, failed: 1, skipped: 1 });
    expect(r.failures[0]).toMatchObject({ file: 'tests/Calc.Core.Tests/NoteBookTests.cs', line: 42 });
    expect(r.failures[0].message).toBe('Calc.Core.Tests.NoteBookTests.Toggle_Remove_ClearDone: Assert.Equal() Failure: Values differ');
  });

  it('returns null for unknown output', () => {
    expect(parseVitest('hello', ctx)).toBeNull();
    expect(parseJest('hello', ctx)).toBeNull();
    expect(parseNodeTest('hello', ctx)).toBeNull();
    expect(parsePytest('hello', ctx)).toBeNull();
    expect(parseDotnetTest('hello', ctx)).toBeNull();
    expect(parseMocha('hello', ctx)).toBeNull();
    expect(parseNunitXml('<xml/>', ctx)).toBeNull();
    expect(parseTrx('<xml/>', ctx)).toBeNull();
  });
});

describe('compiler and linter parsers', () => {
  it('tsc (plain and pretty) and MSBuild/C# errors, deduplicated', () => {
    const out = [
      "src/app.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/util.ts:10:2 - error TS2304: Cannot find name 'foo'.",
      'C:\\Users\\Ada\\NOVA Projekte\\Calc\\src\\Calc\\MainWindow.xaml.cs(12,5): error CS1002: ; expected [C:\\Users\\Ada\\NOVA Projekte\\Calc\\src\\Calc\\Calc.csproj]',
      'C:\\Users\\Ada\\NOVA Projekte\\Calc\\src\\Calc\\MainWindow.xaml.cs(12,5): error CS1002: ; expected [C:\\Users\\Ada\\NOVA Projekte\\Calc\\src\\Calc\\Calc.csproj]',
    ].join('\n');
    const tsc = parseCompilerErrors(out, ctx);
    expect(tsc[0]).toEqual({ file: 'src/app.ts', line: 3, column: 7, message: "TS2322: Type 'string' is not assignable to type 'number'." });
    const win = parseCompilerErrors(out, WIN);
    const cs = win.filter((f) => f.message.startsWith('CS1002'));
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ file: 'src/Calc/MainWindow.xaml.cs', line: 12, column: 5 });
    expect(tsc.find((f) => f.message.startsWith('TS2304'))).toMatchObject({ file: 'src/util.ts', line: 10, column: 2 });
  });

  it('ESLint stylish output', () => {
    const out = `\n${ROOT}/src/app.js\n  3:7   error  'x' is assigned a value but never used  no-unused-vars\n  5:1   warning  Unexpected console statement  no-console\n\n✖ 2 problems (1 error, 1 warning)\n`;
    expect(parseEslintStylish(out, ctx)).toEqual([{ file: 'src/app.js', line: 3, column: 7, message: "'x' is assigned a value but never used (no-unused-vars)" }]);
  });

  it('esbuild, gcc-style, node --check and Python tracebacks', () => {
    const esbuild = '✘ [ERROR] Could not resolve "./missing"\n\n    src/main.ts:1:7:\n      1 │ import "./missing";\n';
    expect(parseGenericErrors(esbuild, ctx)[0]).toEqual({ file: 'src/main.ts', line: 1, column: 7, message: 'Could not resolve "./missing"' });
    const gcc = 'src/main.c:12:5: error: expected ‘;’ before ‘}’ token';
    expect(parseGenericErrors(gcc, ctx)[0]).toMatchObject({ file: 'src/main.c', line: 12, column: 5 });
    const nodeCheck = `${ROOT}/src/broken.js:1\nexport const x = ;\n                 ^\n\nSyntaxError: Unexpected token ';'\n    at checkSyntax (node:internal/main/check_syntax:74:5)`;
    expect(parseGenericErrors(nodeCheck, ctx)[0]).toEqual({ file: 'src/broken.js', line: 1, column: null, message: "SyntaxError: Unexpected token ';'" });
    const py = `Traceback (most recent call last):\n  File "${ROOT}/main.py", line 4, in <module>\n    main()\n  File "${ROOT}/.venv/lib/python3.12/site-packages/x.py", line 2, in main\n    raise ValueError("kaputt")\nValueError: kaputt`;
    expect(parseGenericErrors(py, ctx)[0]).toEqual({ file: 'main.py', line: 4, column: null, message: 'ValueError: kaputt' });
  });
});

describe('dispatcher, paths and signatures', () => {
  it('parseCheckOutput picks the framework for test kinds and compiler errors for builds', () => {
    expect(parseCheckOutput('test', VITEST, ctx).framework).toBe('vitest');
    expect(parseCheckOutput('test', NODE_TAP, ctx).framework).toBe('node-test');
    const build = parseCheckOutput('build', "src/app.ts(3,7): error TS2322: Nope.\n", ctx);
    expect(build.passed).toBeNull();
    expect(build.failures).toHaveLength(1);
  });

  it('strips ANSI colors before parsing', () => {
    expect(stripAnsi('\u001b[31mFAIL\u001b[39m x\r\n')).toBe('FAIL x\n');
  });

  it('normalizes paths to project-relative form', () => {
    expect(toProjectRelative(`${ROOT}/src/a.ts`, ctx)).toBe('src/a.ts');
    expect(toProjectRelative(`file://${ROOT}/src/a%20b.ts`, ctx)).toBe('src/a b.ts');
    expect(toProjectRelative('./src/a.ts', ctx)).toBe('src/a.ts');
    expect(toProjectRelative('/etc/passwd', ctx)).toBeNull();
    expect(toProjectRelative('../x.ts', ctx)).toBeNull();
    expect(toProjectRelative('node:internal/x', ctx)).toBeNull();
    expect(toProjectRelative('c:\\users\\ada\\nova projekte\\calc\\Src\\A.cs', WIN)).toBe('Src/A.cs');
    expect(toProjectRelative('file:///C:/Users/Ada/NOVA%20Projekte/Calc/src/x.js', WIN)).toBe('src/x.js');
    expect(toProjectRelative('D:\\other\\x.cs', WIN)).toBeNull();
    expect(toProjectRelative('C:/Users/Ada/NOVA Projekte/Calc/src/a.test.ts', WIN)).toBe('src/a.test.ts');
  });

  it('failure signatures ignore line numbers, order and timings', () => {
    const a = failureSignature([{ file: 'a.ts', line: 3, column: 1, message: 'boom (12ms)\ndetails' }, { file: 'b.ts', line: 1, column: null, message: 'x' }], { exitCode: 1, output: '' });
    const b = failureSignature([{ file: 'b.ts', line: 9, column: null, message: 'x' }, { file: 'a.ts', line: 7, column: 4, message: 'boom (40ms)' }], { exitCode: 1, output: '' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    const c = failureSignature([{ file: 'a.ts', line: 3, column: 1, message: 'other' }], { exitCode: 1, output: '' });
    expect(c).not.toBe(a);
    const fallback1 = failureSignature([], { exitCode: 2, output: 'Error: x\nDuration 12ms' });
    const fallback2 = failureSignature([], { exitCode: 2, output: 'Error: x\nDuration 99ms' });
    expect(fallback1).toBe(fallback2);
  });
});
