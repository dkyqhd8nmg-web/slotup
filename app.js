// ============================================
// SLOTUP - MODULAR REFACTOR
// ============================================

const SlotUp = {
  // -------------------------------------------------------------------------
  // Config: Configuration and Constants
  // -------------------------------------------------------------------------
  Config: {
    SUPABASE_URL: 'https://lzehwbueywdddkzovmun.supabase.co',
    SUPABASE_KEY: 'sb_publishable_rm_UBkN_mKvBX-WJqXhiDQ_2tpvnFgB',
    STATUS_COLORS: {
      available: '#4caf50',
      maybe: '#ff9800',
      'not-available': '#f44336'
    },
    STATUS_CLASSES: {
      available: 'available',
      maybe: 'maybe',
      'not-available': 'not-available'
    }
  },

  // -------------------------------------------------------------------------
  // State: Application State
  // -------------------------------------------------------------------------
  State: {
    currentPlanId: null,
    savingInProgress: false,
    selectedStatus: 'available',
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    savedParticipants: new Set()
  },

  // -------------------------------------------------------------------------
  // Utils: Helper Functions
  // -------------------------------------------------------------------------
  Utils: {
    supabaseClient: null,

    initClient() {
      const { createClient } = supabase;
      this.supabaseClient = createClient(SlotUp.Config.SUPABASE_URL, SlotUp.Config.SUPABASE_KEY);
    },

    safeQuery(selector) {
      const el = document.querySelector(selector);
      if (!el) console.warn(`Element not found: ${selector}`);
      return el;
    },

    debounce(func, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
      };
    },

    formatMonthYear(year, month) {
      const d = new Date(year, month);
      return d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
  },

  // -------------------------------------------------------------------------
  // API: Backend Interactions
  // -------------------------------------------------------------------------
  API: {
    async createPlan(planName) {
      const { data, error } = await SlotUp.Utils.supabaseClient
        .from('plans')
        .insert({ name: planName })
        .select('id, name')
        .single();

      if (error) {
        console.error('Error creating plan:', error);
        throw error;
      }
      return data;
    },

    async saveAvailability(planId, participantName, availabilities) {
      // 1. Clear old data
      const { error: deleteError } = await SlotUp.Utils.supabaseClient
        .from('availabilities')
        .delete()
        .eq('plan_id', planId)
        .eq('participant_name', participantName);

      if (deleteError) {
        throw new Error('Error clearing old availability: ' + deleteError.message);
      }

      // 2. Insert new data
      const { error: insertError } = await SlotUp.Utils.supabaseClient
        .from('availabilities')
        .insert(availabilities);

      if (insertError) {
        throw new Error('Error saving availability: ' + insertError.message);
      }

      return true;
    },

    async loadAvailability(planId, participantName) {
      const { data, error } = await SlotUp.Utils.supabaseClient
        .from('availabilities')
        .select('day, status')
        .eq('plan_id', planId)
        .eq('participant_name', participantName);

      if (error) {
        console.error('Error loading availability:', error);
        return [];
      }
      return data;
    },

    async getPlanSummary(planId) {
      const { data, error } = await SlotUp.Utils.supabaseClient
        .from('availabilities')
        .select('day, status')
        .eq('plan_id', planId);

      if (error) {
        console.error('Error loading summary:', error);
        throw error;
      }
      return data;
    }
  },

  // -------------------------------------------------------------------------
  // UI: DOM Manipulation & View Logic
  // -------------------------------------------------------------------------
  UI: {
    elements: {},

    cacheElements() {
      const q = SlotUp.Utils.safeQuery;
      this.elements = {
        calendar: document.getElementById('calendar'),
        creatorDashboard: document.getElementById('creator-dashboard'),
        participantView: document.getElementById('participant-view'),
        planTitle: document.getElementById('plan-title'),
        participantName: document.getElementById('participant-name'),
        saveBtn: document.getElementById('save-btn'),
        createPlanBtn: document.getElementById('create-plan-btn'),
        planNameInput: document.getElementById('plan-name'),
        shareSection: document.getElementById('share-section'),
        shareUrl: document.getElementById('share-url'),
        copyShareBtn: document.getElementById('copy-share-url'),
        backToCreatorBtn: document.getElementById('back-to-creator'),
        summaryBtn: document.getElementById('summary-btn'),
        summaryContainer: document.getElementById('summary'),
        calendarControls: null, // Dynamic
        monthYearDisplay: document.createElement('div'),
        controlsContainer: document.createElement('div'),
        statusLegend: document.getElementById('status-legend'),
        participantSection: document.getElementById('participant-section')
      };
    },

    init() {
      this.cacheElements();

      // Initialize Control Elements
      if (this.elements.controlsContainer) {
        this.elements.controlsContainer.id = 'calendar-controls';
        this.elements.controlsContainer.style.textAlign = 'center';
        this.elements.controlsContainer.style.marginBottom = '1em';
      }

      this.bindEvents();
    },

    bindEvents() {
      const els = this.elements;

      // Status Legend Click
      if (els.statusLegend) {
        els.statusLegend.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') {
            SlotUp.State.selectedStatus = e.target.getAttribute('data-status');
          }
        });
      }

      // Create Plan
      if (els.createPlanBtn) {
        els.createPlanBtn.addEventListener('click', async () => {
          const name = els.planNameInput.value.trim();
          if (!name) return alert('Enter plan name');
          try {
            const planData = await SlotUp.API.createPlan(name);
            this.handlePlanCreated(planData);
          } catch (e) {
            alert('Error creating plan');
          }
        });
      }

      // Copy Link
      if (els.copyShareBtn) {
        els.copyShareBtn.addEventListener('click', () => {
          if (els.shareUrl) {
            navigator.clipboard.writeText(els.shareUrl.value).then(() => alert('Link copied!'));
          }
        });
      }

      // Back to Creator
      if (els.backToCreatorBtn) {
        els.backToCreatorBtn.addEventListener('click', () => {
          window.location.href = window.location.pathname;
        });
      }

      // Participant Name Input (Debounced)
      if (els.participantName) {
        const loadDebounced = SlotUp.Utils.debounce(async (name) => {
          if (name && SlotUp.State.currentPlanId) {
            await this.loadAndRenderUserAvailability(name);
          }
        }, 500);

        els.participantName.addEventListener('input', (e) => {
          this.updateSaveButtonState(e.target.value.trim());
          loadDebounced(e.target.value.trim());
        });
      }

      // Save Button
      if (els.saveBtn) {
        els.saveBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          if (els.saveBtn.disabled) return;

          const name = els.participantName.value.trim();
          if (!name) return alert('Enter your name first');

          await this.handleSaveAvailability(name);
        });
      }

      // Summary Button
      if (els.summaryBtn) {
        els.summaryBtn.addEventListener('click', () => this.toggleSummary());
      }
    },

    handlePlanCreated(planData) {
      SlotUp.State.currentPlanId = planData.id;
      const url = `${window.location.origin}${window.location.pathname}?plan=${planData.id}`;
      if (this.elements.shareUrl) this.elements.shareUrl.value = url;
      if (this.elements.shareSection) this.elements.shareSection.style.display = 'block';
      if (this.elements.planNameInput) this.elements.planNameInput.value = '';
    },

    async loadAndRenderUserAvailability(name) {
      const data = await SlotUp.API.loadAvailability(SlotUp.State.currentPlanId, name);

      // Reset calendar View
      this.elements.calendar.querySelectorAll('div.calendar-day').forEach(div => {
        div.className = 'calendar-day';
        div.removeAttribute('data-status');
        // We don't remove textContent (day number)
      });

      // Apply loaded data
      data.forEach(({ day, status }) => {
        const date = new Date(day);
        // Only apply if matches current view
        if (date.getFullYear() === SlotUp.State.currentYear &&
          date.getMonth() === SlotUp.State.currentMonth) {
          const dayNum = date.getDate();
          // Find element by text content
          const dayDiv = Array.from(this.elements.calendar.children).find(
            d => d.classList.contains('calendar-day') && parseInt(d.textContent) === dayNum
          );
          if (dayDiv) {
            dayDiv.setAttribute('data-status', status);
            dayDiv.className = `calendar-day ${SlotUp.Config.STATUS_CLASSES[status]}`;
          }
        }
      });
    },

    updateSaveButtonState(currentName) {
      const btn = this.elements.saveBtn;
      if (!btn) return;

      if (!SlotUp.State.savedParticipants.has(currentName)) {
        btn.disabled = false;
        btn.textContent = 'Save Availability';
        btn.style.removeProperty('pointer-events');
        btn.style.removeProperty('opacity');
        btn.style.removeProperty('cursor');
      }
    },

    async handleSaveAvailability(name) {
      const btn = this.elements.saveBtn;

      // UI: Loading state
      btn.disabled = true;
      btn.textContent = 'Saving...';
      btn.style.opacity = '0.6';

      try {
        // Collect Data
        const availabilities = [];
        const dayDivs = this.elements.calendar.querySelectorAll('div[data-status]');

        dayDivs.forEach(dayEl => {
          const day = dayEl.textContent.padStart(2, '0');
          const status = dayEl.getAttribute('data-status');
          const dayDate = `${SlotUp.State.currentYear}-${String(SlotUp.State.currentMonth + 1).padStart(2, '0')}-${day}`;

          availabilities.push({
            plan_id: SlotUp.State.currentPlanId,
            day: dayDate,
            participant_name: name,
            status: status
          });
        });

        if (availabilities.length === 0) {
          alert('No days selected.');
          throw new Error('No data');
        }

        await SlotUp.API.saveAvailability(SlotUp.State.currentPlanId, name, availabilities);

        SlotUp.State.savedParticipants.add(name);
        btn.textContent = '✓ Saved';

      } catch (error) {
        if (error.message !== 'No data') {
          console.error(error);
          alert('Error saving data');
        }
        // Reset button on error (unless it was just empty data which we handled)
        if (error.message !== 'No data') {
          this.updateSaveButtonState(name); // Reset
        }
      }
    },

    renderCalendar(year, month) {
      const cal = this.elements.calendar;
      if (!cal) return;

      cal.innerHTML = '';

      // Update Controls Display
      this.elements.monthYearDisplay.textContent = SlotUp.Utils.formatMonthYear(year, month);

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysCount = lastDay.getDate();
      const startDay = firstDay.getDay();

      // Headers
      const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        cal.appendChild(header);
      });

      // Empty cells
      for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        // Note: 'empty' class allows us to style them differently (e.g. transparent background)
        cal.appendChild(empty);
      }

      // Day cells
      for (let day = 1; day <= daysCount; day++) {
        const dayEl = document.createElement('div');
        dayEl.textContent = day;
        dayEl.className = 'calendar-day';
        dayEl.addEventListener('click', () => {
          const status = SlotUp.State.selectedStatus;
          dayEl.setAttribute('data-status', status);
          dayEl.className = `calendar-day ${SlotUp.Config.STATUS_CLASSES[status]}`;
        });
        cal.appendChild(dayEl);
      }
    },

    renderControls() {
      // Create controls if not injected yet
      const container = this.elements.controlsContainer;
      container.innerHTML = ''; // Clear

      const prevBtn = document.createElement('button');
      prevBtn.textContent = '<';
      prevBtn.style.padding = '8px 12px';
      prevBtn.onclick = () => this.navigateMonth(-1);

      const nextBtn = document.createElement('button');
      nextBtn.textContent = '>';
      nextBtn.style.padding = '8px 12px';
      nextBtn.onclick = () => this.navigateMonth(1);

      const display = this.elements.monthYearDisplay;
      display.style.fontWeight = 'bold';
      display.style.fontSize = '1.2em';
      display.style.display = 'inline-block';
      display.style.minWidth = '140px';

      container.appendChild(prevBtn);
      container.appendChild(display);
      container.appendChild(nextBtn);

      if (this.elements.calendar && this.elements.calendar.parentNode) {
        this.elements.calendar.parentNode.insertBefore(container, this.elements.calendar);
      }
    },

    navigateMonth(offset) {
      SlotUp.State.currentMonth += offset;
      if (SlotUp.State.currentMonth < 0) {
        SlotUp.State.currentMonth = 11;
        SlotUp.State.currentYear--;
      } else if (SlotUp.State.currentMonth > 11) {
        SlotUp.State.currentMonth = 0;
        SlotUp.State.currentYear++;
      }
      this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

      // Reload availabilities for this month if user is present
      const name = this.elements.participantName?.value.trim();
      if (name) {
        this.loadAndRenderUserAvailability(name);
      }
    },

    async toggleSummary() {
      const summaryEl = this.elements.summaryContainer;
      const isVisible = summaryEl && getComputedStyle(summaryEl).display !== 'none';

      if (isVisible) {
        // Hide Summary
        summaryEl.style.display = 'none';
        this.setMainViewVisibility(true);
        this.elements.summaryBtn.textContent = '📊 Show Summary';
      } else {
        // Show Summary
        await this.renderSummary();
        this.elements.summaryBtn.textContent = 'Back to Plan';
      }
    },

    async renderSummary() {
      const summaryEl = this.elements.summaryContainer;
      try {
        const data = await SlotUp.API.getPlanSummary(SlotUp.State.currentPlanId);

        if (!data || data.length === 0) {
          summaryEl.innerHTML = '<p>No availability data yet.</p>';
          summaryEl.style.display = 'block';
          this.setMainViewVisibility(false);
          return;
        }

        // Process Data
        const days = {};
        data.forEach(row => {
          const dayKey = row.day.split('T')[0];
          if (!days[dayKey]) days[dayKey] = { available: 0, maybe: 0, 'not-available': 0, total: 0 };
          days[dayKey][row.status]++;
          days[dayKey].total++;
        });

        // Build Table
        let html = '<table><thead><tr><th>Date</th><th>Available</th><th>Maybe</th><th>Not Available</th><th>Total</th></tr></thead><tbody>';
        Object.keys(days).sort().forEach(key => {
          const d = days[key];
          const dateStr = new Date(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          html += `<tr>
              <td>${dateStr}</td>
              <td>${d.available}</td>
              <td>${d.maybe}</td>
              <td>${d['not-available']}</td>
              <td>${d.total}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        summaryEl.innerHTML = html;
        summaryEl.style.display = 'block';
        this.setMainViewVisibility(false);

      } catch (e) {
        summaryEl.innerHTML = '<p>Error loading summary</p>';
        summaryEl.style.display = 'block';
      }
    },

    setMainViewVisibility(visible) {
      // Use empty string to remove inline style and let CSS take over (display: grid)
      const display = visible ? '' : 'none';
      if (this.elements.calendar) this.elements.calendar.style.display = display;
      if (this.elements.controlsContainer) this.elements.controlsContainer.style.display = display;
      if (this.elements.participantSection) this.elements.participantSection.style.display = display;
      if (this.elements.statusLegend) this.elements.statusLegend.style.display = display;
    },

    resetToParticipantView(planId) {
      SlotUp.State.currentPlanId = parseInt(planId);
      if (this.elements.planTitle) this.elements.planTitle.textContent = `Plan #${planId}`;
      if (this.elements.creatorDashboard) this.elements.creatorDashboard.style.display = 'none';
      if (this.elements.participantView) this.elements.participantView.style.display = 'block';

      // Init Calendar
      if (this.elements.calendar) {
        // Ensure we don't accidentally force block
        this.elements.calendar.style.display = '';
        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);
      }
    }
  },

  // -------------------------------------------------------------------------
  // Main: Entry Point
  // -------------------------------------------------------------------------
  init() {
    this.Utils.initClient();
    this.UI.init();

    // Check URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const planId = urlParams.get('plan');

    if (planId) {
      this.UI.resetToParticipantView(planId);
    } else {
      if (this.UI.elements.creatorDashboard) {
        this.UI.elements.creatorDashboard.style.display = 'block';
      }
      if (this.UI.elements.participantView) {
        this.UI.elements.participantView.style.display = 'none';
      }
    }
  }
};

// Start App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  SlotUp.init();
});
