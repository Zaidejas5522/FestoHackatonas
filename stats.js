// ===================== STATISTICS MODULE (with user filter) =====================
let statsChart = null;
let currentStatsFilter = { departmentId: null, userValue: null }; // userValue can be email or name

// ── Helper: load departments into dropdown ─────────────────────────────────
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
      const option = document.createElement('option');
      option.value = dept.id;
      option.textContent = dept.name;
      deptSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

// ── Helper: load users based on selected department ────────────────────────
async function loadUsers(departmentId) {
  const userInput = document.getElementById('stats-user-input');
  const userDatalist = document.getElementById('stats-user-datalist');
  if (!userInput || !userDatalist) return;
  
  try {
    let query = supabaseClient
      .from('profiles')
      .select('id, email, full_name, department_id');
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }
    const { data, error } = await query.order('full_name', { ascending: true });
    if (error) throw error;
    
    userDatalist.innerHTML = '';
    data.forEach(profile => {
      const option = document.createElement('option');
      const displayName = profile.full_name || profile.email;
      // Store email as value, but we will match by both email and full_name later
      option.value = profile.email;
      option.textContent = `${displayName} (${profile.email})`;
      userDatalist.appendChild(option);
    });
    // Clear input when department changes (optional)
    userInput.value = '';
    currentStatsFilter.userValue = null;
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

// ── Event handlers for filters ─────────────────────────────────────────────
async function onDepartmentChange() {
  const deptSelect = document.getElementById('stats-dept-select');
  const departmentId = deptSelect.value || null;
  currentStatsFilter.departmentId = departmentId;
  await loadUsers(departmentId);
  await renderStatistics();
}

async function onUserChange() {
  const userInput = document.getElementById('stats-user-input');
  const selectedValue = userInput.value.trim();
  // We need to check if the selected value matches any profile's email or full_name
  const datalist = document.getElementById('stats-user-datalist');
  let matched = false;
  for (let opt of datalist.options) {
    if (opt.value === selectedValue) {
      matched = true;
      break;
    }
  }
  // If not matched, maybe the user typed a name that equals a full_name (but not stored as value)
  if (!matched && selectedValue) {
    // Try to see if any profile has this as full_name (we don't have full_name list easily)
    // We'll just store the raw string and later match in filter by both email and full_name
    currentStatsFilter.userValue = selectedValue;
  } else {
    currentStatsFilter.userValue = matched ? selectedValue : null;
  }
  await renderStatistics();
}

function resetFilters() {
  const deptSelect = document.getElementById('stats-dept-select');
  const userInput = document.getElementById('stats-user-input');
  if (deptSelect) deptSelect.value = '';
  if (userInput) userInput.value = '';
  currentStatsFilter = { departmentId: null, userValue: null };
  loadUsers(null);   // reload all users
  renderStatistics();
}

// ── Helper: filter ideas by the selected user (by email or full name) ─────
function filterIdeasByUser(ideas, userValue) {
  if (!userValue) return ideas;
  // userValue can be email (exact match) or full name (case-insensitive)
  return ideas.filter(idea => {
    const submitterEmail = idea.submitter_email;
    const authorName = idea.idea_author;
    // Try to match by email first (if present)
    if (submitterEmail && submitterEmail.toLowerCase() === userValue.toLowerCase()) return true;
    // Otherwise match by author name (case-insensitive)
    if (authorName && authorName.toLowerCase() === userValue.toLowerCase()) return true;
    return false;
  });
}

// ── Main rendering function (now filters ideas by user) ────────────────────
async function renderStatistics() {
  // Ensure we have ideas data
  if (!allIdeas.length && currentUser) {
    await fetchAndRenderIdeas();
  }
  let ideas = allIdeas;

  // Apply user filter if a user is selected
  if (currentStatsFilter.userValue) {
    ideas = filterIdeasByUser(ideas, currentStatsFilter.userValue);
  }
  // Department filter is only used to populate user list, not to filter ideas directly.
  // (If you also want to filter by department, uncomment the following)
  // if (currentStatsFilter.departmentId) {
  //   // We need department_id in ideas – currently ideas don't have department of submitter directly.
  //   // You would need to join profiles. Keep as is.
  // }

  // Calculate summary numbers
  const totalIdeas = ideas.length;
  const inDevelopment = ideas.filter(i => 
    i.status === 'In Development' || i.status === 'Testing' || i.status === 'Implemented'
  ).length;
  const implemented = ideas.filter(i => i.status === 'Implemented').length;

  // Update DOM elements
  const totalEl = document.getElementById('stat-total');
  const devEl = document.getElementById('stat-development');
  const implEl = document.getElementById('stat-implemented');
  if (totalEl) totalEl.textContent = totalIdeas;
  if (devEl) devEl.textContent = inDevelopment;
  if (implEl) implEl.textContent = implemented;

  // Histogram of AI scores (only rated ideas)
  const ratedIdeas = ideas.filter(i => i.ai_score !== null && i.ai_score !== undefined);
  const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  const binLabels = bins.map(b => `${b}-${b+9}%`).slice(0, -1);
  binLabels.push('90-100%');
  const counts = new Array(binLabels.length).fill(0);
  ratedIdeas.forEach(idea => {
    const score = idea.ai_score;
    let binIndex = Math.floor(score / 10);
    if (binIndex >= counts.length) binIndex = counts.length - 1;
    if (binIndex >= 0 && binIndex < counts.length) counts[binIndex]++;
  });

  // Destroy previous chart
  if (statsChart) statsChart.destroy();
  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;
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
        legend: { labels: { color: textColor } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw} idea(s)` } }
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

// ── Expose filter actions globally ─────────────────────────────────────────
window.showStatsView = async function() {
  showView('stats-view');
  await loadDepartments();
  await loadUsers(null);
  await renderStatistics();
};

window.refreshStatsIfVisible = function() {
  const statsView = document.getElementById('stats-view');
  if (statsView && statsView.style.display !== 'none') {
    renderStatistics();
  }
};

// Attach event listeners after DOM ready (called from HTML inline or here)
document.addEventListener('DOMContentLoaded', () => {
  const deptSelect = document.getElementById('stats-dept-select');
  const userInput = document.getElementById('stats-user-input');
  const resetBtn = document.getElementById('stats-reset-btn');
  if (deptSelect) deptSelect.addEventListener('change', onDepartmentChange);
  if (userInput) userInput.addEventListener('change', onUserChange);
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
});