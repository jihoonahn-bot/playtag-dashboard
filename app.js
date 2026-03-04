// ===================== STATE =====================
const COLORS = ['#0066ff','#00c896','#ff6b35','#a855f7','#f59e0b','#ef4444','#06b6d4','#84cc16','#ec4899','#8b5cf6'];
const PALETTES = {
  default: ['#0066ff','#00c896','#ff6b35','#a855f7','#f59e0b'],
  ocean: ['#0077b6','#00b4d8','#90e0ef','#caf0f8','#023e8a'],
  forest: ['#1b4332','#2d6a4f','#40916c','#74c69d','#b7e4c7'],
  sunset: ['#ff0a54','#ff477e','#ff7096','#ff85a1','#fbb1bd'],
  mono: ['#111','#333','#555','#888','#bbb'],
};
let selectedPalette = 'default';
let selectedSize = 'col-6';
let dashboardCharts = [];
let chartInstances = {};
let predictChart = null, driverChart = null, deptChart = null, builderChart = null;
let scenarios = [];

// Pre-loaded data from xlsx
const yearData = [
  {year:2025,manpower:600,referralPct:0,inbound:5,retentionPct:0.83,cumulative:1000},
  {year:2026,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null},
  {year:2027,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null},
  {year:2028,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null},
  {year:2029,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null},
  {year:2030,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null},
];
function computeYearly(data){
  let cum = data[0].cumulative;
  for(let i=1;i<data.length;i++){
    const prev=data[i-1],cur=data[i];
    const mp = cur.manpower !== null ? cur.manpower : Math.round(prev.manpower*(1+0.3));
    const ref = Math.round(cum*cur.referralPct);
    const ib = cur.inbound !== null ? cur.inbound : Math.round(prev.inbound*(1+0.09));
    const bounce = -Math.round(cum*0.17);
    cum = cum + mp + ref + ib + bounce;
    data[i].manpower = mp; data[i].inbound = ib; data[i].cumulative = cum;
  }
  return data;
}

const growthFunnelData = [
  {level:'Level 1',stage:'Sales Conversion',dept:'Business',kpi:'Conversion rate, Volume',result:'Expansion',influence:1.0},
  {level:'Level 2',stage:'Service Ready',dept:'PL',kpi:'Stability (업로드율, H/W 정상유지, 설치 만족도)',result:'Retention',influence:0.2},
  {level:'Level 2',stage:'Service Ready',dept:'R&D',kpi:'Stability (인식율, 정확성, 안정성 등)',result:'Retention',influence:0.8},
  {level:'Level 2',stage:'Service Ready',dept:'Operation',kpi:'Service Ready',result:'Retention',influence:0.05},
  {level:'Level 2',stage:'Service Ready',dept:'Product',kpi:'Usability (준비상태, 자료준비, 유저시나리오 생산량)',result:'Retention',influence:0.05},
  {level:'Level 3',stage:'Usage Loop',dept:'Product',kpi:'Send rate / Teacher usage',result:'Retention',influence:0.7},
  {level:'Level 3',stage:'Usage Loop',dept:'Operation',kpi:'Service Operation',result:'Retention',influence:0.3},
  {level:'Level 4',stage:'Parent Action',dept:'Product',kpi:'Parent action',result:'Retention',influence:0.7},
  {level:'Level 4',stage:'Parent Action',dept:'Business',kpi:'Contact',result:'Retention',influence:0.3},
  {level:'Level 5',stage:'Retention',dept:'Product',kpi:'Retention',result:'Retention',influence:0.8},
  {level:'Level 5',stage:'Retention',dept:'Business',kpi:'CRM',result:'Retention',influence:0.2},
  {level:'Level 6',stage:'Expansion Opportunity',dept:'Product',kpi:'Referral, Inbound',result:'Expansion',influence:0.5},
  {level:'Level 6',stage:'Expansion Opportunity',dept:'Business',kpi:'Conversion rate, Volume, CRM',result:'Expansion',influence:0.5},
];

const funnelSteps = [
  {label:'Cold Lead',count:10000,color:'#0066ff'},
  {label:'Warm Lead',count:2000,color:'#00c896'},
  {label:'가계약',count:480,color:'#ff6b35'},
  {label:'본계약',count:192,color:'#a855f7'},
  {label:'설치 완료',count:171,color:'#f59e0b'},
];

// ===================== INIT =====================
window.onload = function(){
  computeYearly(yearData);
  buildYearTable();
  buildCustomTable();
  buildFunnelViz();
  buildGrowthFunnelTable();
  buildDeptTable();
  buildPaletteUI();
  initDashboard();
  runPrediction();
  buildDeptChart();
  previewChart();
};

// ===================== NAVIGATION =====================
function switchView(v){
  ['dashboard','data','charts','funnel','predict','dept'].forEach(n=>{
    document.getElementById('view-'+n).classList.add('hidden');
    document.querySelectorAll('.sidebar-item').forEach(el=>el.classList.remove('active'));
  });
  document.getElementById('view-'+v).classList.remove('hidden');
  document.querySelectorAll('.sidebar-item').forEach(el=>{
    if(el.getAttribute('onclick')===`switchView('${v}')`) el.classList.add('active');
  });
  const titles = {dashboard:'Overview Dashboard',data:'데이터 입력',charts:'차트 빌더',funnel:'Growth Funnel',predict:'예측 시뮬레이터',dept:'부서별 KPI'};
  document.getElementById('topbar-title').innerHTML = titles[v]+' <span>Playtag Growth · 2026</span>';
  if(v==='charts') setTimeout(previewChart,100);
  if(v==='predict') setTimeout(()=>{ if(!predictChart) runPrediction(); },100);
}

function switchDataTab(el,tab){
  document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['채널별신규','연도별누적','퍼널전환율','커스텀'].forEach(t=>{
    const el2 = document.getElementById('dtab-'+t);
    if(el2) el2.classList.toggle('hidden', t!==tab);
  });
}

// ===================== DASHBOARD INIT =====================
function initDashboard(){
  const grid = document.getElementById('dashboard-grid');
  const initialCharts = [
    {id:'ch1',title:'채널별 신규계약 비중',type:'doughnut',source:'channel',size:'col-4'},
    {id:'ch2',title:'연도별 누적수량 추이',type:'line',source:'yearly',size:'col-8'},
    {id:'ch3',title:'퍼널 전환율',type:'bar',source:'funnel',size:'col-6'},
    {id:'ch4',title:'채널별 수량 비교',type:'bar',source:'channel',size:'col-6'},
  ];
  initialCharts.forEach(c=>{ dashboardCharts.push(c); renderCard(c,grid); });
  makeSortable(grid);
}

function renderCard(cfg, container){
  const div = document.createElement('div');
  div.className = `chart-card ${cfg.size}`;
  div.dataset.id = cfg.id;
  div.innerHTML = `
    <div class="card-header">
      <span class="drag-handle">⠿</span>
      <div class="card-title">${cfg.title}</div>
      <div class="card-actions">
        <button class="card-btn" onclick="editCard('${cfg.id}')" title="편집">✏️</button>
        <button class="card-btn" onclick="resizeCard('${cfg.id}')" title="크기">⤢</button>
        <button class="card-btn" onclick="removeCard('${cfg.id}')" title="삭제">×</button>
      </div>
    </div>
    <div class="card-body"><canvas id="canvas-${cfg.id}"></canvas></div>`;
  container.appendChild(div);
  setTimeout(()=>renderChartById(cfg.id, cfg.type, cfg.source, cfg.title),50);
}

function makeSortable(el){
  if(typeof Sortable !== 'undefined'){
    Sortable.create(el,{animation:150,handle:'.drag-handle',ghostClass:'sortable-ghost',chosenClass:'sortable-chosen'});
  }
}

// ===================== CHART RENDERING =====================
function getDataForSource(source){
  if(source==='channel'){
    const rows = getTableRows('channel-table');
    return {
      labels: rows.map(r=>r[1]||r[0]),
      datasets:[{label:'수량',data:rows.map(r=>parseFloat(r[2])||0)}]
    };
  }
  if(source==='yearly'){
    computeYearly(yearData);
    return {
      labels: yearData.map(r=>String(r.year)),
      datasets:[
        {label:'누적수량',data:yearData.map(r=>r.cumulative)},
        {label:'Manpower(신규)',data:yearData.map(r=>r.manpower)},
      ]
    };
  }
  if(source==='funnel'){
    const rows = getTableRows('funnel-table');
    return {
      labels: rows.map(r=>r[1]),
      datasets:[{label:'전환율(%)',data:rows.map(r=>parseFloat(r[2])||0)}]
    };
  }
  return {labels:[],datasets:[]};
}

function getTableRows(tableId){
  const tbody = document.querySelector(`#${tableId} tbody`);
  if(!tbody) return [];
  return Array.from(tbody.rows).map(row=>{
    return Array.from(row.cells).slice(0,-1).map(cell=>{
      const inp = cell.querySelector('input,select');
      return inp ? inp.value : cell.textContent.trim();
    });
  });
}

function renderChartById(id, type, source, title){
  const canvas = document.getElementById('canvas-'+id);
  if(!canvas) return;
  if(chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  const data = getDataForSource(source);
  chartInstances[id] = buildChart(canvas, type, data, title, COLORS, 12, 'top');
}

function buildChart(canvas, type, data, title, colors, fontSize, legendPos){
  const isStacked = type==='bar-stacked';
  const isMixed = type==='mixed';
  const isArea = type==='line-area';
  let chartType = type;
  if(isStacked||type==='bar-grouped') chartType='bar';
  if(isArea) chartType='line';

  const datasets = data.datasets.map((ds,i)=>{
    const c = colors[i%colors.length];
    const base = {
      label:ds.label,
      data:ds.data,
      backgroundColor: ['pie','doughnut','polarArea'].includes(chartType)
        ? colors.map(c=>c+'cc')
        : c+'bb',
      borderColor: c,
      borderWidth: ['pie','doughnut','polarArea'].includes(chartType)?0:2,
      borderRadius: chartType==='bar'?4:0,
      fill: isArea,
      tension: 0.4,
      pointRadius: chartType==='line'||isArea?4:0,
      pointHoverRadius: 6,
    };
    if(isMixed && i===data.datasets.length-1){ base.type='line'; base.fill=false; }
    return base;
  });

  const cfg = {
    type: isMixed?'bar':chartType,
    data:{labels:data.labels,datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        title:{display:!!title,text:title,font:{size:fontSize+1,weight:'600'}},
        legend:{display:legendPos!=='false',position:legendPos},
      },
      scales:['pie','doughnut','polarArea','radar'].includes(chartType)?{}:{
        x:{stacked:isStacked,grid:{color:'#f0f2f5'},ticks:{font:{size:fontSize-1}}},
        y:{stacked:isStacked,grid:{color:'#f0f2f5'},ticks:{font:{size:fontSize-1}}},
      },
    }
  };
  return new Chart(canvas, cfg);
}

function refreshAllCharts(){
  computeYearly(yearData);
  dashboardCharts.forEach(c=>renderChartById(c.id,c.type,c.source,c.title));
  if(predictChart) runPrediction();
}

// ===================== CHART BUILDER =====================
function buildPaletteUI(){
  const c = document.getElementById('palette-picker');
  if(!c) return;
  Object.keys(PALETTES).forEach(name=>{
    const wrap = document.createElement('div');
    wrap.style.cssText='display:flex;gap:3px;align-items:center;cursor:pointer;border:2px solid transparent;border-radius:6px;padding:3px';
    wrap.title = name;
    PALETTES[name].forEach(col=>{
      const s = document.createElement('div');
      s.style.cssText=`width:16px;height:16px;border-radius:50%;background:${col}`;
      wrap.appendChild(s);
    });
    if(name===selectedPalette) wrap.style.borderColor='var(--accent)';
    wrap.onclick=()=>{
      selectedPalette=name;
      document.querySelectorAll('#palette-picker > div').forEach(d=>d.style.borderColor='transparent');
      wrap.style.borderColor='var(--accent)';
      previewChart();
    };
    c.appendChild(wrap);
  });
}

function previewChart(){
  const type = document.getElementById('builder-type')?.value;
  const source = document.getElementById('builder-source')?.value;
  const title = document.getElementById('builder-title')?.value||'';
  const legend = document.getElementById('builder-legend')?.value||'top';
  const fontSize = parseInt(document.getElementById('builder-fontsize')?.value||12);
  const canvas = document.getElementById('builder-canvas');
  if(!canvas||!type||!source) return;
  if(builderChart){ builderChart.destroy(); builderChart=null; }
  const data = getDataForSource(source);
  builderChart = buildChart(canvas, type, data, title, PALETTES[selectedPalette], fontSize, legend);
}

function loadBuilderData(){ previewChart(); }

function selectSize(el,size){
  selectedSize=size;
  document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

function addChartToDashboard(){
  const id = 'ch'+Date.now();
  const cfg = {
    id,
    title: document.getElementById('builder-title')?.value||'새 차트',
    type: document.getElementById('builder-type')?.value||'bar',
    source: document.getElementById('builder-source')?.value||'channel',
    size: selectedSize,
  };
  dashboardCharts.push(cfg);
  renderCard(cfg, document.getElementById('dashboard-grid'));
  switchView('dashboard');
}

// ===================== QUICK ADD MODAL =====================
function openAddChart(){ document.getElementById('modal-add').classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function quickAddChart(){
  const id='ch'+Date.now();
  const cfg={
    id,
    title:document.getElementById('quick-title').value||'새 차트',
    type:document.getElementById('quick-type').value,
    source:document.getElementById('quick-source').value,
    size:document.getElementById('quick-size').value,
  };
  dashboardCharts.push(cfg);
  renderCard(cfg, document.getElementById('dashboard-grid'));
  closeModal('modal-add');
  switchView('dashboard');
}

// ===================== CARD CONTROLS =====================
function removeCard(id){
  if(!confirm('이 차트를 삭제하시겠습니까?')) return;
  const card = document.querySelector(`[data-id="${id}"]`);
  if(card) card.remove();
  if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
  dashboardCharts = dashboardCharts.filter(c=>c.id!==id);
}

function resizeCard(id){
  const sizes = ['col-3','col-4','col-6','col-8','col-12'];
  const card = document.querySelector(`[data-id="${id}"]`);
  if(!card) return;
  const cur = sizes.find(s=>card.classList.contains(s))||'col-6';
  const next = sizes[(sizes.indexOf(cur)+1)%sizes.length];
  sizes.forEach(s=>card.classList.remove(s));
  card.classList.add(next);
  setTimeout(()=>{ const ch=dashboardCharts.find(c=>c.id===id); if(ch) renderChartById(id,ch.type,ch.source,ch.title); },100);
}

// ===================== EDIT MODAL =====================
let editingId = null;
let editPreviewChart = null, editColorChart = null, editDataChart = null, editCompareChart = null;
let editPalette = 'default';
let editCustomColors = [];
let editCompareLayers = [];
let editInlineData = { labels: [], datasets: [] };

const CHART_TYPES = [
  {v:'bar',icon:'📊',label:'막대'},
  {v:'line',icon:'📈',label:'꺾은선'},
  {v:'line-area',icon:'🏔',label:'영역'},
  {v:'pie',icon:'🥧',label:'파이'},
  {v:'doughnut',icon:'🍩',label:'도넛'},
  {v:'radar',icon:'🕸',label:'레이더'},
  {v:'polarArea',icon:'🎯',label:'폴라'},
  {v:'bar-stacked',icon:'📦',label:'누적막대'},
  {v:'bar-grouped',icon:'🗂',label:'그룹막대'},
  {v:'scatter',icon:'✦',label:'산점도'},
  {v:'bubble',icon:'🫧',label:'버블'},
  {v:'mixed',icon:'🔀',label:'혼합'},
];

function editCard(id) {
  const ch = dashboardCharts.find(c => c.id === id);
  if (!ch) return;
  editingId = id;
  editPalette = ch.palette || 'default';
  editCompareLayers = ch.compareLayers ? JSON.parse(JSON.stringify(ch.compareLayers)) : [];
  editCustomColors = ch.customColors ? [...ch.customColors] : [...PALETTES[editPalette]];

  // Set title/legend/fontsize
  document.getElementById('edit-title').value = ch.title;
  document.getElementById('edit-legend').value = ch.legendPos || 'top';
  document.getElementById('edit-fontsize').value = ch.fontSize || 12;
  document.getElementById('edit-modal-subtitle').textContent = `차트 ID: ${id}`;

  // Init inline data from source
  editInlineData = JSON.parse(JSON.stringify(getDataForSource(ch.source)));
  if (ch.inlineData) editInlineData = JSON.parse(JSON.stringify(ch.inlineData));

  // Build type grid
  buildTypeGrid(ch.type);
  // Build palette grid
  buildEditPaletteGrid();
  // Build color rows
  buildColorRows();
  // Build data table
  buildEditDataTable();
  // Build compare layer list
  buildLayerList();

  // Switch to first tab
  document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.edit-tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('.edit-tab[data-tab="type"]').classList.add('active');
  document.getElementById('etab-type').classList.remove('hidden');

  document.getElementById('modal-edit').classList.add('open');
  setTimeout(() => refreshEditPreview(), 80);
}

function switchEditTab(el) {
  document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.edit-tab-panel').forEach(p => p.classList.add('hidden'));
  el.classList.add('active');
  document.getElementById('etab-' + el.dataset.tab).classList.remove('hidden');
  const tab = el.dataset.tab;
  if (tab === 'type') setTimeout(refreshEditPreview, 60);
  if (tab === 'color') setTimeout(refreshColorPreview, 60);
  if (tab === 'data') setTimeout(refreshDataPreview, 60);
  if (tab === 'compare') {
    const src = document.getElementById('compare-source').value;
    toggleCompareInputs(src);
    setTimeout(refreshComparePreview, 60);
  }
}

function buildTypeGrid(current) {
  const grid = document.getElementById('type-grid');
  if (!grid) return;
  grid.innerHTML = CHART_TYPES.map(t => `
    <div class="type-btn ${t.v === current ? 'active' : ''}" onclick="selectEditType('${t.v}', this)">
      <span class="type-icon">${t.icon}</span>${t.label}
    </div>`).join('');
}

function selectEditType(type, el) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  refreshEditPreview();
}

function getEditType() {
  const active = document.querySelector('.type-btn.active');
  return active ? CHART_TYPES[Array.from(document.querySelectorAll('.type-btn')).indexOf(active)].v : 'bar';
}

function refreshEditPreview() {
  const canvas = document.getElementById('edit-preview-canvas');
  if (!canvas) return;
  if (editPreviewChart) { editPreviewChart.destroy(); editPreviewChart = null; }
  const ch = dashboardCharts.find(c => c.id === editingId);
  if (!ch) return;
  const type = getEditType();
  const title = document.getElementById('edit-title')?.value || '';
  const legend = document.getElementById('edit-legend')?.value || 'top';
  const fontSize = parseInt(document.getElementById('edit-fontsize')?.value) || 12;
  const data = buildMergedData(ch.source, editCompareLayers, editInlineData);
  editPreviewChart = buildChart(canvas, type, data, title, editCustomColors, fontSize, legend);
}

function buildEditPaletteGrid() {
  const grid = document.getElementById('edit-palette-grid');
  if (!grid) return;
  grid.innerHTML = Object.keys(PALETTES).map(name => `
    <div class="palette-card ${name === editPalette ? 'active' : ''}" onclick="selectEditPalette('${name}', this)">
      <div class="pal-swatches">
        ${PALETTES[name].slice(0, 5).map(c => `<div class="pal-swatch" style="background:${c}"></div>`).join('')}
      </div>
      <div class="pal-name">${name}</div>
    </div>`).join('');
}

function selectEditPalette(name, el) {
  editPalette = name;
  editCustomColors = [...PALETTES[name]];
  document.querySelectorAll('.palette-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  buildColorRows();
  refreshColorPreview();
}

function buildColorRows() {
  const wrap = document.getElementById('edit-color-rows');
  if (!wrap) return;
  const ch = dashboardCharts.find(c => c.id === editingId);
  if (!ch) return;
  const data = buildMergedData(ch.source, editCompareLayers, editInlineData);
  const labels = data.datasets.map(d => d.label);
  wrap.innerHTML = labels.map((lbl, i) => {
    const col = editCustomColors[i % editCustomColors.length] || COLORS[i % COLORS.length];
    return `<div style="display:flex;align-items:center;gap:10px">
      <input type="color" value="${col}" style="width:36px;height:30px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px"
        onchange="editCustomColors[${i}]=this.value; refreshColorPreview()"/>
      <span style="font-size:12px;font-weight:500">${lbl || '데이터셋 '+(i+1)}</span>
      <span style="font-size:11px;color:var(--text3);font-family:'DM Mono'">${col}</span>
    </div>`;
  }).join('');
}

function refreshColorPreview() {
  const canvas = document.getElementById('edit-color-preview');
  if (!canvas) return;
  if (editColorChart) { editColorChart.destroy(); editColorChart = null; }
  const ch = dashboardCharts.find(c => c.id === editingId);
  if (!ch) return;
  const type = getEditType();
  const data = buildMergedData(ch.source, editCompareLayers, editInlineData);
  editColorChart = buildChart(canvas, type, data, '', editCustomColors, 11, 'top');
}

// ---- DATA TAB ----
function buildEditDataTable() {
  const thead = document.getElementById('edit-data-thead');
  const tbody = document.getElementById('edit-data-tbody');
  if (!thead || !tbody) return;
  const d = editInlineData;
  const dsCount = d.datasets.length;

  thead.innerHTML = `<tr>
    <th>레이블</th>
    ${d.datasets.map((ds, i) => `<th><input value="${ds.label}" style="background:transparent;border:none;font-weight:600;color:var(--text2);width:100px" onchange="editInlineData.datasets[${i}].label=this.value"/></th>`).join('')}
    <th></th>
  </tr>`;

  tbody.innerHTML = d.labels.map((lbl, ri) => `
    <tr>
      <td><input value="${lbl}" onchange="editInlineData.labels[${ri}]=this.value;refreshDataPreview()"/></td>
      ${d.datasets.map((ds, ci) => `<td><input type="number" value="${ds.data[ri]??''}" style="width:90px" onchange="editInlineData.datasets[${ci}].data[${ri}]=parseFloat(this.value)||0;refreshDataPreview()"/></td>`).join('')}
      <td><button class="del-btn" onclick="editDataDelRow(${ri})">×</button></td>
    </tr>`).join('');
}

function editAddDataRow() {
  editInlineData.labels.push('새 항목');
  editInlineData.datasets.forEach(ds => ds.data.push(0));
  buildEditDataTable();
  refreshDataPreview();
}

function editAddDataset() {
  const name = prompt('새 데이터셋 이름:', '데이터셋 ' + (editInlineData.datasets.length + 1));
  if (!name) return;
  editInlineData.datasets.push({ label: name, data: editInlineData.labels.map(() => 0) });
  buildEditDataTable();
  refreshDataPreview();
}

function editDataDelRow(ri) {
  editInlineData.labels.splice(ri, 1);
  editInlineData.datasets.forEach(ds => ds.data.splice(ri, 1));
  buildEditDataTable();
  refreshDataPreview();
}

function applyEditData() { refreshDataPreview(); }

function refreshDataPreview() {
  const canvas = document.getElementById('edit-data-preview');
  if (!canvas) return;
  if (editDataChart) { editDataChart.destroy(); editDataChart = null; }
  const type = getEditType();
  editDataChart = buildChart(canvas, type, editInlineData, '', editCustomColors, 11, 'top');
}

// ---- COMPARE TAB ----
document.getElementById && document.addEventListener('DOMContentLoaded', () => {
  const cs = document.getElementById('compare-source');
  if (cs) cs.addEventListener('change', () => toggleCompareInputs(cs.value));
});

function toggleCompareInputs(src) {
  document.getElementById('compare-manual-wrap').classList.toggle('hidden', src !== 'manual');
  document.getElementById('compare-line-wrap').classList.toggle('hidden', src !== 'custom_line');
}

function getCompareData(src) {
  computeYearly(yearData);
  if (src === 'yearly_cumulative') return { labels: yearData.map(r => String(r.year)), values: yearData.map(r => r.cumulative) };
  if (src === 'yearly_manpower') return { labels: yearData.map(r => String(r.year)), values: yearData.map(r => r.manpower) };
  if (src === 'funnel') { const rows = getTableRows('funnel-table'); return { labels: rows.map(r => r[1]), values: rows.map(r => parseFloat(r[2]) || 0) }; }
  if (src === 'channel') { const rows = getTableRows('channel-table'); return { labels: rows.map(r => r[1] || r[0]), values: rows.map(r => parseFloat(r[2]) || 0) }; }
  if (src === 'manual') {
    const raw = document.getElementById('compare-manual-vals')?.value || '';
    const vals = raw.split(',').map(v => parseFloat(v.trim()) || 0);
    return { labels: vals.map((_, i) => `항목 ${i + 1}`), values: vals };
  }
  if (src === 'custom_line') {
    const val = parseFloat(document.getElementById('compare-line-val')?.value) || 0;
    const ch = dashboardCharts.find(c => c.id === editingId);
    const base = getDataForSource(ch?.source || 'yearly');
    return { labels: base.labels, values: base.labels.map(() => val) };
  }
  return { labels: [], values: [] };
}

function addCompareLayer() {
  const src = document.getElementById('compare-source').value;
  const type = document.getElementById('compare-type').value;
  const label = document.getElementById('compare-label').value || src;
  const { labels, values } = getCompareData(src);
  const color = COLORS[(editCompareLayers.length + 2) % COLORS.length];
  editCompareLayers.push({ src, type, label, labels, values, color });
  buildLayerList();
  refreshComparePreview();
}

function buildLayerList() {
  const list = document.getElementById('compare-layer-list');
  if (!list) return;
  if (!editCompareLayers.length) { list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">추가된 비교 레이어가 없습니다.</div>'; return; }
  list.innerHTML = editCompareLayers.map((l, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
      <input type="color" value="${l.color}" style="width:28px;height:28px;border:none;cursor:pointer;border-radius:50%"
        onchange="editCompareLayers[${i}].color=this.value;refreshComparePreview()"/>
      <span style="flex:1;font-size:12px;font-weight:500">${l.label}</span>
      <span style="font-size:11px;color:var(--text3);background:var(--panel);padding:2px 8px;border-radius:4px;border:1px solid var(--border)">${l.type}</span>
      <span style="font-size:11px;color:var(--text3)">${l.values.length}개 값</span>
      <button class="del-btn" onclick="editCompareLayers.splice(${i},1);buildLayerList();refreshComparePreview()">×</button>
    </div>`).join('');
}

function clearCompareLayers() { editCompareLayers = []; buildLayerList(); refreshComparePreview(); }

function buildMergedData(source, layers, inlineOverride) {
  const base = inlineOverride && inlineOverride.labels.length ? JSON.parse(JSON.stringify(inlineOverride)) : JSON.parse(JSON.stringify(getDataForSource(source)));
  layers.forEach(layer => {
    const isDash = layer.type === 'line-dash';
    const ds = {
      label: layer.label,
      data: layer.values,
      type: (layer.type === 'line' || isDash) ? 'line' : layer.type === 'scatter' ? 'scatter' : 'bar',
      borderDash: isDash ? [6, 4] : undefined,
      fill: false,
      tension: 0.4,
      pointRadius: 4,
    };
    // align length
    while (ds.data.length < base.labels.length) ds.data.push(null);
    base.datasets.push(ds);
  });
  return base;
}

function refreshComparePreview() {
  const canvas = document.getElementById('edit-compare-preview');
  if (!canvas) return;
  if (editCompareChart) { editCompareChart.destroy(); editCompareChart = null; }
  const ch = dashboardCharts.find(c => c.id === editingId);
  if (!ch) return;
  const type = editCompareLayers.length > 0 ? 'bar' : getEditType();
  const data = buildMergedData(ch.source, editCompareLayers, editInlineData);
  const allColors = [...editCustomColors, ...editCompareLayers.map(l => l.color)];
  editCompareChart = buildChart(canvas, type, data, '', allColors, 11, 'top');
}

// ---- APPLY EDIT ----
function applyEdit() {
  const ch = dashboardCharts.find(c => c.id === editingId);
  if (!ch) return;
  ch.title = document.getElementById('edit-title').value;
  ch.type = getEditType();
  ch.legendPos = document.getElementById('edit-legend').value;
  ch.fontSize = parseInt(document.getElementById('edit-fontsize').value) || 12;
  ch.palette = editPalette;
  ch.customColors = [...editCustomColors];
  ch.compareLayers = JSON.parse(JSON.stringify(editCompareLayers));
  ch.inlineData = editInlineData.labels.length ? JSON.parse(JSON.stringify(editInlineData)) : null;

  // Update card title label
  const card = document.querySelector(`[data-id="${editingId}"]`);
  if (card) { const t = card.querySelector('.card-title'); if (t) t.textContent = ch.title; }

  // Re-render
  const canvas = document.getElementById('canvas-' + editingId);
  if (canvas) {
    if (chartInstances[editingId]) { chartInstances[editingId].destroy(); delete chartInstances[editingId]; }
    const data = buildMergedData(ch.source, ch.compareLayers, ch.inlineData || null);
    const allColors = [...ch.customColors, ...ch.compareLayers.map(l => l.color)];
    const type = ch.compareLayers.length > 0 ? 'bar' : ch.type;
    chartInstances[editingId] = buildChart(canvas, type, data, ch.title, allColors, ch.fontSize, ch.legendPos);
  }
  closeModal('modal-edit');
}

// ===================== TABLE HELPERS =====================
function calcRatios(tableId){
  const tbody = document.querySelector(`#${tableId} tbody`);
  if(!tbody) return;
  const rows = Array.from(tbody.rows);
  const total = rows.reduce((s,r)=>{
    const inp = r.cells[2]?.querySelector('input');
    return s+(parseFloat(inp?.value)||0);
  },0);
  rows.forEach(r=>{
    const qty = parseFloat(r.cells[2]?.querySelector('input')?.value)||0;
    const ratioInp = r.cells[3]?.querySelector('input');
    if(ratioInp) ratioInp.value = total>0?(qty/total*100).toFixed(1):0;
  });
}

function addRow(tableId){
  const tbody = document.querySelector(`#${tableId} tbody`);
  if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML=`<td><input value="항목"/></td><td><select><option>Outbound</option><option>Inbound</option><option>Referral</option><option>기타</option></select></td><td><input type="number" value="0" class="qty-input" onchange="calcRatios('${tableId}')"/></td><td><input type="number" value="0" readonly style="color:var(--accent2)"/></td><td><input type="number" value="0"/></td><td><input type="number" value="0"/></td><td><button class="del-btn" onclick="delRow(this)">×</button></td>`;
  tbody.appendChild(tr);
}

function delRow(btn){ btn.closest('tr').remove(); }

function addYearRow(){
  const tbody = document.getElementById('year-tbody');
  if(!tbody) return;
  const lastYear = yearData[yearData.length-1].year;
  const newYear = lastYear+1;
  const entry = {year:newYear,manpower:null,referralPct:0,inbound:null,retentionPct:0.83,cumulative:null};
  yearData.push(entry);
  computeYearly(yearData);
  buildYearTable();
}

function buildYearTable(){
  computeYearly(yearData);
  const tbody = document.getElementById('year-tbody');
  if(!tbody) return;
  tbody.innerHTML = yearData.map((r,i)=>`
    <tr>
      <td><input type="number" value="${r.year}" onchange="yearData[${i}].year=parseInt(this.value);buildYearTable()"/></td>
      <td><input type="number" value="${r.manpower||''}" placeholder="자동계산" onchange="yearData[${i}].manpower=parseFloat(this.value)||null;computeYearly(yearData);buildYearTable()"/></td>
      <td><input type="number" value="${r.referralPct}" step="0.01" onchange="yearData[${i}].referralPct=parseFloat(this.value)||0;computeYearly(yearData);buildYearTable()"/></td>
      <td><input type="number" value="${r.inbound||''}" placeholder="자동계산" onchange="yearData[${i}].inbound=parseFloat(this.value)||null;computeYearly(yearData);buildYearTable()"/></td>
      <td><input type="number" value="${r.retentionPct}" step="0.01" onchange="yearData[${i}].retentionPct=parseFloat(this.value)||0.83;computeYearly(yearData);buildYearTable()"/></td>
      <td><input value="${Math.round(-(r.cumulative||0)*0.17)}" readonly style="color:var(--danger)"/></td>
      <td><input value="${Math.round(r.cumulative)||''}" readonly style="color:var(--accent2);font-weight:600"/></td>
      <td><button class="del-btn" onclick="yearData.splice(${i},1);buildYearTable()">×</button></td>
    </tr>`).join('');
}

// ===================== CUSTOM TABLE =====================
let customCols = ['구분','값1','값2'];
let customRows = [['항목 A',100,200],['항목 B',150,180],['항목 C',200,120]];

function buildCustomTable(){
  const wrap = document.getElementById('custom-table-wrap');
  if(!wrap) return;
  wrap.innerHTML=`<table class="data-table" id="custom-data-table">
    <thead><tr>${customCols.map((c,i)=>`<th><input value="${c}" onchange="customCols[${i}]=this.value" style="background:transparent;border:none;font-weight:600;color:var(--text2);width:100px"/></th>`).join('')}<th></th></tr></thead>
    <tbody>${customRows.map((r,ri)=>`<tr>${r.map((v,ci)=>`<td><input value="${v}" onchange="customRows[${ri}][${ci}]=this.value"/></td>`).join('')}<td><button class="del-btn" onclick="customRows.splice(${ri},1);buildCustomTable()">×</button></td></tr>`).join('')}
    </tbody></table>`;
}

function addCustomCol(){ customCols.push('새 열'); customRows.forEach(r=>r.push(0)); buildCustomTable(); }
function addCustomRow(){ customRows.push(customCols.map((_,i)=>i===0?'새 항목':0)); buildCustomTable(); }

function buildCustomChart(){
  const id='custom'+Date.now();
  const cfg={id,title:'커스텀 차트',type:'bar',source:'custom',size:'col-12'};
  dashboardCharts.push(cfg);
  renderCard(cfg, document.getElementById('dashboard-grid'));
  switchView('dashboard');
  setTimeout(()=>{
    const canvas=document.getElementById('canvas-'+id);
    if(canvas&&chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
    const labels=customRows.map(r=>r[0]);
    const datasets=customCols.slice(1).map((col,i)=>({label:col,data:customRows.map(r=>parseFloat(r[i+1])||0)}));
    if(canvas) chartInstances[id]=buildChart(canvas,'bar',{labels,datasets},'커스텀 차트',COLORS,12,'top');
  },100);
}

// ===================== FUNNEL VIZ =====================
function buildFunnelViz(){
  const c = document.getElementById('funnel-viz');
  if(!c) return;
  const max = funnelSteps[0].count;
  c.innerHTML = funnelSteps.map((step,i)=>{
    const pct = Math.round(step.count/max*100);
    const rate = i>0?Math.round(step.count/funnelSteps[i-1].count*100)+'%':'--';
    return `<div class="funnel-step">
      <div class="funnel-label">${step.label}</div>
      <div class="funnel-bar-wrap">
        <div class="funnel-bar" style="width:${pct}%;background:${step.color}">
          ${step.count.toLocaleString()}개
        </div>
      </div>
      <div class="funnel-rate">→ ${rate}</div>
    </div>`;
  }).join('');
}

// ===================== GROWTH FUNNEL TABLE =====================
function buildGrowthFunnelTable(){
  const tbody = document.getElementById('funnel-tbody');
  if(!tbody) return;
  const levelMap={'Level 1':'level-1','Level 2':'level-2','Level 3':'level-3','Level 4':'level-4','Level 5':'level-5','Level 6':'level-6'};
  const deptMap={'Business':'dept-business','Product':'dept-product','R&D':'dept-rnd','Operation':'dept-operation','PL':'dept-pl'};
  tbody.innerHTML = growthFunnelData.map(r=>`
    <tr>
      <td><span class="level-badge ${levelMap[r.level]||''}">${r.level}</span></td>
      <td style="font-weight:600">${r.stage}</td>
      <td><span class="dept-badge ${deptMap[r.dept]||''}">${r.dept}</span></td>
      <td style="color:var(--text2);font-size:12px">${r.kpi}</td>
      <td><span class="chip active">${r.result}</span></td>
      <td style="min-width:120px">
        <div style="font-size:11px;font-family:'DM Mono';margin-bottom:2px">${Math.round(r.influence*100)}%</div>
        <div class="influence-bar"><div class="influence-fill" style="width:${r.influence*100}%"></div></div>
      </td>
    </tr>`).join('');
}

// ===================== DEPT TABLE =====================
function buildDeptTable(){
  const tbody = document.getElementById('dept-tbody');
  if(!tbody) return;
  const levelMap={'Level 1':'level-1','Level 2':'level-2','Level 3':'level-3','Level 4':'level-4','Level 5':'level-5','Level 6':'level-6'};
  const deptMap={'Business':'dept-business','Product':'dept-product','R&D':'dept-rnd','Operation':'dept-operation','PL':'dept-pl'};
  tbody.innerHTML = growthFunnelData.map(r=>`
    <tr>
      <td><span class="level-badge ${levelMap[r.level]||''}">${r.level}</span></td>
      <td>${r.stage}</td>
      <td><span class="dept-badge ${deptMap[r.dept]||''}">${r.dept}</span></td>
      <td style="font-size:12px">${r.kpi}</td>
      <td><span class="chip">${r.result}</span></td>
      <td style="font-family:'DM Mono'">${Math.round(r.influence*100)}%</td>
      <td><input type="number" placeholder="현재값" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px"/></td>
      <td><input type="number" placeholder="목표값" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px"/></td>
      <td><button class="del-btn" onclick="this.closest('tr').remove()">×</button></td>
    </tr>`).join('');
}

function addDeptRow(){
  const tbody = document.getElementById('dept-tbody');
  if(!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML=`<td><input value="Level X" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:4px"/></td><td><input value="단계명"/></td><td><select style="border:1px solid var(--border);border-radius:6px;padding:4px"><option>Business</option><option>Product</option><option>R&D</option><option>Operation</option><option>PL</option></select></td><td><input value="관리지표 입력"/></td><td><input value="Retention" style="width:90px;border:1px solid var(--border);border-radius:6px;padding:4px"/></td><td><input type="number" value="0.5" step="0.1" style="width:70px;border:1px solid var(--border);border-radius:6px;padding:4px"/></td><td><input type="number" placeholder="현재" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:4px"/></td><td><input type="number" placeholder="목표" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:4px"/></td><td><button class="del-btn" onclick="this.closest('tr').remove()">×</button></td>`;
  tbody.appendChild(tr);
}

function buildDeptChart(){
  const canvas = document.getElementById('dept-canvas');
  if(!canvas) return;
  if(deptChart){ deptChart.destroy(); deptChart=null; }
  // aggregate influence by dept per result
  const depts=['Business','Product','R&D','Operation','PL'];
  const retInfluence=[0,0,0,0,0];
  const expInfluence=[0,0,0,0,0];
  growthFunnelData.forEach(r=>{
    const di=depts.indexOf(r.dept);
    if(di<0) return;
    if(r.result==='Retention') retInfluence[di]+=r.influence;
    else expInfluence[di]+=r.influence;
  });
  deptChart = new Chart(canvas,{
    type:'bar',
    data:{
      labels:depts,
      datasets:[
        {label:'Retention 영향력',data:retInfluence.map(v=>Math.round(v*100)/100),backgroundColor:'#0066ffbb',borderColor:'#0066ff',borderWidth:2,borderRadius:4},
        {label:'Expansion 영향력',data:expInfluence.map(v=>Math.round(v*100)/100),backgroundColor:'#00c896bb',borderColor:'#00c896',borderWidth:2,borderRadius:4},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{grid:{display:false}},y:{grid:{color:'#f0f2f5'},title:{display:true,text:'합산 영향력'}}}}
  });
}

// ===================== PREDICTION =====================
let scenarioColors = ['#0066ff','#00c896','#ff6b35','#a855f7','#f59e0b'];

function computeScenario(params){
  const yrs=[];
  let cum=params.start;
  for(let i=0;i<=params.horizon;i++){
    yrs.push({year:params.startYear+i,cum:Math.round(cum)});
    const mp=params.manpower*Math.pow(1+params.mpGrowth/100,i);
    const ref=Math.round(cum*(params.referralPct/100));
    const ib=params.inbound*Math.pow(1+params.ibGrowth/100,i);
    const bounce=-Math.round(cum*(1-params.retention/100));
    cum=cum+mp+ref+ib+bounce;
    if(cum<0) cum=0;
  }
  return yrs;
}

function runPrediction(){
  const params={
    start:parseFloat(document.getElementById('pred-start')?.value)||1000,
    startYear:parseInt(document.getElementById('pred-year')?.value)||2025,
    horizon:parseInt(document.getElementById('pred-horizon')?.value)||6,
    retention:parseFloat(document.getElementById('pred-retention')?.value)||83,
    manpower:parseFloat(document.getElementById('pred-manpower')?.value)||600,
    mpGrowth:parseFloat(document.getElementById('pred-manpower-growth')?.value)||30,
    inbound:parseFloat(document.getElementById('pred-inbound')?.value)||5,
    ibGrowth:parseFloat(document.getElementById('pred-inbound-growth')?.value)||9,
    referralPct:parseFloat(document.getElementById('pred-referral')?.value)||0,
    target:parseFloat(document.getElementById('pred-target')?.value)||6000,
    name:document.getElementById('pred-name')?.value||'시나리오',
  };
  const result=computeScenario(params);
  const existing=scenarios.find(s=>s.name===params.name);
  if(existing){ existing.data=result; existing.params=params; }
  else scenarios.push({name:params.name,data:result,params,color:scenarioColors[scenarios.length%scenarioColors.length]});

  drawPredictChart();
  updateInsight(params, result);
  updateScenarioCards();
  drawDriverChart(params, result);
}

function drawPredictChart(){
  const canvas=document.getElementById('predict-canvas');
  if(!canvas) return;
  if(predictChart){ predictChart.destroy(); predictChart=null; }
  const allYears=[...new Set(scenarios.flatMap(s=>s.data.map(d=>d.year)))].sort();
  const datasets=scenarios.map(s=>({
    label:s.name,
    data:allYears.map(y=>{ const d=s.data.find(dd=>dd.year===y); return d?d.cum:null; }),
    borderColor:s.color,
    backgroundColor:s.color+'22',
    fill:true,tension:0.4,borderWidth:2,pointRadius:4,pointHoverRadius:7,
  }));

  // target line
  const tgt=scenarios[0]?.params.target||6000;
  datasets.push({label:`목표 ${tgt.toLocaleString()}`,data:allYears.map(()=>tgt),borderColor:'#ef4444',borderDash:[6,4],fill:false,borderWidth:1.5,pointRadius:0,tension:0});

  predictChart=new Chart(canvas,{
    type:'line',
    data:{labels:allYears,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},
      scales:{x:{grid:{color:'#f0f2f5'}},y:{grid:{color:'#f0f2f5'},ticks:{callback:v=>v.toLocaleString()}}}}
  });
}

function drawDriverChart(params,result){
  const canvas=document.getElementById('driver-canvas');
  if(!canvas) return;
  if(driverChart){ driverChart.destroy(); driverChart=null; }
  const totalGrowth=result[result.length-1].cum-params.start;
  const mpTotal=params.manpower*(Math.pow(1+params.mpGrowth/100,params.horizon+1)-1)/(params.mpGrowth/100||0.01);
  const ibTotal=params.inbound*(Math.pow(1+params.ibGrowth/100,params.horizon+1)-1)/(params.ibGrowth/100||0.01);
  const refTotal=params.start*(params.referralPct/100)*params.horizon;
  const bounceTotal=-params.start*(1-params.retention/100)*params.horizon;
  driverChart=new Chart(canvas,{
    type:'bar',
    data:{
      labels:['Manpower(신규)','Inbound','Referral','Bounce(이탈)','순성장'],
      datasets:[{label:'누적 기여 수량',
        data:[Math.round(mpTotal),Math.round(ibTotal),Math.round(refTotal),Math.round(bounceTotal),totalGrowth],
        backgroundColor:['#0066ffbb','#00c896bb','#a855f7bb','#ef4444bb','#f59e0bbb'],
        borderColor:['#0066ff','#00c896','#a855f7','#ef4444','#f59e0b'],
        borderWidth:2,borderRadius:6}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false}},y:{grid:{color:'#f0f2f5'},ticks:{callback:v=>v.toLocaleString()}}}}
  });
}

function updateInsight(params,result){
  const box=document.getElementById('predict-insight');
  if(!box) return;
  const final=result[result.length-1].cum;
  const targetYear=result.find(r=>r.cum>=params.target);
  const gap=params.target-final;
  box.innerHTML=`<strong>📊 시뮬레이션 인사이트 — ${params.name}</strong><br/><br/>
    현재 파라미터 유지 시 <strong>${params.horizon}년 후 (${result[result.length-1].year}년)</strong> 예측 누적수량은 <strong style="color:var(--accent)">${Math.round(final).toLocaleString()}개</strong>입니다.
    ${targetYear
      ? `<br/>목표 <strong>${params.target.toLocaleString()}개</strong>는 <strong style="color:var(--accent2)">${targetYear.year}년</strong>에 달성 예측됩니다.`
      : `<br/>현재 속도로는 목표 <strong>${params.target.toLocaleString()}개</strong> 달성이 어렵습니다. <strong style="color:var(--danger)">약 ${Math.abs(Math.round(gap)).toLocaleString()}개 부족</strong> — Referral/Inbound 드라이버 강화가 필요합니다.`}
    <br/>Manpower 의존도: <strong style="color:var(--accent3)">${params.mpGrowth}%/년</strong> → Product-driven 전환 시 Referral Rate를 <strong>15%+</strong>로 끌어올리는 것이 핵심입니다.`;
}

function updateScenarioCards(){
  const c=document.getElementById('scenario-cards');
  if(!c) return;
  c.innerHTML=scenarios.map(s=>`
    <div class="scenario-card">
      <div class="scenario-name">
        <div class="scenario-dot" style="background:${s.color}"></div>
        ${s.name}
        <button class="btn btn-secondary" style="font-size:10px;padding:3px 8px;margin-left:auto" onclick="removeScenario('${s.name}')">삭제</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${['start','retention','manpower','referralPct'].map(k=>`
          <div style="font-size:11px;color:var(--text3)">${{start:'시작수량',retention:'Retention%',manpower:'Manpower기준',referralPct:'Referral%'}[k]}</div>
          <div style="font-size:12px;font-family:'DM Mono';font-weight:600">${s.params[k]}</div>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--accent2);font-weight:600">
        최종 예측: ${(s.data[s.data.length-1]?.cum||0).toLocaleString()}개 (${s.data[s.data.length-1]?.year}년)
      </div>
    </div>`).join('');
}

function removeScenario(name){
  scenarios=scenarios.filter(s=>s.name!==name);
  drawPredictChart();
  updateScenarioCards();
}

function clearScenarios(){ scenarios=[]; drawPredictChart(); updateScenarioCards(); if(predictChart){predictChart.destroy();predictChart=null;} }

// ===================== EXPORT =====================
function exportData(){
  const rows=[['연도','누적수량','Manpower','Inbound','Referral%','Retention%']];
  computeYearly(yearData);
  yearData.forEach(r=>rows.push([r.year,r.cumulative,r.manpower,r.inbound,r.referralPct,r.retentionPct]));
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download='playtag_growth_data.csv';
  a.click();
}

// Modal close on bg click
document.getElementById('modal-add').addEventListener('click',function(e){ if(e.target===this) closeModal('modal-add'); });
document.getElementById('modal-edit').addEventListener('click',function(e){ if(e.target===this) closeModal('modal-edit'); });

// Compare source change
document.getElementById('compare-source').addEventListener('change', function(){ toggleCompareInputs(this.value); });