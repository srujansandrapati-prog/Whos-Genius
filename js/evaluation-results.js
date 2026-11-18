import { db, ref, get, set, update, serverTimestamp } from "./firebase-config.js";
import { evaluateTypedAnswer } from "./question-bank.js";
import { generateBotQuizResponses } from "./bot-engine.js";

const DAILY_BIBLE_VERSES = [
  { text: "“I can do all things through Christ who strengthens me.”", ref: "Philippians 4:13" },
  { text: "“Your word is a lamp to my feet and a light to my path.”", ref: "Psalm 119:105" },
  { text: "“The fear of the Lord is the beginning of knowledge.”", ref: "Proverbs 1:7" },
  { text: "“Trust in the Lord with all your heart, and lean not on your own understanding.”", ref: "Proverbs 3:5" },
  { text: "“Be strong and of good courage; do not be afraid, for the Lord your God is with you.”", ref: "Joshua 1:9" }
];

// Lightweight Web Audio API Synthesizer (Zero external audio files required, respects Settings)
export function playSoundEffect(type, userProfile) {
  if (userProfile?.settings?.sfx === false) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "win") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);       // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12);// E5
      osc.frequency.setValueAtTime(783.99, now + 0.24);// G5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch {}
}

// Score a single player's 10 assigned questions (Section 7: Typed = 10, MCQ = 6, Wrong/Blank = 0)
export function evaluatePlayerQuestionSet(assignedQuestionIds, responsesMap, publicQuestionsMap, answerKeysMap) {
  let totalPoints = 0;
  let typedCorrectCount = 0;
  let mcqCorrectCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  const details = [];

  for (const qId of assignedQuestionIds) {
    const pubQ = publicQuestionsMap[qId];
    const keyQ = answerKeysMap[qId];
    const resp = responsesMap?.[qId] || { mode: "typed", typedText: "", selectedOptionIndex: null };

    if (!pubQ || !keyQ) continue;

    const mode = resp.mode === "mcq" ? "mcq" : "typed";
    let isUnanswered = false;
    let isCorrect = false;
    let userAnswerDisplay = "No answer";
    let pointsEarned = 0;

    if (mode === "mcq") {
      if (typeof resp.selectedOptionIndex !== "number") {
        isUnanswered = true;
      } else {
        userAnswerDisplay = pubQ.mcqOptions[resp.selectedOptionIndex] || "Option";
        isCorrect = resp.selectedOptionIndex === keyQ.correctOptionIndex;
        if (isCorrect) {
          pointsEarned = 6;
          mcqCorrectCount++;
        } else {
          incorrectCount++;
        }
      }
    } else {
      const rawText = (resp.typedText || "").trim();
      if (!rawText) {
        isUnanswered = true;
      } else {
        userAnswerDisplay = rawText;
        const evalRes = evaluateTypedAnswer(rawText, keyQ, true);
        isCorrect = evalRes.isCorrect;
        if (isCorrect) {
          pointsEarned = 10;
          typedCorrectCount++;
        } else {
          incorrectCount++;
        }
      }
    }

    if (isUnanswered) {
      unansweredCount++;
    }

    totalPoints += pointsEarned;

    details.push({
      questionId: qId,
      questionText: pubQ.questionText,
      mode,
      isUnanswered,
      isCorrect,
      userAnswerDisplay,
      canonicalAnswer: keyQ.correctAnswer,
      acceptedAnswers: keyQ.acceptedAnswers || [keyQ.correctAnswer],
      pointsEarned
    });
  }

  return {
    totalPoints,
    typedCorrectCount,
    mcqCorrectCount,
    incorrectCount,
    unansweredCount,
    details
  };
}

// Finalize match, persist results & user stats idempotently, and render S13 & S14
export async function finalizeAndRenderMatch({ matchId, activeMatch, currentUser, userProfile, questionBank }) {
  // 1. Build lookup maps for public questions and secret answer keys
  const publicQuestionsMap = {};
  questionBank.forEach(q => { publicQuestionsMap[q.questionId] = q; });

  const keysSnap = await get(ref(db, "questionKeys"));
  if (!keysSnap.exists()) {
    throw new Error("Answer keys could not be loaded for evaluation.");
  }
  const answerKeysMap = keysSnap.val();

  // 2. Load match record and player views
  const matchRef = ref(db, `matches/${matchId}`);
  const matchSnap = await get(matchRef);
  if (!matchSnap.exists()) throw new Error("Match record not found.");
  const match = matchSnap.val();

  const myUid = currentUser.uid;
  const isPlayerA = match.playerA?.uid === myUid;
  const myMeta = isPlayerA ? match.playerA : match.playerB;
  const oppMeta = isPlayerA ? match.playerB : match.playerA;

  // Each side answers the 10 questions selected by the opponent (Section 2 & 3)
  const myAssignedIds = oppMeta?.selectedForOpponent || activeMatch.assignedQuestionIds || [];
  const oppAssignedIds = myMeta?.selectedForOpponent || activeMatch.opponentQuestionIds || [];

  const myViewSnap = await get(ref(db, `matches/${matchId}/playerViews/${myUid}`));
  const myResponses = myViewSnap.exists() ? (myViewSnap.val().responses || {}) : {};

  let oppResponses = {};
  if (match.mode === "bot") {
    // Check if bot responses were already generated for this match
    const existingBotViewSnap = await get(ref(db, `matches/${matchId}/playerViews/${oppMeta.uid}`));
    if (existingBotViewSnap.exists()) {
      oppResponses = existingBotViewSnap.val().responses || {};
    } else {
      const botGen = generateBotQuizResponses(
        oppAssignedIds,
        publicQuestionsMap,
        answerKeysMap,
        activeMatch.botProfile || { fixedDifficulty: oppMeta.fixedDifficulty || "Medium", accuracyRate: 0.72 }
      );
      oppResponses = botGen.responses;
      await set(ref(db, `matches/${matchId}/playerViews/${oppMeta.uid}`), {
        uid: oppMeta.uid,
        responses: oppResponses,
        submitted: true,
        submittedAt: serverTimestamp()
      });
    }
  } else {
    const oppViewSnap = await get(ref(db, `matches/${matchId}/playerViews/${oppMeta.uid}`));
    oppResponses = oppViewSnap.exists() ? (oppViewSnap.val().responses || {}) : {};
  }

  // 3. Evaluate both players' question sets
  const myEval = evaluatePlayerQuestionSet(myAssignedIds, myResponses, publicQuestionsMap, answerKeysMap);
  const oppEval = evaluatePlayerQuestionSet(oppAssignedIds, oppResponses, publicQuestionsMap, answerKeysMap);

  const outcome =
    myEval.totalPoints > oppEval.totalPoints
      ? "WIN"
      : myEval.totalPoints < oppEval.totalPoints
      ? "LOSS"
      : "DRAW";

  // 4. Save verified result summary under /matches/{matchId}/results/{myUid}
  await update(ref(db, `matches/${matchId}/results/${myUid}`), {
    uid: myUid,
    totalPoints: myEval.totalPoints,
    opponentPoints: oppEval.totalPoints,
    outcome,
    typedCorrectCount: myEval.typedCorrectCount,
    mcqCorrectCount: myEval.mcqCorrectCount,
    incorrectCount: myEval.incorrectCount,
    unansweredCount: myEval.unansweredCount,
    evaluatedAt: serverTimestamp()
  });

  // 5. Idempotently record match in /userMatches/{uid}/{matchId} & update aggregate /users/{uid}/stats
  const userMatchRef = ref(db, `userMatches/${myUid}/${matchId}`);
  const userMatchSnap = await get(userMatchRef);
  if (!userMatchSnap.exists()) {
    await set(userMatchRef, {
      matchId,
      mode: match.mode,
      opponentName: oppMeta?.displayName || "Opponent",
      myScore: myEval.totalPoints,
      oppScore: oppEval.totalPoints,
      outcome,
      completedAt: Date.now()
    });

    const prevStats = userProfile.stats || { totalMatches: 0, wins: 0, losses: 0, draws: 0, totalPoints: 0 };
    const updatedStats = {
      totalMatches: (prevStats.totalMatches || 0) + 1,
      wins: (prevStats.wins || 0) + (outcome === "WIN" ? 1 : 0),
      losses: (prevStats.losses || 0) + (outcome === "LOSS" ? 1 : 0),
      draws: (prevStats.draws || 0) + (outcome === "DRAW" ? 1 : 0),
      totalPoints: (prevStats.totalPoints || 0) + myEval.totalPoints
    };
    userProfile.stats = updatedStats;
    await update(ref(db, `users/${myUid}/stats`), updatedStats);
  }

  // 6. Populate S13 Match Results Screen
  document.getElementById("res-my-avatar").src = myMeta?.photoURL || userProfile.photoURL;
  document.getElementById("res-my-name").textContent = myMeta?.displayName || userProfile.displayName;
  document.getElementById("res-my-score").textContent = String(myEval.totalPoints);

  document.getElementById("res-opp-avatar").src = oppMeta?.photoURL || "";
  document.getElementById("res-opp-name").textContent = oppMeta?.displayName || "Opponent";
  document.getElementById("res-opp-score").textContent = String(oppEval.totalPoints);

  const ribbonEl = document.getElementById("res-outcome-ribbon");
  const trophyEl = document.getElementById("results-trophy-icon");
  if (outcome === "WIN") {
    ribbonEl.textContent = "You Win!";
    ribbonEl.className = "outcome-ribbon win";
    trophyEl.textContent = "🏆";
    playSoundEffect("win", userProfile);
  } else if (outcome === "DRAW") {
    ribbonEl.textContent = "It's a Draw!";
    ribbonEl.className = "outcome-ribbon draw";
    trophyEl.textContent = "🤝";
  } else {
    ribbonEl.textContent = `${oppMeta?.displayName || "Opponent"} Wins`;
    ribbonEl.className = "outcome-ribbon loss";
    trophyEl.textContent = "🛡️";
  }

  document.getElementById("bd-typed-correct").textContent = String(myEval.typedCorrectCount);
  document.getElementById("bd-mcq-correct").textContent = String(myEval.mcqCorrectCount);
  document.getElementById("bd-incorrect").textContent = String(myEval.incorrectCount);
  document.getElementById("bd-unanswered").textContent = String(myEval.unansweredCount);

  // 7. Populate S14 Review Answers Screen
  renderReviewAnswersScreen(myEval.details);
}

function renderReviewAnswersScreen(detailsList) {
  const container = document.getElementById("review-answers-list");
  container.innerHTML = detailsList.map((item, idx) => {
    const rowStateClass = item.isCorrect ? "correct" : "wrong";
    const ansStateClass = item.isCorrect ? "ok" : "bad";
    const icon = item.isCorrect ? "✓" : "✗";
    const modeLabel = item.mode === "mcq" ? "MCQ Mode (max 6)" : "Typed Mode (max 10)";

    return `
      <div class="review-row ${rowStateClass}">
        <div>
          <div class="rev-q-title">${idx + 1}. ${item.questionText}</div>
          <span class="rev-mode-tag">${modeLabel}</span>
        </div>
        <div class="rev-user-ans ${ansStateClass}">
          <span>${icon}</span> ${item.userAnswerDisplay}
        </div>
        <div class="rev-canon-ans">
          ${item.canonicalAnswer}
        </div>
        <div class="rev-pts-badge">
          +${item.pointsEarned}
        </div>
      </div>
    `;
  }).join("");

  // Pick a Daily Bible Verse deterministically by day of year
  const dayIndex = Math.floor(Date.now() / 86400000) % DAILY_BIBLE_VERSES.length;
  const verse = DAILY_BIBLE_VERSES[dayIndex];
  document.getElementById("daily-verse-text").textContent = verse.text;
  document.getElementById("daily-verse-ref").textContent = verse.ref;
}
