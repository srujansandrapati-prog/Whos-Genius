import { db, ref, get, set } from "./firebase-config.js";

// Configurable Bot Roster (Section 4.3 S07 & Section 6)
export const DEFAULT_BOT_ROSTER = [
  {
    botId: "bot_noah",
    displayName: "Noah",
    fixedDifficulty: "Easy",
    personality: "Patient, calm, and steady through every storm. Great for a relaxed warmup duel!",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Noah&backgroundColor=22c55e",
    accuracyRate: 0.50,          // 50% correct (within Easy 45-60% spec range)
    mcqUsageRate: 0.55,          // Uses MCQ 55% of the time
    responseDelayRangeSec: [12, 26],
    active: true
  },
  {
    botId: "bot_peter",
    displayName: "Peter",
    fixedDifficulty: "Easy",
    personality: "Bold and enthusiastic, though sometimes answers a little too quickly!",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Peter&backgroundColor=16a34a",
    accuracyRate: 0.58,          // 58% correct
    mcqUsageRate: 0.45,
    responseDelayRangeSec: [8, 20],
    active: true
  },
  {
    botId: "bot_thomas",
    displayName: "Thomas",
    fixedDifficulty: "Medium",
    personality: "Cautious and observant. Double-checks every verse before locking his answer.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Thomas&backgroundColor=f59e0b",
    accuracyRate: 0.70,          // 70% correct (within Medium 65-80% spec range)
    mcqUsageRate: 0.35,
    responseDelayRangeSec: [15, 32],
    active: true
  },
  {
    botId: "bot_david",
    displayName: "David",
    fixedDifficulty: "Medium",
    personality: "Confident and poetic challenger who never backs down from a giant test.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=David&backgroundColor=d97706",
    accuracyRate: 0.78,          // 78% correct
    mcqUsageRate: 0.25,
    responseDelayRangeSec: [12, 28],
    active: true
  },
  {
    botId: "bot_daniel",
    displayName: "Daniel",
    fixedDifficulty: "Hard",
    personality: "A sharp mind and a deep faith. Are you ready for the challenge?",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Daniel&backgroundColor=ef4444",
    accuracyRate: 0.88,          // 88% correct (within Hard 85-95% spec range)
    mcqUsageRate: 0.15,
    responseDelayRangeSec: [10, 24],
    active: true
  },
  {
    botId: "bot_paul",
    displayName: "Paul",
    fixedDifficulty: "Hard",
    personality: "Relentless scholar of the Law, Prophets, and Epistles with near-flawless recall.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Paul&backgroundColor=dc2626",
    accuracyRate: 0.92,          // 92% correct
    mcqUsageRate: 0.10,
    responseDelayRangeSec: [9, 22],
    active: true
  }
];

export async function ensureBotsSeeded() {
  const snap = await get(ref(db, "bots"));
  if (snap.exists()) {
    return Object.values(snap.val()).filter(b => b.active);
  }
  const botMap = {};
  DEFAULT_BOT_ROSTER.forEach(b => { botMap[b.botId] = b; });
  await set(ref(db, "bots"), botMap);
  return DEFAULT_BOT_ROSTER;
}

// Randomly pick an active bot, avoiding the immediately previous bot if possible (Section 6.2)
export function selectRandomBot(activeBots, lastBotId = null) {
  if (!activeBots || activeBots.length === 0) {
    throw new Error("No active bots configured in roster.");
  }
  const pool = activeBots.length > 1 && lastBotId
    ? activeBots.filter(b => b.botId !== lastBotId)
    : activeBots;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

// Bot selects 10 unique active questions for the human player (Section 6.3)
export function selectBotQuestionsForHuman(questionBank, count = 10) {
  const eligible = questionBank.filter(q => q.active !== false);
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(q => q.questionId);
}

// Deterministic/Controlled Bot Answer Generator for the 10 questions chosen by the human
export function generateBotQuizResponses(questionIdsForBot, publicQuestionsMap, answerKeysMap, botProfile) {
  const responses = {};
  let totalSimulatedSeconds = 0;
  const [minDelay, maxDelay] = botProfile.responseDelayRangeSec || [10, 25];

  for (const qId of questionIdsForBot) {
    const pubQ = publicQuestionsMap[qId];
    const keyQ = answerKeysMap[qId];
    if (!pubQ || !keyQ) continue;

    const qDelay = Math.floor(minDelay + Math.random() * (maxDelay - minDelay + 1));
    totalSimulatedSeconds = Math.min(410, totalSimulatedSeconds + qDelay);

    const useMcq = Math.random() < (botProfile.mcqUsageRate ?? 0.3);
    const isCorrect = Math.random() < (botProfile.accuracyRate ?? 0.7);
    const mode = useMcq ? "mcq" : "typed";

    if (isCorrect) {
      if (mode === "mcq") {
        responses[qId] = {
          questionId: qId,
          mode: "mcq",
          selectedOptionIndex: keyQ.correctOptionIndex,
          typedText: "",
          answeredAtOffsetSec: totalSimulatedSeconds
        };
      } else {
        responses[qId] = {
          questionId: qId,
          mode: "typed",
          selectedOptionIndex: null,
          typedText: keyQ.correctAnswer,
          answeredAtOffsetSec: totalSimulatedSeconds
        };
      }
    } else {
      // Bot gets this question wrong
      if (mode === "mcq") {
        const wrongIndices = [0, 1, 2, 3].filter(idx => idx !== keyQ.correctOptionIndex);
        const pickedWrong = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
        responses[qId] = {
          questionId: qId,
          mode: "mcq",
          selectedOptionIndex: pickedWrong,
          typedText: "",
          answeredAtOffsetSec: totalSimulatedSeconds
        };
      } else {
        // Pick a wrong option text or leave blank occasionally on Easy
        const wrongIndices = [0, 1, 2, 3].filter(idx => idx !== keyQ.correctOptionIndex);
        const wrongText = pubQ.mcqOptions[wrongIndices[0]] || "Not sure";
        responses[qId] = {
          questionId: qId,
          mode: "typed",
          selectedOptionIndex: null,
          typedText: botProfile.fixedDifficulty === "Easy" && Math.random() < 0.3 ? "" : wrongText,
          answeredAtOffsetSec: totalSimulatedSeconds
        };
      }
    }
  }

  return {
    responses,
    totalDurationSec: Math.min(415, totalSimulatedSeconds)
  };
}
