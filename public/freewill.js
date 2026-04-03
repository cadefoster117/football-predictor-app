// public/freewill.js - FIXED & CLEAN
let debates = [];

async function loadDebates() {
  const container = document.getElementById('debatesContainer');
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('runDebateBtn');

  statusEl.textContent = 'Loading debates...';
  btn.disabled = true;
  container.innerHTML = '<p style="text-align:center; color:#888;">Fetching Team Free Will analysis...</p>';

  try {
    const res = await fetch('/api/debate');
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p style="color:#f87171; text-align:center;">${data.message || data.error}</p>`;
      return;
    }

    debates = data.debates || [];
    renderDebates();
    statusEl.textContent = `✅ ${debates.length} matches analyzed by Team Free Will`;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#f87171; text-align:center;">Connection error. Server running?</p>`;
  } finally {
    btn.disabled = false;
  }
}

function renderDebates() {
  const container = document.getElementById('debatesContainer');
  container.innerHTML = '';

  if (debates.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No debates yet. Run the engine first.</p>';
    return;
  }

  debates.forEach(debate => {
    const card = document.createElement('div');
    card.className = 'match-card';

    const ais = [
      { name: 'Gemini', data: debate.gemini || {}, color: '#8b5cf6' },
      { name: 'DeepSeek', data: debate.deepseek || {}, color: '#34d399' },
      { name: 'GPT', data: debate.gpt || {}, color: '#60a5fa' }
    ];

    let aiHtml = '';
    ais.forEach(ai => {
      const v = ai.data.vote || 'ERROR';
      const voteClass = v === 'YES' ? 'vote-yes' : v === 'NO' ? 'vote-no' : 'vote-maybe';
      aiHtml += `
        <div class="ai-card">
          <div class="ai-header" style="color:${ai.color}">
            <span>${ai.name}</span>
            <span class="\( {voteClass}"> \){v} (${ai.data.confidence || 0}%)</span>
          </div>
          <p style="margin-top:10px; line-height:1.45;">${ai.data.reason || 'No reason provided.'}</p>
        </div>`;
    });

    const strength = debate.consensus?.strength || 'WEAK';
    const strengthColor = strength === 'STRONG' ? '#4ade80' : strength === 'MODERATE' ? '#fbbf24' : '#f87171';

    card.innerHTML = `
      <h2>${debate.match || 'Match'}</h2>
      <p style="color:#999;">${debate.date ? new Date(debate.date).toLocaleString() : ''}</p>
      <div class="consensus">
        <strong>Consensus:</strong> ${debate.consensus?.yesCount || 0}/3 YES — 
        Avg Confidence: <strong>${debate.consensus?.avgConfidence || 0}%</strong> 
        <span style="color:\( {strengthColor}; font-weight:bold;">( \){strength})</span>
      </div>
      <div class="ai-grid">${aiHtml}</div>
    `;

    container.appendChild(card);
  });
}

// Button + initial load
document.getElementById('runDebateBtn').addEventListener('click', loadDebates);
window.onload = loadDebates;
