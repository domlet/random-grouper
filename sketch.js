/* Random Grouper — p5.js (1000x1000)
   - 5 roster dropdown (each 32 names)
   - group count dropdown (2..8)
   - circles arranged on a big ring
   - group 1 at 10 o'clock; group 2 is counter-clockwise from it
   - "Make groups" animates assignment over 5s
   - sound: start whoosh, tick per name, success chime
*/

let rosterSelect, countSelect, makeBtn;
// rosters array is now loaded from rosters.js
let rosterNames = [];
let groupCount = 6;

let groups = []; // array of arrays of names
let assignOrder = []; // shuffled roster list of 32
let anim = {
  running: false,
  startMs: 0,
  durationMs: 5000,
  nextIndex: 0,
  intervalMs: 0,
};

let osc, env;

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
  for (let i = 0; i < rosters.length; i++) rosterSelect.option(rosters[i].label, i);
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
  for (let n = 2; n <= 18; n++) countSelect.option(String(n), n);
  countSelect.selected("");
  countSelect.changed(() => {
    const selectedCount = int(countSelect.value());
    if (!Number.isNaN(selectedCount) && selectedCount > 0) {
      groupCount = selectedCount;
      resetGroups();
    }
  });

  makeBtn = createButton("Make groups");
  makeBtn.position(70, uiY + 60 * 2);
  makeBtn.size(290, 46);
  makeBtn.style("font-family", "Ibarra Real Nova");
  makeBtn.style("font-size", "30px");
  makeBtn.style("font-weight", "700");
  makeBtn.style("border-radius", "10px");
  makeBtn.style("background-color", "#4CAF50");
  makeBtn.mousePressed(startGrouping);

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

  // Update animation (add names over time)
  if (anim.running) stepAnimation();

  // Draw group circles
  drawGroupCircles();
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
  const rosterIdx = int(rosterSelect.value());
  if (!isNaN(rosterIdx) && rosters[rosterIdx]) {
    const n = rosters[rosterIdx].names.filter((x) => String(x).trim().length > 0).length;
    textAlign(LEFT, CENTER);
    fill(200);
    text(`Names in roster: ${n}`, 70, 180);
  }
}

function resetGroups() {
  // Clear group buckets
  groups = [];
  for (let i = 0; i < groupCount; i++) groups.push([]);

  // Stop animation if it was running
  anim.running = false;
  anim.nextIndex = 0;
}

function startGrouping() {
  userStartAudio();

  resetGroups();

  const rosterIdx = int(rosterSelect.value());
  if (isNaN(rosterIdx) || !rosters[rosterIdx]) {
    playTick();
    anim.running = false;
    return;
  }

  rosterNames = rosters[rosterIdx].names.slice(); // copy
  rosterNames = rosterNames.filter((n) => String(n).trim().length > 0); // remove blanks

  if (rosterNames.length === 0) {
    // Optional: tiny “no names” sound
    playTick();
    anim.running = false;
    return;
  }

  assignOrder = shuffle(rosterNames.slice());

  anim.running = true;
  anim.startMs = millis();
  anim.durationMs = 5000;
  anim.nextIndex = 0;

  // Interval is based on however many names you have
  anim.intervalMs = anim.durationMs / assignOrder.length;

  playStartWhoosh();
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
    const g = anim.nextIndex % groupCount;
    groups[g].push(name);

    playTick();
    anim.nextIndex++;
  }

  if (progress >= 1 && anim.nextIndex >= assignOrder.length) {
    anim.running = false;
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
    fill(30);
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
  fill(235);

  const startY = y - r + paddingTop + 20;

  for (let i = 0; i < shown.length; i++) {
    const yy = startY + i * lineH;
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
