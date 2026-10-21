// A judge or check agent answers with the photo codes of its prompt. decodeResult turns each code
// back into the photo key, from job.codes. An unknown code stays as it is, so keyProblems reports it.
export function decodeResult(job, result) {
  if (result == null || job.kind === 'rank' || !job.codes) return result;
  return { ...result, results: (result.results ?? []).map(a => (a && job.codes[a.key] ? { ...a, key: job.codes[a.key] } : a)) };
}

// Key coverage of one job. Every key of the job comes back exactly once, and no other key appears.
// check and judge: the keys of result.results. rank: the keys of every order plus result.unread
// (a key in unread counts as covered, because the agent says it could not read it). A ranked key must
// stay in its own group. Returns a list of problem strings. A job with no result returns [] (the caller reports that).
export function keyProblems(job, result) {
  if (result == null) return [];
  const problems = [];
  let got;
  if (job.kind === 'rank') {
    const groupOf = new Map(Object.entries(job.groups ?? {}).flatMap(([g, keys]) => keys.map(k => [k, g])));
    got = [...(result.unread ?? [])];
    for (const [g, keys] of Object.entries(result.orders ?? {})) {
      for (const k of keys ?? []) {
        got.push(k);
        if (groupOf.has(k) && groupOf.get(k) !== g) problems.push(`${job.label}: key ${k} in group ${g}, want group ${groupOf.get(k)}`);
      }
    }
  } else got = (result.results ?? []).map(x => x?.key);
  const want = new Set(job.keys), count = new Map();
  for (const k of got) count.set(k, (count.get(k) ?? 0) + 1);
  const cover = [];
  for (const k of job.keys) {
    if (!count.has(k)) cover.push(`${job.label}: key ${k} missing`);
    else if (count.get(k) > 1) cover.push(`${job.label}: key ${k} returned ${count.get(k)} times`);
  }
  for (const k of count.keys()) if (!want.has(k)) cover.push(`${job.label}: unknown key ${k}`);
  return [...cover, ...problems];
}
