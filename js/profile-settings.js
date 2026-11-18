import { db, ref, update, get } from "./firebase-config.js";

export function renderStatsScreen(userProfile) {
  const stats = userProfile.stats || { totalMatches: 0, wins: 0, losses: 0, draws: 0, totalPoints: 0 };
  const total = stats.totalMatches || 0;
  const wins = stats.wins || 0;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const avgScore = total > 0 ? Math.round((stats.totalPoints || 0) / total) : 0;

  document.getElementById("stats-avatar").src = userProfile.photoURL;
  document.getElementById("stats-username").textContent = userProfile.displayName;
  document.getElementById("stats-email").textContent = userProfile.email || "";

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-wins").textContent = wins;
  document.getElementById("stat-winrate").textContent = `${winRate}%`;
  document.getElementById("stat-avg").textContent = avgScore;
}

export async function loadMatchHistory(uid) {
  const listEl = document.getElementById("match-history-list");
  try {
    const snap = await get(ref(db, `userMatches/${uid}`));
    if (!snap.exists()) {
      listEl.innerHTML = `<p class="empty-state">No completed matches yet. Start a duel to record your first victory!</p>`;
      return;
    }
    const items = Object.values(snap.val()).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    listEl.innerHTML = items.slice(0, 15).map(m => `
      <div class="setting-row">
        <div>
          <strong>vs ${m.opponentName || "Opponent"}</strong>
          <p class="muted-text sm">${m.mode === "bot" ? "Bot Match" : "Multiplayer"} • Score: ${m.myScore}/100 vs ${m.oppScore}/100</p>
        </div>
        <span class="${m.outcome === 'WIN' ? 'text-green' : m.outcome === 'DRAW' ? 'text-gold' : 'muted-text'}">
          <strong>${m.outcome}</strong>
        </span>
      </div>
    `).join("");
  } catch {
    listEl.innerHTML = `<p class="empty-state">Unable to load match history right now.</p>`;
  }
}

export function bindSettingsControls(getState, showToast) {
  const sfxEl = document.getElementById("set-sfx");
  const bgmEl = document.getElementById("set-bgm");
  const langEl = document.getElementById("set-lang");

  async function saveSettings() {
    const { currentUser, userProfile } = getState();
    if (!currentUser) return;
    const settings = {
      sfx: sfxEl.checked,
      bgm: bgmEl.checked,
      language: langEl.value
    };
    userProfile.settings = settings;
    await update(ref(db, `users/${currentUser.uid}/settings`), settings);
    showToast("Settings saved");
  }

  sfxEl.addEventListener("change", saveSettings);
  bgmEl.addEventListener("change", saveSettings);
  langEl.addEventListener("change", saveSettings);
}
