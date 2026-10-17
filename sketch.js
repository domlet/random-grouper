/* Random Grouper — p5.js (1000x1000)
   - 5 roster dropdown (each 32 names)
   - group count dropdown (2..8)
   - circles arranged on a big ring
   - group 1 at 10 o'clock; group 2 is counter-clockwise from it
   - "Make groups" animates assignment over 5s
   - sound: start whoosh, tick per name, success chime
*/

let rosterSelect, countSelect, makeBtn, prefsCheckbox;
let nameColors = new Map();
let pendingColors = new Map();
let prefsApplied = false;
let legendDiv;
const statusColors = { met: "lime", wildcard: "#56B4E9", unmet: "red" };
// rosters array is now loaded from rosters.js
let rosterNames = [];
let groupCount = 6;

let groups = []; // array of arrays of names
let assignOrder = []; // shuffled roster list of 32
let assignmentGroupIndexes = [];
let anim = {
  running: false,
  startMs: 0,
  durationMs: 5000,
  nextIndex: 0,
  intervalMs: 0,
};

let osc, env;

function getRosterEntries() {
  return Array.isArray(rosters) ? rosters.map((roster, index) => [index, roster]) : Object.entries(rosters || {});
}

function getSelectedRoster() {
  const selectedKey = rosterSelect.value();
  if (selectedKey === "" || selectedKey === null) return null;

  return Array.isArray(rosters) ? rosters[int(selectedKey)] : rosters[selectedKey];
}

function setup() {
  createCanvas(1000, 1000);

  // ----- Build 5 rosters
  // rosters.js = [makeRoster("Group A", "A"), makeRoster("Group B", "B"), makeRoster("Group C", "C"), makeRoster("Group D", "D"), makeRoster("Group E", "E")];

  // ----- UI -----
  const uiY = 90;

  rosterSelect = createSelect();
  rosterSelect.position(70, uiY);
  rosterSelect.size(290, 46);
  // First option is a non-selectable label
  rosterSelect.option("Choose a roster", "");
  rosterSelect.elt.querySelector('option[value=""]').disabled = true;
  getRosterEntries().forEach(([key, roster]) => {
    const label = roster.label || key;
    rosterSelect.option(label, key);
  });
  rosterSelect.selected("");
  rosterSelect.changed(() => {
    const selectedRoster = rosterSelect.value();
    if (selectedRoster !== "" && selectedRoster !== null) {
      resetGroups();
    }
  });

  countSelect = createSelect();
  countSelect.position(70, uiY + 60);
  countSelect.size(290, 46);
  // First option is a non-selectable label
  countSelect.option("How many groups?", "");
  countSelect.elt.querySelector('option[value=""]').disabled = true;
  countSelect.option("Pairs", "pairs");
  for (let n = 2; n <= 18; n++) countSelect.option(String(n), n);
  countSelect.selected("");
  countSelect.changed(() => {
    if (countSelect.value() === "pairs") {
      pairsMode = true;
      resetPairGroups();
      return;
    }

    pairsMode = false;
    const selectedCount = int(countSelect.value());
    if (!Number.isNaN(selectedCount) && selectedCount > 0) {
      groupCount = selectedCount;
      resetGroups();
    }
  });

  prefsCheckbox = createCheckbox("Apply preferences", false);
  prefsCheckbox.position(70, uiY + 60 * 2 - 4);
  prefsCheckbox.style("font-family", "sans-serif");
  prefsCheckbox.style("font-size", "22px");
  prefsCheckbox.style("color", "#fff");
  loadResponses();

  makeBtn = createButton("Make groups");
  makeBtn.position(70, uiY + 60 * 2 + 36);
  makeBtn.size(290, 46);
  makeBtn.style("font-family", "Ibarra Real Nova");
  makeBtn.style("font-size", "30px");
  makeBtn.style("font-weight", "700");
  makeBtn.style("border-radius", "10px");
  makeBtn.style("background-color", "#4CAF50");
  makeBtn.mousePressed(startGrouping);
  createPrefsLegend(70, uiY + 60 * 2 + 36 + 46 + 12);

  // ----- Sound (generated) -----
  osc = new p5.Oscillator("triangle");
  env = new p5.Envelope();
  env.setADSR(0.005, 0.06, 0.0, 0.08);
  env.setRange(0.35, 0);

  osc.amp(0);
  osc.start();

  const selectedCount = int(countSelect.value());
  if (!Number.isNaN(selectedCount) && selectedCount > 0) {
    groupCount = selectedCount;
  }
  resetGroups();
}

function draw() {
  background(18);

  drawTitleAndLabels();

  if (pairsMode) {
    if (pairAnimation.running) stepPairAnimation();
    drawPairCircles();
    return;
  }

  // Update animation (add names over time)
  if (anim.running) stepAnimation();

  // Draw group circles
  drawGroupCircles();
  legendDiv.style("display", prefsApplied ? "flex" : "none");
}

function createPrefsLegend(x, y) {
  legendDiv = createDiv();
  // Placed at the caller's x/y (same x as the inputs) so it sits under "Make groups"
  legendDiv.position(x, y);
  // Starts hidden: it is only relevant after a run with "Apply preferences" checked.
  // draw() flips it to "flex" when prefsApplied is true and back to "none" after a reset or a run without preferences
  legendDiv.style("display", "none");
  // Stacks the entries vertically, one line per preference outcome
  legendDiv.style("flex-direction", "column");
  legendDiv.style("gap", "6px");
  legendDiv.style("font-family", "sans-serif");
  legendDiv.style("font-size", "24px");
  // Neutral label color; each dot below is colored with the same value used for names
  // in statusColors (lime = met, blue = all nopref/no ignore data, red = not met)
  legendDiv.style("color", "#c8c8c8");
  [
    ["lime", "preference met"],
    ["#56B4E9", "no prefs"],
    ["red", "not met"],
    ["white", "no submission"],
  ].forEach(([col, label]) => {
    legendDiv.child(createSpan(`<span style="color:${col}">●</span> ${label}`));
  });
}

function drawTitleAndLabels() {
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textFont("Ibarra Real Nova");
  textSize(44);
  text("Random Grouper", width / 2, 40);
  textFont("sans-serif");

  // Small status
  textSize(20);
  textAlign(RIGHT, CENTER);
  fill(200);
  const status = anim.running ? "Grouping..." : "Ready";
  text(status, width / 2, 90);

  // show roster size
  const roster = getSelectedRoster();
  if (roster) {
    const n = getRosterNames(roster).length;
    textAlign(LEFT, CENTER);
    fill(200);
    text(`Names in roster: ${n}`, 70, 180);
  }
}

function getRosterNames(roster) {
  if (Array.isArray(roster.names)) {
    return roster.names.filter((name) => String(name).trim().length > 0).map((name) => String(name));
  }

  if (Array.isArray(roster.tables)) {
    return roster.tables.flatMap((table) => {
      const tableId = Object.keys(table)[0];
      const names = Array.isArray(table[tableId]) ? table[tableId] : [];
      return names.filter((name) => String(name).trim().length > 0).map((name) => String(name));
    });
  }

  return [];
}

function resetGroups() {
  // Clear group buckets
  groups = [];
  nameColors = new Map();
  pendingColors = new Map();
  prefsApplied = false;
  for (let i = 0; i < groupCount; i++) groups.push([]);

  // Stop animation if it was running
  anim.running = false;
  anim.nextIndex = 0;
  assignmentGroupIndexes = [];
}

function startGrouping() {
  userStartAudio();

  if (pairsMode) {
    startPairGrouping();
    return;
  }

  resetGroups();

  const roster = getSelectedRoster();
  if (!roster) {
    playTick();
    anim.running = false;
    return;
  }

  rosterNames = getRosterNames(roster);

  if (rosterNames.length === 0) {
    // Optional: tiny “no names” sound
    playTick();
    anim.running = false;
    return;
  }

  assignOrder = shuffle(rosterNames.slice());
  assignmentGroupIndexes = getGroupAssignmentIndexes(
    assignOrder.length,
    groupCount,
  );
  applySeatingRestrictions(assignOrder);
  nameColors = new Map();
  pendingColors = new Map();
  prefsApplied = false;

  // Always runs so mxbBlocklist and prefSeating are enforced; with no prefs it only resolves those conflicts
  optimizeOrder(assignOrder, groupCount, new Map(), restrictedGroupIndexes);

  if (prefsCheckbox.checked()) {
    if (!responsesRows) {
      console.warn(responsesError || "responses.csv is still loading; grouping without preferences.");
    } else {
      const prefs = buildPreferences(rosterSelect.value(), rosterNames);
      const restricted = restrictedGroupIndexes;
      optimizeOrder(assignOrder, groupCount, prefs, restricted);
      const statuses = evaluateStatuses(assignOrder, groupCount, prefs);
      statuses.forEach(({ status }, name) => pendingColors.set(name, statusColors[status]));
      prefsApplied = true;
      printPreferenceReport(statuses);
    }
  }

  anim.running = true;
  anim.startMs = millis();
  anim.durationMs = 5000;
  anim.nextIndex = 0;

  // Interval is based on however many names you have
  anim.intervalMs = anim.durationMs / assignOrder.length;

  playStartWhoosh();
}

// Zero-based group indexes for tables 3 and 9
const restrictedGroupIndexes = [2, 8];

function isPrefSeating(name) {
  return prefSeating.includes(name);
}

// Swaps preferred-seating students out of restricted groups (round-robin slots)
function applySeatingRestrictions(order) {
  const assignments = getGroupAssignmentIndexes(order.length, groupCount);
  const isRestricted = (i) =>
    restrictedGroupIndexes.includes(assignments[i]);
  for (let i = 0; i < order.length; i++) {
    if (!isRestricted(i) || !isPrefSeating(order[i])) continue;
    const j = order.findIndex((name, k) => !isRestricted(k) && !isPrefSeating(name));
    if (j === -1) continue;
    [order[i], order[j]] = [order[j], order[i]];
  }
}

function stepAnimation() {
  const elapsed = millis() - anim.startMs;

  // Clamp progress from 0..1
  const progress = constrain(elapsed / anim.durationMs, 0, 1);

  // Reveal this many names by now
  const shouldBe = floor(progress * assignOrder.length);

  while (anim.nextIndex < assignOrder.length && anim.nextIndex < shouldBe) {
    const name = assignOrder[anim.nextIndex];

    // Round-robin distribution across groupCount
    const g = assignmentGroupIndexes[anim.nextIndex];
    groups[g].push(name);

    playTick();
    anim.nextIndex++;
  }

  if (progress >= 1 && anim.nextIndex >= assignOrder.length) {
    anim.running = false;
    nameColors = pendingColors;
    playSuccessChime();
  }
}

function drawGroupCircles() {
  const cx = width / 2;
  const cy = 600; // push circles down below UI
  const ringR = 300;
  const circleR = 115;

  // Group 1 at 10 o'clock; group 2 counter-clockwise side.
  // In p5, +angle is clockwise (because y grows downward), so counter-clockwise is negative.
  const startAngle = radians(-150); // ~10 o'clock

  for (let i = 0; i < groupCount; i++) {
    const ang = startAngle - i * (TWO_PI / groupCount);
    const x = cx + ringR * cos(ang);
    const y = cy + ringR * sin(ang) - 20;

    // Circle
    stroke(255, 60);
    strokeWeight(2);
    if (groupCount >= 8) {
      noFill();
    } else {
      fill(30);
    }
    circle(x, y, circleR * 2);

    // Group number
    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(50);
    text(i + 1, x, y - circleR + 32);

    // Names inside
    const names = groups[i] || [];
    drawNamesInCircle(x, y, circleR, names);
  }
}

function drawNamesInCircle(x, y, r, names) {
  const paddingTop = 34;
  const maxLines = 9; // tune for readability
  const shown = names.slice(-maxLines); // show most recent at bottom
  const lineH = 30;

  textAlign(CENTER, TOP);
  textSize(30);

  const startY = y - r + paddingTop + 20;

  for (let i = 0; i < shown.length; i++) {
    const yy = startY + i * lineH;
    fill(nameColors.get(shown[i]) || 235);
    text(shown[i], x, yy);
  }

  // If more names exist, show a tiny count indicator
  if (names.length > maxLines) {
    textSize(16);
    fill(180);
    text(`(+${names.length - maxLines} more)`, x, y + r - 22);
  }
}

// ------------------ Helpers: sample rosters ------------------

function makeRoster(label, prefix) {
  const names = [];
  for (let i = 1; i <= 32; i++) {
    // Example: A01..A32 (replace with real student names)
    names.push(`${prefix}${String(i).padStart(2, "0")}`);
  }
  return { label, names };
}

// ------------------ Sound design (no external files) ------------------

function playStartWhoosh() {
  // Quick downward sweep
  const startF = 880;
  const endF = 220;
  const steps = 10;
  let k = 0;

  const id = setInterval(() => {
    const t = k / (steps - 1);
    const f = lerp(startF, endF, t);
    osc.freq(f);
    env.play(osc, 0, 0.02);
    k++;
    if (k >= steps) clearInterval(id);
  }, 25);
}

function playTick() {
  // Small blip at a random pleasant pitch
  const scale = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5 D5 E5 G5 A5
  osc.freq(random(scale));
  env.setADSR(0.002, 0.03, 0.0, 0.04);
  env.setRange(0.25, 0);
  env.play(osc, 0, 0.01);
}

function playSuccessChime() {
  // Simple arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  let i = 0;

  const id = setInterval(() => {
    osc.freq(notes[i]);
    env.setADSR(0.003, 0.08, 0.0, 0.1);
    env.setRange(0.35, 0);
    env.play(osc, 0, 0.02);
    i++;
    if (i >= notes.length) clearInterval(id);
  }, 140);
}
