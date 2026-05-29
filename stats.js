// ===================== STATISTICS MODULE =====================
// This file depends on global variables/functions from app.js:
//   - supabaseClient
//   - currentUser
//   - allIdeas
//   - fetchAndRenderIdeas()
// It also needs Chart.js library (already loaded in index.html)

let statsChart = null;  // store Chart instance

// Switch to statistics view and render data
window.showStatsView = async function() {
  showView('stats-view');  // showView is defined in app.js
  await renderStatistics();
};

// Main rendering function for statistics
async function renderStatistics() {
  // Ensure we have ideas data
  if (!allIdeas.length && currentUser) {
    await fetchAndRenderIdeas();  // defined in app.js
  }
  const ideas = allIdeas;

  // Calculate summary numbers
  const totalIdeas = ideas.length;
  const inDevelopment = ideas.filter(i => 
    i.status === 'In Development' || i.status === 'Testing' || i.status === 'Implemented'
  ).length;
  const implemented = ideas.filter(i => i.status === 'Implemented').length;

  // Update DOM elements (they exist in stats-view)
  const totalEl = document.getElementById('stat-total');
  const devEl = document.getElementById('stat-development');
  const implEl = document.getElementById('stat-implemented');
  if (totalEl) totalEl.textContent = totalIdeas;
  if (devEl) devEl.textContent = inDevelopment;
  if (implEl) implEl.textContent = implemented;

  // Prepare chart data – only ideas with a numeric AI score
  const ratedIdeas = ideas.filter(i => i.ai_score !== null && i.ai_score !== undefined);
  const labels = ratedIdeas.map(i => 
    i.automation_name.length > 20 ? i.automation_name.substring(0, 17) + '...' : i.automation_name
  );
  const scores = ratedIdeas.map(i => i.ai_score);

  // Destroy previous chart if exists
  if (statsChart) {
    statsChart.destroy();
  }

  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  
  // Get current theme colors for chart (respect light/dark mode)
  const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e8e8f0';
  const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#6b6b80';

  statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'AI Score (%)',
        data: scores,
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
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw}%` } }
      },
      scales: {
        y: { 
          title: { display: true, text: 'AI Score (%)', color: mutedColor },
          min: 0,
          max: 100,
          ticks: { color: textColor }
        },
        x: {
          ticks: { color: textColor, maxRotation: 45, minRotation: 45 },
          title: { display: true, text: 'Idea Name', color: mutedColor }
        }
      }
    }
  });
}

// Optionally refresh stats if the view is visible when data changes
// This function should be called from the realtime subscription in app.js
window.refreshStatsIfVisible = function() {
  const statsView = document.getElementById('stats-view');
  if (statsView && statsView.style.display !== 'none') {
    renderStatistics();
  }
};