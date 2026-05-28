// ===================== CONFIGURATION =====================
const SUPABASE_URL     = "https://qgtwismenwfiipmvkjcm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFndHdpc21lbndmaWlwbXZramNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzYxMDQsImV4cCI6MjA5NTU1MjEwNH0.iqrPgymdol7Z8gzPQF3H84nWRM79Nm8vzo9RMo4GpAI";

// ===================== SUPABASE CLIENT =====================
let supabaseClient = null;
try {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase library not loaded");
  }
} catch(e) { console.error(e); }

// ===================== APP STATE =====================
let currentUser       = null;
let allIdeas          = [];
let currentDetailIdea = null;
let ideasChannel      = null;

// ===================== UTILITY: SHOW/HIDE VIEWS =====================
function showView(id) {
  ['login-view','register-view','dashboard-view','detail-view'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) {
    target.style.display = (id === 'login-view' || id === 'register-view') ? 'flex' : 'block';
    // Re-trigger animation on auth boxes
    const box = target.querySelector('.auth-box');
    if (box) { box.style.animation = 'none'; box.offsetHeight; box.style.animation = ''; }
  }
}

function setStatus(elementId, message, type = 'info') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = 'auth-status ' + type;
}

// ===================== AUTH: LOGIN =====================
window.handleLogin = async function() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email)    { setStatus('login-status', 'Please enter your email.', 'error'); return; }
  if (!password) { setStatus('login-status', 'Please enter your password.', 'error'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  setStatus('login-status', '', 'info');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    showDashboard();
  } catch(err) {
    setStatus('login-status', err.message || 'Login failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
};

// ===================== AUTH: REGISTER =====================
window.handleRegister = async function() {
  const name      = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;

  if (!name)                      { setStatus('register-status', 'Full name is required.', 'error'); return; }
  if (!email || !email.includes('@')) { setStatus('register-status', 'Please enter a valid email.', 'error'); return; }
  if (password.length < 6)        { setStatus('register-status', 'Password must be at least 6 characters.', 'error'); return; }
  if (password !== password2)     { setStatus('register-status', 'Passwords do not match.', 'error'); return; }

  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.textContent = 'Creating account…';
  setStatus('register-status', '', 'info');

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }   // stored in auth.users.raw_user_meta_data
      }
    });
    if (error) throw error;

    // Supabase may require email confirmation depending on project settings.
    // If the session is immediately available, go to dashboard.
    if (data.session) {
      currentUser = data.user;
      showDashboard();
    } else {
      setStatus('register-status',
        '✓ Account created! Check your email to confirm, then sign in.',
        'success');
      setTimeout(() => showView('login-view'), 3000);
    }
  } catch(err) {
    setStatus('register-status', err.message || 'Registration failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
};

// ===================== AUTH: LOGOUT =====================
window.handleLogout = async function() {
  if (ideasChannel && supabaseClient) {
    supabaseClient.removeChannel(ideasChannel);
    ideasChannel = null;
  }
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  allIdeas    = [];
  showView('login-view');
  setStatus('login-status', '', 'info');
};

// ===================== UTILITY: TOGGLE PASSWORD =====================
window.togglePassword = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.textContent = 'show';
  }
};

// ===================== DASHBOARD =====================
function showDashboard() {
  showView('dashboard-view');
  const email = currentUser?.email || currentUser?.user_metadata?.full_name || '';
  document.getElementById('user-display').textContent = email;
  fetchAndRenderIdeas();
  subscribeToRealtime();
}

// ===================== SUPABASE CRUD =====================
async function fetchIdeasFromDB() {
  if (!supabaseClient || !currentUser) return [];
  const { data, error } = await supabaseClient
    .from('automation_ideas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error("Fetch error:", error); return []; }
  return data || [];
}

async function fetchAndRenderIdeas() {
  if (!currentUser) return;
  allIdeas = await fetchIdeasFromDB();
  renderIdeas();
}

async function insertIdea(d) {
  if (!supabaseClient || !currentUser) throw new Error("Not authenticated");
  const row = {
    idea_author:               d.idea_author,
    automation_name:           d.automation_name,
    description:               d.description,
    standardized_process_score: d.standardized_process_score,
    digital_input:             d.digital_input,
    rule_based:                d.rule_based,
    software_systems:          d.software_systems,
    weekly_hours:              d.weekly_hours,
    speed_criticality:         d.speed_criticality,
    test_data_available:       d.test_data_available,
    process_documented:        d.process_documented,
    status:                    'Pending'
  };
  const { data, error } = await supabaseClient
    .from('automation_ideas')
    .insert([row])
    .select();
  if (error) throw error;
  return data[0];
}

async function updateIdeaStatus(ideaId, newStatus) {
  if (!supabaseClient) throw new Error("No client");
  const { error } = await supabaseClient
    .from('automation_ideas')
    .update({ status: newStatus })
    .eq('id', ideaId);
  if (error) throw error;
  await fetchAndRenderIdeas();
  if (currentDetailIdea && currentDetailIdea.id === ideaId) {
    currentDetailIdea.status = newStatus;
    renderDetail(currentDetailIdea);
  }
}

function subscribeToRealtime() {
  if (!supabaseClient || !currentUser) return;
  if (ideasChannel) supabaseClient.removeChannel(ideasChannel);
  ideasChannel = supabaseClient
    .channel('automation-ideas-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'automation_ideas' },
      (payload) => {
        fetchAndRenderIdeas();
        if (currentDetailIdea && payload.new && currentDetailIdea.id === payload.new.id) {
          currentDetailIdea = payload.new;
          renderDetail(currentDetailIdea);
        }
      })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log("[realtime] listening to automation_ideas");
    });
}

// ===================== RENDER: DASHBOARD CARDS =====================
function renderIdeas() {
  const grid = document.getElementById('ideas-grid');
  if (!grid) return;
  const searchTerm   = (document.getElementById('search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('status-filter')?.value || 'All';

  let filtered = [...allIdeas];
  if (statusFilter !== 'All') filtered = filtered.filter(i => i.status === statusFilter);
  if (searchTerm.trim()) {
    filtered = filtered.filter(i =>
      i.automation_name?.toLowerCase().includes(searchTerm) ||
      i.description?.toLowerCase().includes(searchTerm) ||
      i.idea_author?.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">✨ No ideas found. Create one!</div>`;
    return;
  }

  grid.innerHTML = filtered.map(idea => `
    <div class="idea-card" onclick="showDetailById('${idea.id}')">
      <div class="card-title">${escapeHtml(idea.automation_name || '—')}</div>
      <div class="card-author">${escapeHtml(idea.idea_author || 'Anonymous')}</div>
      <div class="card-stats">
        <div class="card-stat">
          <strong>${idea.weekly_hours != null ? idea.weekly_hours + 'h' : '—'}</strong>
          weekly hrs
        </div>
        <div class="card-stat">
          <strong>${idea.standardized_process_score != null ? idea.standardized_process_score + '/10' : '—'}</strong>
          process std
        </div>
        <div class="card-stat">
          <strong>${idea.speed_criticality != null ? idea.speed_criticality + '/10' : '—'}</strong>
          speed crit
        </div>
      </div>
      <div class="card-meta">
        ${escapeHtml(idea.software_systems || '—')} systems • ${new Date(idea.created_at).toLocaleDateString()}
      </div>
      <div><span class="badge badge-${idea.status}">${idea.status}</span></div>
    </div>
  `).join('');
}

async function showDetailById(ideaId) {
  const idea = allIdeas.find(i => i.id === ideaId);
  if (idea) {
    showDetail(idea);
  } else if (supabaseClient) {
    const { data } = await supabaseClient.from('automation_ideas').select('*').eq('id', ideaId).single();
    if (data) showDetail(data);
  }
}

// ===================== RENDER: DETAIL VIEW =====================
function showDetail(idea) {
  currentDetailIdea = idea;
  showView('detail-view');
  renderDetail(idea);
}

function renderDetail(idea) {
  const container = document.getElementById('detail-body');
  if (!container) return;
  const yn = v => v || '—';

  container.innerHTML = `
    <div class="detail-title">${escapeHtml(idea.automation_name || '—')}</div>
    <div class="detail-author">Submitted by ${escapeHtml(idea.idea_author || 'Anonymous')}</div>
    <div class="detail-badges"><span class="badge badge-${idea.status}">${idea.status}</span></div>

    <div class="section-heading">§1 — Basic Info</div>
    <div class="detail-section">
      <div class="detail-label">Description</div>
      <div class="detail-value">${escapeHtml(idea.description) || '—'}</div>
    </div>
    <hr class="divider" />

    <div class="section-heading">§2 — Complexity</div>
    <div class="score-grid">
      <div class="score-box"><div class="score-box-label">Process Score</div><div class="score-box-value">${idea.standardized_process_score != null ? idea.standardized_process_score + '/10' : '—'}</div></div>
      <div class="score-box"><div class="score-box-label">Digital Input</div><div class="score-box-value neutral">${yn(idea.digital_input)}</div></div>
      <div class="score-box"><div class="score-box-label">Rule-Based</div><div class="score-box-value neutral">${yn(idea.rule_based)}</div></div>
      <div class="score-box"><div class="score-box-label">Systems</div><div class="score-box-value neutral">${yn(idea.software_systems)}</div></div>
    </div>
    <hr class="divider" />

    <div class="section-heading">§3 — Impact</div>
    <div class="score-grid">
      <div class="score-box"><div class="score-box-label">Weekly Hours</div><div class="score-box-value">${idea.weekly_hours != null ? idea.weekly_hours + 'h' : '—'}</div></div>
      <div class="score-box"><div class="score-box-label">Speed Criticality</div><div class="score-box-value">${idea.speed_criticality != null ? idea.speed_criticality + '/10' : '—'}</div></div>
    </div>
    <hr class="divider" />

    <div class="section-heading">§4 — Implementation</div>
    <div class="score-grid">
      <div class="score-box"><div class="score-box-label">Test Data</div><div class="score-box-value neutral">${yn(idea.test_data_available)}</div></div>
      <div class="score-box"><div class="score-box-label">Documented</div><div class="score-box-value neutral">${yn(idea.process_documented)}</div></div>
    </div>
    <hr class="divider" />

    <div class="detail-section">
      <div class="detail-label">Created</div>
      <div class="detail-value">${new Date(idea.created_at).toLocaleString()}</div>
    </div>

    <div class="detail-actions">
      ${idea.status !== 'Approved' ? `<button class="btn btn-approve btn-sm" onclick="changeStatus('${idea.id}', 'Approved')">✓ Approve</button>` : ''}
      ${idea.status !== 'Rejected' ? `<button class="btn btn-reject btn-sm" onclick="changeStatus('${idea.id}', 'Rejected')">✗ Reject</button>` : ''}
    </div>
  `;
}

window.changeStatus = async function(ideaId, newStatus) {
  try {
    await updateIdeaStatus(ideaId, newStatus);
  } catch(err) {
    console.error("Status update error", err);
    alert("Failed to update status. Check console.");
  }
};

// ===================== MODAL & FORM =====================
function openForm() {
  document.getElementById('modal-overlay').classList.add('open');
  ['f-author','f-name','f-desc','f-hours'].forEach(id => document.getElementById(id).value = '');
  ['f-digital','f-rule','f-systems','f-testdata','f-documented'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-std').value = 5;   document.getElementById('f-std-val').innerText = 5;
  document.getElementById('f-speed').value = 5; document.getElementById('f-speed-val').innerText = 5;
  // Pre-fill author from logged-in user's display name or email
  if (currentUser) {
    const name = currentUser.user_metadata?.full_name || currentUser.email || '';
    document.getElementById('f-author').value = name;
  }
}

function closeForm() {
  document.getElementById('modal-overlay').classList.remove('open');
}

window.submitIdea = async function() {
  const author     = document.getElementById('f-author').value.trim();
  const name       = document.getElementById('f-name').value.trim();
  const desc       = document.getElementById('f-desc').value.trim();
  const std        = parseInt(document.getElementById('f-std').value);
  const digital    = document.getElementById('f-digital').value;
  const rule       = document.getElementById('f-rule').value;
  const systems    = document.getElementById('f-systems').value;
  const hours      = parseFloat(document.getElementById('f-hours').value) || null;
  const speed      = parseInt(document.getElementById('f-speed').value);
  const testdata   = document.getElementById('f-testdata').value;
  const documented = document.getElementById('f-documented').value;

  if (!name)       { alert("Automation name is required"); return; }
  if (!author)     { alert("Author name is required"); return; }
  if (!digital)    { alert("Please answer 'Digital Input?'"); return; }
  if (!rule)       { alert("Please answer 'Rule-Based?'"); return; }
  if (!systems)    { alert("Please select software systems count"); return; }
  if (!testdata)   { alert("Please answer 'Test Data Available?'"); return; }
  if (!documented) { alert("Please answer 'Process Documented?'"); return; }

  const submitBtn = document.querySelector('#modal-overlay .btn-submit');
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting...";

  try {
    await insertIdea({ idea_author: author, automation_name: name, description: desc,
      standardized_process_score: std, digital_input: digital, rule_based: rule,
      software_systems: systems, weekly_hours: hours, speed_criticality: speed,
      test_data_available: testdata, process_documented: documented });
    closeForm();
    await fetchAndRenderIdeas();
  } catch(err) {
    console.error("Insert error:", err);
    alert("Failed to create idea: " + (err.message || "unknown error"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit Idea";
  }
};

// ===================== UTILITIES =====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m] || m));
}

// ===================== INIT =====================
window.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) {
    showView('login-view');
    setStatus('login-status', '⚠️ Supabase failed to initialise. Check URL/KEY.', 'error');
    return;
  }

  // Restore existing session (e.g. page refresh)
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    showDashboard();
  } else {
    showView('login-view');
  }

  // Sync app state if the session changes (login/logout from another tab, token refresh, etc.)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      allIdeas = [];
    }
  });

  // Close modal on backdrop click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeForm();
  });

  // Allow Enter key to submit login / register forms
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('reg-password2').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});

// Expose to global scope for inline onclick handlers
window.showView       = showView;
window.showDashboard  = showDashboard;
window.openForm       = openForm;
window.closeForm      = closeForm;
window.renderIdeas    = renderIdeas;
window.showDetailById = showDetailById;