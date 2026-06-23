const API_URL = "http://localhost:5000";

// fallback scenarios, used only if the backend is unreachable
const SCENARIOS = [
  {
    risk: "Fake Investor",
    category: "fraud",
    title: "A VC firm reaches out with a term sheet",
    text: "You get an email from GlobalVentures Capital claiming to have backed three unicorns in your sector. They want to lead your seed round at a $3M valuation cap and can move fast — term sheet within 24 hours. The partner's LinkedIn has 200 connections and no mutual contacts with you. They ask for a $2,000 due diligence fee before proceeding.",
    options: [
      "Pay the fee and move forward — the terms are too good to pass up",
      "Schedule a call with the partner before doing anything else",
      "Verify the firm on Crunchbase and contact portfolio founders directly",
      "Decline — legitimate VCs never charge upfront fees"
    ],
    correct: [2, 3],
    flags: [
      "Upfront due diligence fee — no legitimate VC charges this",
      "Artificial 24-hour deadline to pressure a fast decision",
      "Thin LinkedIn profile with no verifiable track record"
    ],
    action: "Don't pay anything. Verify the firm on Crunchbase and reach out to founders they claim to have backed before engaging further."
  },
  {
    risk: "Invoice Fraud",
    category: "fraud",
    title: "A vendor sends a revised bank account for payment",
    text: "You're wrapping up a $15,000 contract with a design agency you've worked with twice before. An email comes in from what looks like their address, saying they've switched banks and asking you to update your records before sending the final payment. The email is slightly different — 'contact@studioname.co' instead of '.com'. You have a payment due in two days.",
    options: [
      "Update the bank details and send the payment on time",
      "Reply to the email asking for confirmation",
      "Call the agency on a number you already have to confirm the change",
      "Delay the payment until you can verify in person"
    ],
    correct: [2, 3],
    flags: [
      "Domain is slightly different from the real vendor's email",
      "Request to change payment details always requires out-of-band verification",
      "Time pressure makes it feel urgent to act without checking"
    ],
    action: "Never update bank details based on email alone. Call the vendor on a number from your existing records — not from the suspicious email — to confirm before sending any money."
  },
  {
    risk: "Phishing",
    category: "fraud",
    title: "Your cloud provider asks you to verify your account",
    text: "You get an email from 'AWS Security Team' saying unusual activity was detected on your account and you need to verify your credentials within 6 hours or your account will be suspended. The link goes to aws-account-verify.com. Your startup's backend runs entirely on AWS and downtime would be catastrophic.",
    options: [
      "Click the link immediately — you can't afford any downtime",
      "Forward it to your CTO and ask them to handle it",
      "Go directly to aws.amazon.com and check your account from there",
      "Ignore it — it's probably spam"
    ],
    correct: [2],
    flags: [
      "Domain is aws-account-verify.com, not amazonaws.com or aws.amazon.com",
      "Urgency framing with a 6-hour deadline is a classic phishing tactic",
      "Legitimate AWS security alerts link to the actual AWS console, not third-party domains"
    ],
    action: "Never click links in security alert emails. Always navigate directly to the service's official URL and log in from there to check if the alert is real."
  },
  {
    risk: "Suspicious Contract",
    category: "contract risk",
    title: "A distribution partner adds a last-minute clause",
    text: "You're one signature away from closing a distribution deal that took three months to negotiate. The partner's lawyer sends a 'minor update' to the contract — a new clause giving the partner the right to sublicense your technology to third parties without your approval, in exchange for a 5% royalty back to you. Your lawyer is on vacation. The partner says they need the contract signed today or they're moving on.",
    options: [
      "Sign it — 5% royalty sounds fair and the deal is too important to lose",
      "Ask for one week to review with your lawyer",
      "Strike the clause yourself and send it back unsigned",
      "Walk away from the deal entirely"
    ],
    correct: [1, 2],
    flags: [
      "Last-minute contract changes introduced under time pressure are a red flag",
      "Sublicensing rights without approval could let them commercialize your tech without you",
      "A partner threatening to walk if you don't sign immediately is a negotiation tactic, not a real deadline"
    ],
    action: "Never sign a contract with new IP-related clauses without legal review. Push back on the deadline — if the deal is real, they'll wait a few days. If they won't, that tells you something."
  },
  {
    risk: "Financial Mismanagement",
    category: "financial risk",
    title: "Your co-founder wants to skip the cap table update",
    text: "You just closed a $200K convertible note from an angel investor. Your co-founder, who handles finance, says updating the cap table is something you can do 'whenever' and suggests putting it off until you raise a proper round. The investor hasn't asked about it. You've been too busy with product to push back.",
    options: [
      "Agree — there's no investor pressure and you have more urgent things to do",
      "Update it yourself using the note terms you have",
      "Insist the cap table gets updated now and set a deadline for this week",
      "Ask your investor directly if they want to see an updated cap table"
    ],
    correct: [2, 3],
    flags: [
      "Letting cap table updates pile up creates legal and trust issues at the next fundraise",
      "Co-founders controlling finance with no oversight is a governance risk",
      "Investors expect accurate records even if they don't actively ask for them"
    ],
    action: "Update the cap table as soon as a note or agreement closes. This protects all parties and keeps your company clean for future due diligence."
  }
];

const TOTAL_ROUNDS = 5;

let state = {
  round: 0,
  score: 0,
  selected: null,
  profile: {},
  difficulty: 0.5,
  current: null,
  usingFallback: false
};

async function startTraining() {
  state.profile = {
    stage: document.getElementById('stage').value,
    sector: document.getElementById('sector').value,
    funding: document.getElementById('funding').value,
    team_size: document.getElementById('team-size').value
  };
  state.round = 0;
  state.score = 0;
  state.difficulty = 0.5;
  await loadScenario();
}

async function loadScenario() {
  try {
    const res = await fetch(`${API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: state.profile.stage,
        sector: state.profile.sector,
        funding: parseFloat(state.profile.funding) || 0,
        team_size: parseFloat(state.profile.team_size) || 3,
        difficulty: state.difficulty
      })
    });

    if (!res.ok) throw new Error('backend not ok');

    const data = await res.json();
    state.usingFallback = false;
    state.current = {
      risk: data.fraud_type.replace(/_/g, ' '),
      category: data.risk_level,
      title: data.fraud_type.replace(/_/g, ' '),
      text: data.short_summary,
      flags: data.red_flags.split(',').map(f => f.replace(/_/g, ' ')),
      action: data.correct_action.replace(/,/g, ', ').replace(/_/g, ' '),
      predicted_rating: data.predicted_user_rating
    };
  } catch (err) {
    // backend unreachable, fall back to a hardcoded scenario
    state.usingFallback = true;
    const s = SCENARIOS[state.round % SCENARIOS.length];
    state.current = {
      risk: s.risk,
      category: s.category,
      title: s.title,
      text: s.text,
      flags: s.flags,
      action: s.action,
      options: s.options,
      correct: s.correct
    };
  }

  showScenario();
}

function showScenario() {
  const s = state.current;

  document.getElementById('risk-badge').textContent = s.risk;
  document.getElementById('cat-badge').textContent = s.category;
  document.getElementById('scenario-title').textContent = s.title;
  document.getElementById('scenario-text').textContent = s.text;

  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  if (state.usingFallback) {
    // fallback scenarios have real multiple choice options
    s.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.onclick = () => selectOption(btn, i);
      grid.appendChild(btn);
    });
  } else {
    // model output: offer the real action plus 3 plausible wrong moves
    const choices = [
      { text: s.action.charAt(0).toUpperCase() + s.action.slice(1), correct: true },
      { text: "Ignore it and proceed as planned", correct: false },
      { text: "Act immediately without verifying anything", correct: false },
      { text: "Ask a teammate to handle it without context", correct: false }
    ].sort(() => Math.random() - 0.5);

    state.current.choices = choices;

    choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = choice.text;
      btn.onclick = () => selectOption(btn, i);
      grid.appendChild(btn);
    });
  }

  document.getElementById('progress-fill').style.width = ((state.round + 1) / TOTAL_ROUNDS * 100) + '%';
  document.getElementById('progress-label').textContent = `Round ${state.round + 1} of ${TOTAL_ROUNDS}`;
  document.getElementById('diff-chip').innerHTML = `Difficulty <strong>${state.difficulty.toFixed(2)}</strong>`;
  document.getElementById('score-display').textContent = state.score;

  state.selected = null;
  document.getElementById('btn-submit').disabled = true;

  switchScreen('screen-scenario');
}

function selectOption(btn, idx) {
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selected = idx;
  document.getElementById('btn-submit').disabled = false;
}

function submitAnswer() {
  if (state.selected === null) return;

  const s = state.current;
  let correct;

  if (state.usingFallback) {
    correct = s.correct.includes(state.selected);
  } else {
    correct = s.choices[state.selected].correct;
  }

  // adaptive difficulty, same formula as the notebook's feedback loop
  const rating = correct ? 5 : 1;
  if (rating <= 2) state.difficulty -= 0.0875;
  else if (rating >= 4) state.difficulty += 0.0875;
  state.difficulty = Math.max(0.1, Math.min(0.95, state.difficulty));

  if (correct) state.score += 10;

  const icon = document.getElementById('verdict-icon');
  icon.className = 'verdict-icon ' + (correct ? 'correct' : 'wrong');
  icon.innerHTML = correct
    ? '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5L18 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 6l10 10M16 6L6 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  document.getElementById('verdict-text').textContent = correct ? 'Good call' : 'Not quite';
  document.getElementById('verdict-sub').textContent = correct
    ? 'You spotted the risk correctly'
    : `This was a ${s.risk.toLowerCase()} scenario`;

  const flagsList = document.getElementById('flags-list');
  flagsList.innerHTML = s.flags.map(f => `<li>${f}</li>`).join('');

  document.getElementById('recommended-text').textContent = s.action;
  document.getElementById('score-result-display').textContent = state.score;

  switchScreen('screen-result');
}

function skipScenario() {
  const s = state.current;

  document.getElementById('verdict-icon').className = 'verdict-icon wrong';
  document.getElementById('verdict-icon').innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 6l10 10M16 6L6 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.getElementById('verdict-text').textContent = 'Skipped';
  document.getElementById('verdict-sub').textContent = s.risk + ' scenario';

  const flagsList = document.getElementById('flags-list');
  flagsList.innerHTML = s.flags.map(f => `<li>${f}</li>`).join('');
  document.getElementById('recommended-text').textContent = s.action;
  document.getElementById('score-result-display').textContent = state.score;

  switchScreen('screen-result');
}

async function nextRound() {
  state.round++;
  if (state.round >= TOTAL_ROUNDS) {
    goHome();
    return;
  }
  await loadScenario();
}

function goHome() {
  switchScreen('screen-onboard');
}

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
