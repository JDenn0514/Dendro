import type { TestContext } from 'node:test';

import type { Exec } from '../lib/run.ts';

export interface ExecCall {
  command: string;
  args: string[];
}

export type FakeExec = Exec & {
  calls: ExecCall[];
  queue: { code: number; out: string }[];
  /** What `git symbolic-ref` answers. Null is a detached HEAD. */
  branch: string | null;
};

/**
 * Records every call. `queue` holds the results the next calls return, in order. A
 * `git symbolic-ref` call reads `branch` and takes nothing from the queue, so the run
 * guard does not shift the answers a test queued.
 */
export function fakeExec(branch: string | null = 'content/demo'): FakeExec {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    if (command === 'git' && args[0] === 'symbolic-ref') {
      return fake.branch === null ? { code: 1, out: '' } : { code: 0, out: fake.branch };
    }
    return queue.shift() ?? { code: 0, out: '' };
  };
  const fake: FakeExec = Object.assign(exec, { calls, queue, branch });
  return fake;
}

/** Every call except the branch reads of the run guard. A test of what a command changes reads these. */
export function changes(exec: { calls: ExecCall[] }): ExecCall[] {
  return exec.calls.filter((call) => !(call.command === 'git' && call.args[0] === 'symbolic-ref'));
}

/**
 * Captures what a command prints. `out` holds one string per `console.log` call and `err`
 * one per `console.error` call. The test context restores both functions afterwards.
 */
export function captureConsole(t: TestContext): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]): void => {
    out.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]): void => {
    err.push(args.map(String).join(' '));
  };
  t.after(() => {
    console.log = log;
    console.error = error;
  });
  return { out, err };
}
