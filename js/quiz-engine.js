import {
  db,
  ref,
  get,
  set,
  update,
  onValue,
  serverTimestamp
} from "./firebase-config.js";
import { QUIZ_DURATION_MS } from "./multiplayer.js";

// Configurable Rule (Section 2 & Section 16): One-way switch from Typed (10 pts) to MCQ (6 pts)
export const ONE_WAY_MCQ_CONVERSION = true;
export const TIMER_WARNING_SECONDS = 30;

export class QuizEngineController {
  constructor({ getState, showScreen, showToast, onMatchReadyForEvaluation }) {
    this.getState = getState;
    this.showScreen = showScreen;
    this.showToast = showToast;
    this.onMatchReadyForEvaluation = onMatchReadyForEvaluation;

    this.questions = [];          // 10 public question objects assigned to this player
    this.responses = {};          // { [questionId]: { questionId, mode: 'typed'|'mcq', typedText: '', selectedOptionIndex: null, markedForReview: false } }
    this.currentIndex = 0;
    this.deadlineAt = 0;
    this.serverOffsetMs = 0;
    this.timerInterval = null;
    this.isSubmitted = false;

    this.initServerTimeOffset();
    this.bindEvents();
  }

  initServerTimeOffset() {
    const offsetRef = ref(db, ".info/serverTimeOffset");
    onValue(offsetRef, (snap) => {
      this.serverOffsetMs = snap.val() || 0;
    });
  }

  getServerNow() {
    return Date.now() + this.serverOffsetMs;
  }

  bindEvents() {
    const typedInput = document.getElementById("quiz-typed-input");
    typedInput.addEventListener("input", (e) => {
      const q = this.questions[this.currentIndex];
      if (!q || this.isSubmitted) return;
      this.responses[q.questionId].typedText = e.target.value;
      this.renderNavStrip();
      this.persistDraftToFirebase();
    });

    document.getElementById("btn-show-mcq").addEventListener("click", () => {
      const q = this.questions[this.currentIndex];
      if (!q || this.isSubmitted) return;
      const resp = this.responses[q.questionId];
      resp.mode = "mcq";
      this.renderCurrentQuestion();
      this.renderNavStrip();
      this.persistDraftToFirebase();
    });

    document.getElementById("btn-mark-review").addEventListener("click", () => {
      const q = this.questions[this.currentIndex];
      if (!q || this.isSubmitted) return;
      const resp = this.responses[q.questionId];
      resp.markedForReview = !resp.markedForReview;
      this.renderCurrentQuestion();
      this.renderNavStrip();
    });

    document.getElementById("btn-quiz-prev").addEventListener("click", () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.renderCurrentQuestion();
        this.renderNavStrip();
      }
    });

    document.getElementById("btn-quiz-next").addEventListener("click", () => {
      if (this.currentIndex < this.questions.length - 1) {
        this.currentIndex++;
        this.renderCurrentQuestion();
        this.renderNavStrip();
      }
    });

    // Submit Modal Controls
    document.getElementById("btn-quiz-submit-open").addEventListener("click", () => {
      this.openSubmitConfirmationModal();
    });

    document.getElementById("btn-cancel-submit").addEventListener("click", () => {
      document.getElementById("quiz-submit-modal").classList.add("hidden");
    });

    document.getElementById("btn-confirm-final-submit").addEventListener("click", async () => {
      document.getElementById("quiz-submit-modal").classList.add("hidden");
      await this.submitQuiz(false);
    });
  }

  isQuestionAnswered(qId) {
    const r = this.responses[qId];
    if (!r) return false;
    if (r.mode === "mcq") return typeof r.selectedOptionIndex === "number";
    return (r.typedText || "").trim().length > 0;
  }

  // Start or restore a 10-question 7-minute duel
  async startQuizSession({ matchId, assignedQuestionIds, opponentName, startAt, deadlineAt }) {
    const { questionBank, currentUser } = this.getState();
    const bankMap = {};
    questionBank.forEach(q => { bankMap[q.questionId] = q; });

    this.questions = assignedQuestionIds.map(id => bankMap[id]).filter(Boolean);
    this.currentIndex = 0;
    this.isSubmitted = false;

    const now = this.getServerNow();
    this.deadlineAt = deadlineAt || (now + QUIZ_DURATION_MS);

    // Check if player already has saved draft responses in Firebase (for refresh recovery)
    const viewRef = ref(db, `matches/${matchId}/playerViews/${currentUser.uid}`);
    const existingSnap = await get(viewRef);
    const savedResponses = existingSnap.exists() ? (existingSnap.val().responses || {}) : {};

    this.responses = {};
    this.questions.forEach(q => {
      const prev = savedResponses[q.questionId];
      this.responses[q.questionId] = prev || {
        questionId: q.questionId,
        mode: "typed",
        typedText: "",
        selectedOptionIndex: null,
        markedForReview: false
      };
    });

    // If player already submitted before browser refresh, route straight to waiting screen
    if (existingSnap.exists() && existingSnap.val().submitted) {
      this.isSubmitted = true;
      this.showScreen("screen-submitted");
      this.startCountdownTimer();
      return;
    }

    document.getElementById("quiz-opp-name").textContent = opponentName || "Opponent";
    document.getElementById("quiz-submit-modal").classList.add("hidden");

    this.renderNavStrip();
    this.renderCurrentQuestion();
    this.showScreen("screen-quiz");
    this.startCountdownTimer();
    await this.persistDraftToFirebase();
  }

  startCountdownTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const timerPill = document.getElementById("quiz-timer-pill");
    const timerText = document.getElementById("quiz-timer-text");
    const subTimerText = document.getElementById("submitted-timer-text");

    const tick = async () => {
      const remainingMs = Math.max(0, this.deadlineAt - this.getServerNow());
      const totalSeconds = Math.ceil(remainingMs / 1000);
      const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const secs = String(totalSeconds % 60).padStart(2, "0");
      const formatted = `${mins}:${secs}`;

      timerText.textContent = formatted;
      if (subTimerText) subTimerText.textContent = formatted;

      if (totalSeconds <= TIMER_WARNING_SECONDS && totalSeconds > 0) {
        timerPill.classList.add("warning");
      } else {
        timerPill.classList.remove("warning");
      }

      if (remainingMs <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        if (!this.isSubmitted) {
          this.showToast("Time is up! Auto-submitting your answers...");
          await this.submitQuiz(true);
        } else {
          // Deadline reached while waiting for opponent -> trigger final evaluation
          await this.onMatchReadyForEvaluation();
        }
      }
    };

    tick();
    this.timerInterval = setInterval(tick, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  renderNavStrip() {
    const strip = document.getElementById("quiz-nav-strip");
    strip.innerHTML = this.questions.map((q, idx) => {
      const resp = this.responses[q.questionId];
      const answered = this.isQuestionAnswered(q.questionId);
      const isCurrent = idx === this.currentIndex;

      let statusClass = "";
      let statusIcon = "•"; // Unanswered indicator (non-color)
      if (resp?.markedForReview) {
        statusClass = "review";
        statusIcon = "⚑";
      } else if (answered) {
        statusClass = "answered";
        statusIcon = "✓";
      }

      return `
        <button
          type="button"
          class="q-nav-pill ${statusClass} ${isCurrent ? "current" : ""}"
          data-idx="${idx}"
          aria-label="Question ${idx + 1} (${answered ? "Answered" : "Unanswered"})"
        >
          <span>${idx + 1}</span>
          <span class="q-pill-icon" aria-hidden="true">${statusIcon}</span>
        </button>
      `;
    }).join("");

    strip.querySelectorAll(".q-nav-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        this.currentIndex = Number(btn.dataset.idx);
        this.renderCurrentQuestion();
        this.renderNavStrip();
      });
    });
  }

  renderCurrentQuestion() {
    const q = this.questions[this.currentIndex];
    if (!q) return;
    const resp = this.responses[q.questionId];

    document.getElementById("quiz-q-index").textContent = String(this.currentIndex + 1);
    document.getElementById("quiz-q-category").textContent = q.categoryId;
    document.getElementById("quiz-q-text").textContent = q.questionText;

    const ptsBadge = document.getElementById("quiz-q-points-badge");
    const typedPanel = document.getElementById("quiz-typed-panel");
    const mcqPanel = document.getElementById("quiz-mcq-panel");

    if (resp.mode === "mcq") {
      ptsBadge.textContent = "MCQ Mode • Max 6 pts";
      typedPanel.classList.add("hidden");
      mcqPanel.classList.remove("hidden");
      this.renderMcqOptions(q, resp);
    } else {
      ptsBadge.textContent = "Typed Mode • Max 10 pts";
      typedPanel.classList.remove("hidden");
      mcqPanel.classList.add("hidden");
      const inputEl = document.getElementById("quiz-typed-input");
      inputEl.value = resp.typedText || "";
    }

    // Review button state
    const reviewBtn = document.getElementById("btn-mark-review");
    if (resp.markedForReview) {
      reviewBtn.textContent = "⚑ Marked for Review";
      reviewBtn.classList.add("active-review");
    } else {
      reviewBtn.textContent = "⚑ Mark for Review";
      reviewBtn.classList.remove("active-review");
    }

    // Previous / Next buttons
    document.getElementById("btn-quiz-prev").disabled = this.currentIndex === 0;
    document.getElementById("btn-quiz-next").disabled = this.currentIndex === this.questions.length - 1;
  }

  renderMcqOptions(q, resp) {
    const listEl = document.getElementById("quiz-mcq-list");
    listEl.innerHTML = (q.mcqOptions || []).map((optText, idx) => {
      const isSelected = resp.selectedOptionIndex === idx;
      return `
        <button
          type="button"
          class="mcq-option-btn ${isSelected ? "selected" : ""}"
          data-opt-idx="${idx}"
          role="radio"
          aria-checked="${isSelected}"
        >
          <div class="mcq-left">
            <span class="mcq-radio-circle">${isSelected ? "●" : ""}</span>
            <span>${optText}</span>
          </div>
          <span class="mcq-check-badge" aria-hidden="true">✓</span>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll(".mcq-option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isSubmitted) return;
        resp.selectedOptionIndex = Number(btn.dataset.optIdx);
        this.renderMcqOptions(q, resp);
        this.renderNavStrip();
        this.persistDraftToFirebase();
      });
    });
  }

  openSubmitConfirmationModal() {
    const total = this.questions.length;
    const answeredCount = this.questions.filter(q => this.isQuestionAnswered(q.questionId)).length;
    const unansweredCount = total - answeredCount;

    const summaryEl = document.getElementById("submit-modal-summary");
    if (unansweredCount === 0) {
      summaryEl.textContent = `You have answered all ${total} questions! Ready to lock your answers?`;
    } else {
      summaryEl.textContent = `You have answered ${answeredCount} of ${total} questions (${unansweredCount} unanswered will be scored as 0).`;
    }

    document.getElementById("quiz-submit-modal").classList.remove("hidden");
  }

  async persistDraftToFirebase() {
    const { activeMatch, currentUser } = this.getState();
    if (!activeMatch?.matchId || !currentUser) return;
    try {
      await update(ref(db, `matches/${activeMatch.matchId}/playerViews/${currentUser.uid}`), {
        responses: this.responses,
        updatedAt: serverTimestamp()
      });
    } catch {}
  }

  async submitQuiz(isAutoTimeout = false) {
    if (this.isSubmitted) return;
    this.isSubmitted = true;

    const { activeMatch, currentUser } = this.getState();
    if (!activeMatch?.matchId || !currentUser) return;

    const matchId = activeMatch.matchId;
    const uid = currentUser.uid;

    // 1. Lock player's responses in /matches/{matchId}/playerViews/{uid}
    await set(ref(db, `matches/${matchId}/playerViews/${uid}`), {
      uid,
      responses: this.responses,
      submitted: true,
      autoSubmittedOnTimeout: isAutoTimeout,
      submittedAt: serverTimestamp()
    });

    // 2. Show S12 Submitted / Waiting Screen immediately
    this.showScreen("screen-submitted");

    if (activeMatch.mode === "bot") {
      document.getElementById("submitted-waiting-text").textContent =
        `Calculating scores against ${activeMatch.botProfile?.displayName || "Bot"}...`;
      this.stopTimer();
      await update(ref(db, `matches/${matchId}`), {
        state: "COMPLETED",
        completedAt: serverTimestamp()
      });
      await this.onMatchReadyForEvaluation();
      return;
    }

    // 3. Human Multiplayer: Mark playerA or playerB as submitted
    const roleKey = activeMatch.playerRoleKey || "playerA";
    await update(ref(db, `matches/${matchId}/${roleKey}`), {
      quizSubmitted: true,
      submittedAt: serverTimestamp()
    });

    const matchSnap = await get(ref(db, `matches/${matchId}`));
    if (!matchSnap.exists()) return;
    const match = matchSnap.val();

    const bothSubmitted = !!(match.playerA?.quizSubmitted && match.playerB?.quizSubmitted);
    if (bothSubmitted || isAutoTimeout) {
      this.stopTimer();
      await update(ref(db, `matches/${matchId}`), {
        state: "COMPLETED",
        completedAt: serverTimestamp()
      });
      await this.onMatchReadyForEvaluation();
    } else {
      const nextState = roleKey === "playerA" ? "PLAYER_A_SUBMITTED" : "PLAYER_B_SUBMITTED";
      await update(ref(db, `matches/${matchId}`), { state: nextState });
      document.getElementById("submitted-waiting-text").textContent =
        `Waiting for ${activeMatch.opponentName || "your opponent"} to submit...`;
    }
  }
}
