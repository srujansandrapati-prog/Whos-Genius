import {
  auth,
  db,
  onAuthStateChanged,
  ref,
  set,
  update,
  push,
  onValue,
  serverTimestamp
} from "./firebase-config.js";
import {
  ensureUserProfile,
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  formatAuthError
} from "./auth.js";
import {
  renderStatsScreen,
  loadMatchHistory,
  bindSettingsControls
} from "./profile-settings.js";
import { ensureQuestionBankSeeded } from "./question-bank.js";
import {
  ensureBotsSeeded,
  selectRandomBot,
  selectBotQuestionsForHuman
} from "./bot-engine.js";
import { QuestionSelectorController } from "./question-selector.js";
import {
  createPrivateRoom,
  joinPrivateRoom,
  toggleLobbyReady,
  leaveRoomLobby,
  hostStartQuestionSelection,
  submitPvpQuestionSelection,
  subscribeToRoom,
  subscribeToMatch,
  QUIZ_DURATION_MS
} from "./multiplayer.js";
import { QuizEngineController } from "./quiz-engine.js";
import {
  finalizeAndRenderMatch,
  playSoundEffect
} from "./evaluation-results.js";

// Global Application State
const state = {
  currentUser: null,
  userProfile: null,
  questionBank: [],
  botRoster: [],
  lastBotId: null,
  activeMatch: null,
  roomUnsub: null,
  matchUnsub: null,
  quizLaunchedForMatchId: null,
  authMode: "login" // "login" | "register"
};

// Controllers for S08 Question Selection & S10/S11 Quiz Engine
let questionSelector = null;
let quizEngine = null;

// Screen Router (S01 - S16)
export function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
}

// Toast Notification Helper
export function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// Clean up active listeners and reset match state when returning to Dashboard
function cleanupActiveMatchState() {
  if (state.roomUnsub) {
    state.roomUnsub();
    state.roomUnsub = null;
  }
  if (state.matchUnsub) {
    state.matchUnsub();
    state.matchUnsub = null;
  }
  if (quizEngine) {
    quizEngine.stopTimer();
  }
  state.activeMatch = null;
  state.quizLaunchedForMatchId = null;
}

// Populate S03 Dashboard & Sync S16 Settings UI
function populateDashboard(profile) {
  if (!profile) return;
  document.getElementById("dash-avatar").src = profile.photoURL;
  document.getElementById("dash-username").textContent = profile.displayName;
  const total = profile.stats?.totalMatches || 0;
  document.getElementById("dash-subtitle").textContent =
    total === 0 ? "New Challenger" : `${total} Match${total === 1 ? "" : "es"} Played`;

  const settings = profile.settings || { sfx: true, bgm: false, language: "bilingual" };
  document.getElementById("set-sfx").checked = !!settings.sfx;
  document.getElementById("set-bgm").checked = !!settings.bgm;
  document.getElementById("set-lang").value = settings.language || "bilingual";
}

// S02: Authentication UI Setup (Google + Email/Password)
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
      tabLogin.setAttribute("aria-selected", "true");
      tabRegister.classList.remove("active");
      tabRegister.setAttribute("aria-selected", "false");
      nameWrap.classList.add("hidden");
      submitBtn.textContent = "Sign In";
    } else {
      tabRegister.classList.add("active");
      tabRegister.setAttribute("aria-selected", "true");
      tabLogin.classList.remove("active");
      tabLogin.setAttribute("aria-selected", "false");
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

// S07: Start Solo Bot Challenge Flow
async function startBotFlow() {
  try {
    cleanupActiveMatchState();
    if (state.botRoster.length === 0) {
      state.botRoster = await ensureBotsSeeded();
    }
    const bot = selectRandomBot(state.botRoster, state.lastBotId);
    state.lastBotId = bot.botId;
    state.activeMatch = {
      mode: "bot",
      botProfile: bot,
      opponentName: bot.displayName,
      evaluated: false
    };

    document.getElementById("bot-intro-avatar").src = bot.avatar;
    document.getElementById("bot-intro-name").textContent = bot.displayName;
    document.getElementById("bot-intro-desc").textContent = bot.personality;

    const diffEl = document.getElementById("bot-intro-diff");
    diffEl.textContent = bot.fixedDifficulty;
    diffEl.className = `diff-badge diff-${bot.fixedDifficulty.toLowerCase()}`;

    playSoundEffect("click", state.userProfile);
    showScreen("screen-bot-intro");
  } catch (err) {
    showToast(err.message || "Could not load bot roster.");
  }
}

// S08 -> S09 -> S10: Handle Confirming 10 Questions for Opponent (Bot & PvP)
async function handleConfirmQuestions(humanSelectedIds) {
  playSoundEffect("click", state.userProfile);
  showScreen("screen-selection-locked");

  if (state.activeMatch?.mode === "bot") {
    const bot = state.activeMatch.botProfile;
    document.getElementById("selection-waiting-msg").textContent =
      `${bot.displayName} is locking 10 questions for you...`;

    const botSelectedIds = selectBotQuestionsForHuman(state.questionBank, 10);
    const matchRef = push(ref(db, "matches"));
    const matchId = matchRef.key;
    const uid = state.currentUser.uid;
    const now = Date.now();
    const deadlineAt = now + QUIZ_DURATION_MS;

    const matchData = {
      matchId,
      mode: "bot",
      state: "IN_PROGRESS",
      createdAt: serverTimestamp(),
      startAt: now,
      deadlineAt,
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
    state.activeMatch.assignedQuestionIds = botSelectedIds;
    state.activeMatch.opponentQuestionIds = humanSelectedIds;
    state.activeMatch.startAt = now;
    state.activeMatch.deadlineAt = deadlineAt;

    // Launch 7-Minute Quiz Engine (S10)
    state.quizLaunchedForMatchId = matchId;
    await quizEngine.startQuizSession({
      matchId,
      assignedQuestionIds: botSelectedIds,
      opponentName: bot.displayName,
      startAt: now,
      deadlineAt
    });
  } else if (state.activeMatch?.mode === "pvp") {
    document.getElementById("selection-waiting-msg").textContent =
      `Waiting for ${state.activeMatch.opponentName || "your opponent"} to lock their 10 questions...`;
    await submitPvpQuestionSelection(
      state.activeMatch.matchId,
      state.activeMatch.playerRoleKey,
      humanSelectedIds
    );
  }
}

// S05 & S06: Multiplayer Create/Join Room & Live Lobby Setup
function setupMultiplayerUI() {
  const tabCreate = document.getElementById("tab-mp-create");
  const tabJoin = document.getElementById("tab-mp-join");
  const panelCreate = document.getElementById("panel-mp-create");
  const panelJoin = document.getElementById("panel-mp-join");
  const codeTextEl = document.getElementById("generated-room-code");
  const enterLobbyBtn = document.getElementById("btn-enter-created-lobby");
  const qrWrap = document.getElementById("room-qr-wrap");
  const joinErrorEl = document.getElementById("join-room-error");

  function switchMpTab(mode) {
    joinErrorEl.classList.add("hidden");
    if (mode === "create") {
      tabCreate.classList.add("active");
      tabCreate.setAttribute("aria-selected", "true");
      tabJoin.classList.remove("active");
      tabJoin.setAttribute("aria-selected", "false");
      panelCreate.classList.remove("hidden");
      panelJoin.classList.add("hidden");
    } else {
      tabJoin.classList.add("active");
      tabJoin.setAttribute("aria-selected", "true");
      tabCreate.classList.remove("active");
      tabCreate.setAttribute("aria-selected", "false");
      panelJoin.classList.remove("hidden");
      panelCreate.classList.add("hidden");
    }
  }

  tabCreate.addEventListener("click", () => {
    switchMpTab("create");
    if (!state.activeMatch?.roomCode) {
      openMultiplayerScreen("create");
    }
  });
  tabJoin.addEventListener("click", () => switchMpTab("join"));

  async function openMultiplayerScreen(initialTab = "create") {
    cleanupActiveMatchState();
    showScreen("screen-multiplayer");
    switchMpTab(initialTab);

    if (initialTab === "create") {
      codeTextEl.textContent = "......";
      enterLobbyBtn.disabled = true;
      qrWrap.innerHTML = `<span class="muted-text sm">Creating room...</span>`;
      try {
        const roomData = await createPrivateRoom(state.userProfile);
        state.activeMatch = {
          mode: "pvp",
          roomCode: roomData.roomCode,
          role: "host",
          playerRoleKey: "playerA",
          evaluated: false
        };
        codeTextEl.textContent = roomData.roomCode;
        enterLobbyBtn.disabled = false;

        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomData.roomCode}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(inviteUrl)}`;
        qrWrap.innerHTML = `<img src="${qrApiUrl}" alt="QR Code for room ${roomData.roomCode}" />`;
      } catch (err) {
        showToast(err.message || "Failed to create room.");
      }
    }
  }

  document.getElementById("btn-mode-pvp").addEventListener("click", () => openMultiplayerScreen("create"));

  const copyCurrentCode = async () => {
    const code = state.activeMatch?.roomCode;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    showToast(`Room code ${code} copied!`);
  };

  document.getElementById("btn-copy-code").addEventListener("click", copyCurrentCode);
  document.getElementById("btn-lobby-copy").addEventListener("click", copyCurrentCode);

  document.getElementById("btn-share-room").addEventListener("click", async () => {
    const code = state.activeMatch?.roomCode;
    if (!code) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Bible Quiz Duel",
          text: `Join my Bible Quiz Duel room with code: ${code}`,
          url: inviteUrl
        });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(inviteUrl);
    showToast("Invite link copied to clipboard!");
  });

  enterLobbyBtn.addEventListener("click", () => {
    if (!state.activeMatch?.roomCode) return;
    enterRoomLobby(state.activeMatch.roomCode, "host");
  });

  document.getElementById("form-join-room").addEventListener("submit", async (e) => {
    e.preventDefault();
    joinErrorEl.classList.add("hidden");
    const inputCode = document.getElementById("input-join-code").value.trim().toUpperCase();
    const submitBtn = document.getElementById("btn-submit-join");
    submitBtn.disabled = true;

    try {
      const { roomCode, role } = await joinPrivateRoom(inputCode, state.userProfile);
      state.activeMatch = {
        mode: "pvp",
        roomCode,
        role,
        playerRoleKey: role === "host" ? "playerA" : "playerB",
        evaluated: false
      };
      enterRoomLobby(roomCode, role);
    } catch (err) {
      joinErrorEl.textContent = err.message;
      joinErrorEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("btn-toggle-ready").addEventListener("click", async () => {
    if (!state.activeMatch?.roomCode || !state.activeMatch?.latestRoom) return;
    const { roomCode, role, latestRoom } = state.activeMatch;
    const currentReady = role === "host" ? latestRoom.host?.ready : latestRoom.guest?.ready;
    await toggleLobbyReady(roomCode, role, !!currentReady);
  });

  document.getElementById("btn-host-start-match").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await hostStartQuestionSelection(state.activeMatch.roomCode);
    } catch (err) {
      showToast(err.message || "Could not start match.");
      btn.disabled = false;
    }
  });

  const handleLeaveLobby = async () => {
    const code = state.activeMatch?.roomCode;
    const role = state.activeMatch?.role;
    cleanupActiveMatchState();
    if (code) {
      await leaveRoomLobby(code, role);
    }
    showScreen("screen-dashboard");
  };

  document.getElementById("btn-leave-room").addEventListener("click", handleLeaveLobby);
  document.getElementById("btn-leave-lobby-top").addEventListener("click", handleLeaveLobby);
}

// S06: Live Room Lobby Subscription
function enterRoomLobby(roomCode, role) {
  if (state.roomUnsub) state.roomUnsub();
  showScreen("screen-lobby");
  document.getElementById("lobby-room-code").textContent = roomCode;

  state.roomUnsub = subscribeToRoom(roomCode, (room) => {
    if (!room || !state.activeMatch) return;
    state.activeMatch.latestRoom = room;

    if (room.status === "CANCELLED") {
      cleanupActiveMatchState();
      showToast("The host closed the room.");
      showScreen("screen-dashboard");
      return;
    }

    if (room.status === "SELECTING_QUESTIONS" && room.matchId) {
      if (state.roomUnsub) {
        state.roomUnsub();
        state.roomUnsub = null;
      }
      state.activeMatch.matchId = room.matchId;
      const oppName = role === "host" ? room.guest?.displayName : room.host?.displayName;
      state.activeMatch.opponentName = oppName || "Opponent";
      questionSelector.resetForNewMatch(state.activeMatch.opponentName);
      showScreen("screen-select-questions");
      listenToPvpMatchProgress(room.matchId);
      return;
    }

    // Update Host Slot UI
    if (room.host) {
      document.getElementById("lobby-host-avatar").src = room.host.photoURL;
      document.getElementById("lobby-host-name").textContent = room.host.displayName;
      const hostReadyEl = document.getElementById("lobby-host-ready");
      const isHostReady = room.host.ready && room.host.connected !== false;
      hostReadyEl.textContent =
        room.host.connected === false ? "Reconnecting..." : isHostReady ? "✓ Ready" : "Not Ready";
      hostReadyEl.className = `ready-pill ${isHostReady ? "ready" : "waiting"}`;
    }

    // Update Guest Slot UI
    const guestEmptyEl = document.getElementById("lobby-guest-empty");
    const guestAvatarEl = document.getElementById("lobby-guest-avatar");
    const guestNameEl = document.getElementById("lobby-guest-name");
    const guestReadyEl = document.getElementById("lobby-guest-ready");

    if (room.guest) {
      guestEmptyEl.classList.add("hidden");
      guestAvatarEl.src = room.guest.photoURL;
      guestAvatarEl.classList.remove("hidden");
      guestNameEl.textContent = room.guest.displayName;
      const isGuestReady = room.guest.ready && room.guest.connected !== false;
      guestReadyEl.textContent =
        room.guest.connected === false ? "Reconnecting..." : isGuestReady ? "✓ Ready" : "Not Ready";
      guestReadyEl.className = `ready-pill ${isGuestReady ? "ready" : "waiting"}`;
    } else {
      guestEmptyEl.classList.remove("hidden");
      guestAvatarEl.classList.add("hidden");
      guestNameEl.textContent = "Waiting...";
      guestReadyEl.textContent = "Not Joined";
      guestReadyEl.className = "ready-pill waiting";
    }

    const bothReady = !!(
      room.host?.ready &&
      room.guest?.ready &&
      room.host?.connected !== false &&
      room.guest?.connected !== false
    );
    document.getElementById("lobby-status-heading").textContent =
      !room.guest
        ? "Waiting for opponent..."
        : bothReady
        ? "Both players ready!"
        : "Waiting for players to mark ready...";

    const startBtn = document.getElementById("btn-host-start-match");
    if (role === "host") {
      startBtn.classList.remove("hidden");
      startBtn.disabled = !bothReady;
    } else {
      startBtn.classList.add("hidden");
    }
  });
}

// Listen to /matches/{matchId} for Synchronized Quiz Start & Completion
function listenToPvpMatchProgress(matchId) {
  if (state.matchUnsub) state.matchUnsub();
  state.matchUnsub = subscribeToMatch(matchId, async (match) => {
    if (!match || !state.activeMatch) return;
    state.activeMatch.latestMatch = match;

    const myRoleKey = state.activeMatch.playerRoleKey;
    const oppRoleKey = myRoleKey === "playerA" ? "playerB" : "playerA";

    // Launch 7-Minute Quiz simultaneously when both sets are locked
    if (
      (match.state === "IN_PROGRESS" ||
        match.state === "PLAYER_A_SUBMITTED" ||
        match.state === "PLAYER_B_SUBMITTED") &&
      match.startAt &&
      state.quizLaunchedForMatchId !== matchId
    ) {
      state.quizLaunchedForMatchId = matchId;
      const assignedIds = match[oppRoleKey]?.selectedForOpponent || [];
      const opponentIds = match[myRoleKey]?.selectedForOpponent || [];

      state.activeMatch.assignedQuestionIds = assignedIds;
      state.activeMatch.opponentQuestionIds = opponentIds;
      state.activeMatch.startAt = match.startAt;
      state.activeMatch.deadlineAt = match.deadlineAt;

      await quizEngine.startQuizSession({
        matchId,
        assignedQuestionIds: assignedIds,
        opponentName: match[oppRoleKey]?.displayName || "Opponent",
        startAt: match.startAt,
        deadlineAt: match.deadlineAt
      });
    }

    // When both players submit or deadline expires, compute & reveal results (S13)
    if (match.state === "COMPLETED") {
      quizEngine.stopTimer();
      await handleMatchEvaluation();
    }
  });
}

// S13 & S14: Evaluate Scores, Update Stats, and Show Match Results
async function handleMatchEvaluation() {
  if (!state.activeMatch?.matchId || state.activeMatch.evaluated) return;
  state.activeMatch.evaluated = true;

  try {
    await finalizeAndRenderMatch({
      matchId: state.activeMatch.matchId,
      activeMatch: state.activeMatch,
      currentUser: state.currentUser,
      userProfile: state.userProfile,
      questionBank: state.questionBank
    });
    populateDashboard(state.userProfile);
    showScreen("screen-results");
  } catch (err) {
    showToast(err.message || "Error calculating match results.");
  }
}

// Support QR Code / Share Link Auto-Join (?room=ABCDEF)
function checkUrlRoomInvite() {
  const params = new URLSearchParams(window.location.search);
  const invitedCode = params.get("room");
  if (invitedCode && invitedCode.trim().length === 6) {
    showScreen("screen-multiplayer");
    document.getElementById("tab-mp-join").click();
    document.getElementById("input-join-code").value = invitedCode.trim().toUpperCase();
    // Clean query string so refreshing doesn't force-open join screen repeatedly
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Global Screen Navigation & Action Buttons
function setupNavigation() {
  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playSoundEffect("click", state.userProfile);
      showScreen(btn.dataset.back);
    });
  });

  const openStats = async () => {
    if (!state.userProfile) return;
    playSoundEffect("click", state.userProfile);
    renderStatsScreen(state.userProfile);
    showScreen("screen-stats");
    await loadMatchHistory(state.currentUser.uid);
  };

  document.getElementById("btn-open-profile").addEventListener("click", openStats);
  document.getElementById("btn-nav-stats").addEventListener("click", openStats);
  document.getElementById("btn-tile-stats").addEventListener("click", openStats);

  const openSettings = () => {
    playSoundEffect("click", state.userProfile);
    showScreen("screen-settings");
  };
  document.getElementById("btn-nav-settings").addEventListener("click", openSettings);
  document.getElementById("btn-tile-settings").addEventListener("click", openSettings);

  document.getElementById("btn-logout").addEventListener("click", async () => {
    cleanupActiveMatchState();
    await logoutUser();
    showToast("Logged out");
  });

  // Mode Selection & Bot Start
  document.getElementById("btn-play-bot").addEventListener("click", startBotFlow);
  document.getElementById("btn-mode-bot").addEventListener("click", startBotFlow);
  document.getElementById("btn-play-pvp").addEventListener("click", () => {
    playSoundEffect("click", state.userProfile);
    showScreen("screen-mode");
  });

  document.getElementById("btn-start-bot-select").addEventListener("click", () => {
    playSoundEffect("click", state.userProfile);
    const oppName = state.activeMatch?.botProfile?.displayName || "Bot";
    questionSelector.resetForNewMatch(oppName);
    showScreen("screen-select-questions");
  });

  document.getElementById("btn-leave-selection").addEventListener("click", () => {
    cleanupActiveMatchState();
    showScreen("screen-dashboard");
  });

  // S13 Match Results & S14 Review Answers Navigation
  document.getElementById("btn-view-review").addEventListener("click", () => {
    playSoundEffect("click", state.userProfile);
    showScreen("screen-review");
  });

  document.getElementById("btn-back-to-results").addEventListener("click", () => {
    playSoundEffect("click", state.userProfile);
    showScreen("screen-results");
  });

  document.getElementById("btn-results-home").addEventListener("click", () => {
    playSoundEffect("click", state.userProfile);
    cleanupActiveMatchState();
    showScreen("screen-dashboard");
  });

  document.getElementById("btn-play-again").addEventListener("click", () => {
    const lastMode = state.activeMatch?.mode;
    cleanupActiveMatchState();
    if (lastMode === "bot") {
      startBotFlow();
    } else {
      showScreen("screen-mode");
    }
  });
}

// Monitor Firebase Connection Status Banner
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

// Application Entry Point
function init() {
  questionSelector = new QuestionSelectorController({
    getQuestionBank: () => state.questionBank,
    showToast,
    onConfirmSelection: async (selectedIds) => {
      await handleConfirmQuestions(selectedIds);
    }
  });

  quizEngine = new QuizEngineController({
    getState: () => state,
    showScreen,
    showToast,
    onMatchReadyForEvaluation: handleMatchEvaluation
  });

  setupAuthUI();
  setupNavigation();
  setupMultiplayerUI();
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
        checkUrlRoomInvite();
      } catch (err) {
        document.getElementById("splash-loader").classList.add("hidden");
        document.getElementById("splash-error").classList.remove("hidden");
        document.getElementById("splash-error-msg").textContent =
          err?.message || "Could not load your player profile. Check your Firebase Realtime Database rules.";
      }
    } else {
      cleanupActiveMatchState();
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
