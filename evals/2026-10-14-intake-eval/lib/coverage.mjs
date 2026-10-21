// Key coverage of one job. Every key of the job comes back exactly once, and no other key appears.
// P0 and P1: the keys of result.results. P2 and P3: the keys of result.ranked plus result.rejects
// (a key in result.unread counts as covered, because the judge says it could not read it).
// Returns a list of problem strings. A job with no result returns [] (the caller reports that).
export function keyProblems(job, result) {
  if (result == null) return [];
  const got = job.pass === 'P0' || job.pass === 'P1'
    ? (result.results ?? []).map(x => x?.key)
    : [...(result.ranked ?? []).map(x => x?.key), ...(result.rejects ?? []), ...(result.unread ?? [])];
  const want = new Set(job.keys), count = new Map();
  for (const k of got) count.set(k, (count.get(k) ?? 0) + 1);
  const problems = [];
  for (const k of job.keys) {
    if (!count.has(k)) problems.push(`${job.label}: key ${k} missing`);
    else if (count.get(k) > 1) problems.push(`${job.label}: key ${k} returned ${count.get(k)} times`);
  }
  for (const k of count.keys()) if (!want.has(k)) problems.push(`${job.label}: unknown key ${k}`);
  return problems;
}
