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
    },
    VIEW_MODES: {
      SINGLE: 'single',
      TRIPLE: 'triple'
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
    savedParticipants: new Set(),
    viewMode: 'single', // 'single' or 'triple'
    creatorSelectedDates: new Set(), // Dates selected by plan creator
    isCreatorMode: false, // Whether user is selecting dates as creator
    currentPlanDates: null // Selected dates for current plan (for participants)
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
    async createPlan(planName, selectedDates = []) {
      const { data, error } = await SlotUp.Utils.supabaseClient
        .from('plans')
        .insert({
          name: planName,
          selected_dates: selectedDates
        })
        .select('id, name, selected_dates')
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
    },

    async getPlanDates(planId) {
      const { data, error } = await SlotUp.Utils.supabaseClient
        .from('plans')
        .select('selected_dates')
        .eq('id', planId)
        .single();

      if (error) {
        console.error('Error loading plan dates:', error);
        return null;
      }
      return data?.selected_dates || [];
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
        viewToggleContainer: document.createElement('div'),
        viewToggleSingle: document.createElement('button'),
        viewToggleTriple: document.createElement('button'),
        statusLegend: document.getElementById('status-legend'),
        participantSection: document.getElementById('participant-section'),
        creatorDateSelection: document.getElementById('creator-date-selection'),
        creatorInstructions: document.getElementById('creator-instructions'),
        creatorContinueBtn: document.getElementById('creator-continue-btn'),
        creatorCalendar: document.getElementById('creator-calendar')
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

      // Create Plan - Now shows date selection first
      if (els.createPlanBtn) {
        els.createPlanBtn.addEventListener('click', () => {
          const name = els.planNameInput.value.trim();
          if (!name) return alert('Enter plan name');
          this.showCreatorDateSelection(name);
        });
      }

      // Creator Continue Button - Creates plan with selected dates
      if (els.creatorContinueBtn) {
        els.creatorContinueBtn.addEventListener('click', async () => {
          await this.completeCreatorSelection();
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

      // View Toggle Buttons
      if (els.viewToggleSingle) {
        els.viewToggleSingle.addEventListener('click', () => this.switchViewMode(SlotUp.Config.VIEW_MODES.SINGLE));
      }
      if (els.viewToggleTriple) {
        els.viewToggleTriple.addEventListener('click', () => this.switchViewMode(SlotUp.Config.VIEW_MODES.TRIPLE));
      }
    },

    handlePlanCreated(planData) {
      SlotUp.State.currentPlanId = planData.id;
      const url = `${window.location.origin}${window.location.pathname}?plan=${planData.id}`;
      if (this.elements.shareUrl) this.elements.shareUrl.value = url;
      if (this.elements.shareSection) this.elements.shareSection.style.display = 'block';
      if (this.elements.planNameInput) this.elements.planNameInput.value = '';
    },

    showCreatorDateSelection(planName) {
      // Store plan name for later
      SlotUp.State.currentPlanName = planName;
      SlotUp.State.isCreatorMode = true;
      SlotUp.State.creatorSelectedDates.clear();

      // Hide creator dashboard, show date selection
      if (this.elements.creatorDashboard) {
        this.elements.creatorDashboard.style.display = 'none';
      }
      if (this.elements.creatorDateSelection) {
        this.elements.creatorDateSelection.style.display = 'block';
      }

      // Render calendar in creator mode directly to creator calendar element
      if (this.elements.creatorCalendar) {
        // Clear creator calendar first
        this.elements.creatorCalendar.innerHTML = '';

        // Save original, swap temporarily just for rendering
        const originalCalendar = this.elements.calendar;
        this.elements.calendar = this.elements.creatorCalendar;

        // Render controls and calendar
        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

        // Restore original calendar reference immediately
        this.elements.calendar = originalCalendar;
      }
    },

    async completeCreatorSelection() {
      if (SlotUp.State.creatorSelectedDates.size === 0) {
        alert('Please select at least one date');
        return;
      }

      const selectedDatesArray = Array.from(SlotUp.State.creatorSelectedDates);

      try {
        const planData = await SlotUp.API.createPlan(SlotUp.State.currentPlanName, selectedDatesArray);

        // Hide date selection, show creator dashboard
        if (this.elements.creatorDateSelection) {
          this.elements.creatorDateSelection.style.display = 'none';
        }
        if (this.elements.creatorDashboard) {
          this.elements.creatorDashboard.style.display = 'block';
        }

        // Reset creator mode
        SlotUp.State.isCreatorMode = false;
        SlotUp.State.creatorSelectedDates.clear();

        // Show plan created message
        this.handlePlanCreated(planData);
      } catch (e) {
        console.error(e);
        alert('Error creating plan');
      }
    },

    async loadAndRenderUserAvailability(name) {
      const data = await SlotUp.API.loadAvailability(SlotUp.State.currentPlanId, name);

      // Reset all calendar day cells
      this.elements.calendar.querySelectorAll('div.calendar-day').forEach(div => {
        div.className = 'calendar-day';
        div.removeAttribute('data-status');
      });

      // Apply loaded data
      data.forEach(({ day, status }) => {
        const date = new Date(day);
        const year = date.getFullYear();
        const month = date.getMonth();
        const dayNum = date.getDate();

        // Find the calendar grid that matches this date
        const grids = this.elements.calendar.querySelectorAll('.calendar-grid');
        grids.forEach(grid => {
          const gridYear = parseInt(grid.getAttribute('data-year'));
          const gridMonth = parseInt(grid.getAttribute('data-month'));

          if (gridYear === year && gridMonth === month) {
            // Find the day element within this grid
            const dayDiv = Array.from(grid.querySelectorAll('.calendar-day')).find(
              d => parseInt(d.getAttribute('data-day')) === dayNum
            );
            if (dayDiv) {
              dayDiv.setAttribute('data-status', status);
              dayDiv.className = `calendar-day ${SlotUp.Config.STATUS_CLASSES[status]}`;
            }
          }
        });
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
        // Collect Data from all calendar grids
        const availabilities = [];
        const grids = this.elements.calendar.querySelectorAll('.calendar-grid');

        grids.forEach(grid => {
          const gridYear = parseInt(grid.getAttribute('data-year'));
          const gridMonth = parseInt(grid.getAttribute('data-month'));
          const dayDivs = grid.querySelectorAll('div[data-status]');

          dayDivs.forEach(dayEl => {
            const day = dayEl.getAttribute('data-day').padStart(2, '0');
            const status = dayEl.getAttribute('data-status');
            const dayDate = `${gridYear}-${String(gridMonth + 1).padStart(2, '0')}-${day}`;

            availabilities.push({
              plan_id: SlotUp.State.currentPlanId,
              day: dayDate,
              participant_name: name,
              status: status
            });
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
      if (!cal) {
        return;
      }

      cal.innerHTML = '';

      if (SlotUp.State.viewMode === SlotUp.Config.VIEW_MODES.TRIPLE) {
        // Render 3-month view
        cal.className = 'calendar-container-triple';

        // Update month/year display to show range
        const endMonth = month + 2;
        const endYear = endMonth > 11 ? year + 1 : year;
        const adjustedEndMonth = endMonth > 11 ? endMonth - 12 : endMonth;

        const displayText = `${SlotUp.Utils.formatMonthYear(year, month)} - ${SlotUp.Utils.formatMonthYear(endYear, adjustedEndMonth)}`;
        if (this.elements.monthYearDisplay) {
          this.elements.monthYearDisplay.textContent = displayText;
        }

        // Render 3 consecutive months
        for (let i = 0; i < 3; i++) {
          let currentMonth = month + i;
          let currentYear = year;

          // Handle year overflow
          if (currentMonth > 11) {
            currentMonth -= 12;
            currentYear++;
          }

          const monthWrapper = document.createElement('div');
          monthWrapper.className = 'calendar-month-wrapper';

          // Add month label
          const monthLabel = document.createElement('div');
          monthLabel.className = 'calendar-month-label';
          monthLabel.textContent = SlotUp.Utils.formatMonthYear(currentYear, currentMonth);
          monthWrapper.appendChild(monthLabel);

          // Create grid container
          const monthGrid = document.createElement('div');
          monthGrid.className = 'calendar-grid';
          monthGrid.setAttribute('data-year', currentYear);
          monthGrid.setAttribute('data-month', currentMonth);

          this.renderMonthGrid(monthGrid, currentYear, currentMonth);
          monthWrapper.appendChild(monthGrid);
          cal.appendChild(monthWrapper);
        }
      } else {
        // Render single month view
        cal.className = 'calendar-container-single';
        this.elements.monthYearDisplay.textContent = SlotUp.Utils.formatMonthYear(year, month);

        const monthGrid = document.createElement('div');
        monthGrid.className = 'calendar-grid';
        monthGrid.setAttribute('data-year', year);
        monthGrid.setAttribute('data-month', month);

        this.renderMonthGrid(monthGrid, year, month);
        cal.appendChild(monthGrid);
      }
    },

    renderMonthGrid(gridElement, year, month) {
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
        gridElement.appendChild(header);
      });

      // Empty cells
      for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        gridElement.appendChild(empty);
      }

      // Day cells
      for (let day = 1; day <= daysCount; day++) {
        const dayEl = document.createElement('div');
        dayEl.textContent = day;
        dayEl.className = 'calendar-day';
        dayEl.setAttribute('data-day', day);

        const dayDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (SlotUp.State.isCreatorMode) {
          // Creator mode: Allow selecting any date
          dayEl.addEventListener('click', () => {
            if (SlotUp.State.creatorSelectedDates.has(dayDate)) {
              SlotUp.State.creatorSelectedDates.delete(dayDate);
              dayEl.classList.remove('creator-selected');
            } else {
              SlotUp.State.creatorSelectedDates.add(dayDate);
              dayEl.classList.add('creator-selected');
            }
          });

          // Mark already selected dates
          if (SlotUp.State.creatorSelectedDates.has(dayDate)) {
            dayEl.classList.add('creator-selected');
          }
        } else {
          // Participant mode: Check if date is in allowed list
          const allowedDates = SlotUp.State.currentPlanDates;
          const isAllowed = !allowedDates || allowedDates.length === 0 || allowedDates.includes(dayDate);

          if (!isAllowed) {
            dayEl.classList.add('disabled');
          } else {
            dayEl.addEventListener('click', () => {
              const status = SlotUp.State.selectedStatus;
              dayEl.setAttribute('data-status', status);
              dayEl.setAttribute('data-day', day); // Ensure data-day is preserved
              dayEl.className = `calendar-day ${SlotUp.Config.STATUS_CLASSES[status]}`;
            });
          }
        }

        gridElement.appendChild(dayEl);
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

      // Create view toggle buttons
      const viewToggle = this.elements.viewToggleContainer;
      viewToggle.className = 'view-toggle-container';
      viewToggle.innerHTML = '';

      const singleBtn = this.elements.viewToggleSingle;
      singleBtn.textContent = '1 Month';
      singleBtn.className = 'view-toggle-btn';
      if (SlotUp.State.viewMode === SlotUp.Config.VIEW_MODES.SINGLE) {
        singleBtn.classList.add('active');
        singleBtn.classList.remove('active'); // Wait, logic error? No.
        if (SlotUp.State.viewMode === SlotUp.Config.VIEW_MODES.SINGLE) singleBtn.classList.add('active'); // fix
      } else {
        singleBtn.classList.remove('active');
      }

      const tripleBtn = this.elements.viewToggleTriple;
      tripleBtn.textContent = '3 Months';
      tripleBtn.className = 'view-toggle-btn';
      if (SlotUp.State.viewMode === SlotUp.Config.VIEW_MODES.TRIPLE) {
        tripleBtn.classList.add('active');
      } else {
        tripleBtn.classList.remove('active');
      }

      viewToggle.appendChild(singleBtn);
      viewToggle.appendChild(tripleBtn);

      container.appendChild(prevBtn);
      container.appendChild(display);
      container.appendChild(nextBtn);
      container.appendChild(viewToggle);

      if (this.elements.calendar && this.elements.calendar.parentNode) {
        this.elements.calendar.parentNode.insertBefore(container, this.elements.calendar);
      }
    },

    switchViewMode(mode) {
      if (SlotUp.State.viewMode === mode) return; // Already in this mode

      SlotUp.State.viewMode = mode;

      // Handle Creator Mode vs Participant Mode rendering
      if (SlotUp.State.isCreatorMode && this.elements.creatorCalendar) {
        // In creator mode, we need to render to the creator calendar
        const originalCalendar = this.elements.calendar;
        this.elements.calendar = this.elements.creatorCalendar;

        // Clear before re-rendering (important for creator mode)
        this.elements.calendar.innerHTML = '';

        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

        // Restore
        this.elements.calendar = originalCalendar;
      } else {
        // Normal Participant Mode
        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

        // Reload availability if participant name is present
        const name = this.elements.participantName?.value.trim();
        if (name) {
          this.loadAndRenderUserAvailability(name);
        }
      }
    },

    navigateMonth(offset) {
      // In triple view, navigate by 3 months; in single view, by 1 month
      const step = SlotUp.State.viewMode === SlotUp.Config.VIEW_MODES.TRIPLE ? 3 : 1;
      SlotUp.State.currentMonth += (offset * step);

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

    switchViewMode(mode) {
      if (SlotUp.State.viewMode === mode) return; // Already in this mode

      SlotUp.State.viewMode = mode;

      // Handle Creator Mode vs Participant Mode rendering
      if (SlotUp.State.isCreatorMode && this.elements.creatorCalendar) {
        // In creator mode, we need to render to the creator calendar
        const originalCalendar = this.elements.calendar;
        this.elements.calendar = this.elements.creatorCalendar;

        // Clear before re-rendering (important for creator mode)
        this.elements.calendar.innerHTML = '';

        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

        // Restore
        this.elements.calendar = originalCalendar;
      } else {
        // Normal Participant Mode
        this.renderControls();
        this.renderCalendar(SlotUp.State.currentYear, SlotUp.State.currentMonth);

        // Reload availability if participant name is present
        const name = this.elements.participantName?.value.trim();
        if (name) {
          this.loadAndRenderUserAvailability(name);
        }
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

    async resetToParticipantView(planId) {
      SlotUp.State.currentPlanId = parseInt(planId);

      // Load plan dates
      const planDates = await SlotUp.API.getPlanDates(planId);
      SlotUp.State.currentPlanDates = planDates;

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
