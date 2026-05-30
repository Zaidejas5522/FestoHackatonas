// ===================== STATISTICS MODULE =====================
let statsChart = null;
let currentStatsFilter = { departmentId: null, userValue: null };
let allProfiles = [];
let statsPieChart = null;

// ── Load departments ───────────────────────────────────────
async function loadDepartments() {
  const deptSelect = document.getElementById('stats-dept-select');
  if (!deptSelect) return;
  try {
    const { data, error } = await supabaseClient
      .from('department')
      .select('id, name')
      .order('name');
    if (error) throw error;
    deptSelect.innerHTML = '<option value="">All Departments</option>';
    data.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = dept.name;
      deptSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

// ── Load all profiles, filter datalist by department ──────
async function loadUsers(departmentId) {
  const userInput = document.getElementById('stats-user-input');
  const userDatalist = document.getElementById('stats-user-datalist');
  if (!userInput || !userDatalist) return;

  // Fetch all profiles only once
  if (!allProfiles.length) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, email, full_name, department_id')
        .order('full_name', { ascending: true });
      if (error) throw error;
      allProfiles = data || [];
    } catch (err) {
      console.error('Failed to load profiles:', err);
      return;
    }
  }

  // Filter by department if selected
  const filtered = departmentId
    ? allProfiles.filter(p => String(p.department_id) === String(departmentId))
    : allProfiles;

  // Build datalist options with human‑readable names
  userDatalist.innerHTML = '';
  filtered.forEach(profile => {
    const opt = document.createElement('option');
    // Use full name as the selectable value (will be stored in the input)
    opt.value = profile.full_name || profile.email;
    // Display: "Full Name (email)"
    opt.textContent = `${profile.full_name || profile.email} (${profile.email})`;
    userDatalist.appendChild(opt);
  });

  // Clear the input and stored filter when department changes
  userInput.value = '';
  currentStatsFilter.userValue = null;
}

// ── Event handlers ─────────────────────────────────────────
async function onDepartmentChange() {
  const deptSelect = document.getElementById('stats-dept-select');
  currentStatsFilter.departmentId = deptSelect.value || null;
  currentStatsFilter.userValue = null;
  await loadUsers(currentStatsFilter.departmentId);
  await renderStatistics();
}

async function onUserChange() {
  const userInput = document.getElementById('stats-user-input');
  const selectedValue = userInput?.value.trim() || null;
  currentStatsFilter.userValue = selectedValue;
  await renderStatistics();
}

async function resetFilters() {
  const deptSelect = document.getElementById('stats-dept-select');
  const userInput = document.getElementById('stats-user-input');
  if (deptSelect) deptSelect.value = '';
  if (userInput) userInput.value = '';
  currentStatsFilter = { departmentId: null, userValue: null };
  await loadUsers(null);
  await renderStatistics();
}

// ── Filter helpers ─────────────────────────────────────────
function filterIdeasByDepartment(ideas, departmentId) {
  if (!departmentId) return ideas;
  const deptEmails = allProfiles
    .filter(p => String(p.department_id) === String(departmentId))
    .map(p => p.email?.toLowerCase());
  return ideas.filter(idea => {
    const email = idea.submitter_email?.toLowerCase();
    return email && deptEmails.includes(email);
  });
}

function filterIdeasByUser(ideas, userValue) {
  if (!userValue) return ideas;
  const v = userValue.toLowerCase();
  return ideas.filter(idea =>
    idea.submitter_email?.toLowerCase() === v ||
    idea.idea_author?.toLowerCase() === v
  );
}

// ── Main render function ───────────────────────────────────
async function renderStatistics() {
  try {
    if (!allIdeas.length && currentUser) await fetchAndRenderIdeas();
    if (!allProfiles.length) await loadUsers(null);

    let ideas = [...allIdeas];

    if (currentStatsFilter.departmentId) {
      ideas = filterIdeasByDepartment(ideas, currentStatsFilter.departmentId);
    }
    if (currentStatsFilter.userValue) {
      ideas = filterIdeasByUser(ideas, currentStatsFilter.userValue);
    }

    // Summary cards
    const totalEl = document.getElementById('stat-total');
    const devEl = document.getElementById('stat-development');
    const implEl = document.getElementById('stat-implemented');
    if (totalEl) totalEl.textContent = ideas.length;
    if (devEl) devEl.textContent = ideas.filter(i =>
      ['In Development', 'Testing', 'Implemented'].includes(i.status)).length;
    if (implEl) implEl.textContent = ideas.filter(i => i.status === 'Implemented').length;

    // Weekly hours saved (completed)
    const hoursSavedEl = document.getElementById('stat-hours-saved');
    if (hoursSavedEl) {
      const totalHours = ideas
        .filter(i => i.status === 'Implemented')
        .reduce((sum, i) => sum + (i.weekly_hours || 0), 0);
      hoursSavedEl.textContent = totalHours;
    }

    // AI score histogram (bar chart)
    const ratedIdeas = ideas.filter(i => i.ai_score != null);
    const binLabels = ['0-9%', '10-19%', '20-29%', '30-39%', '40-49%', '50-59%', '60-69%', '70-79%', '80-89%', '90-100%'];
    const counts = new Array(10).fill(0);
    ratedIdeas.forEach(idea => {
      let bin = Math.floor(idea.ai_score / 10);
      if (bin >= 10) bin = 9;
      counts[bin]++;
    });

    if (statsChart) statsChart.destroy();
    const canvas = document.getElementById('scoreChart');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e8e8f0';
      const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#6b6b80';

      statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: binLabels,
          datasets: [{
            label: 'Number of Ideas',
            data: counts,
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => `${ctx.raw} idea(s)` } }
          },
          scales: {
            y: {
              title: { display: true, text: 'Number of Ideas', color: mutedColor },
              ticks: { color: textColor, stepSize: 1, precision: 0 }
            },
            x: {
              title: { display: true, text: 'AI Score Range', color: mutedColor },
              ticks: { color: textColor, maxRotation: 45, minRotation: 45 }
            }
          }
        }
      });
    }

    // Doughnut chart (pipeline status)
    if (typeof renderPieChart === 'function') {
      renderPieChart(ideas);
    }
  } catch (err) {
    console.error('Error in renderStatistics:', err);
    const canvas = document.getElementById('scoreChart');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted') || '#6b6b80';
      ctx.font = '14px monospace';
      ctx.fillText('Error loading statistics. Please try refreshing the page.', 20, 50);
    }
  }
}

// ── Pie chart helpers ──────────────────────────────────────
function getIdeaCategory(status) {
  if (status === 'Implemented') return 'completed';
  if (status === 'In Development' || status === 'Testing') return 'inProgress';
  if (status === 'Rejected') return 'declined';
  return 'submitted';
}

function renderPieChart(ideas) {
  const categories = {
    inDevelopment: { label: 'In Development', color: '#facc15', count: 0 },
    completed: { label: 'Completed', color: '#22c55e', count: 0 },
    declined: { label: 'Declined', color: '#ef4444', count: 0 }
  };

  ideas.forEach(idea => {
    if (idea.status === 'Implemented') categories.completed.count++;
    else if (idea.status === 'In Development' || idea.status === 'Testing') categories.inDevelopment.count++;
    else if (idea.status === 'Rejected') categories.declined.count++;
  });

  const labels = [];
  const data = [];
  const colors = [];
  Object.values(categories).forEach(cat => {
    if (cat.count > 0) {
      labels.push(cat.label);
      data.push(cat.count);
      colors.push(cat.color);
    }
  });

  if (data.length === 0) {
    const canvas = document.getElementById('pieChart');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted') || '#6b6b80';
      ctx.font = '12px monospace';
      ctx.fillText('No data for pie chart', 20, 50);
    }
    if (statsPieChart) statsPieChart.destroy();
    return;
  }

  const canvas = document.getElementById('pieChart');
  if (!canvas) return;

  if (statsPieChart) statsPieChart.destroy();
  const ctx = canvas.getContext('2d');
  const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e8e8f0';

  statsPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 8,
        spacing: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} idea(s)`
          }
        }
      }
    }
  });
}

// ── Global exports and initialisation ──────────────────────
window.showStatsView = async function() {
  showView('stats-view');
  await loadDepartments();
  await loadUsers(null);
  await renderStatistics();
};

window.refreshStatsIfVisible = function() {
  const statsView = document.getElementById('stats-view');
  if (statsView && statsView.style.display !== 'none') renderStatistics();
};

document.addEventListener('DOMContentLoaded', () => {
  const deptSelect = document.getElementById('stats-dept-select');
  const userInput = document.getElementById('stats-user-input');
  const resetBtn = document.getElementById('stats-reset-btn');
  if (deptSelect) deptSelect.addEventListener('change', onDepartmentChange);
  if (userInput) userInput.addEventListener('change', onUserChange); // 'change' instead of 'input'
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
});