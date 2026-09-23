import type { TestContext } from 'node:test';

import type { Exec } from '../lib/run.ts';

export interface ExecCall {
  command: string;
  args: string[];
}

/** Records every call. `queue` holds the results the next calls return, in order. */
export function fakeExec(): Exec & { calls: ExecCall[]; queue: { code: number; out: string }[] } {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    return queue.shift() ?? { code: 0, out: '' };
  };
  return Object.assign(exec, { calls, queue });
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
