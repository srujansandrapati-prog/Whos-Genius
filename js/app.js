import {
  auth,
  db,
  onAuthStateChanged,
  ref,
  onValue,
  push,
  set,
  serverTimestamp
} from "./firebase-config.js";
import { ensureQuestionBankSeeded } from "./question-bank.js";
import { ensureBotsSeeded, selectRandomBot, selectBotQuestionsForHuman } from "./bot-engine.js";
import { QuestionSelectorController } from "./question-selector.js";
import {
  ensureUserProfile,
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  formatAuthError
} from "./auth.js";
import { renderStatsScreen, loadMatchHistory, bindSettingsControls } from "./profile-settings.js";

const state = {
  currentUser: null,
  userProfile: null,
  questionBank: [],
  botRoster: [],
  lastBotId: null,
  activeMatch: null, // Holds { matchId, mode: 'bot'|'pvp', botProfile, ... }
  authMode: "login"
};

export function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
}

export function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function populateDashboard(profile) {
  document.getElementById("dash-avatar").src = profile.photoURL;
  document.getElementById("dash-username").textContent = profile.displayName;
  const total = profile.stats?.totalMatches || 0;
  document.getElementById("dash-subtitle").textContent =
    total === 0 ? "New Challenger" : `${total} Match${total === 1 ? "" : "es"} Played`;

  // Sync settings controls
  const settings = profile.settings || { sfx: true, bgm: false, language: "bilingual" };
  document.getElementById("set-sfx").checked = !!settings.sfx;
  document.getElementById("set-bgm").checked = !!settings.bgm;
  document.getElementById("set-lang").value = settings.language || "bilingual";
}

function setupAuthUI() {
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const nameWrap = document.getElementById("field-name-wrap");
  const submitBtn = document.getElementById("btn-auth-submit");
  const errorEl = document.getElementById("auth-error-text");
  const passInput = document.getElementById("auth-password");

  function setAuthMode(mode) {
    state.authMode = mode;
    errorEl.classList.add("hidden");
    if (mode === "login") {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      nameWrap.classList.add("hidden");
      submitBtn.textContent = "Sign In";
    } else {
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      nameWrap.classList.remove("hidden");
      submitBtn.textContent = "Create Account";
    }
  }

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));

  document.getElementById("btn-toggle-pass").addEventListener("click", () => {
    passInput.type = passInput.type === "password" ? "text" : "password";
  });

  document.getElementById("btn-google-signin").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    errorEl.classList.add("hidden");
    try {
      await loginWithGoogle();
    } catch (err) {
      errorEl.textContent = formatAuthError(err);
      errorEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const email = document.getElementById("auth-email").value.trim();
    const password = passInput.value;
    const name = document.getElementById("auth-name").value.trim();

    if (!email || !password) {
      errorEl.textContent = "Please enter both email and password.";
      errorEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    try {
      if (state.authMode === "register") {
        if (!name) throw new Error("Please enter a display name.");
        await registerWithEmail(name, email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err) {
      errorEl.textContent = formatAuthError(err);
      errorEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  const questionSelector = new QuestionSelectorController({
    getQuestionBank: () => state.questionBank,
    showToast,
    onConfirmSelection: async (selectedQuestionIds) => {
      await handleConfirmQuestions(selectedQuestionIds);
    }
  });

  async function startBotFlow() {
    try {
      if (state.botRoster.length === 0) {
        state.botRoster = await ensureBotsSeeded();
      }
      const bot = selectRandomBot(state.botRoster, state.lastBotId);
      state.lastBotId = bot.botId;
      state.activeMatch = {
        mode: "bot",
        botProfile: bot
      };

      // Populate S07 Bot Introduction Screen
      document.getElementById("bot-intro-avatar").src = bot.avatar;
      document.getElementById("bot-intro-name").textContent = bot.displayName;
      document.getElementById("bot-intro-desc").textContent = bot.personality;

      const diffEl = document.getElementById("bot-intro-diff");
      diffEl.textContent = bot.fixedDifficulty;
      diffEl.className = `diff-badge diff-${bot.fixedDifficulty.toLowerCase()}`;

      showScreen("screen-bot-intro");
    } catch (err) {
      showToast(err.message || "Could not load bot roster.");
    }
  }

  async function handleConfirmQuestions(humanSelectedIds) {
    showScreen("screen-selection-locked");

    if (state.activeMatch?.mode === "bot") {
      const bot = state.activeMatch.botProfile;
      document.getElementById("selection-waiting-msg").textContent =
        `${bot.displayName} is locking 10 questions for you...`;

      // Bot selects 10 distinct questions for the human player
      const botSelectedIds = selectBotQuestionsForHuman(state.questionBank, 10);

      // Create server-backed match record in Firebase RTDB
      const matchRef = push(ref(db, "matches"));
      const matchId = matchRef.key;
      const uid = state.currentUser.uid;

      const matchData = {
        matchId,
        mode: "bot",
        state: "QUIZ_READY",
        createdAt: serverTimestamp(),
        playerA: {
          uid,
          displayName: state.userProfile.displayName,
          photoURL: state.userProfile.photoURL,
          selectedForOpponent: humanSelectedIds,
          selectionLocked: true
        },
        playerB: {
          uid: bot.botId,
          displayName: bot.displayName,
          photoURL: bot.avatar,
          fixedDifficulty: bot.fixedDifficulty,
          selectedForOpponent: botSelectedIds,
          selectionLocked: true
        }
      };

      await set(matchRef, matchData);
      state.activeMatch.matchId = matchId;
      state.activeMatch.assignedQuestionIds = botSelectedIds; // Human answers Bot's 10 picks
      state.activeMatch.opponentQuestionIds = humanSelectedIds; // Bot answers Human's 10 picks

      showToast(`Both sets locked! Duel vs ${bot.displayName} is ready.`);
      // Sub-Task 5 will transition directly from here into S10 (7-Minute Quiz Engine)
    }
  }

  document.getElementById("btn-play-bot").addEventListener("click", startBotFlow);
  document.getElementById("btn-mode-bot").addEventListener("click", startBotFlow);

  document.getElementById("btn-play-pvp").addEventListener("click", () => showScreen("screen-mode"));

  document.getElementById("btn-start-bot-select").addEventListener("click", () => {
    const oppName = state.activeMatch?.botProfile?.displayName || "Bot";
    questionSelector.resetForNewMatch(oppName);
    showScreen("screen-select-questions");
  });

  document.getElementById("btn-leave-selection").addEventListener("click", () => {
    state.activeMatch = null;
    showScreen("screen-dashboard");
  });

  const openStats = async () => {
    if (!state.userProfile) return;
    renderStatsScreen(state.userProfile);
    showScreen("screen-stats");
    await loadMatchHistory(state.currentUser.uid);
  };

  document.getElementById("btn-open-profile").addEventListener("click", openStats);
  document.getElementById("btn-nav-stats").addEventListener("click", openStats);
  document.getElementById("btn-tile-stats").addEventListener("click", openStats);

  const openSettings = () => showScreen("screen-settings");
  document.getElementById("btn-nav-settings").addEventListener("click", openSettings);
  document.getElementById("btn-tile-settings").addEventListener("click", openSettings);

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await logoutUser();
    showToast("Logged out");
  });
}

function monitorConnection() {
  const connectedRef = ref(db, ".info/connected");
  const banner = document.getElementById("offline-banner");
  onValue(connectedRef, (snap) => {
    if (snap.val() === false && state.currentUser) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  });
}

function init() {
  setupAuthUI();
  setupNavigation();
  bindSettingsControls(() => state, showToast);
  monitorConnection();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        state.currentUser = user;
        state.userProfile = await ensureUserProfile(user);
        state.questionBank = await ensureQuestionBankSeeded();
        populateDashboard(state.userProfile);
        showScreen("screen-dashboard");
      } catch (err) {
        document.getElementById("splash-loader").classList.add("hidden");
        document.getElementById("splash-error").classList.remove("hidden");
        document.getElementById("splash-error-msg").textContent =
          "Could not load your player profile. Check your Firebase Realtime Database rules.";
      }
    } else {
      state.currentUser = null;
      state.userProfile = null;
      showScreen("screen-auth");
    }
  });

  document.getElementById("btn-retry-init").addEventListener("click", () => {
    window.location.reload();
  });
}

init();
