const REQUIRED_COUNT = 10;

export class QuestionSelectorController {
  constructor({ getQuestionBank, showToast, onConfirmSelection }) {
    this.getQuestionBank = getQuestionBank;
    this.showToast = showToast;
    this.onConfirmSelection = onConfirmSelection;

    this.selectedIds = new Set();
    this.activeFilter = "ALL";
    this.searchQuery = "";

    this.chipsContainer = document.getElementById("category-chips");
    this.searchInput = document.getElementById("question-search-input");
    this.listContainer = document.getElementById("question-select-list");
    this.counterText = document.getElementById("selected-counter-text");
    this.statusIcon = document.getElementById("selected-status-icon");
    this.confirmBtn = document.getElementById("btn-confirm-selection");
    this.autoSelectBtn = document.getElementById("btn-auto-select");
    this.clearBtn = document.getElementById("btn-clear-select");

    this.bindEvents();
  }

  bindEvents() {
    this.searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderQuestionList();
    });

    this.autoSelectBtn.addEventListener("click", () => this.autoSelectRemaining());
    this.clearBtn.addEventListener("click", () => {
      this.selectedIds.clear();
      this.updateSummaryUI();
      this.renderQuestionList();
    });

    this.confirmBtn.addEventListener("click", async () => {
      if (this.selectedIds.size !== REQUIRED_COUNT) return;
      this.confirmBtn.disabled = true;
      await this.onConfirmSelection(Array.from(this.selectedIds));
    });
  }

  resetForNewMatch(opponentDisplayName = "your opponent") {
    this.selectedIds.clear();
    this.activeFilter = "ALL";
    this.searchQuery = "";
    this.searchInput.value = "";
    document.getElementById("select-opp-name").textContent = opponentDisplayName;
    this.renderCategoryChips();
    this.renderQuestionList();
    this.updateSummaryUI();
  }

  renderCategoryChips() {
    const bank = this.getQuestionBank();
    const categories = Array.from(new Set(bank.map(q => q.categoryId)));
    const filters = ["ALL", "Old Testament", "New Testament", ...categories];

    this.chipsContainer.innerHTML = filters.map(f => {
      const label = f === "ALL" ? "All (100)" : f;
      const isActive = f === this.activeFilter ? "active" : "";
      return `<button type="button" class="chip-btn ${isActive}" data-filter="${f}">${label}</button>`;
    }).join("");

    this.chipsContainer.querySelectorAll(".chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.activeFilter = btn.dataset.filter;
        this.renderCategoryChips();
        this.renderQuestionList();
      });
    });
  }

  getFilteredQuestions() {
    const bank = this.getQuestionBank().filter(q => q.active !== false);
    return bank.filter(q => {
      const matchesFilter =
        this.activeFilter === "ALL" ||
        q.testament === this.activeFilter ||
        q.categoryId === this.activeFilter;

      if (!matchesFilter) return false;
      if (!this.searchQuery) return true;

      const hay = `${q.questionText} ${q.categoryId} ${(q.keywords || []).join(" ")}`.toLowerCase();
      return hay.includes(this.searchQuery);
    });
  }

  toggleQuestion(questionId) {
    if (this.selectedIds.has(questionId)) {
      this.selectedIds.delete(questionId);
    } else {
      if (this.selectedIds.size >= REQUIRED_COUNT) {
        this.showToast("You have already selected 10 questions. Deselect one to swap.");
        return;
      }
      this.selectedIds.add(questionId);
    }
    this.updateSummaryUI();
    this.renderQuestionList();
  }

  // Auto Select fills ONLY the remaining slots and preserves manually chosen questions (Section 4.3 S08)
  autoSelectRemaining() {
    const remainingNeeded = REQUIRED_COUNT - this.selectedIds.size;
    if (remainingNeeded <= 0) {
      this.showToast("All 10 slots are already filled!");
      return;
    }

    // Prefer current filtered view first; if not enough, pull from full active bank
    let unselectedPool = this.getFilteredQuestions().filter(q => !this.selectedIds.has(q.questionId));
    if (unselectedPool.length < remainingNeeded) {
      unselectedPool = this.getQuestionBank().filter(q => q.active !== false && !this.selectedIds.has(q.questionId));
    }

    const shuffled = [...unselectedPool].sort(() => Math.random() - 0.5);
    shuffled.slice(0, remainingNeeded).forEach(q => this.selectedIds.add(q.questionId));

    this.updateSummaryUI();
    this.renderQuestionList();
    this.showToast(`Auto-selected ${remainingNeeded} question${remainingNeeded === 1 ? "" : "s"}!`);
  }

  updateSummaryUI() {
    const count = this.selectedIds.size;
    this.counterText.textContent = `${count}/${REQUIRED_COUNT}`;
    if (count === REQUIRED_COUNT) {
      this.statusIcon.textContent = "✓";
      this.statusIcon.classList.add("ready");
      this.confirmBtn.disabled = false;
    } else {
      this.statusIcon.textContent = String(count);
      this.statusIcon.classList.remove("ready");
      this.confirmBtn.disabled = true;
    }
  }

  renderQuestionList() {
    const list = this.getFilteredQuestions();
    if (list.length === 0) {
      this.listContainer.innerHTML = `<p class="empty-state">No questions match your filter/search.</p>`;
      return;
    }

    this.listContainer.innerHTML = list.map(q => {
      const isSelected = this.selectedIds.has(q.questionId);
      return `
        <div class="q-select-item ${isSelected ? "selected" : ""}" data-qid="${q.questionId}" role="option" aria-selected="${isSelected}">
          <div class="q-item-left">
            <span class="q-check">✓</span>
            <span class="q-item-text">${q.questionText}</span>
          </div>
          <span class="q-item-meta">${q.categoryId}</span>
        </div>
      `;
    }).join("");

    this.listContainer.querySelectorAll(".q-select-item").forEach(row => {
      row.addEventListener("click", () => this.toggleQuestion(row.dataset.qid));
    });
  }
}
