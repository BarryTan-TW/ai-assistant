'use strict';

const STORE_KEY = 'ai-assistant-bot.conversations';
const PREFS_KEY = 'ai-assistant-bot.prefs';
const DEFAULT_AGENT = 'product-owner';
const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24];
const DEFAULT_FONT = 18;
const PREFS_VERSION = 2;
const $ = (id) => document.getElementById(id);

const ROLES = {
  'group': { emoji: '👥', zh: '群組討論', en: 'Group discussion', zhDesc: '大家一起討論：每位專家輪流依專長提出想法、設計或做法，最後由專案經理總結', enDesc: 'Everyone discusses together: each expert adds ideas, design or implementation in turn, then the project manager sums up' },
  'product-owner': { emoji: '📋', zh: '產品經理', en: 'Product Owner', zhDesc: '把您的想法整理成清楚的需求規格書', enDesc: 'Turns your idea into a clear spec' },
  'ux-ui-designer': { emoji: '🎨', zh: '介面設計師', en: 'UX/UI Designer', zhDesc: '設計畫面、操作流程與無障礙', enDesc: 'Designs screens, flows and accessibility' },
  'qa-tdd-tester': { emoji: '🧪', zh: '測試工程師', en: 'QA Tester', zhDesc: '在寫程式之前，先依規格寫好測試', enDesc: 'Writes tests from the spec before coding' },
  'android-developer': { emoji: '🤖', zh: 'Android 工程師', en: 'Android Developer', zhDesc: '開發 Android 手機 App', enDesc: 'Builds the Android app' },
  'ios-developer': { emoji: '🍎', zh: 'iOS 工程師', en: 'iOS Developer', zhDesc: '開發 iPhone / iPad App', enDesc: 'Builds the iPhone / iPad app' },
  'orchestrator': { emoji: '🧭', zh: '專案經理', en: 'Project Manager', zhDesc: '安排整個團隊依流程合作', enDesc: 'Coordinates the whole team workflow' },
};
const ROLE_ORDER = Object.keys(ROLES);
const GROUP = 'group';
const MODERATOR = 'orchestrator';
const PASS_RE = /^\W*PASS\W*$/i;

const I18N = {
  zh: {
    brand: 'AI 小助手', newChat: '＋ 開新對話', history: '對話紀錄', talkTo: '① 請選擇要跟誰說話（可隨時更換）：',
    placeholder: '③ 請在這裡輸入您的想法…\n（按 Enter 送出，Shift + Enter 換行）',
    aicRun: (n) => `本次花費 ${n} AIC`, aicRunning: (n) => `處理中，已花 ${n} AIC`, aicTotal: (n) => `此對話共 ${n} AIC`,
    aicLeft: (n, total, pct) => `剩餘 ${n} / ${total} AIC（${pct}%）`, aicReset: (d) => `${d} 重置`,
    aicUnlimited: '剩餘：無上限', aicUnknown: '剩餘：無法取得（請先執行 gh auth login）',
    projectLabel: '② 專案位置：', projectChange: '📂 選擇專案', projectTitle: '📂 選擇要討論的專案',
    projectRecent: '最近用過的專案', projectGithub: '🌐 GitHub 網址（會自動下載到電腦）', projectDownload: '下載並使用',
    projectGithubHint: (dir) => `例如：https://github.com/owner/repo 或 owner/repo。會下載到 ${dir}`,
    projectLocal: '💻 電腦裡的資料夾', projectGo: '前往', projectUseFolder: '✔ 使用這個資料夾',
    projectUp: '⬆ 回上一層', projectNoDirs: '（這裡沒有子資料夾）', projectNone: '（尚未選擇）',
    projectCloning: '正在下載專案，第一次可能要等一兩分鐘…', projectLoading: '請稍候…',
    projectSwitchTitle: '📂 換專案', projectSwitchText: (n) => `要換到「${n}」嗎？\n這個對話會保留在紀錄裡，換專案後會開一個新對話。`,
    send: '送出 ➤', stop: '■ 停止', saveSpec: '💾 儲存規格書', deleteChat: '🗑 刪除對話',
    ok: '確定', cancel: '取消', you: '您', readAloud: '🔊 朗讀', stopReading: '■ 停止朗讀',
    thinking: '正在思考，請稍候', stopped: '⏹ 已停止回答。', newTitle: '新對話',
    fontLabel: (n) => `字 ${n}`, dark: '🌙 深色', light: '☀️ 淺色', lang: 'English',
    switched: (name) => `已換成「${name}」跟您對話。他記得前面所有內容。`,
    switchedGroup: '已換成「👥 群組討論」。各位專家會輪流發言，大家都記得前面所有內容。',
    speaking: (name, n, total) => `${name} 正在發言（第 ${n} 位，共 ${total} 位），請稍候`,
    summarizing: (name) => `${name} 正在整理大家的意見，請稍候`,
    passed: (name) => `${name}：這次沒有補充。`,
    summaryTag: '（總結）',
    emptyTitle: '您好！今天想做什麼產品呢？',
    emptySteps: [
      '在上方選擇要跟誰說話（建議先找「📋 產品經理」，或選「👥 群組討論」讓大家一起出主意）。',
      '按「📂 選擇專案」挑選電腦裡的資料夾或 GitHub 專案，專家會看著這個專案跟您討論。',
      '在下方輸入您的想法，按「送出 ➤」。',
      '助手會問您幾個問題，慢慢回答就好。',
      '想換人時，直接點上方其他角色，對話內容會保留。',
      '談好後，按「💾 儲存規格書」。',
    ],
    saveTitle: '💾 儲存規格書', saveText: '請幫這個功能取一個資料夾名稱：',
    saveHint: '只能用英文小寫字母、數字和「-」，例如：dark-mode。不確定的話，直接按「確定」即可。',
    badSlug: '名稱格式不對，請只用英文小寫字母、數字和「-」。',
    deleteTitle: '🗑 刪除對話', deleteText: (t) => `確定要刪除「${t}」嗎？刪除後無法復原。`,
    saveMsg: (s) => `💾 請把規格書存到 docs/features/${s}/spec.md`,
    tour: '❓ 新手教學', tourSkip: '結束教學', tourPrev: '◀ 上一步', tourNext: '下一步 ▶', tourDone: '開始使用 ✔',
    tourStep: (n, total) => `第 ${n} 步，共 ${total} 步`,
    tourSteps: [
      { title: '👋 歡迎使用 AI 小助手！', text: '這個簡短的教學會帶您認識畫面上的每個地方。請按「下一步」。之後想再看，可以按左上角的「❓ 新手教學」。' },
      { target: ['#roles-bar'], title: '① 選擇要跟誰說話', text: '點一下想對話的專家。例如想整理想法，就選「📋 產品經理」。對話中可以隨時換人，前面的內容都會保留。' },
      { target: ['[data-role="group"]'], title: '👥 群組討論', text: '想聽大家的意見時選這個。每位專家會輪流提出想法，最後由專案經理總結。一輪大約要等 2～4 分鐘。' },
      { target: ['#project-bar'], title: '② 選擇專案', text: '按「📂 選擇專案」，可以選電腦裡的資料夾，或貼上 GitHub 網址自動下載。專家會讀這個專案的程式碼來討論規格與實作。' },
      { target: ['#input'], title: '③ 輸入您的想法', text: '在這裡打字，說說您想做什麼。不用很完整，專家會再問您問題。按 Enter 送出，按 Shift + Enter 換行。' },
      { target: ['#send'], title: '送出', text: '寫好後按這個按鈕。專家回答時，它會變成「■ 停止」，不想等可以按它停下來。' },
      { target: ['#messages'], title: '對話內容', text: '專家的回答會出現在這裡，每則都會寫是誰說的。回答旁邊有「🔊 朗讀」，可以念給您聽。' },
      { target: ['#save-spec'], title: '💾 儲存規格書', text: '討論好之後按這裡，產品經理會把內容整理成一份規格書，存到電腦裡。' },
      { target: ['#aic-info'], title: '💰 AI 點數（AIC）', text: '這裡的灰色小字會顯示這次回答花了多少 AI 點數、這個對話總共花了多少，以及這個月還剩多少。' },
      { target: ['#new-chat', '#conversations'], title: '開新對話與紀錄', text: '按「＋ 開新對話」可以開始新主題。下面的「對話紀錄」可以回到以前的對話。' },
      { target: ['.settings'], title: '字體、顏色與語言', text: '字太小或太大，請按「A－」或「A＋」。「🌙 深色」會換成深色畫面，「English」可以切換成英文。' },
      { title: '🎉 準備好了！', text: '現在就在下方輸入您的第一個想法吧。有問題隨時按「❓ 新手教學」。' },
    ],
  },
  en: {
    brand: 'AI Assistant', newChat: '+ New conversation', history: 'Conversations', talkTo: '① Choose who to talk to (you can switch anytime):',
    placeholder: '③ Type your idea here…\n(Enter to send, Shift + Enter for a new line)',
    aicRun: (n) => `This reply: ${n} AIC`, aicRunning: (n) => `Working, ${n} AIC so far`, aicTotal: (n) => `This conversation: ${n} AIC`,
    aicLeft: (n, total, pct) => `Remaining ${n} / ${total} AIC (${pct}%)`, aicReset: (d) => `resets ${d}`,
    aicUnlimited: 'Remaining: unlimited', aicUnknown: 'Remaining: unavailable (run gh auth login)',
    projectLabel: '② Project:', projectChange: '📂 Choose project', projectTitle: '📂 Choose the project to discuss',
    projectRecent: 'Recent projects', projectGithub: '🌐 GitHub URL (downloaded automatically)', projectDownload: 'Download & use',
    projectGithubHint: (dir) => `e.g. https://github.com/owner/repo or owner/repo. Downloaded to ${dir}`,
    projectLocal: '💻 Folder on this computer', projectGo: 'Go', projectUseFolder: '✔ Use this folder',
    projectUp: '⬆ Up one level', projectNoDirs: '(no sub-folders here)', projectNone: '(not chosen)',
    projectCloning: 'Downloading the project; the first time can take a minute or two…', projectLoading: 'Please wait…',
    projectSwitchTitle: '📂 Change project', projectSwitchText: (n) => `Switch to "${n}"?\nThis conversation stays in your history and a new conversation starts for the new project.`,
    send: 'Send ➤', stop: '■ Stop', saveSpec: '💾 Save spec', deleteChat: '🗑 Delete',
    ok: 'OK', cancel: 'Cancel', you: 'You', readAloud: '🔊 Read aloud', stopReading: '■ Stop reading',
    thinking: 'Thinking, please wait', stopped: '⏹ Stopped.', newTitle: 'New conversation',
    fontLabel: (n) => `Text ${n}`, dark: '🌙 Dark', light: '☀️ Light', lang: '中文',
    switched: (name) => `Now talking to "${name}". They remember everything said so far.`,
    switchedGroup: 'Switched to "👥 Group discussion". The experts take turns and all remember everything said so far.',
    speaking: (name, n, total) => `${name} is speaking (${n} of ${total}), please wait`,
    summarizing: (name) => `${name} is summarising everyone's ideas, please wait`,
    passed: (name) => `${name}: nothing to add this time.`,
    summaryTag: ' (summary)',
    emptyTitle: 'Hello! What would you like to build today?',
    emptySteps: [
      'Choose who to talk to above (start with "📋 Product Owner", or "👥 Group discussion" to hear from everyone).',
      'Press "📂 Choose project" to pick a folder or a GitHub project; the experts will look at it while you talk.',
      'Type your idea below and press "Send ➤".',
      'The assistant will ask a few questions. Take your time.',
      'To switch teammate, just click another role. The conversation is kept.',
      'When you are happy, press "💾 Save spec".',
    ],
    saveTitle: '💾 Save spec', saveText: 'Give this feature a folder name:',
    saveHint: 'Lowercase letters, numbers and "-" only, e.g. dark-mode. If unsure, just press OK.',
    badSlug: 'Invalid name. Use lowercase letters, numbers and "-" only.',
    deleteTitle: '🗑 Delete conversation', deleteText: (t) => `Delete "${t}"? This cannot be undone.`,
    saveMsg: (s) => `💾 Please save the spec to docs/features/${s}/spec.md`,
    tour: '❓ Tutorial', tourSkip: 'End tutorial', tourPrev: '◀ Back', tourNext: 'Next ▶', tourDone: 'Start ✔',
    tourStep: (n, total) => `Step ${n} of ${total}`,
    tourSteps: [
      { title: '👋 Welcome to AI Assistant!', text: 'This short tutorial shows you each part of the screen. Press "Next" to continue. You can replay it any time with "❓ Tutorial" at the top left.' },
      { target: ['#roles-bar'], title: '① Choose who to talk to', text: 'Click the expert you want. To shape an idea, pick "📋 Product Owner". You can switch at any time and the conversation is kept.' },
      { target: ['[data-role="group"]'], title: '👥 Group discussion', text: 'Pick this to hear from everyone. Each expert adds ideas in turn, then the project manager sums up. A round takes about 2–4 minutes.' },
      { target: ['#project-bar'], title: '② Choose a project', text: 'Press "📂 Choose project" to pick a folder on this computer, or paste a GitHub URL to download it. The experts read its code to discuss specs and implementation.' },
      { target: ['#input'], title: '③ Type your idea', text: 'Describe what you want to build. It does not need to be complete; the experts will ask questions. Enter sends, Shift + Enter adds a new line.' },
      { target: ['#send'], title: 'Send', text: 'Press this to send. While experts answer it becomes "■ Stop" so you can stop waiting.' },
      { target: ['#messages'], title: 'Conversation', text: 'Answers appear here with the name of who said it. Use "🔊 Read aloud" next to an answer to hear it.' },
      { target: ['#save-spec'], title: '💾 Save spec', text: 'When you are happy, press this. The product owner writes everything into a spec file on your computer.' },
      { target: ['#aic-info'], title: '💰 AI credits (AIC)', text: 'The small grey text shows the AI credits this reply used, the total for this conversation, and how many are left this month.' },
      { target: ['#new-chat', '#conversations'], title: 'New conversation & history', text: 'Press "+ New conversation" to start a new topic. The list below takes you back to earlier conversations.' },
      { target: ['.settings'], title: 'Text size, colours & language', text: 'Use "A－" / "A＋" to change the text size, "🌙 Dark" for a dark screen, and "中文" to switch language.' },
      { title: '🎉 You are ready!', text: 'Type your first idea below. Press "❓ Tutorial" whenever you need help.' },
    ],
  },
};

let agents = [];
let defaultProject = null;
let quota = null;
const USAGE_MARK = '\u001e';
let reposDir = '';
let conversations = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
let prefs = { lang: 'zh', font: DEFAULT_FONT, dark: false, agent: DEFAULT_AGENT, tourSeen: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
// v1 defaulted to font 22; reset everyone to the new, smaller default once.
if (prefs.v !== PREFS_VERSION) { prefs.font = DEFAULT_FONT; prefs.v = PREFS_VERSION; }
let currentId = conversations[0]?.id || null;
let controller = null;

const t = (key, ...a) => { const v = I18N[prefs.lang][key]; return typeof v === 'function' ? v(...a) : v; };
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(conversations));
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
const current = () => conversations.find((c) => c.id === currentId);
const roleName = (name) => (ROLES[name] ? `${ROLES[name].emoji} ${ROLES[name][prefs.lang]}` : `👤 ${name}`);
const selectedAgent = () => (current()?.agent) || prefs.agent;
const activeProject = () => current()?.project || prefs.project || defaultProject;
const projectIcon = (p) => (p?.type === 'local' ? '💻' : '🌐');

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Minimal, safe markdown: escape first, then apply formatting.
function renderMarkdown(src) {
  const blocks = [];
  let text = src.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => {
    blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  text = escapeHtml(text);
  const out = [];
  let list = null;
  let table = [];
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r));
    out.push('<table>' + rows.map((r, i) => '<tr>' + r.replace(/^\||\|$/g, '').split('|')
      .map((c) => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>');
    table = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) { closeList(); table.push(line.trim()); continue; }
    flushTable();
    let m;
    if ((m = /^(#{1,4})\s+(.*)/.exec(line))) { closeList(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(line))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList(); flushTable();
  return out.join('\n').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

// ---------- Read aloud ----------
const canSpeak = 'speechSynthesis' in window;
let speakingBtn = null;
function toggleSpeak(btn, text) {
  const wasMe = speakingBtn === btn;
  speechSynthesis.cancel();
  if (speakingBtn) speakingBtn.textContent = t('readAloud');
  speakingBtn = null;
  if (wasMe) return;
  const u = new SpeechSynthesisUtterance(text.replace(/[`*#|>_-]+/g, ' '));
  u.lang = prefs.lang === 'zh' ? 'zh-TW' : 'en-US';
  u.rate = 0.9;
  u.onend = () => { btn.textContent = t('readAloud'); speakingBtn = null; };
  speakingBtn = btn;
  btn.textContent = t('stopReading');
  speechSynthesis.speak(u);
}

// ---------- Dialog ----------
function openDialog({ title, text, input, hint }) {
  const d = $('dialog');
  $('dialog-title').textContent = title;
  $('dialog-text').textContent = text;
  $('dialog-hint').textContent = hint || '';
  $('dialog-input').hidden = input === undefined;
  $('dialog-input').value = input || '';
  d.returnValue = '';
  d.showModal();
  if (input !== undefined) $('dialog-input').select();
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? $('dialog-input').value.trim() || true : null), { once: true });
  });
}
$('dialog-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('dialog').close('ok'); }
});

// ---------- Rendering ----------
function applyPrefs() {
  document.documentElement.style.setProperty('--fs', `${prefs.font}px`);
  document.documentElement.classList.toggle('dark', prefs.dark);
  document.documentElement.lang = prefs.lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('input').placeholder = t('placeholder');
  $('font-label').textContent = t('fontLabel', prefs.font);
  $('font-down').disabled = prefs.font === FONT_SIZES[0];
  $('font-up').disabled = prefs.font === FONT_SIZES[FONT_SIZES.length - 1];
  $('theme-toggle').textContent = prefs.dark ? t('light') : t('dark');
  $('lang-toggle').textContent = t('lang');
}

function renderRoles() {
  const active = selectedAgent();
  const box = $('roles');
  box.innerHTML = '';
  const choices = [...agents];
  if (groupMembers().length > 1) choices.unshift({ name: GROUP, description: '' });
  for (const a of choices) {
    const r = ROLES[a.name];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.dataset.role = a.name;
    btn.setAttribute('aria-checked', String(a.name === active));
    btn.title = r ? r[`${prefs.lang}Desc`] : a.description;
    btn.disabled = !!controller;
    btn.innerHTML = `<span class="emoji">${r ? r.emoji : '👤'}</span><span>${escapeHtml(r ? r[prefs.lang] : a.name)}</span>`;
    btn.onclick = () => switchRole(a.name);
    box.appendChild(btn);
  }
  const r = ROLES[active];
  $('role-desc').textContent = r ? r[`${prefs.lang}Desc`] : (agents.find((a) => a.name === active)?.description || '');
}

function renderProject() {
  const p = activeProject();
  const el = $('project-current');
  el.innerHTML = p ? `${projectIcon(p)} ${escapeHtml(p.name)}<small>${escapeHtml(p.url || p.path)}</small>` : escapeHtml(t('projectNone'));
  el.title = p?.path || '';
  $('project-btn').disabled = !!controller;
}

const fmtAic = (n) => Number(n || 0).toLocaleString(prefs.lang === 'zh' ? 'zh-TW' : 'en', { maximumFractionDigits: 2 });

function renderAic() {
  const c = current();
  const parts = [];
  if (controller && c) parts.push(t('aicRunning', fmtAic(c.lastAic)));
  else if (c?.lastAic != null) parts.push(t('aicRun', fmtAic(c.lastAic)));
  if (c?.aic) parts.push(t('aicTotal', fmtAic(c.aic)));
  if (quota?.unlimited) parts.push(t('aicUnlimited'));
  else if (quota && !quota.unavailable) {
    let left = t('aicLeft', fmtAic(quota.remaining), fmtAic(quota.entitlement), fmtAic(quota.percentRemaining));
    if (quota.resetDate) left += prefs.lang === 'zh' ? `，${t('aicReset', quota.resetDate)}` : `, ${t('aicReset', quota.resetDate)}`;
    parts.push(left);
  } else if (quota?.unavailable) parts.push(t('aicUnknown'));
  $('aic-info').textContent = parts.join(' ・ ');
}

async function refreshQuota() {
  try { quota = await (await fetch('/api/quota')).json(); } catch { quota = { unavailable: true }; }
  renderAic();
}

function renderSidebar() {
  const ul = $('conversations');
  ul.innerHTML = '';
  for (const c of conversations) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = c.id === currentId ? 'active' : '';
    btn.disabled = !!controller;
    const proj = c.project ? ` · ${projectIcon(c.project)} ${c.project.name}` : '';
    btn.innerHTML = `${escapeHtml(c.untitled ? t('newTitle') : c.title)}<small>${escapeHtml(roleName(c.agent) + proj)}</small>`;
    btn.onclick = () => { currentId = c.id; render(); };
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function addMessageEl(m) {
  const div = document.createElement('div');
  div.className = `msg ${m.role}`;
  if (m.role === 'note') {
    div.textContent = m.agent === GROUP ? t('switchedGroup') : t('switched', roleName(m.agent));
  } else if (m.pass) {
    div.className = 'msg pass';
    div.textContent = t('passed', roleName(m.agent));
  } else {
    div.innerHTML = `<div class="who"></div><div class="body"></div>`;
    const who = div.querySelector('.who');
    who.textContent = m.role === 'user' ? `🙂 ${t('you')}` : roleName(m.agent) + (m.summary ? t('summaryTag') : '');
    if (m.summary) div.classList.add('summary');
    const body = div.querySelector('.body');
    if (m.role === 'user') body.textContent = m.text;
    else body.innerHTML = renderMarkdown(m.text);
    if (m.role === 'bot' && canSpeak && m.text) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('readAloud');
      btn.onclick = () => toggleSpeak(btn, m.text);
      who.appendChild(btn);
    }
  }
  $('messages').appendChild(div);
  $('messages').scrollTop = $('messages').scrollHeight;
  return div;
}

function render() {
  applyPrefs();
  renderRoles();
  renderProject();
  renderSidebar();
  const c = current();
  const box = $('messages');
  box.innerHTML = '';
  const busy = !!controller;
  $('send').hidden = busy;
  $('stop').hidden = !busy;
  $('input').disabled = busy;
  $('new-chat').disabled = busy;
  $('save-spec').disabled = busy || !(c && c.started);
  $('delete-chat').disabled = busy || !c;
  renderAic();
  if (!c || !c.messages.length) {
    box.innerHTML = `<div class="empty"><h2>${escapeHtml(t('emptyTitle'))}</h2><ol>${
      t('emptySteps').map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>`;
    return;
  }
  for (const m of c.messages) addMessageEl({ ...m, agent: m.agent || c.agent });
}

// ---------- Actions ----------
function newConversation() {
  const c = { id: crypto.randomUUID(), title: '', untitled: true, agent: prefs.agent, project: prefs.project || defaultProject, started: false, messages: [] };
  conversations.unshift(c);
  currentId = c.id;
  save();
  return c;
}

function switchRole(name) {
  prefs.agent = name;
  savePrefs();
  const c = current();
  if (c && c.agent !== name) {
    if (c.started) c.messages.push({ role: 'note', agent: name, text: '' });
    c.agent = name;
    save();
  }
  render();
  $('input').focus();
}

function groupMembers() {
  const names = agents.map((a) => a.name);
  return ROLE_ORDER.filter((n) => n !== GROUP && n !== MODERATOR && names.includes(n))
    .concat(names.filter((n) => !ROLES[n]));
}

// Streams one agent turn into `bot`. Returns false if the server rejected the request.
async function streamTurn(c, bot, payload, waitingText) {
  c.messages.push(bot);
  save();
  render();
  const body = $('messages').lastChild.querySelector('.body');
  const showWaiting = () => { body.innerHTML = `<span class="thinking">${escapeHtml(waitingText)}</span>`; };
  showWaiting();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, sessionId: c.id, firstTurn: !c.started, workdir: c.project?.path }),
    signal: controller.signal,
  });
  if (!res.ok) {
    bot.text = `⚠️ ${(await res.json().catch(() => ({}))).error || res.statusText}`;
    return false;
  }
  c.started = true;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    bot.text = raw.split(USAGE_MARK)[0];
    // Don't flash a partial "PASS" while a group member decides to skip.
    if (payload.group && 'PASS'.startsWith(bot.text.trim().toUpperCase())) showWaiting();
    else body.innerHTML = renderMarkdown(bot.text);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  const usageText = raw.split(USAGE_MARK)[1];
  if (usageText) {
    try {
      const { aic } = JSON.parse(usageText);
      bot.aic = aic;
      c.lastAic = (c.lastAic || 0) + aic;
      c.aic = (c.aic || 0) + aic;
      save();
      renderAic();
    } catch { /* ignore malformed usage */ }
  }
  return true;
}

async function runGroup(c, message) {
  const members = groupMembers();
  let first = true;
  let spoke = 0;
  for (let i = 0; i < members.length; i++) {
    const agent = members[i];
    const bot = { role: 'bot', agent, text: '' };
    const ok = await streamTurn(c, bot, {
      agent, previousAgent: c.lastAgent || null, message: first ? message : '',
      group: { step: 'speak', members, first },
    }, t('speaking', roleName(agent), i + 1, members.length));
    if (!ok) return;
    first = false;
    c.lastAgent = GROUP;
    if (PASS_RE.test(bot.text.trim())) { bot.pass = true; bot.text = ''; } else spoke++;
  }
  if (spoke > 1 && agents.some((a) => a.name === MODERATOR)) {
    const bot = { role: 'bot', agent: MODERATOR, summary: true, text: '' };
    await streamTurn(c, bot, { agent: MODERATOR, group: { step: 'summary', members } }, t('summarizing', roleName(MODERATOR)));
  }
}

async function send({ message, saveSpec }) {
  const c = current() || newConversation();
  const display = saveSpec ? t('saveMsg', saveSpec) : message;
  if (c.untitled) { c.title = display.slice(0, 30); c.untitled = false; }
  c.messages.push({ role: 'user', text: display });
  c.lastAic = 0;
  controller = new AbortController();
  try {
    if (c.agent === GROUP && !saveSpec) {
      await runGroup(c, message);
    } else {
      // In group mode the product owner writes the spec.
      const agent = c.agent === GROUP ? 'product-owner' : c.agent;
      const bot = { role: 'bot', agent, text: '' };
      if (await streamTurn(c, bot, { agent, previousAgent: c.lastAgent || null, message, saveSpec }, t('thinking'))) {
        c.lastAgent = agent;
      }
    }
  } catch (e) {
    const last = c.messages[c.messages.length - 1];
    const note = e.name === 'AbortError' ? t('stopped') : `⚠️ ${e.message}`;
    if (last && last.role === 'bot') last.text += `\n\n${note}`;
  } finally {
    controller = null;
    save();
    render();
    $('input').focus();
    refreshQuota();
  }
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const message = $('input').value.trim();
  if (!message || controller) return;
  $('input').value = '';
  send({ message });
});
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
});
$('stop').onclick = () => controller?.abort();
$('new-chat').onclick = () => { currentId = null; render(); $('input').focus(); };
$('delete-chat').onclick = async () => {
  const c = current();
  if (!c) return;
  const ok = await openDialog({ title: t('deleteTitle'), text: t('deleteText', c.untitled ? t('newTitle') : c.title) });
  if (!ok) return;
  conversations = conversations.filter((x) => x.id !== c.id);
  currentId = conversations[0]?.id || null;
  save();
  render();
};
$('save-spec').onclick = async () => {
  const fromTitle = (current()?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const d = new Date();
  const fallback = `feature-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let hint = t('saveHint');
  for (;;) {
    const slug = await openDialog({ title: t('saveTitle'), text: t('saveText'), input: fromTitle.length >= 3 ? fromTitle.slice(0, 40) : fallback, hint });
    if (!slug || slug === true) return;
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return send({ saveSpec: slug });
    hint = t('badSlug');
  }
};
$('font-down').onclick = () => { prefs.font = FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(prefs.font) - 1)]; savePrefs(); render(); };
$('font-up').onclick = () => { prefs.font = FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(prefs.font) + 1)]; savePrefs(); render(); };
$('theme-toggle').onclick = () => { prefs.dark = !prefs.dark; savePrefs(); render(); };
$('lang-toggle').onclick = () => { prefs.lang = prefs.lang === 'zh' ? 'en' : 'zh'; savePrefs(); render(); };

// ---------- Project picker ----------
let fsPath = '';
function projectStatus(text, isError = false) {
  $('project-status').textContent = text || '';
  $('project-status').classList.toggle('error', isError);
}

async function browse(p) {
  const res = await fetch(`/api/fs?path=${encodeURIComponent(p || '')}`);
  const data = await res.json();
  if (!res.ok) return projectStatus(`⚠️ ${data.error}`, true);
  projectStatus('');
  fsPath = data.path;
  $('project-path').value = data.path;
  const list = $('fs-list');
  list.innerHTML = '';
  const addBtn = (label, target) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => browse(target);
    list.appendChild(b);
  };
  if (data.parent) addBtn(t('projectUp'), data.parent);
  for (const d of data.dirs) addBtn(`📁 ${d.name}${d.isGit ? '  (Git)' : ''}`, `${data.path.replace(/\/$/, '')}/${d.name}`);
  if (!data.dirs.length) list.insertAdjacentHTML('beforeend', `<p class="muted">${escapeHtml(t('projectNoDirs'))}</p>`);
}

async function chooseProject(input, busyText) {
  projectStatus(busyText);
  $('project-dialog').querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
  try {
    const res = await fetch('/api/project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
    });
    const data = await res.json();
    if (!res.ok) return projectStatus(`⚠️ ${data.error}`, true);
    const project = { type: data.type, path: data.path, name: data.name, url: data.url };
    $('project-dialog').close();
    await applyProject(project);
  } catch (e) {
    projectStatus(`⚠️ ${e.message}`, true);
  } finally {
    $('project-dialog').querySelectorAll('button, input').forEach((el) => { el.disabled = false; });
  }
}

async function applyProject(project) {
  const c = current();
  if (c?.project?.path === project.path) return;
  if (c && c.started) {
    if (!await openDialog({ title: t('projectSwitchTitle'), text: t('projectSwitchText', project.name) })) return;
    currentId = null;
  } else if (c) {
    c.project = project;
    save();
  }
  prefs.project = project;
  prefs.recentProjects = [project, ...(prefs.recentProjects || []).filter((p) => p.path !== project.path)].slice(0, 6);
  savePrefs();
  render();
  $('input').focus();
}

function openProjectDialog() {
  const recent = (prefs.recentProjects || []);
  $('project-recent-section').hidden = !recent.length;
  $('project-recent').innerHTML = '';
  for (const p of recent) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${projectIcon(p)} ${p.name}`;
    b.title = p.url || p.path;
    b.onclick = () => chooseProject(p.path, t('projectLoading'));
    $('project-recent').appendChild(b);
  }
  $('project-github-hint').textContent = t('projectGithubHint', reposDir);
  $('project-url').value = '';
  projectStatus('');
  const p = activeProject();
  browse(p?.type === 'local' ? p.path : '');
  $('project-dialog').showModal();
}

$('project-btn').onclick = openProjectDialog;
$('project-close').onclick = () => $('project-dialog').close();
$('project-path-go').onclick = () => browse($('project-path').value.trim());
$('project-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('project-path-go').click(); } });
$('project-local-use').onclick = () => chooseProject($('project-path').value.trim() || fsPath, t('projectLoading'));
$('project-url-use').onclick = () => { const v = $('project-url').value.trim(); if (v) chooseProject(v, t('projectCloning')); };
$('project-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('project-url-use').click(); } });

// ---------- Beginner tour ----------
let tourIndex = -1;
let tourSteps = [];

function unionRect(selectors) {
  const rects = selectors.map((s) => document.querySelector(s)).filter((el) => el && el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect());
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top };
}

function placeTour() {
  const step = tourSteps[tourIndex];
  if (!step) return;
  const spot = $('tour-spot');
  const card = $('tour-card');
  const pad = 6;
  const r = step.target ? unionRect(step.target) : null;
  if (r) {
    spot.classList.remove('none');
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  } else {
    spot.classList.add('none');
    Object.assign(spot.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
  }
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = (vw - cw) / 2;
  let top = (vh - ch) / 2;
  if (r) {
    const gap = 16;
    if (r.top + r.height + pad + gap + ch <= vh) top = r.top + r.height + pad + gap; // below
    else if (r.top - pad - gap - ch >= 0) top = r.top - pad - gap - ch; // above
    else if (r.left + r.width + pad + gap + cw <= vw) { left = r.left + r.width + pad + gap; top = r.top; } // right
    else if (r.left - pad - gap - cw >= 0) { left = r.left - pad - gap - cw; top = r.top; } // left
    if (top === r.top + r.height + pad + gap || top === r.top - pad - gap - ch) left = r.left;
  }
  card.style.left = `${Math.max(8, Math.min(left, vw - cw - 8))}px`;
  card.style.top = `${Math.max(8, Math.min(top, vh - ch - 8))}px`;
}

function showTourStep(i) {
  tourIndex = i;
  const step = tourSteps[i];
  if (step.target) document.querySelector(step.target[0])?.scrollIntoView({ block: 'nearest' });
  $('tour-step').textContent = t('tourStep', i + 1, tourSteps.length);
  $('tour-title').textContent = step.title;
  $('tour-text').textContent = step.text;
  $('tour-prev').disabled = i === 0;
  $('tour-next').textContent = i === tourSteps.length - 1 ? t('tourDone') : t('tourNext');
  placeTour();
  $('tour-next').focus();
}

function startTour() {
  if (controller) return;
  render();
  // Skip steps whose element isn't on the page (e.g. no group button).
  tourSteps = t('tourSteps').filter((s) => !s.target || unionRect(s.target));
  $('tour').hidden = false;
  showTourStep(0);
}

function endTour() {
  $('tour').hidden = true;
  tourIndex = -1;
  prefs.tourSeen = true;
  savePrefs();
  $('input').focus();
}

$('tour-btn').onclick = startTour;
$('tour-skip').onclick = endTour;
$('tour-prev').onclick = () => tourIndex > 0 && showTourStep(tourIndex - 1);
$('tour-next').onclick = () => (tourIndex < tourSteps.length - 1 ? showTourStep(tourIndex + 1) : endTour());
window.addEventListener('resize', () => { if (tourIndex >= 0) placeTour(); });
document.addEventListener('keydown', (e) => {
  if (tourIndex < 0) return;
  if (e.key === 'Escape') endTour();
  else if (e.key === 'ArrowRight') $('tour-next').click();
  else if (e.key === 'ArrowLeft') $('tour-prev').click();
});

(async () => {
  if (!FONT_SIZES.includes(prefs.font)) prefs.font = DEFAULT_FONT;
  savePrefs();
  applyPrefs();
  const data = await (await fetch('/api/agents')).json();
  agents = data.agents.sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.name); const ib = ROLE_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  if (prefs.agent !== GROUP && !agents.some((a) => a.name === prefs.agent)) prefs.agent = agents[0]?.name || DEFAULT_AGENT;
  defaultProject = data.defaultProject;
  reposDir = data.reposDir;
  // Older stored conversations: assume their only agent was also the last one used,
  // and that they ran in the default project.
  for (const c of conversations) {
    if (!c.project && defaultProject) c.project = defaultProject;
    if (c.started && !c.lastAgent) c.lastAgent = c.agent;
    if (c.title === 'New conversation') c.untitled = true;
  }
  $('meta').textContent = `model: ${data.model}\nrepos: ${data.reposDir}`;
  render();
  refreshQuota();
  if (!prefs.tourSeen) startTour();
})();
