// ===================== CONFIGURATION =====================
const SUPABASE_URL      = "https://qgtwismenwfiipmvkjcm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFndHdpc21lbndmaWlwbXZramNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzYxMDQsImV4cCI6MjA5NTU1MjEwNH0.iqrPgymdol7Z8gzPQF3H84nWRM79Nm8vzo9RMo4GpAI";

// ── AI API CONFIGURATION ──────────────────────────────────────────────────────
// Set your OpenAI key here. When switching to FestoGPT, only change these three
// values: AI_API_URL, AI_API_KEY, AI_MODEL — everything else stays the same.
//const AI_API_URL  = "https://api.openai.com/v1/chat/completions";
const AI_API_KEY         = "EDGE_FUNCTION";   // not the real key — just a truthy non-default value
const AI_SCORE_THRESHOLD = 60;
//const AI_MODEL    = "gpt-4o-mini";
//const AI_SCORE_THRESHOLD = 60; // ideas scoring >= this are Approved

// ===================== PIPELINE STAGES =====================
const PIPELINE_STAGES = [
  { key: 'Submitted',              label: 'Submitted',          icon: '✦', color: 'stage-submitted'   },
  { key: 'AI Review',              label: 'AI Review',          icon: '⟳', color: 'stage-review'      },
  { key: 'Awaiting Digi Approval', label: 'Digi Approval',      icon: '⚑', color: 'stage-digi'        },
  { key: 'In Development',         label: 'In Development',     icon: '⚙', color: 'stage-development' },
  { key: 'Testing',                label: 'Testing',            icon: '⚗', color: 'stage-testing'     },
  { key: 'Implemented',            label: 'Implemented',        icon: '★', color: 'stage-implemented' },
  { key: 'Rejected',               label: 'Rejected',           icon: '✗', color: 'stage-rejected'    },
];

// ===================== DIGI DRIVER ROLE =====================
// Add the Digi Driver email(s) here. Anyone in this list gets the approval queue.
const DIGI_DRIVER_EMAILS = [
  'digidriver@festo.com',   // ← replace with the real Digi Driver email
  // 'another@festo.com',   // add more if needed
];
// ===================== DRIVER ROLE =====================
const DRIVER_EMAILS = [
  'driver@festo.com',   // ← replace with the real Digi Driver email
  // 'another@festo.com',   // add more if needed
];

function isDigiDriver() {
  const email = currentUser?.email || '';
  return DIGI_DRIVER_EMAILS.includes(email.toLowerCase());
}
function isDriver() {
  const email = currentUser?.email || '';
  return DRIVER_EMAILS.includes(email.toLowerCase());
}
function getStageIndex(status) {
  const idx = PIPELINE_STAGES.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

function getStageInfo(status) {
  return PIPELINE_STAGES.find(s => s.key === status) || PIPELINE_STAGES[0];
}

function getNextStage(status) {
  if (status === 'Rejected' || status === 'Implemented') return null;
  const activeStages = PIPELINE_STAGES.filter(s => s.key !== 'Rejected');
  const idx = activeStages.findIndex(s => s.key === status);
  return idx !== -1 && idx < activeStages.length - 1 ? activeStages[idx + 1] : null;
}

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
let activeTab         = 'all'; // 'all' | 'approved'

// ===================== THEME =====================
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '🌑' : '🌙';
}

window.toggleTheme = function() {
  const isLight = document.body.classList.contains('theme-light');
  const next = isLight ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem('ideaflow-theme', next); } catch(e) {}
};

// ===================== UTILITY: SHOW/HIDE VIEWS =====================
function showView(id) {
  ['login-view','register-view','dashboard-view','detail-view'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) {
    target.style.display = (id === 'login-view' || id === 'register-view') ? 'flex' : 'block';
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
  btn.disabled = true; btn.textContent = 'Signing in…';
  setStatus('login-status', '', 'info');
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    showDashboard();
  } catch(err) {
    setStatus('login-status', err.message || 'Login failed.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
};

// ===================== AUTH: REGISTER =====================
window.handleRegister = async function() {
  const name      = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;
  if (!name)                       { setStatus('register-status', 'Full name is required.', 'error'); return; }
  if (!email || !email.includes('@')) { setStatus('register-status', 'Please enter a valid email.', 'error'); return; }
  if (password.length < 6)         { setStatus('register-status', 'Password must be at least 6 characters.', 'error'); return; }
  if (password !== password2)      { setStatus('register-status', 'Passwords do not match.', 'error'); return; }
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  setStatus('register-status', '', 'info');
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password, options: { data: { full_name: name } }
    });
    if (error) throw error;
    if (data.session) { currentUser = data.user; showDashboard(); }
    else {
      setStatus('register-status', '✓ Account created! Check your email to confirm, then sign in.', 'success');
      setTimeout(() => showView('login-view'), 3000);
    }
  } catch(err) {
    setStatus('register-status', err.message || 'Registration failed.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
};

// ===================== AUTH: LOGOUT =====================
window.handleLogout = async function() {
  if (ideasChannel && supabaseClient) { supabaseClient.removeChannel(ideasChannel); ideasChannel = null; }
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null; allIdeas = [];
  showView('login-view');
  setStatus('login-status', '', 'info');
};

// ===================== UTILITY: TOGGLE PASSWORD =====================
window.togglePassword = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text'; btn.textContent = 'hide'; }
  else { input.type = 'password'; btn.textContent = 'show'; }
};

// ===================== TAB SWITCHING =====================
window.switchTab = function(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  const newBtn = document.getElementById('new-idea-btn');
  if (newBtn) newBtn.style.display = tab === 'all' ? '' : 'none';
  renderIdeas();
};

function showDashboard() {
  showView('dashboard-view');
  const email = currentUser?.email || currentUser?.user_metadata?.full_name || '';
  document.getElementById('user-display').textContent = email;

  // Show/hide Digi Driver tab based on role
  const digiTab = document.getElementById('digi-tab');
  if (digiTab) digiTab.style.display = isDigiDriver() ? '' : 'none';

  // Reset to all-ideas tab
  activeTab = 'all';
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === 'all');
  });
  const newBtn = document.getElementById('new-idea-btn');
  if (newBtn) newBtn.style.display = '';
  fetchAndRenderIdeas();
  subscribeToRealtime();
}

// ===================== SUPABASE CRUD =====================
async function fetchIdeasFromDB() {
  if (!supabaseClient || !currentUser) return [];
  const { data, error } = await supabaseClient
    .from('automation_ideas').select('*').order('created_at', { ascending: false });
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
    idea_author: d.idea_author, automation_name: d.automation_name, description: d.description,
    standardized_process_score: d.standardized_process_score, digital_input: d.digital_input,
    rule_based: d.rule_based, software_systems: d.software_systems, weekly_hours: d.weekly_hours,
    speed_criticality: d.speed_criticality, test_data_available: d.test_data_available,
    process_documented: d.process_documented, status: 'Submitted'
  };
  const { data, error } = await supabaseClient.from('automation_ideas').insert([row]).select();
  if (error) throw error;
  return data[0];
}

async function updateIdeaStatus(ideaId, newStatus) {
  if (!supabaseClient) throw new Error("No client");
  // stage_updated_at is optional — add the column with: ALTER TABLE automation_ideas ADD COLUMN stage_updated_at timestamptz;
  const updates = { status: newStatus };
  try { updates.stage_updated_at = new Date().toISOString(); } catch(e) {}
  const { error } = await supabaseClient.from('automation_ideas')
    .update(updates)
    .eq('id', ideaId);
  if (error) throw error;
  await fetchAndRenderIdeas();
  if (currentDetailIdea && currentDetailIdea.id === ideaId) {
    currentDetailIdea.status = newStatus;
    renderDetail(currentDetailIdea);
  }
}

async function updateIdeaFull(ideaId, fields) {
  if (!supabaseClient) throw new Error("No client");
  const { error } = await supabaseClient.from('automation_ideas').update(fields).eq('id', ideaId);
  if (error) throw error;
  await fetchAndRenderIdeas();
}

function subscribeToRealtime() {
  if (!supabaseClient || !currentUser) return;
  if (ideasChannel) supabaseClient.removeChannel(ideasChannel);
  ideasChannel = supabaseClient
    .channel('automation-ideas-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_ideas' }, (payload) => {
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

// ===================== AI RATING ENGINE =====================

function buildRatingPrompt(idea) {
  return `Evaluate this automation idea and return a JSON object with EXACTLY these three fields:
- "score": integer 0-100 representing overall automation viability
- "summary": a 2-4 sentence paragraph covering your overall assessment, the strongest points, and the weakest points
- "decision": either "Approved" or "Rejected" (use Approved if score >= ${AI_SCORE_THRESHOLD})

Idea details:
- Name: ${idea.automation_name}
- Description: ${idea.description || 'Not provided'}
- Submitted by: ${idea.idea_author}
- Standardized process score: ${idea.standardized_process_score}/10 (how well-defined and repeatable the process is)
- Digital input: ${idea.digital_input} (whether the process uses digital data)
- Rule-based: ${idea.rule_based} (whether decisions follow clear rules vs human judgment)
- Software systems involved: ${idea.software_systems}
- Estimated weekly hours saved: ${idea.weekly_hours != null ? idea.weekly_hours + 'h' : 'Not specified'}
- Speed criticality: ${idea.speed_criticality}/10 (how time-sensitive the process is)
- Test data available: ${idea.test_data_available}
- Process documented: ${idea.process_documented}

Scoring guidance:
- High (70-100): rule-based, digital input, well-documented, test data available, clear measurable time savings, few systems
- Mid (40-69): some manual steps, partially documented, unclear scope, moderate complexity
- Low (0-39): requires human judgment, no digital input, undocumented, no test data, too many systems

Respond with ONLY the JSON object. No markdown, no code fences, no explanation outside the JSON.`;
}

async function callAIAPI(idea) {
  // Get the Supabase Edge Function URL
  const functionURL = `${SUPABASE_URL}/functions/v1/rate-idea`
  
  const response = await fetch(functionURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}` // Optional: add auth if needed
    },
    body: JSON.stringify({ idea })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error || `Edge Function error ${response.status}`)
  }

  const data = await response.json()
  return data // { score, summary, decision }
}

async function rateIdeaWithAI(idea, { showLoading = false } = {}) {
  // Show loading state on the card if requested
  if (showLoading) setCardRatingState(idea.id, 'loading');

  try {
    const result = await callAIAPI(idea);
    const { score, summary, decision } = result;

    // Validate
    if (typeof score !== 'number' || !summary || !decision) {
      throw new Error('Invalid AI response shape');
    }

    const safeScore    = Math.max(0, Math.min(100, Math.round(score)));
    const safeDecision = decision === 'Approved' ? 'Approved' : 'Rejected';
    // AI passes → goes to Digi Driver queue; AI rejects → Rejected
    const newStatus = safeDecision === 'Approved' ? 'Awaiting Digi Approval' : 'Rejected';

    // Write back to Supabase — update ai fields AND status
    await supabaseClient
      .from('automation_ideas')
      .update({ 
        ai_score: safeScore, 
        ai_summary: summary, 
        ai_status: safeDecision, 
        status: newStatus,
        stage_updated_at: new Date().toISOString()
      })
      .eq('id', idea.id);

    // Update in-memory copy
    const idx = allIdeas.findIndex(i => i.id === idea.id);
    if (idx !== -1) {
      allIdeas[idx] = { 
        ...allIdeas[idx], 
        ai_score: safeScore, 
        ai_summary: summary, 
        ai_status: safeDecision, 
        status: newStatus
      };
    }
    if (currentDetailIdea && currentDetailIdea.id === idea.id) {
      currentDetailIdea = { 
        ...currentDetailIdea, 
        ai_score: safeScore, 
        ai_summary: summary, 
        ai_status: safeDecision, 
        status: newStatus
      };
    }

    renderIdeas();
    if (currentDetailIdea && currentDetailIdea.id === idea.id) renderDetail(currentDetailIdea);

    return { score: safeScore, summary, decision: safeDecision };
  } catch(err) {
    console.error('[AI Rating] failed:', err);
    if (showLoading) setCardRatingState(idea.id, 'error');
    return null;
  }
}

function setCardRatingState(ideaId, state) {
  const cards = document.querySelectorAll('.idea-card');
  cards.forEach(card => {
    if (card.dataset.id === String(ideaId)) {
      const badge = card.querySelector('.ai-score-badge');
      if (badge) {
        if (state === 'loading') { badge.className = 'ai-score-badge ai-rating'; badge.textContent = 'Rating…'; }
        if (state === 'error')   { badge.className = 'ai-score-badge ai-error'; badge.textContent = 'AI error'; }
      }
    }
  });
}

window.reRateIdea = async function(ideaId) {
  const idea = allIdeas.find(i => i.id === ideaId) || currentDetailIdea;
  if (!idea) return;
  // Check API key
  if (!AI_API_KEY) {
    alert('AI rating is not configured.');
    return;
 }
  // Show loading in detail view
  const btn = document.getElementById('rerate-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rating…'; }
  const summaryEl = document.getElementById('ai-summary-text');
  if (summaryEl) summaryEl.textContent = 'Asking AI…';

  const result = await rateIdeaWithAI(idea, { showLoading: true });

  if (btn) { btn.disabled = false; btn.textContent = '↻ Re-rate with AI'; }
  if (!result && summaryEl) summaryEl.textContent = 'Rating failed. Check the console for details.';
};

// ===================== RENDER: DASHBOARD CARDS =====================
function aiScoreColor(score) {
  if (score == null) return '';
  if (score >= 70) return 'ai-score--high';
  if (score >= 40) return 'ai-score--mid';
  return 'ai-score--low';
}

function renderIdeas() {
  const grid = document.getElementById('ideas-grid');
  if (!grid) return;
  const searchTerm   = (document.getElementById('search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('status-filter')?.value || 'All';

  let filtered = [...allIdeas];

  // Tab filter
  if (activeTab === 'approved') {
    filtered = filtered.filter(i => i.status === 'In Development' || i.status === 'Testing' || i.status === 'Implemented');
  } else if (activeTab === 'digi') {
    filtered = filtered.filter(i => i.status === 'Awaiting Digi Approval');
  }

  if (statusFilter !== 'All') filtered = filtered.filter(i => i.status === statusFilter);
  if (searchTerm.trim()) {
    filtered = filtered.filter(i =>
      i.automation_name?.toLowerCase().includes(searchTerm) ||
      i.description?.toLowerCase().includes(searchTerm) ||
      i.idea_author?.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    const msg = activeTab === 'approved'
      ? '⚙ No ideas currently in development or implemented yet.'
      : activeTab === 'digi'
      ? '⚑ No ideas awaiting your approval right now.'
      : '✨ No ideas found. Create one!';
    grid.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  grid.innerHTML = filtered.map(idea => {
    const hasScore = idea.ai_score != null;
    const scoreBadge = hasScore
      ? `<div class="ai-score-badge ${aiScoreColor(idea.ai_score)}">${idea.ai_score}%</div>`
      : `<div class="ai-score-badge ai-pending">Not rated</div>`;
    const stage = getStageInfo(idea.status);

    return `
      <div class="idea-card" data-id="${idea.id}" onclick="showDetailById('${idea.id}')">
        <div class="card-header-row">
          <div class="card-title">${escapeHtml(idea.automation_name || '—')}</div>
          ${scoreBadge}
        </div>
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
        <div class="card-footer-row">
          <span class="stage-badge ${stage.color}">${stage.icon} ${stage.label}</span>
          ${idea.ai_status ? `<span class="ai-decision-label ai-decision--${idea.ai_status.toLowerCase()}">AI: ${idea.ai_status}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function showDetailById(ideaId) {
  const idea = allIdeas.find(i => i.id === ideaId);
  if (idea) { showDetail(idea); }
  else if (supabaseClient) {
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

  // AI analysis section HTML
  const hasAI = idea.ai_score != null;
  const aiSection = `
    <hr class="divider" />
    <div class="section-heading ai-section-heading">§5 — AI Analysis</div>
    ${hasAI ? `
      <div class="ai-result-panel">
        <div class="ai-score-display">
          <div class="ai-score-ring ${aiScoreColor(idea.ai_score)}">
            <span class="ai-score-number">${idea.ai_score}</span>
            <span class="ai-score-pct">%</span>
          </div>
          <div class="ai-score-meta">
            <div class="ai-decision-pill ai-decision-pill--${(idea.ai_status||'').toLowerCase()}">${idea.ai_status || '—'}</div>
            <div class="ai-score-label">AI viability score</div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">AI Summary</div>
          <div class="detail-value ai-summary-text" id="ai-summary-text">${escapeHtml(idea.ai_summary) || '—'}</div>
        </div>
      </div>
    ` : `
      <div class="ai-unrated">
        <div class="ai-unrated-icon">✦</div>
        <div class="ai-unrated-text">This idea has not been rated by AI yet.</div>
        <div id="ai-summary-text" style="display:none"></div>
      </div>
    `}
    <div class="ai-actions">
      <button class="btn-rerate" id="rerate-btn" onclick="reRateIdea('${idea.id}')">
        ${hasAI ? '↻ Re-rate with AI' : '✦ Rate with AI'}
      </button>
      ${hasAI ? `<span class="ai-powered-label">Powered by OpenAI → FestoGPT</span>` : ''}
    </div>
  `;

  container.innerHTML = `
    <div class="detail-title" id="d-title">${escapeHtml(idea.automation_name || '—')}</div>
    <div class="detail-author" id="d-author-disp">Submitted by ${escapeHtml(idea.idea_author || 'Anonymous')}</div>
    <div class="detail-badges">
      <span class="stage-badge ${getStageInfo(idea.status).color}" id="d-badge">${getStageInfo(idea.status).icon} ${idea.status}</span>
      ${idea.ai_score != null ? `<span class="badge-ai-score ${aiScoreColor(idea.ai_score)}">${idea.ai_score}% AI Score</span>` : ''}
    </div>

    <!-- ── EDIT PANEL ── -->
    <div class="detail-edit-panel" id="edit-panel">
      <div class="section-heading">Edit Idea</div>
      <div class="edit-grid">
        <div class="edit-field">
          <label>Automation Name</label>
          <input type="text" id="e-name" value="${escapeHtml(idea.automation_name || '')}">
        </div>
        <div class="edit-field">
          <label>Author</label>
          <input type="text" id="e-author" value="${escapeHtml(idea.idea_author || '')}">
        </div>
      </div>
      <div class="edit-field">
        <label>Description</label>
        <textarea id="e-desc">${escapeHtml(idea.description || '')}</textarea>
      </div>
      <div class="edit-grid">
        <div class="edit-field">
          <label>Standardized Process Score (0–10)</label>
          <div class="range-wrapper">
            <input type="range" id="e-std" min="0" max="10" value="${idea.standardized_process_score ?? 5}"
              oninput="document.getElementById('e-std-val').innerText=this.value">
            <span class="range-val" id="e-std-val">${idea.standardized_process_score ?? 5}</span>
          </div>
        </div>
        <div class="edit-field">
          <label>Speed Criticality (0–10)</label>
          <div class="range-wrapper">
            <input type="range" id="e-speed" min="0" max="10" value="${idea.speed_criticality ?? 5}"
              oninput="document.getElementById('e-speed-val').innerText=this.value">
            <span class="range-val" id="e-speed-val">${idea.speed_criticality ?? 5}</span>
          </div>
        </div>
        <div class="edit-field">
          <label>Digital Input?</label>
          <select id="e-digital">
            <option value="">Select…</option>
            ${['Yes','No','Maybe'].map(v=>`<option${idea.digital_input===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="edit-field">
          <label>Rule-Based?</label>
          <select id="e-rule">
            <option value="">Select…</option>
            ${['Yes','No','Maybe'].map(v=>`<option${idea.rule_based===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="edit-field">
          <label>Software Systems</label>
          <select id="e-systems">
            <option value="">Select…</option>
            ${['1 or less','2','3','4 or more'].map(v=>`<option${idea.software_systems===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="edit-field">
          <label>Weekly Hours Saved</label>
          <input type="number" id="e-hours" value="${idea.weekly_hours ?? ''}" min="0" step="0.5">
        </div>
        <div class="edit-field">
          <label>Test Data Available?</label>
          <select id="e-testdata">
            <option value="">Select…</option>
            ${['Yes','No'].map(v=>`<option${idea.test_data_available===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="edit-field">
          <label>Process Documented?</label>
          <select id="e-documented">
            <option value="">Select…</option>
            ${['Yes','No'].map(v=>`<option${idea.process_documented===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="edit-actions">
        <button class="btn-save" id="save-btn" onclick="saveEdit()">Save Changes</button>
        <button class="btn-discard" onclick="discardEdit()">Discard</button>
        <span class="save-status" id="save-status"></span>
      </div>
    </div>

    <!-- ── READ VIEW ── -->
    <div id="read-panel">
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

      ${aiSection}
    </div>

    <!-- ── PIPELINE STEPPER ── -->
    <div class="pipeline-section">
      <div class="section-heading">§6 — Pipeline Stage</div>
      <div class="pipeline-stepper">
        ${PIPELINE_STAGES.filter(s => s.key !== 'Rejected').map((stage, idx) => {
          const currentIdx = getStageIndex(idea.status === 'Rejected' ? 'Rejected' : idea.status);
          const rejectedActive = idea.status === 'Rejected';
          const isComplete = !rejectedActive && idx < currentIdx;
          const isActive   = !rejectedActive && idx === currentIdx;
          return `
            <div class="pipeline-step ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''}">
              <div class="pipeline-step-dot">${isComplete ? '✓' : stage.icon}</div>
              <div class="pipeline-step-label">${stage.label}</div>
            </div>
            ${idx < PIPELINE_STAGES.filter(s => s.key !== 'Rejected').length - 1
              ? `<div class="pipeline-connector ${isComplete ? 'complete' : ''}"></div>`
              : ''}
          `;
        }).join('')}
      </div>
      ${idea.status === 'Rejected' ? `
        <div class="pipeline-rejected-note">✗ This idea was rejected${idea.ai_status === 'Rejected' ? ' by AI scoring' : ''}.
          ${idea.digi_note ? `<span class="digi-note-inline">Digi note: "${escapeHtml(idea.digi_note)}"</span>` : ''}
        </div>
      ` : ''}

      ${idea.status === 'Awaiting Digi Approval' ? `
        ${isDigiDriver() ? `
          <div class="digi-approval-box">
            <div class="digi-approval-label">⚑ Digi Driver Decision</div>
            <textarea id="digi-note-input" placeholder="Optional note for the submitter…" rows="2"></textarea>
            <div class="digi-approval-actions">
              <button class="btn-advance" onclick="digiApprove('${idea.id}')">✓ Approve for Development</button>
              <button class="btn-reject-stage" onclick="digiReject('${idea.id}')">✗ Reject</button>
            </div>
          </div>
        ` : `
          <div class="digi-waiting-notice">
            <span class="digi-waiting-icon">⚑</span>
            <span>Awaiting approval from the Digi Community Driver.</span>
          </div>
        `}
      ` : `
        <div class="pipeline-actions">
          ${(() => {
            const next = getNextStage(idea.status);
            // Regular users cannot advance past Awaiting Digi Approval — handled above
            if (next && next.key !== 'Awaiting Digi Approval') return `
              <button class="btn-advance" onclick="changeStatus('${idea.id}', '${next.key}')">
                ${next.icon} Advance to ${next.label} →
              </button>`;
            if (idea.status === 'Implemented') return `
              <div class="pipeline-complete-badge">★ Fully Implemented</div>`;
            return '';
          })()}
          ${idea.status !== 'Rejected' && idea.status !== 'Implemented' && idea.status !== 'Awaiting Digi Approval' ? `
            <button class="btn-reject-stage" onclick="changeStatus('${idea.id}', 'Rejected')">✗ Reject</button>
          ` : ''}
          ${idea.status === 'Rejected' ? `
            <button class="btn-advance" onclick="changeStatus('${idea.id}', 'Submitted')">↩ Reopen</button>
          ` : ''}
        </div>
      `}

      ${idea.digi_note && idea.status !== 'Rejected' ? `
        <div class="digi-note-display">⚑ Digi note: "${escapeHtml(idea.digi_note)}"</div>
      ` : ''}
    </div>

    <div class="detail-actions" id="d-actions">
      <button class="btn-edit" id="edit-btn" onclick="toggleEditMode()">✎ Edit</button>
    </div>
  `;
}

let _editMode = false;

window.toggleEditMode = function() {
  _editMode = !_editMode;
  const panel = document.getElementById('edit-panel');
  const readPanel = document.getElementById('read-panel');
  const btn = document.getElementById('edit-btn');
  if (panel) panel.classList.toggle('visible', _editMode);
  if (readPanel) readPanel.style.display = _editMode ? 'none' : '';
  if (btn) { btn.textContent = _editMode ? '✎ Editing…' : '✎ Edit'; btn.classList.toggle('active', _editMode); }
  if (_editMode) { document.getElementById('e-name')?.focus(); }
};

window.discardEdit = function() {
  _editMode = false;
  renderDetail(currentDetailIdea);
};

window.saveEdit = async function() {
  const btn = document.getElementById('save-btn');
  const status = document.getElementById('save-status');
  if (!currentDetailIdea) return;

  const fields = {
    automation_name:            document.getElementById('e-name').value.trim(),
    idea_author:                document.getElementById('e-author').value.trim(),
    description:                document.getElementById('e-desc').value.trim(),
    standardized_process_score: parseInt(document.getElementById('e-std').value),
    digital_input:              document.getElementById('e-digital').value || null,
    rule_based:                 document.getElementById('e-rule').value || null,
    software_systems:           document.getElementById('e-systems').value || null,
    weekly_hours:               parseFloat(document.getElementById('e-hours').value) || null,
    speed_criticality:          parseInt(document.getElementById('e-speed').value),
    test_data_available:        document.getElementById('e-testdata').value || null,
    process_documented:         document.getElementById('e-documented').value || null,
  };

  if (!fields.automation_name) {
    if (status) { status.textContent = 'Name is required.'; status.className = 'save-status err'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Saving…'; status.className = 'save-status'; }

  try {
    await updateIdeaFull(currentDetailIdea.id, fields);
    currentDetailIdea = { ...currentDetailIdea, ...fields };
    _editMode = false;
    renderDetail(currentDetailIdea);
  } catch(err) {
    console.error("Save error", err);
    if (btn) btn.disabled = false;
    if (status) { status.textContent = 'Save failed: ' + (err.message || 'unknown'); status.className = 'save-status err'; }
  }
};

window.changeStatus = async function(ideaId, newStatus) {
  try { await updateIdeaStatus(ideaId, newStatus); }
  catch(err) { console.error("Status update error", err); alert("Failed to update status. Check console."); }
};

// ===================== DIGI DRIVER ACTIONS =====================
window.digiApprove = async function(ideaId) {
  const note = document.getElementById('digi-note-input')?.value.trim() || null;
  const btn = document.querySelector('.digi-approval-actions .btn-advance');
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
  try {
    const updates = { status: 'In Development', digi_approved_by: currentUser.email };
    if (note) updates.digi_note = note;
    const { error } = await supabaseClient.from('automation_ideas').update(updates).eq('id', ideaId);
    if (error) throw error;
    if (currentDetailIdea && currentDetailIdea.id === ideaId) {
      currentDetailIdea = { ...currentDetailIdea, ...updates };
    }
    await fetchAndRenderIdeas();
    renderDetail(currentDetailIdea);
  } catch(err) {
    console.error('Digi approve error', err);
    alert('Failed to approve: ' + (err.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = '✓ Approve for Development'; }
  }
};

window.digiReject = async function(ideaId) {
  const note = document.getElementById('digi-note-input')?.value.trim() || null;
  const btn = document.querySelector('.digi-approval-actions .btn-reject-stage');
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
  try {
    const updates = { status: 'Rejected', digi_approved_by: currentUser.email };
    if (note) updates.digi_note = note;
    const { error } = await supabaseClient.from('automation_ideas').update(updates).eq('id', ideaId);
    if (error) throw error;
    if (currentDetailIdea && currentDetailIdea.id === ideaId) {
      currentDetailIdea = { ...currentDetailIdea, ...updates };
    }
    await fetchAndRenderIdeas();
    renderDetail(currentDetailIdea);
  } catch(err) {
    console.error('Digi reject error', err);
    alert('Failed to reject: ' + (err.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = '✗ Reject'; }
  }
};

// ===================== MODAL & FORM =====================
function openForm() {
  document.getElementById('modal-overlay').classList.add('open');
  ['f-author','f-name','f-desc','f-hours'].forEach(id => document.getElementById(id).value = '');
  ['f-digital','f-rule','f-systems','f-testdata','f-documented'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-std').value = 5;   document.getElementById('f-std-val').innerText = 5;
  document.getElementById('f-speed').value = 5; document.getElementById('f-speed-val').innerText = 5;
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
  submitBtn.innerText = "Submitting…";

  try {
    const idea = await insertIdea({
      idea_author: author, automation_name: name, description: desc,
      standardized_process_score: std, digital_input: digital, rule_based: rule,
      software_systems: systems, weekly_hours: hours, speed_criticality: speed,
      test_data_available: testdata, process_documented: documented
    });
    closeForm();
    await fetchAndRenderIdeas();

    // Trigger AI rating automatically after insert (non-blocking)
    if (idea && AI_API_KEY && AI_API_KEY !== 'YOUR_OPENAI_KEY_HERE') {
      rateIdeaWithAI(idea, { showLoading: true });
    }
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
  try {
    const saved = localStorage.getItem('ideaflow-theme') || 'dark';
    applyTheme(saved);
  } catch(e) { applyTheme('dark'); }

  if (!supabaseClient) {
    showView('login-view');
    setStatus('login-status', '⚠️ Supabase failed to initialise. Check URL/KEY.', 'error');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) { currentUser = session.user; showDashboard(); }
  else { showView('login-view'); }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) { currentUser = session.user; }
    else if (event === 'SIGNED_OUT') { currentUser = null; allIdeas = []; }
  });

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeForm();
  });

  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('reg-password2').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});

// ===================== GLOBALS =====================
window.showView       = showView;
window.showDashboard  = showDashboard;
window.openForm       = openForm;
window.closeForm      = closeForm;
window.renderIdeas    = renderIdeas;
window.showDetailById = showDetailById;
window.toggleTheme    = toggleTheme;
window.toggleEditMode = toggleEditMode;
window.discardEdit    = discardEdit;
window.saveEdit       = saveEdit;
window.reRateIdea     = reRateIdea;
window.switchTab      = switchTab;
window.digiApprove    = digiApprove;
window.digiReject     = digiReject;