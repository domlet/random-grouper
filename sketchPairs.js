let pairsMode = false;
const pairCircleCount = 9;
let pairGroups = [];
let pairAnimation = {
  running: false,
  startMs: 0,
  durationMs: 5000,
  nextIndex: 0,
};
let pairLabels = [];

function getRosterStudentsWithSource(roster) {
  if (Array.isArray(roster.names)) {
    return roster.names
      .filter((name) => String(name).trim().length > 0)
      .map((name) => ({ name: String(name), source: null }));
  }

  if (Array.isArray(roster.tables)) {
    return roster.tables.flatMap((table) => {
      const tableId = Object.keys(table).find((key) =>
        Array.isArray(table[key]),
      );
      const names = tableId ? table[tableId] : [];
      return names
        .filter((name) => String(name).trim().length > 0)
        .map((name) => ({ name: String(name), source: tableId }));
    });
  }

  return [];
}

function resetPairGroups() {
  pairGroups = Array.from({ length: pairCircleCount }, () => []);
  pairLabels = [];
  pairAnimation.running = false;
  pairAnimation.nextIndex = 0;
}

function startPairGrouping() {
  resetPairGroups();

  const roster = getSelectedRoster();
  if (!roster) {
    playTick();
    return;
  }

  pairLabels = createPairLabels(getRosterStudentsWithSource(roster));
  if (pairLabels.length === 0) {
    playTick();
    return;
  }

  pairGroups = distributePairLabels(pairLabels);

  pairAnimation.running = true;
  pairAnimation.startMs = millis();
  pairAnimation.durationMs = 5000;
  pairAnimation.nextIndex = 0;
  playStartWhoosh();
}

// Retries the random pairing until no blocklisted students share a pair or a circle
function createPairLabels(students) {
  let labels = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    labels = buildPairLabels(students);
    if (labels.length === 0) return labels;
    const circles = distributePairLabels(labels);
    const conflict = circles.some((circle) => countBlockedPairs(circle.flat()) > 0);
    if (!conflict) return labels;
  }
  console.warn("Could not satisfy mxbBlocklist for all pairs; some blocked students may share a table.");
  return labels;
}

function buildPairLabels(students) {
  const sources = [
    ...new Set(
      students
        .map((student) => student.source)
        .filter((source) => source !== null),
    ),
  ];
  if (
    sources.length === 2 &&
    students.every((student) => student.source !== null)
  ) {
    return createTwoSourcePairLabels(students, sources);
  }

  const hasSourceConstraints = students.some(
    (student) => student.source !== null,
  );
  for (let attempt = 0; attempt < 1000; attempt++) {
    const remaining = shuffle(students.slice());
    const labels = [];
    let triad = null;

    if (remaining.length % 2 === 1) {
      triad = takeDifferentSourceStudents(remaining, 3, hasSourceConstraints);
      if (!triad) continue;
      labels.push(triad.map((student) => student.name));
    }

    let failed = false;
    while (remaining.length > 0) {
      const first = remaining.shift();
      const candidateIndex = remaining.findIndex(
        (student) =>
          !hasSourceConstraints ||
          student.source === null ||
          first.source === null ||
          student.source !== first.source,
      );

      if (candidateIndex === -1) {
        failed = true;
        break;
      }

      const second = remaining.splice(candidateIndex, 1)[0];
      labels.push([
        first.name,
        second.name,
      ]);
    }

    if (!failed) return shuffle(labels);
  }

  return [];
}

function createTwoSourcePairLabels(students, sources) {
  const groupsBySource = sources.map((source) =>
    shuffle(students.filter((student) => student.source === source)),
  );
  const labels = [];

  if (students.length % 2 === 1) {
    const largerGroupIndex =
      groupsBySource[0].length >= groupsBySource[1].length ? 0 : 1;
    const smallerGroupIndex = 1 - largerGroupIndex;
    const triad = [
      groupsBySource[largerGroupIndex].pop(),
      groupsBySource[largerGroupIndex].pop(),
      groupsBySource[smallerGroupIndex].pop(),
    ];
    labels.push(triad.map((student) => student.name));
  }

  while (groupsBySource[0].length > 0 && groupsBySource[1].length > 0) {
    labels.push([
      groupsBySource[0].pop().name,
      groupsBySource[1].pop().name,
    ]);
  }

  const leftovers = shuffle(groupsBySource.flat());
  while (leftovers.length > 0) {
    labels.push([
      leftovers.pop().name,
      leftovers.pop().name,
    ]);
  }

  return shuffle(labels);
}

function distributePairLabels(labels) {
  const distributed = Array.from({ length: pairCircleCount }, () => []);

  labels.forEach((label, index) => {
    distributed[index % pairCircleCount].push(label);
  });

  const singlePairIndex = distributed.findIndex(
    (circle) => circle.length === 1,
  );
  if (singlePairIndex !== -1 && singlePairIndex !== 2) {
    [
      distributed[singlePairIndex],
      distributed[2],
    ] = [
      distributed[2],
      distributed[singlePairIndex],
    ];
  }

  const triplePairIndex = distributed.findIndex(
    (circle) => circle.length === 3,
  );
  if (triplePairIndex !== -1 && triplePairIndex !== 7) {
    [
      distributed[triplePairIndex],
      distributed[7],
    ] = [
      distributed[7],
      distributed[triplePairIndex],
    ];
  }

  const triadIndex = distributed.findIndex((circle) =>
    circle.some((label) => label.length === 3),
  );
  if (triadIndex !== -1 && triadIndex !== 7) {
    const triadLabelIndex = distributed[triadIndex].findIndex(
      (label) => label.length === 3,
    );
    const triad = distributed[triadIndex].splice(triadLabelIndex, 1)[0];
    const displaced = distributed[7].shift();

    distributed[7].unshift(triad);
    if (displaced) distributed[triadIndex].push(displaced);
  }

  keepPrefSeatingOutOfRestrictedTables(distributed);
  return distributed;
}

// Tables 3 and 9 (circles 2 and 8) must not seat preferred-seating students
function keepPrefSeatingOutOfRestrictedTables(distributed) {
  const restricted = [2, 8];
  const hasPref = (label) => label.some((name) => prefSeating.includes(name));

  restricted.forEach((circleIndex) => {
    distributed[circleIndex].forEach((label, labelIndex) => {
      if (!hasPref(label)) return;
      for (let i = 0; i < distributed.length; i++) {
        if (restricted.includes(i)) continue;
        const otherIndex = distributed[i].findIndex(
          (other) => other.length === label.length && !hasPref(other),
        );
        if (otherIndex === -1) continue;
        const other = distributed[i][otherIndex];
        distributed[i][otherIndex] = label;
        distributed[circleIndex][labelIndex] = other;
        return;
      }
    });
  });
}

function takeDifferentSourceStudents(students, count, hasSourceConstraints) {
  const chosen = [];
  const usedSources = new Set();

  for (
    let index = students.length - 1;
    index >= 0 && chosen.length < count;
    index--
  ) {
    const student = students[index];
    if (
      hasSourceConstraints &&
      student.source !== null &&
      usedSources.has(student.source)
    )
      continue;
    chosen.push(student);
    students.splice(index, 1);
    if (student.source !== null) usedSources.add(student.source);
  }

  if (chosen.length === count) return chosen;
  students.push(...chosen);
  return null;
}

function stepPairAnimation() {
  const progress = constrain(
    (millis() - pairAnimation.startMs) / pairAnimation.durationMs,
    0,
    1,
  );
  const shouldBe = floor(progress * pairLabels.length);
  pairGroups = distributePairLabels(pairLabels.slice(0, shouldBe));

  while (pairAnimation.nextIndex < shouldBe) {
    playTick();
    pairAnimation.nextIndex++;
  }

  if (progress >= 1) {
    pairAnimation.running = false;
    pairGroups = distributePairLabels(pairLabels);
    playSuccessChime();
  }
}

function drawPairCircles() {
  const cx = width / 2;
  const cy = 600;
  const ringR = 300;
  const circleR = 115;
  const startAngle = radians(-150);

  for (let index = 0; index < pairCircleCount; index++) {
    const angle = startAngle - index * (TWO_PI / pairCircleCount);
    const x = cx + ringR * cos(angle);
    const y = cy + ringR * sin(angle) - 20;

    stroke(255, 60);
    strokeWeight(2);
    noFill();
    circle(x, y, circleR * 2);

    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(42);
    text(index + 1, x, y - circleR + 28);

    drawPairLabelsInCircle(x, y, circleR, pairGroups[index] || []);
  }
}

function drawPairLabelsInCircle(x, y, r, labels) {
  const lineHeight = 30;

  textAlign(CENTER, TOP);
  textSize(30);
  fill(235);
  const startY = y - r + 58;
  let row = 0;

  labels.forEach((label) => {
    label.forEach((name, nameIndex) => {
      text(name, x, startY + row * lineHeight);
      row++;
      if (nameIndex === 1) row++;
    });
  });
}
