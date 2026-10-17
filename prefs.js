// Student preferences from responses.csv ("Apply preferences" option)

const NO_PREF = "nopref";

// Accepts variants such as "nopref_1"
function isNoPref(value) {
  return normalizeName(value).startsWith(NO_PREF);
}
const IGNORE_PENALTY = 100;
const MET_BONUS = 10;
const MUTUAL_BONUS = 4;
const EXTRA_PREF_BONUS = 1;
const SEATING_PENALTY = 10000;
const BLOCK_PENALTY = 10000;

// Quotes are stripped so keys like "Jordan 'Big Beast' R" match 'Jordan "Big Beast" R'
function blockKey(name) {
  return normalizeName(String(name).replace(/['"]/g, ""));
}

let blockedPairSet = null;

// mxbBlocklist is treated as symmetric: either student listing the other blocks the pair
function isBlocked(a, b) {
  if (!blockedPairSet) {
    blockedPairSet = new Set();
    Object.entries(typeof mxbBlocklist !== "undefined" ? mxbBlocklist : {}).forEach(([name, list]) => {
      list.forEach((other) => {
        blockedPairSet.add(`${blockKey(name)}|${blockKey(other)}`);
        blockedPairSet.add(`${blockKey(other)}|${blockKey(name)}`);
      });
    });
  }
  return blockedPairSet.has(`${blockKey(a)}|${blockKey(b)}`);
}

function countBlockedPairs(members) {
  let count = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (isBlocked(members[i], members[j])) count++;
    }
  }
  return count;
}

let responsesRows = null;
let responsesError = null;

// Needs the page to be served over http (fetch is blocked on file://)
function loadResponses() {
  fetch("responses.csv")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => {
      responsesRows = parseCsv(text);
      responsesError = null;
    })
    .catch((err) => {
      responsesError = `Could not load responses.csv (${err.message})`;
      console.warn(responsesError);
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Which response columns apply to the selected roster
function getClassColumnPrefix(rosterKey) {
  const key = String(rosterKey);
  if (/3rd/i.test(key)) return "3rd";
  if (/4th/i.test(key)) return "4th";
  if (/\bMW\b/.test(key)) return "67MW";
  if (/\bTT\b/.test(key)) return "67TT";
  if (/fake/i.test(key)) return "Fake";
  return null;
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

// Returns Map(studentName -> { picks:Set, ignores:Set, noPref:boolean }) for students with response data
function buildPreferences(rosterKey, names) {
  const prefs = new Map();
  if (!responsesRows || responsesRows.length < 2) return prefs;

  const prefix = getClassColumnPrefix(rosterKey);
  if (!prefix) return prefs;

  const header = responsesRows[0].map((h) => h.trim());
  const emailCol = header.findIndex((h) => /^email/i.test(h));
  const pickCols = [];
  const ignoreCols = [];
  header.forEach((h, i) => {
    if (h.startsWith(`${prefix}: Ignore`)) ignoreCols.push(i);
    else if (h.startsWith(`${prefix}:`)) pickCols.push(i);
  });
  if (emailCol === -1 || (pickCols.length === 0 && ignoreCols.length === 0)) return prefs;

  const byNormalized = new Map(names.map((n) => [normalizeName(n), n]));
  const readCells = (row, cols) =>
    cols
      .flatMap((c) => String(row[c] || "").split(","))
      .map((v) => v.trim())
      .filter((v) => v !== "");

  names.forEach((name) => {
    const email = (typeof emailMapping !== "undefined" && emailMapping[name]) || null;
    if (!email) return;

    // latest response for this email that has data for this class
    let picksRaw = null;
    let ignoresRaw = null;
    for (let r = responsesRows.length - 1; r >= 1; r--) {
      const row = responsesRows[r];
      if (normalizeName(row[emailCol] || "") !== normalizeName(email)) continue;
      const p = readCells(row, pickCols);
      const ig = readCells(row, ignoreCols);
      if (p.length > 0 || ig.length > 0) {
        picksRaw = p;
        ignoresRaw = ig;
        break;
      }
    }
    if (!picksRaw) return;

    const resolve = (list) =>
      new Set(
        list
          .filter((v) => !isNoPref(v))
          .map((v) => byNormalized.get(normalizeName(v)))
          .filter((v) => v && v !== name),
      );

    prefs.set(name, {
      picks: resolve(picksRaw),
      ignores: resolve(ignoresRaw),
      noPref: picksRaw.some((v) => isNoPref(v)),
      noPrefOnly: picksRaw.length > 0 && picksRaw.every((v) => isNoPref(v)),
      hasIgnoreData: ignoresRaw.some((v) => !isNoPref(v)),
    });
  });

  return prefs;
}

function getGroupAssignmentIndexes(studentCount, groupCount) {
  const assignments = [];
  const groupSizes = Array.from({ length: groupCount }, () => 0);
  let groupIndex = 0;

  while (assignments.length < studentCount) {
    if (groupCount >= 3 && groupIndex === 2 && groupSizes[groupIndex] >= 2) {
      groupIndex = (groupIndex + 1) % groupCount;
      continue;
    }

    assignments.push(groupIndex);
    groupSizes[groupIndex]++;
    groupIndex = (groupIndex + 1) % groupCount;
  }

  return assignments;
}

function groupsFromOrder(
  order,
  count,
  assignments = getGroupAssignmentIndexes(order.length, count),
) {
  const groups = Array.from({ length: count }, () => []);
  order.forEach((name, i) => groups[assignments[i]].push(name));
  return groups;
}

function scoreOrder(
  order,
  count,
  prefs,
  restrictedIndexes,
  assignments = getGroupAssignmentIndexes(order.length, count),
) {
  const groups = groupsFromOrder(order, count, assignments);
  let score = 0;

  groups.forEach((members, g) => {
    score -= BLOCK_PENALTY * countBlockedPairs(members);

    members.forEach((name) => {
      if (restrictedIndexes.includes(g) && prefSeating.includes(name)) score -= SEATING_PENALTY;

      const p = prefs.get(name);
      if (!p) return;

      const others = members.filter((m) => m !== name);
      score -= IGNORE_PENALTY * others.filter((m) => p.ignores.has(m)).length;

      const met = others.filter((m) => p.picks.has(m));
      if (met.length > 0) {
        score += MET_BONUS + EXTRA_PREF_BONUS * (met.length - 1);
        score += MUTUAL_BONUS * met.filter((m) => prefs.get(m) && prefs.get(m).picks.has(name)).length;
      }
    });
  });

  return score;
}

// Reorders `order` in place (round-robin slots = groups) to maximise preference score
function optimizeOrder(order, count, prefs, restrictedIndexes) {
  const assignments = getGroupAssignmentIndexes(order.length, count);
  let best = order.slice();
  let bestScore = scoreOrder(
    best,
    count,
    prefs,
    restrictedIndexes,
    assignments,
  );

  for (let restart = 0; restart < 20; restart++) {
    const current = restart === 0 ? order.slice() : shuffle(order.slice());
    let currentScore = scoreOrder(
      current,
      count,
      prefs,
      restrictedIndexes,
      assignments,
    );

    for (let iter = 0; iter < 3000; iter++) {
      const a = floor(random(current.length));
      const b = floor(random(current.length));
      if (a === b || assignments[a] === assignments[b]) continue;
      [current[a], current[b]] = [current[b], current[a]];
      const s = scoreOrder(
        current,
        count,
        prefs,
        restrictedIndexes,
        assignments,
      );
      if (s >= currentScore) currentScore = s;
      else [current[a], current[b]] = [current[b], current[a]];
    }

    if (currentScore > bestScore) {
      bestScore = currentScore;
      best = current.slice();
    }
  }

  best.forEach((name, i) => (order[i] = name));
}

// status per student: "met" (lime), "wildcard" (hotpink), "unmet" (red)
function evaluateStatuses(order, count, prefs) {
  const groups = groupsFromOrder(order, count);
  const statuses = new Map();

  groups.forEach((members, g) => {
    members.forEach((name) => {
      const p = prefs.get(name);
      if (!p) return;

      const others = members.filter((m) => m !== name);
      const ignored = others.filter((m) => p.ignores.has(m));
      const met = others.filter((m) => p.picks.has(m));
      const hasRealPicks = p.picks.size > 0;

      let status;
      if (ignored.length > 0) status = "unmet";
      else if (p.noPrefOnly && !p.hasIgnoreData) status = "wildcard";
      else if (met.length > 0) status = "met";
      else if (p.noPref) status = "wildcard";
      else if (!hasRealPicks && !p.hasIgnoreData) status = null;
      else if (!hasRealPicks) status = "met";
      else status = "unmet";

      if (status) statuses.set(name, { status, table: g + 1, met, ignored });
    });
  });

  return statuses;
}

function printPreferenceReport(statuses) {
  const describe = (name) => {
    const { status, met, ignored } = statuses.get(name);
    if (ignored.length > 0) return `${name} is seated with ${ignored.join(", ")} who they ignored. (not met)`;
    if (met.length > 0) return `${name} is seated with ${met.join(", ")} who they selected.`;
    if (status === "wildcard") return `${name} had nopref and is seated anywhere.`;
    if (status === "unmet") return `${name} is not seated with anyone they selected. (not met)`;
    return `${name} had no selections to match and no ignored students at the table.`;
  };

  const byTable = new Map();
  statuses.forEach(({ table }, name) => {
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(name);
  });

  const sections = [...byTable.keys()]
    .sort((a, b) => a - b)
    .map((table) => {
      const rows = byTable
        .get(table)
        .sort((a, b) => a.localeCompare(b))
        .map(describe);
      return `Table ${table}:\n${rows.join("\n")}`;
    });
  console.log(`Preference report\n\n${sections.join("\n\n")}`);
}
