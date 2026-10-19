export function checkPicks(pools, picks) {
  const problems = [];
  for (const t of pools.targets) {
    const e = picks?.targets?.[t.target];
    if (!e) { problems.push(`${t.target}: no picks`); continue; }
    if (!Array.isArray(e.picks)) { problems.push(`${t.target}: picks is not a list`); continue; }
    const keys = new Set(t.photos.map(p => p.key));
    if (e.picks.length > 6) problems.push(`${t.target}: ${e.picks.length} picks, more than 6`);
    if (new Set(e.picks).size !== e.picks.length) problems.push(`${t.target}: a photo is picked twice`);
    for (const key of e.picks) if (!keys.has(key)) problems.push(`${t.target}: ${key} is not in the pool`);
    if (e.picks.length < 6 && e.done !== true) problems.push(`${t.target}: ${e.picks.length} picks and not marked done`);
  }
  return problems;
}
