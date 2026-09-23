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
