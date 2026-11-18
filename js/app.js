import { auth, db, onAuthStateChanged, ref, onValue } from "./firebase-config.js";
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
  authMode: "login" // "login" | "register"
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

  // Placeholders wired for Sub-Task 3 & 4
  document.getElementById("btn-play-bot").addEventListener("click", () => {
    showToast("Bot Mode unlocks in Sub-Task 3!");
  });
  document.getElementById("btn-play-pvp").addEventListener("click", () => {
    showToast("Multiplayer Rooms unlock in Sub-Task 4!");
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
