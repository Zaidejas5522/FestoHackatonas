// ===================== STATISTICS MODULE =====================
let statsChart = null;
let currentStatsFilter = { departmentId: null, userValue: null };
let allProfiles = []; // cache profiles for department→user mapping

// ── Load departments ───────────────────────────────────────────────────────
async function loadDepartments() {
  const deptSelect = document.getElementById('stats-dept-select');
  if (!deptSelect) return;
  try {
    const { data, error } = await supabaseClient
      .from('department').select('id, name').order('name');
    if (error) throw error;
    deptSelect.innerHTML = '<option value="">All Departments</option>';
    data.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = dept.name;
      deptSelect.appendChild(opt);
    });
  } catch (err) { console.error('Failed to load departments:', err); }
}

// ── Load all profiles once, filter datalist by department ─────────────────
async function loadUsers(departmentId) {
  const userInput    = document.getElementById('stats-user-input');
  const userDatalist = document.getElementById('stats-user-datalist');
  if (!userInput || !userDatalist) return;

  // Only fetch all profiles once
  if (!allProfiles.length) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, email, full_name, department_id')
        .order('full_name', { ascending: true });
      if (error) throw error;
      allProfiles = data || [];
    } catch (err) { console.error('Failed to load profiles:', err); return; }
  }

  // Filter by department if selected
  const filtered = departmentId
    ? allProfiles.filter(p => String(p.department_id) === String(departmentId))
    : allProfiles;

  userDatalist.innerHTML = '';
  filtered.forEach(profile => {
    const opt = document.createElement('option');
    opt.value = profile.email;
    opt.textContent = `${profile.full_name || profile.email} (${profile.email})`;
    userDatalist.appendChild(opt);
  });

  userInput.value = '';
  currentStatsFilter.userValue = null;
}

// ── Event handlers ─────────────────────────────────────────────────────────
async function onDepartmentChange() {
  const deptSelect = document.getElementById('stats-dept-select');
  currentStatsFilter.departmentId = deptSelect.value || null;
  currentStatsFilter.userValue = null;
  await loadUsers(currentStatsFilter.departmentId);
  await renderStatistics();
}

async function onUserChange() {
  const val = document.getElementById('stats-user-input')?.value.trim() || null;
  currentStatsFilter.userValue = val || null;
  await renderStatistics();
}

function resetFilters() {
  const deptSelect = document.getElementById('stats-dept-select');
  const userInput  = document.getElementById('stats-user-input');
  if (deptSelect) deptSelect.value = '';
  if (userInput)  userInput.value  = '';
  currentStatsFilter = { departmentId: null, userValue: null };
  loadUsers(null);
  renderStatistics();
}

// ── Filter helpers ─────────────────────────────────────────────────────────
function filterIdeasByDepartment(ideas, departmentId) {
  if (!departmentId) return ideas;
  // Get all emails belonging to this department from cached profiles
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

// ── Main render ────────────────────────────────────────────────────────────
async function renderStatistics() {
  if (!allIdeas.length && currentUser) await fetchAndRenderIdeas();

  // Make sure profiles are loaded (needed for dept filter)
  if (!allProfiles.length) await loadUsers(null);

  let ideas = [...allIdeas];

  // Apply department filter first
  if (currentStatsFilter.departmentId) {
    ideas = filterIdeasByDepartment(ideas, currentStatsFilter.departmentId);
  }

  // Then apply user filter
  if (currentStatsFilter.userValue) {
    ideas = filterIdeasByUser(ideas, currentStatsFilter.userValue);
  }

  // Summary numbers
  document.getElementById('stat-total').textContent        = ideas.length;
  document.getElementById('stat-development').textContent  = ideas.filter(i =>
    ['In Development','Testing','Implemented'].includes(i.status)).length;
  document.getElementById('stat-implemented').textContent  = ideas.filter(i =>
    i.status === 'Implemented').length;

  // AI score histogram
  const ratedIdeas = ideas.filter(i => i.ai_score != null);
  const binLabels  = ['0-9%','10-19%','20-29%','30-39%','40-49%','50-59%','60-69%','70-79%','80-89%','90-100%'];
  const counts     = new Array(10).fill(0);
  ratedIdeas.forEach(idea => {
    let bin = Math.floor(idea.ai_score / 10);
    if (bin >= 10) bin = 9;
    counts[bin]++;
  });

  if (statsChart) statsChart.destroy();
  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;
  const ctx        = canvas.getContext('2d');
  const textColor  = getComputedStyle(document.body).getPropertyValue('--text').trim()  || '#e8e8f0';
  const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#6b6b80';

  statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [{
        label: 'Number of Ideas',
        data: counts,
        backgroundColor: 'rgba(123, 97, 255, 0.6)',
        borderColor: '#7b61ff',
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend:  { labels: { color: textColor } },
        tooltip: { callbacks: { label: ctx => `${ctx.raw} idea(s)` } }
      },
      scales: {
        y: {
          title: { display: true, text: 'Number of Ideas', color: mutedColor },
          ticks: { color: textColor, stepSize: 1, precision: 0 }
        },
        x: {
          ticks: { color: textColor, maxRotation: 45, minRotation: 45 },
          title: { display: true, text: 'AI Score Range', color: mutedColor }
        }
      }
    }
  });
}

// ── Globals ────────────────────────────────────────────────────────────────
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
  const userInput  = document.getElementById('stats-user-input');
  const resetBtn   = document.getElementById('stats-reset-btn');
  if (deptSelect) deptSelect.addEventListener('change', onDepartmentChange);
  if (userInput)  userInput.addEventListener('input', onUserChange);  // 'input' not 'change'
  if (resetBtn)   resetBtn.addEventListener('click', resetFilters);
});