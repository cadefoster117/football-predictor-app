// public/freewill.js
let debates = [];

async function loadDebates() {
  const container = document.getElementById('debatesContainer');
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('runDebateBtn');

  statusEl.textContent = 'Running AI analysis... (this may take 40-90 seconds)';
  btn.disabled = true;
  container.innerHTML = '<p style="text-align:center; color:#888;">Analyzing matches with Gemini, DeepSeek & GPT...</p>';

  try {
    const res = await fetch('/api/debate');
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p style="color:#f87171; text-align:center;">${data.message || data.error}</p>`;
      return;
    }

    debates = data.debates || [];
    renderDebates();
    statusEl.textContent = `✅ ${debates.length} matches debated by Team Free Will`;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#f87171; text-align:center;">Connection error. Is the server running?</p>`;
  } finally {
    btn.disabled = false;
  }
}

function renderDebates() {
  const container = document.getElementById('debatesContainer');
  container.innerHTML = '';

  if (debates.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No debates yet. Click the button above to start.</p>';
    return;
  }

  debates.forEach(debate => {
    const card = document.createElement('div');
    card.className = 'match-card';

    const ais = [
      { name: 'Gemini',   data: debate.gemini,   color: '#8b5cf6' },
      { name: 'DeepSeek', data: debate.deepseek, color: '#34d399' },
      { name: 'GPT',      data: debate.gpt,      color: '#60a5fa' }
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
          <p style="margin-top:10px; line-height:1.45;">${ai.data.reason || 'No reason returned.'}</p>
        </div>
      `;
    });

    const strength = debate.consensus.strength;
    const strengthColor = strength === 'STRONG' ? '#4ade80' : strength === 'MODERATE' ? '#fbbf24' : '#f87171';

    card.innerHTML = `
      <h2>${debate.match}</h2>
      <p style="color:#999;">${new Date(debate.date).toLocaleString()}</p>

      <div class="consensus">
        <strong>Consensus:</strong> ${debate.consensus.yesCount}/3 YES — 
        Average Confidence: <strong>${debate.consensus.avgConfidence}%</strong> 
        <span style="color:\( {strengthColor}; font-weight:bold;">( \){strength})</span>
      </div>

      <div class="ai-grid">
        ${aiHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

// Event listeners
document.getElementById('runDebateBtn').addEventListener('click', loadDebates);

// Initial load
window.onload = loadDebates;
