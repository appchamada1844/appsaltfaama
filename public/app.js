/* SALT-FAAMA — app oficial: eventos, chamada por QR Code, avisos, calendário e certificados */
(function () {
'use strict';

const SB_URL = 'https://nrsdoplyufeafugnlvqp.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yc2RvcGx5dWZlYWZ1Z25sdnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2OTQ3MzIsImV4cCI6MjEwODI3MDczMn0.Tz-XC4FrSUAFCdjYnAQ5qQXO9yJcU9kCCfAdka1igD8';
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const app = document.getElementById('app');
const S = { session: null, perfil: null, recovery: false, auth: 'welcome', deps: null, unread: 0, cal: null, calSel: null, chamada: { aulaId: null } };
const MAXSIG = 4;
const LOGO = { branco: 'img/salt-faama-branco.png', sigla: 'img/salt-faama-sigla-branco.png', marinho: 'img/salt-faama-marinho.png', siglaMarinho: 'img/salt-faama-sigla-marinho.png' };

/* ================= utilidades ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const SEM3 = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const br = s => s ? s.split('-').reverse().join('/') : '';
const brCurto = s => s ? s.split('-').slice(1).reverse().join('/') : '';
const extenso = s => { const d = parseD(s); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const periodo = t => t.inicio ? (t.fim ? `${brCurto(t.inicio)} a ${brCurto(t.fim)}` : `a partir de ${brCurto(t.inicio)}`) : '';
const semTxt = n => `${n}º semestre`;
const NSEM = 8;
const ehAluno = p => (p || S.perfil || {}).papel === 'aluno';
const idLinha = p => ehAluno(p) ? `RA ${esc(p.ra)} · ${semTxt(p.semestre)}` : PAPEL[p.papel];
const iniciais = nome => (nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const primeiroNome = nome => { const t = (nome || '').trim().split(/\s+/); return /\.$/.test(t[0] || '') && t[1] ? t[0] + ' ' + t[1] : (t[0] || ''); };
const nomeCurto = nome => { const t = (nome || '').trim().split(/\s+/); let i = /\.$/.test(t[0] || '') ? 2 : 1; const out = t.slice(0, i); if (t[i]) { out.push(t[i]); if (/^(d[aeo]s?|e)$/i.test(t[i]) && t[i + 1]) out.push(t[i + 1]); } return out.join(' '); };
const PAPEL = { admin: 'Administrador', secretario: 'Secretário(a)', professor: 'Professor(a)', monitor: 'Monitor(a)', aluno: 'Aluno(a)' };
const role = () => S.perfil ? S.perfil.papel : null;
const isAdmin = () => role() === 'admin';
const isGestao = () => ['admin', 'secretario'].includes(role());
const canChamada = () => ['admin', 'secretario', 'professor', 'monitor'].includes(role());
const canAviso = () => ['admin', 'secretario', 'professor'].includes(role());
function saudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia,' : h < 18 ? 'Boa tarde,' : 'Boa noite,'; }
function quando(ts) {
  const d = new Date(ts), now = new Date();
  const dia = iso(d), hj = hoje();
  if (dia === hj) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const diff = (parseD(hj) - parseD(dia)) / 864e5;
  if (diff === 1) return 'ontem';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function grupoData(ts) {
  const dia = iso(new Date(ts)), diff = (parseD(hoje()) - parseD(dia)) / 864e5;
  if (diff <= 0) return 'Hoje'; if (diff < 7) return 'Esta semana'; return 'Anteriores';
}
let tt; function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3200); }
function traduz(m) {
  const map = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.'],
    [/User already registered/i, 'Este e-mail já tem cadastro. Use "Já tenho cadastro".'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/rate limit|over_email_send_rate_limit/i, 'Muitas tentativas seguidas. Aguarde alguns minutos.'],
    [/Database error saving new user/i, 'Não foi possível concluir o cadastro. Confira se o RA já não está em uso.'],
    [/row-level security|violates row-level/i, 'Você não tem permissão para fazer isso.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sem conexão com a internet.'],
  ];
  for (const [re, t] of map) if (re.test(m)) return t;
  return m;
}
const erro = e => traduz((e && (e.message || e.error_description)) || 'Algo deu errado. Tente de novo.');
function baixar(blob, nome) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 8000); }
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(); const m = 2; let d = '';
  for (let r = 0; r < n; r++) { let c = 0; while (c < n) { if (q.isDark(r, c)) { const s = c; while (c < n && q.isDark(r, c)) c++; d += `M${s + m} ${r + m}h${c - s}v1h-${c - s}z`; } else c++; } }
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0B2443"/></svg>`;
}
const qrPayload = p => 'SALT:' + p.qr_token;
async function q(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }

/* ================= ícones ================= */
const G = '#C49C49';
const ic = {
  home: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3.8 10.3 12 4l8.2 6.3V19a1.5 1.5 0 0 1-1.5 1.5H5.3A1.5 1.5 0 0 1 3.8 19z"/>${a ? `<rect x="9.7" y="13.6" width="4.6" height="6.9" rx="1.3" fill="${G}" stroke="none"/>` : '<path d="M9.7 20.5v-5.6a1.3 1.3 0 0 1 1.3-1.3h2a1.3 1.3 0 0 1 1.3 1.3v5.6"/>'}</svg>`,
  book: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17.5V6.5a2 2 0 0 1 2-2h11.5v13H7a2 2 0 0 0-2 2 2 2 0 0 0 2 2h11.5"/><path d="M13.5 4.5v6l1.8-1.3 1.8 1.3v-6${a ? 'z' : ''}" ${a ? `fill="${G}" stroke="none"` : ''}/></svg>`,
  cal: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.8" y="5.2" width="16.4" height="15" rx="3"/><path d="M3.8 9.8h16.4M8.2 3.5v3.4M15.8 3.5v3.4"/><rect x="13.4" y="13.2" width="3.6" height="3.6" rx=".9" ${a ? `fill="${G}" stroke="none"` : ''}/></svg>`,
  bell: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 2H4.6z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" ${a ? `stroke="${G}" stroke-width="2"` : ''}/></svg>`,
  user: () => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c1-3.3 3.8-5.1 7-5.1s6 1.8 7 5.1"/></svg>`,
  scan: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/><path d="M7.5 12h9" ${a !== false ? `stroke="${G}" stroke-width="2.2"` : ''}/></svg>`,
  grid: a => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2" ${a ? `fill="${G}" stroke="none"` : ''}/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>`,
  back: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
  close: () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`,
  chev: () => `<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>`,
  clock: (c = 'currentColor') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  calSm: (c = 'currentColor') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.8" y="5.2" width="16.4" height="15" rx="3"/><path d="M3.8 9.8h16.4M8.2 3.5v3.4M15.8 3.5v3.4"/></svg>`,
  pin: (c = 'currentColor') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-6.3-5.4-6.3-10.6a6.3 6.3 0 0 1 12.6 0c0 5.2-6.3 10.6-6.3 10.6z"/><circle cx="12" cy="9.9" r="2.2"/></svg>`,
  users: (c = 'currentColor') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.3"/><path d="M3 19c.8-3.2 3.1-5 6-5s5.2 1.8 6 5M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.8 14.3c1.6.7 2.7 2.3 3.2 4.7"/></svg>`,
  dept: (c = 'currentColor') => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20.5h16M5.5 20.5V9.5M18.5 20.5V9.5M9.5 20.5v-6h5v6M3.5 9.5 12 4l8.5 5.5z"/></svg>`,
  mega: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.8 10v4a1 1 0 0 0 1 1h2.2l5 4V5l-5 4H4.8a1 1 0 0 0-1 1z"/><path d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>`,
  seal: () => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9.4" r="5.6"/><circle cx="12" cy="9.4" r="2.4" fill="${G}" stroke="none"/><path d="m8.4 13.8-1.5 6.7 5.1-2.8 5.1 2.8-1.5-6.7"/></svg>`,
  check: (s = 16, w = 2.4) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 12.5 4 4 9-9"/></svg>`,
  x: (s = 12, w = 3) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`,
  search: () => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.8"/><path d="m20 20-3.9-3.9"/></svg>`,
  plus: () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  edit: () => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>`,
  trash: () => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.5h9.2L17.5 7"/></svg>`,
  list: () => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.2" fill="${G}" stroke="none"/><circle cx="4.8" cy="12" r="1.2" fill="${G}" stroke="none"/><circle cx="4.8" cy="17.5" r="1.2" fill="${G}" stroke="none"/></svg>`,
  sun: () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E0BF73" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>`,
  expand: () => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4H20v5.5M20 4l-6.5 6.5M9.5 20H4v-5.5M4 20l6.5-6.5"/></svg>`,
  send: () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3.5 10.5 14M21 3.5l-6.5 17-4-6.5-6.5-4z"/></svg>`,
  undo: () => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7.5 4.5 12 9 16.5"/><path d="M5 12h9.5a5 5 0 0 1 0 10H12"/></svg>`,
  shield: () => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  mail: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.6"/><path d="m4.6 7.2 7.4 5.4 7.4-5.4"/></svg>`,
  lock: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.6"/><path d="M8 10.5V7.9a4 4 0 0 1 8 0v2.6"/></svg>`,
  cap: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 9.4 12 5l9.2 4.4L12 13.8z"/><path d="M6.6 11.4v4.2c1.4 1.3 3.2 2 5.4 2s4-.7 5.4-2v-4.2"/></svg>`,
  idc: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.6"/><circle cx="8.6" cy="10.8" r="1.9"/><path d="M5.9 15.4c.5-1.2 1.5-1.9 2.7-1.9s2.2.7 2.7 1.9M14 10h4M14 13.4h2.8"/></svg>`,
  person: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c1-3.3 3.8-5.1 7-5.1s6 1.8 7 5.1"/></svg>`,
  arrow: () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/></svg>`,
  hourglass: () => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.2 4 5.3 4 8.5s-4 4.3-4 8.5M16 3.5c0 4.2-4 5.3-4 8.5s4 4.3 4 8.5"/></svg>`,
};
const MOTIF = `<svg class="motif" viewBox="0 0 300 130" fill="none" aria-hidden="true"><path d="M0 120C100 100 200 64 300 0" stroke="#E0BF73" stroke-opacity=".2" stroke-width="1.3"/><path d="M0 136C106 114 208 76 300 14" stroke="#E0BF73" stroke-opacity=".12" stroke-width="1.3"/></svg>`;
const CARD_MOTIF = `<svg class="motif" viewBox="0 0 260 90" fill="none" aria-hidden="true"><path d="M0 80C80 66 170 38 260 -6" stroke="#E0BF73" stroke-opacity=".36" stroke-width="1.2"/><path d="M0 92C86 76 176 48 260 6" stroke="#E0BF73" stroke-opacity=".22" stroke-width="1.2"/><path d="M0 104C92 86 182 58 260 18" stroke="#E0BF73" stroke-opacity=".12" stroke-width="1.2"/></svg>`;
function ring(pct, size = 54, w = 5, label) {
  const r = (size - w) / 2 - 1, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct)) / 100 * c, id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A5E94"/><stop offset="1" stop-color="#0B2443"/></linearGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EBEFF4" stroke-width="${w}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${v} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="ring-label" style="font-size:${size > 80 ? 27 : 13.5}px">${label ?? pct + '%'}</div></div>`;
}
function dateTile(s, kind = '') { if (!s) return `<div class="date-tile ${kind}"><b>—</b></div>`; const d = parseD(s); return `<div class="date-tile ${kind}"><b>${String(d.getDate()).padStart(2, '0')}</b><small>${MES3[d.getMonth()]}</small></div>`; }

/* ================= roteamento e moldura ================= */
function rota() { const h = location.hash.replace(/^#\/?/, ''); const [r, id] = h.split('/'); return { r: r || 'inicio', id }; }
function ir(h) { if (location.hash === '#' + h) render(); else location.hash = h; }
window.addEventListener('hashchange', () => { pararCamera(); render(); window.scrollTo(0, 0); });
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); ir(g.dataset.go); } });

function tabs() {
  const p = role();
  if (p === 'aluno') return ['inicio', 'eventos', 'calendario', 'avisos', 'conta'];
  if (p === 'monitor') return ['inicio', 'eventos', 'chamada', 'avisos', 'conta'];
  if (p === 'professor') return ['inicio', 'chamada', 'avisos', 'conta'];
  return ['inicio', 'gestao', 'calendario', 'avisos', 'conta'];
}
const TAB = { inicio: ['Início', ic.home], eventos: ['Eventos', ic.book], calendario: ['Calendário', ic.cal], avisos: ['Avisos', ic.bell], conta: ['Conta', ic.user], chamada: ['Chamada', ic.scan], gestao: ['Gestão', ic.grid] };
function nav(atual) {
  return `<nav class="nav" aria-label="Navegação principal">${tabs().map(k => { const [l, f] = TAB[k]; const on = k === atual; const b = k === 'avisos' && S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : '';
    return `<a href="#${k}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}><span class="ic">${f(on)}${b}</span>${l}</a>`; }).join('')}</nav>`;
}
function screen(inner, tab, opts = {}) { return `<div class="screen ${opts.light ? 'light' : ''} ${opts.noNav ? 'no-nav' : ''}">${inner}</div>${opts.noNav ? '' : nav(tab)}`; }
function hero({ eyebrow, title, sub, back, right = '', ov = '', meta = '', extra = '', logo = false }) {
  return `<header class="hero ${ov}">${MOTIF}
    <div class="hero-top">${back ? `<a class="glass-btn" href="#${back}" aria-label="Voltar">${ic.back()}</a>` : logo ? `<img class="logo" src="${LOGO.sigla}" alt="SALT-FAAMA">` : '<span></span>'}${right}</div>
    ${title ? `<div class="hero-title">${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h1>${esc(title)}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}${meta ? `<div class="meta">${meta}</div>` : ''}</div>` : ''}${extra}</header>`;
}
function topbar(back, center = '', right = '<span style="width:44px"></span>') { return `<div class="topbar"><a class="light-btn" href="#${back}" aria-label="Voltar">${ic.back()}</a>${center}${right}</div>`; }
function loading(tab) { app.innerHTML = screen(`<div class="loading">Carregando…</div>`, tab); }
function falha(e, tab) { console.error(e); app.innerHTML = screen(`<div class="content pad"><div class="banner err">${esc(erro(e))}</div><button class="btn btn-outline" onclick="location.reload()">Tentar de novo</button></div>`, tab); }

/* ================= inicialização ================= */
async function carregarPerfil() {
  if (!S.session) { S.perfil = null; return; }
  const { data } = await sb.from('perfis').select('*').eq('id', S.session.user.id).maybeSingle();
  S.perfil = data || null;
}
async function deps() { if (!S.deps) S.deps = await q(sb.from('departamentos').select('*').eq('ativo', true).order('nome')); return S.deps; }
async function contarNaoLidos() {
  try {
    const [av, li] = await Promise.all([q(sb.from('avisos').select('id,publicar_em').lte('publicar_em', new Date().toISOString()).order('publicar_em', { ascending: false }).limit(100)), q(sb.from('aviso_leituras').select('aviso_id'))]);
    const lidos = new Set(li.map(x => x.aviso_id)); S.unread = av.filter(a => !lidos.has(a.id)).length;
  } catch (e) { S.unread = 0; }
}
const ROTAS = {
  inicio: pgInicio, eventos: pgEventos, evento: pgEvento, avisos: pgAvisos, aviso: pgAviso, 'novo-aviso': pgNovoAviso,
  calendario: pgCalendario, chamada: pgChamada, gestao: pgGestao, gevento: pgGEvento, 'form-evento': pgFormEvento,
  pessoas: pgPessoas, pessoa: pgPessoa, departamentos: pgDepartamentos, conta: pgConta,
};
async function render() {
  if (S.recovery) return pgNovaSenha();
  if (!S.session) return pgAuth();
  if (!S.perfil) { await carregarPerfil(); if (!S.perfil) return pgSemPerfil(); await contarNaoLidos(); }
  const { r, id } = rota();
  const fn = ROTAS[r] || pgInicio;
  try { await fn(id); } catch (e) { falha(e, r); }
}
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') S.recovery = true;
  const mudou = (S.session && S.session.user.id) !== (session && session.user.id);
  S.session = session;
  if (mudou) { S.perfil = null; S.deps = null; setTimeout(render, 0); }
});
(async () => { const { data } = await sb.auth.getSession(); S.session = data.session; render(); })();

/* ================= instalar ================= */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; document.querySelectorAll('.instalar').forEach(el => el.hidden = false); });
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function instalarHtml(dark) {
  if (standalone()) return '';
  if (isIOS()) return `<div class="${dark ? 'banner' : 'card'}" style="${dark ? 'background:rgba(255,255,255,.08);color:#D5DFEA' : ''}"><b>Instale no iPhone:</b> toque em Compartilhar (quadrado com seta) e depois em "Adicionar à Tela de Início".</div>`;
  return `<div class="card instalar" ${promptInstalar ? '' : 'hidden'}><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b>Instale o app</b><br><span style="font-size:12.5px;color:var(--muted)">Acesse sua credencial direto da tela inicial.</span></div><button class="btn btn-navy btn-sm" type="button" data-instalar>Instalar</button></div></div>`;
}
function ligarInstalar() { app.querySelectorAll('[data-instalar]').forEach(b => b.onclick = async () => { if (!promptInstalar) return; promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; app.querySelectorAll('.instalar').forEach(el => el.hidden = true); }); }

/* ================= autenticação ================= */
function pgAuth() {
  const m = S.auth;
  if (m === 'welcome') {
    app.innerHTML = `<div class="welcome">
      <svg style="position:absolute;left:-40px;bottom:120px;width:470px;height:260px" viewBox="0 0 470 260" fill="none" aria-hidden="true"><path d="M0 230C120 200 250 140 470 20" stroke="#C9A24E" stroke-opacity=".32" stroke-width="1.4"/><path d="M0 250C130 218 265 156 470 44" stroke="#C9A24E" stroke-opacity=".22" stroke-width="1.4"/><path d="M0 270C140 236 280 172 470 68" stroke="#C9A24E" stroke-opacity=".14" stroke-width="1.4"/></svg>
      <div class="welcome-inner">
        <img class="logo" src="${LOGO.branco}" alt="SALT-FAAMA · Seminário em Missão">
        <div class="stage"><div class="mini-cred"><div class="back"></div><div class="front">${CARD_MOTIF}<div class="l"><img src="${LOGO.sigla}" alt=""><div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:9px;font-weight:800;letter-spacing:.18em;color:#E0BF73">CREDENCIAL</span><span style="font-size:15px;font-weight:700">Seu nome aqui</span><span style="font-size:11px;color:#B7C6D8">RA 000000 · 1º semestre</span></div></div><div class="qr">${qrSvg('SALT-FAAMA')}</div></div></div></div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:26px"><h1>Cada aula conta.</h1><p>Cadastre-se para receber sua credencial digital. Com ela, sua presença é registrada em segundos e seus certificados ficam sempre à mão.</p></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <button class="btn btn-gold btn-block" data-mode="cadastro">Criar cadastro ${ic.arrow()}</button>
          <button class="btn btn-glass btn-block" data-mode="entrar">Já tenho cadastro</button>
          ${instalarHtml(true)}
        </div>
      </div></div>`;
    app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.auth = b.dataset.mode; pgAuth(); });
    ligarInstalar(); return;
  }
  const sem = Array.from({ length: NSEM }, (_, i) => `<option value="${i + 1}">${semTxt(i + 1)}</option>`).join('');
  const titulos = { cadastro: ['Crie seu cadastro', 'Leva menos de um minuto. Ao concluir, sua credencial com QR Code fica pronta.'], entrar: ['Entrar', 'Use o e-mail e a senha do seu cadastro.'], esqueci: ['Recuperar senha', 'Enviaremos um link para você criar uma nova senha.'] };
  const [t, s] = titulos[m];
  app.innerHTML = `<div class="screen light no-nav"><div class="auth">
    <div class="topbar"><button class="light-btn" data-mode="${m === 'esqueci' ? 'entrar' : 'welcome'}" aria-label="Voltar">${ic.back()}</button><img src="${LOGO.siglaMarinho}" alt="SALT-FAAMA" style="width:118px"><span style="width:44px"></span></div>
    <div style="padding:30px 24px 0;display:flex;flex-direction:column;gap:8px"><h1 style="font-size:28px;font-weight:800;line-height:1.12;color:var(--navy-800)">${t}</h1><p style="font-size:14.5px;color:#5F6C7B">${s}</p></div>
    <div id="msg" style="padding:16px 24px 0"></div>
    ${m === 'cadastro' ? `<form class="form" id="f" style="padding:10px 24px 0" novalidate>
      <label class="field">Nome completo<span class="input-wrap">${ic.person()}<input id="nome" autocomplete="name" required minlength="3"></span><span class="hint">Será impresso nos certificados exatamente assim.</span></label>
      <label class="field">E-mail<span class="input-wrap">${ic.mail()}<input id="email" type="email" autocomplete="email" required></span></label>
      <div class="grid2"><label class="field">Semestre<span class="input-wrap">${ic.cap()}<select id="sem" required><option value="">Selecione</option>${sem}</select></span></label>
      <label class="field">RA<span class="input-wrap">${ic.idc()}<input id="ra" inputmode="numeric" maxlength="6" placeholder="000000" required style="letter-spacing:.06em"></span></label></div>
      <label class="field">Senha<span class="input-wrap">${ic.lock()}<input id="senha" type="password" autocomplete="new-password" minlength="6" required></span><span class="strength" id="forca"><span></span><span></span><span></span><span></span></span><span class="hint">Mínimo de 6 caracteres.</span></label>
      <label class="field">Repita a senha<span class="input-wrap">${ic.lock()}<input id="senha2" type="password" autocomplete="new-password" required></span></label>
      <button class="btn btn-navy btn-block" type="submit" style="margin-top:8px">Concluir cadastro ${ic.arrow()}</button>
      <p style="text-align:center;font-size:13.5px;color:#5F6C7B;padding-bottom:30px">Já tem cadastro? <button type="button" class="link-gold" data-mode="entrar" style="color:var(--navy-800)">Entrar</button></p>
    </form>` : ''}
    ${m === 'entrar' ? `<form class="form" id="f" style="padding:10px 24px 0" novalidate>
      <label class="field">E-mail<span class="input-wrap">${ic.mail()}<input id="email" type="email" autocomplete="email" required></span></label>
      <label class="field">Senha<span class="input-wrap">${ic.lock()}<input id="senha" type="password" autocomplete="current-password" required></span></label>
      <button class="btn btn-navy btn-block" type="submit" style="margin-top:8px">Entrar ${ic.arrow()}</button>
      <button type="button" class="link-gold" data-mode="esqueci" style="align-self:center;padding:8px">Esqueci minha senha</button>
      <p style="text-align:center;font-size:13.5px;color:#5F6C7B">Ainda não tem cadastro? <button type="button" class="link-gold" data-mode="cadastro" style="color:var(--navy-800)">Criar cadastro</button></p>
    </form>` : ''}
    ${m === 'esqueci' ? `<form class="form" id="f" style="padding:10px 24px 0" novalidate>
      <label class="field">E-mail<span class="input-wrap">${ic.mail()}<input id="email" type="email" autocomplete="email" required></span></label>
      <button class="btn btn-navy btn-block" type="submit">Enviar link</button>
    </form>` : ''}
  </div></div>`;
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.auth = b.dataset.mode; pgAuth(); });
  const f = document.getElementById('f'), msg = (t, cls = '') => { document.getElementById('msg').innerHTML = t ? `<div class="banner ${cls}">${t}</div>` : ''; };
  const val = id => (document.getElementById(id) || {}).value || '';
  if (m === 'cadastro') {
    const ra = document.getElementById('ra'); ra.oninput = () => { ra.value = ra.value.replace(/\D/g, '').slice(0, 6); };
    const sn = document.getElementById('senha'); sn.oninput = () => { const v = sn.value; let n = 0; if (v.length >= 6) n++; if (v.length >= 10) n++; if (/\d/.test(v) && /[a-zA-Z]/.test(v)) n++; if (/[^a-zA-Z0-9]/.test(v)) n++; document.querySelectorAll('#forca span').forEach((s, i) => s.classList.toggle('on', i < n)); };
  }
  f.onsubmit = async e => {
    e.preventDefault(); msg(''); const b = f.querySelector('[type=submit]');
    if (m === 'entrar') {
      b.disabled = true; const { error } = await sb.auth.signInWithPassword({ email: val('email').trim(), password: val('senha') }); b.disabled = false;
      if (error) msg(esc(erro(error)), 'err'); return;
    }
    if (m === 'esqueci') {
      b.disabled = true; const { error } = await sb.auth.resetPasswordForEmail(val('email').trim(), { redirectTo: location.origin + location.pathname }); b.disabled = false;
      msg(error ? esc(erro(error)) : 'Se o e-mail estiver cadastrado, o link chegará em instantes.', error ? 'err' : 'ok'); return;
    }
    const nome = val('nome').trim().replace(/\s+/g, ' '), email = val('email').trim().toLowerCase(), ra = val('ra'), semestre = Number(val('sem'));
    if (nome.length < 3) return msg('Informe seu nome completo.', 'err');
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Informe um e-mail válido.', 'err');
    if (!semestre) return msg('Selecione o seu semestre.', 'err');
    if (!/^\d{6}$/.test(ra)) return msg('O RA precisa ter exatamente 6 dígitos.', 'err');
    if (val('senha').length < 6) return msg('A senha precisa ter pelo menos 6 caracteres.', 'err');
    if (val('senha') !== val('senha2')) return msg('As senhas não são iguais.', 'err');
    b.disabled = true;
    const disp = await sb.rpc('ra_disponivel', { p_ra: ra });
    if (disp.error) { b.disabled = false; return msg(esc(erro(disp.error)), 'err'); }
    if (disp.data === false) { b.disabled = false; return msg('Este RA já está cadastrado. Se for você, use "Entrar".', 'err'); }
    const { data, error } = await sb.auth.signUp({ email, password: val('senha'), options: { data: { nome, ra, semestre }, emailRedirectTo: location.origin + location.pathname } });
    b.disabled = false;
    if (error) return msg(esc(erro(error)), 'err');
    if (!data.session) { S.auth = 'entrar'; pgAuth(); document.getElementById('msg').innerHTML = `<div class="banner ok">Cadastro criado. Enviamos um e-mail para <b>${esc(email)}</b>. Confirme e depois entre com sua senha.</div>`; }
  };
}
function pgNovaSenha() {
  app.innerHTML = `<div class="screen light no-nav"><div class="auth"><div style="padding:60px 24px 0;display:flex;flex-direction:column;gap:16px">
    <img src="${LOGO.siglaMarinho}" alt="SALT-FAAMA" style="width:118px"><h1 style="font-size:28px;font-weight:800;color:var(--navy-800)">Nova senha</h1><div id="msg"></div>
    <form class="form" id="f"><label class="field">Nova senha<span class="input-wrap">${ic.lock()}<input id="s" type="password" minlength="6" autocomplete="new-password" required></span></label><button class="btn btn-navy btn-block">Salvar nova senha</button></form></div></div></div>`;
  document.getElementById('f').onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: document.getElementById('s').value });
    if (error) return document.getElementById('msg').innerHTML = `<div class="banner err">${esc(erro(error))}</div>`;
    S.recovery = false; history.replaceState(null, '', location.pathname); toast('Senha alterada.'); render(); };
}
function pgSemPerfil() {
  app.innerHTML = `<div class="screen light no-nav"><div class="content pad" style="padding-top:80px"><div class="banner err">Não encontramos o seu cadastro. Saia e tente novamente, ou fale com a secretaria.</div><button class="btn btn-outline" id="sair">Sair</button></div></div>`;
  document.getElementById('sair').onclick = () => sb.auth.signOut();
}

/* ================= QR em tela cheia ================= */
let wakeLock = null;
async function abrirQR() {
  const p = S.perfil; const el = document.createElement('div'); el.className = 'qr-full';
  el.innerHTML = `<div class="top"><img src="${LOGO.sigla}" alt="SALT-FAAMA"><button class="glass-btn round" aria-label="Fechar">${ic.close()}</button></div>
    <div class="badge-card"><div class="head"><span class="eyebrow">Credencial</span><span class="status ok" style="font-size:11px">Ativa</span></div>
      <div class="qr">${qrSvg(qrPayload(p))}</div><div class="sep"></div>
      <div class="who"><b>${esc(p.nome)}</b><small>${idLinha(p)}</small></div>
      <div class="foot"><img src="${LOGO.sigla}" alt=""></div></div>
    <div class="qr-hint"><span style="display:inline-flex;align-items:center;gap:8px">${ic.sun()} Aumente o brilho se a leitura falhar</span><small>Código pessoal e intransferível</small></div>`;
  document.body.appendChild(el);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { wakeLock = null; }
  el.querySelector('button').onclick = () => { el.remove(); try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; };
}

/* ================= frequência ================= */
function freq(aulas, pres) { const n = aulas.length; const p = aulas.filter(a => pres.has(a.id)).length; return { p, n, pct: n ? Math.round(100 * p / n) : 0 }; }
const minFreq = t => t.frequencia_minima || 75;
const encerrado = t => t.fim && t.fim < hoje();
const apto = (t, f) => f.n > 0 && f.pct >= minFreq(t) && (!t.fim || t.fim <= hoje());

/* ================= INÍCIO ================= */
async function pgInicio() {
  loading('inicio');
  const uid = S.perfil.id;
  const [turmas, mats, pres, avisos, lidos] = await Promise.all([
    q(sb.from('turmas').select('*').order('inicio', { ascending: true, nullsFirst: false })),
    q(sb.from('matriculas').select('*').eq('aluno_id', uid)),
    q(sb.from('presencas').select('aula_id').eq('aluno_id', uid)),
    q(sb.from('avisos').select('id,titulo,departamento_nome,publicar_em').lte('publicar_em', new Date().toISOString()).order('publicar_em', { ascending: false }).limit(30)),
    q(sb.from('aviso_leituras').select('aviso_id')),
  ]);
  const lidoSet = new Set(lidos.map(x => x.aviso_id)); S.unread = avisos.filter(a => !lidoSet.has(a.id)).length;
  const presSet = new Set(pres.map(x => x.aula_id));
  const ids = mats.map(m => m.turma_id);
  const aulas = ids.length ? await q(sb.from('aulas').select('id,turma_id').in('turma_id', ids)) : [];
  const matDe = id => mats.find(m => m.turma_id === id);
  const meus = turmas.filter(t => matDe(t.id) && !(encerrado(t) && matDe(t.id).status !== 'ativa'));
  const abertos = turmas.filter(t => !matDe(t.id) && t.inscricoes_abertas && !encerrado(t));
  const aviso = avisos.find(a => !lidoSet.has(a.id));
  const p = S.perfil;
  const tb = tabs();
  const short = [];
  if (canChamada()) short.push(`<a class="shortcut" href="#chamada"><span class="icon-tile">${ic.scan()}</span>Fazer chamada</a>`);
  if (canAviso()) short.push(`<a class="shortcut" href="#novo-aviso"><span class="icon-tile gold">${ic.mega(20)}</span>Novo aviso</a>`);
  if (isGestao()) short.push(`<a class="shortcut" href="#gestao"><span class="icon-tile">${ic.grid(true)}</span>Gestão</a>`);

  const meuCard = t => {
    const m = matDe(t.id);
    if (m.status !== 'ativa') return `<a class="row-card" href="#evento/${t.id}"><span class="icon-tile gold" style="width:54px;height:54px;border-radius:16px">${ic.hourglass()}</span><div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${t.carga_horaria} h · ${periodo(t)}</span><span class="status ${m.status === 'pendente' ? 'gold' : 'bad'}">${m.status === 'pendente' ? 'Aguardando aprovação' : 'Inscrição recusada'}</span></div>${ic.chev()}</a>`;
    const f = freq(aulas.filter(a => a.turma_id === t.id), presSet); const ok = f.pct >= minFreq(t);
    return `<a class="row-card" href="#evento/${t.id}">${ring(f.pct)}<div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${t.carga_horaria} h · ${f.n ? `${f.p} de ${f.n} aulas` : 'nenhuma aula ainda'}</span>${f.n ? `<span class="status ${ok ? 'ok' : 'bad'}">${ok ? `Acima do mínimo de ${minFreq(t)}%` : `Abaixo do mínimo de ${minFreq(t)}%`}</span>` : `<span class="status muted">Começa ${t.inicio ? 'em ' + brCurto(t.inicio) : 'em breve'}</span>`}</div>${ic.chev()}</a>`;
  };
  app.innerHTML = screen(`
    ${hero({ logo: true, ov: 'ov-xl', right: `<div style="display:flex;gap:10px"><a class="glass-btn round" href="#avisos" aria-label="Avisos">${ic.bell(true)}${S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : ''}</a><a class="avatar-btn" href="#conta" aria-label="Minha conta"><span>${esc(iniciais(p.nome))}</span></a></div>`,
      extra: `<div class="hero-title"><span class="sub">${saudacao()}</span><h1>${esc(nomeCurto(p.nome))}</h1><span class="role-chip" style="align-self:flex-start;margin-top:6px">${role() === 'aluno' ? ic.cap() : ic.shield()} ${PAPEL[role()]}</span></div>` })}
    <div class="content ov-xl">
      <button class="credential" id="cred">${CARD_MOTIF}
        <div class="info"><div style="display:flex;flex-direction:column;gap:6px"><span class="label">${ic.scan()} MEU QR CODE</span><span class="name">${esc(p.nome)}</span><span class="ra">${idLinha(p)}</span></div>
        <span class="cta">${ic.expand()} Ampliar QR Code</span></div>
        <div class="qr-tile">${qrSvg(qrPayload(p))}</div></button>
      ${aviso ? `<a class="row-card unread" href="#aviso/${aviso.id}" style="margin-top:-8px"><span class="icon-tile gold">${ic.mega()}</span><div class="row-main"><span class="status gold" style="font-size:10.5px;letter-spacing:.12em">NOVO AVISO · ${esc(quando(aviso.publicar_em)).toUpperCase()}</span><span class="row-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(aviso.titulo)}</span></div>${ic.chev()}</a>` : ''}
      ${short.length ? `<div class="shortcuts">${short.join('')}</div>` : ''}
      ${meus.length ? `<section class="section"><div class="section-head"><h2>Meus eventos</h2>${tb.includes('eventos') ? '<a href="#eventos">Ver todos</a>' : ''}</div>${meus.slice(0, 4).map(meuCard).join('')}</section>` : ''}
      <section class="section"><div class="section-head"><h2>Inscrições abertas</h2>${tb.includes('eventos') && abertos.length > 3 ? '<a href="#eventos">Ver todas</a>' : ''}</div>
        ${abertos.length ? abertos.slice(0, 3).map(t => `<a class="row-card" href="#evento/${t.id}">${dateTile(t.inicio)}<div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${t.carga_horaria} h · ${t.requer_aprovacao ? 'Com aprovação' : 'Inscrição imediata'}</span></div>${ic.chev()}</a>`).join('') : `<div class="card empty">Nenhum evento com inscrições abertas no momento.</div>`}
      </section>
      ${instalarHtml()}
    </div>`, 'inicio');
  document.getElementById('cred').onclick = abrirQR; ligarInstalar();
}

/* ================= EVENTOS (aluno) ================= */
async function pgEventos() {
  loading('eventos');
  const uid = S.perfil.id;
  const [turmas, mats] = await Promise.all([q(sb.from('turmas').select('*').order('inicio', { ascending: true, nullsFirst: false })), q(sb.from('matriculas').select('*').eq('aluno_id', uid))]);
  const dl = await deps(); const dn = id => (dl.find(d => d.id === id) || {}).nome || '';
  const matDe = id => mats.find(m => m.turma_id === id);
  const aba = S.abaEv || 'meus';
  const meus = turmas.filter(t => matDe(t.id)), abertos = turmas.filter(t => !matDe(t.id) && t.inscricoes_abertas && !encerrado(t));
  const lista = aba === 'meus' ? meus : abertos;
  app.innerHTML = screen(`${hero({ eyebrow: 'SALT-FAAMA', title: 'Eventos', sub: 'Cursos, encontros e programações dos departamentos.', extra: `<div class="seg" style="background:rgba(255,255,255,.1);position:relative"><button class="${aba === 'meus' ? 'on' : ''}" data-aba="meus" style="${aba !== 'meus' ? 'color:#fff' : ''}">Meus eventos · ${meus.length}</button><button class="${aba === 'abertos' ? 'on' : ''}" data-aba="abertos" style="${aba !== 'abertos' ? 'color:#fff' : ''}">Inscrições abertas · ${abertos.length}</button></div>` })}
    <div class="content pad">${lista.length ? `<div class="section">${lista.map(t => { const m = matDe(t.id);
      const st = m ? (m.status === 'ativa' ? (encerrado(t) ? '<span class="status muted">Encerrado</span>' : '<span class="status ok">Inscrito</span>') : m.status === 'pendente' ? '<span class="status gold">Aguardando aprovação</span>' : '<span class="status bad">Recusada</span>') : `<span class="status ${t.requer_aprovacao ? 'gold' : 'ok'}">${t.requer_aprovacao ? 'Com aprovação' : 'Inscrição imediata'}</span>`;
      return `<a class="row-card" href="#evento/${t.id}">${dateTile(t.inicio, m ? '' : 'soft')}<div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${[t.carga_horaria + ' h', dn(t.departamento_id)].filter(Boolean).join(' · ')}</span>${st}</div>${ic.chev()}</a>`; }).join('')}</div>`
      : `<div class="card empty">${aba === 'meus' ? 'Você ainda não está inscrito em nenhum evento. Veja as inscrições abertas.' : 'Nenhum evento com inscrições abertas no momento.'}</div>`}</div>`, 'eventos');
  app.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { S.abaEv = b.dataset.aba; pgEventos(); });
}

async function pgEvento(id) {
  loading('eventos');
  const uid = S.perfil.id;
  const t = await q(sb.from('turmas').select('*').eq('id', id).maybeSingle());
  if (!t) { app.innerHTML = screen(`<div class="content pad"><div class="card empty">Evento não encontrado.</div><a class="btn btn-outline" href="#eventos">Voltar</a></div>`, 'eventos'); return; }
  const [m, aulas, dl] = await Promise.all([q(sb.from('matriculas').select('*').eq('turma_id', id).eq('aluno_id', uid).maybeSingle()), q(sb.from('aulas').select('*').eq('turma_id', id).order('data', { ascending: false }).order('criado_em', { ascending: false })), deps()]);
  const dep = (dl.find(d => d.id === t.departamento_id) || {}).nome;
  const voltar = tabs().includes('eventos') ? 'eventos' : 'inicio';
  const meta = `<span>${ic.clock('#E0BF73')}${t.carga_horaria} horas</span>${t.inicio ? `<span>${ic.calSm('#E0BF73')}${periodo(t)}</span>` : ''}${t.local ? `<span>${ic.pin('#E0BF73')}${esc(t.local)}</span>` : ''}`;
  const gerenciar = canChamada() && role() !== 'monitor' ? `<a class="glass-btn" href="#gevento/${t.id}" aria-label="Gerenciar evento" title="Gerenciar">${ic.grid(true)}</a>` : '';
  if (m && m.status === 'ativa') {
    const pres = new Set((await q(sb.from('presencas').select('aula_id').eq('aluno_id', uid).in('aula_id', aulas.map(a => a.id).concat(['00000000-0000-0000-0000-000000000000'])))).map(x => x.aula_id));
    const f = freq(aulas, pres); const ok = f.pct >= minFreq(t); const pode = apto(t, f);
    const n = aulas.length;
    app.innerHTML = screen(`${hero({ back: voltar, ov: 'ov', right: `<div style="display:flex;gap:8px;align-items:center">${gerenciar}<span class="pill ok" style="background:rgba(47,174,110,.16);color:#A6E8C4;border:1px solid rgba(110,214,160,.35)">Inscrito</span></div>`, eyebrow: dep ? esc(dep) : 'Meu evento', title: t.nome, meta })}
      <div class="content ov">
        <section class="card lift" style="flex-direction:row;align-items:center;gap:20px;padding:20px">${ring(f.pct, 110, 9)}
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:0"><div class="stat-grid"><div><b>${f.p}</b><small>presenças</small></div><div><b>${f.n - f.p}</b><small>faltas</small></div><div><b style="color:var(--gold-deep)">${minFreq(t)}%</b><small>mínimo</small></div></div>
          ${f.n ? `<span class="pill ${ok ? 'ok' : 'bad'}" style="align-self:flex-start;height:32px">${ok ? ic.check() + ' Acima do mínimo' : 'Abaixo do mínimo'}</span>` : '<span class="row-sub">Nenhuma aula registrada ainda.</span>'}</div></section>
        <section class="card" style="flex-direction:row;align-items:center;gap:14px;background:linear-gradient(135deg,#FBF5E7 0%,#F2E3C1 100%);border:1px solid #E8D5A6;box-shadow:none">
          <span class="icon-tile" style="background:#fff;color:var(--gold-deep)">${ic.seal()}</span>
          <div style="flex:1;display:flex;flex-direction:column;gap:3px"><b style="font-size:14.5px;color:#4F3A0B">Certificado</b><span style="font-size:12.5px;line-height:1.45;color:var(--gold-ink)">${pode ? 'Disponível para baixar.' : t.fim ? `Liberado em ${br(t.fim)}, ao fim do evento, com frequência mínima de ${minFreq(t)}%.` : `Liberado ao fim do evento, com frequência mínima de ${minFreq(t)}%.`}</span></div>
          ${pode ? `<button class="btn btn-navy btn-sm" id="cert">Baixar PDF</button>` : ''}</section>
        <section class="card" style="gap:0;padding:18px 18px 8px"><div class="section-head" style="margin-bottom:8px;padding:0"><h2 style="font-size:17px">Histórico de presença</h2><span style="font-size:11.5px;font-weight:600;color:var(--muted2)">registrado pela equipe</span></div>
          ${n ? aulas.map((a, i) => { const pr = pres.has(a.id); return `<div class="tl"><div class="rail"><span class="dotc ${pr ? 'ok' : 'bad'}">${pr ? ic.check(13, 3) : ic.x(11, 3)}</span>${i < n - 1 ? '<span class="line"></span>' : ''}</div><div class="body"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><b style="font-size:14px">${esc(a.tema || 'Aula ' + (n - i))}</b><span style="font-size:12px;color:var(--muted2)">Aula ${n - i} · ${brCurto(a.data)}</span></div><span style="font-size:12px;font-weight:700;color:${pr ? 'var(--ok)' : 'var(--bad)'};padding-top:2px">${pr ? 'Presente' : 'Falta'}</span></div></div>`; }).join('') : '<div class="empty">As aulas aparecem aqui conforme forem acontecendo.</div>'}
        </section>
      </div>`, voltar);
    const cb = document.getElementById('cert'); if (cb) cb.onclick = () => baixar(certificado(t, S.perfil, f.pct, dep), `Certificado - ${t.nome} - ${S.perfil.nome}.pdf`);
    return;
  }
  const podeInscrever = !m && t.inscricoes_abertas && !encerrado(t);
  app.innerHTML = screen(`${hero({ back: voltar, ov: 'ov', right: `<div style="display:flex;gap:8px;align-items:center">${gerenciar}${t.inscricoes_abertas && !encerrado(t) ? '<span class="pill" style="background:rgba(224,191,115,.14);border:1px solid rgba(224,191,115,.4);color:#EBCF8F">Inscrições abertas</span>' : ''}</div>`, eyebrow: dep ? esc(dep) : 'Evento', title: t.nome, extra: t.descricao ? `<p style="font-size:14.5px;line-height:1.6;color:#C3D0DE;position:relative;white-space:pre-line">${esc(t.descricao)}</p>` : '' })}
    <div class="content ov">
      <section class="card lift" style="padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;overflow:hidden">
        ${[['Carga horária', t.carga_horaria + ' horas', ic.clock()], ['Período', periodo(t) || 'A definir', ic.calSm()], ['Local', t.local || 'A definir', ic.pin()], ['Frequência mín.', minFreq(t) + '%', ic.check(15, 2)]].map(([l, v, i], k) => `<div style="padding:16px;display:flex;gap:12px;align-items:center;${k % 2 === 0 ? 'border-right:1px solid #EEF1F5;' : ''}${k < 2 ? 'border-bottom:1px solid #EEF1F5' : ''}"><span class="icon-tile" style="width:38px;height:38px;border-radius:12px">${i}</span><div style="display:flex;flex-direction:column;min-width:0"><span style="font-size:11px;font-weight:600;color:var(--muted2)">${l}</span><b style="font-size:14.5px;color:var(--navy-800);overflow-wrap:anywhere">${esc(v)}</b></div></div>`).join('')}
      </section>
      ${m ? `<div class="banner ${m.status === 'pendente' ? '' : 'err'}">${m.status === 'pendente' ? 'Sua inscrição foi enviada e aguarda aprovação da coordenação.' : 'Sua inscrição neste evento foi recusada. Em caso de dúvida, procure a secretaria.'}</div>`
        : `<section class="card" style="flex-direction:row;gap:14px;align-items:flex-start"><span class="icon-tile ${t.requer_aprovacao ? 'gold' : 'green'}" style="width:38px;height:38px;border-radius:12px">${t.requer_aprovacao ? ic.hourglass() : ic.check(18, 2.6)}</span><div style="display:flex;flex-direction:column;gap:4px"><b style="font-size:14.5px;color:var(--navy-800)">${t.requer_aprovacao ? 'Inscrição com aprovação' : 'Inscrição imediata'}</b><span style="font-size:13px;line-height:1.5;color:#5F6C7B">${t.requer_aprovacao ? 'Sua inscrição será analisada pela coordenação. Você recebe a confirmação no app.' : 'Ao se inscrever você já entra no evento, e a equipe pode registrar sua presença pelo seu QR Code desde a primeira aula.'}</span></div></section>`}
      ${podeInscrever ? `<button class="btn btn-gold btn-block" id="insc">Inscrever-me neste evento</button>` : ''}
    </div>`, voltar);
  const b = document.getElementById('insc'); if (b) b.onclick = async () => { b.disabled = true; const { data, error } = await sb.rpc('inscrever', { p_turma: t.id }); if (error) { b.disabled = false; return toast(erro(error)); } toast(data === 'pendente' ? 'Inscrição enviada. Aguarde a aprovação.' : 'Inscrição confirmada!'); pgEvento(id); };
}

/* ================= AVISOS ================= */
async function pgAvisos() {
  loading('avisos');
  const agora = new Date().toISOString();
  let qa = sb.from('avisos').select('*').order('publicar_em', { ascending: false }).limit(100);
  const [avisos, lidos] = await Promise.all([q(qa), q(sb.from('aviso_leituras').select('aviso_id'))]);
  const lidoSet = new Set(lidos.map(x => x.aviso_id));
  const publicados = avisos.filter(a => a.publicar_em <= agora);
  S.unread = publicados.filter(a => !lidoSet.has(a.id)).length;
  const filtro = S.filtroAv || 'todos';
  const lista = (filtro === 'nao' ? publicados.filter(a => !lidoSet.has(a.id)) : avisos);
  const grupos = {}; lista.forEach(a => { const g = a.publicar_em > agora ? 'Agendados' : grupoData(a.publicar_em); (grupos[g] = grupos[g] || []).push(a); });
  const ordem = ['Agendados', 'Hoje', 'Esta semana', 'Anteriores'];
  app.innerHTML = screen(`${hero({ eyebrow: 'Mural do SALT', title: 'Avisos', right: canAviso() ? `<a class="btn btn-gold btn-sm" href="#novo-aviso">${ic.plus()} Novo aviso</a>` : '',
      extra: `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;position:relative;flex-wrap:wrap"><div class="chips"><button class="chip ${filtro === 'todos' ? 'active' : ''}" data-f="todos">Todos</button><button class="chip ${filtro === 'nao' ? 'active' : ''}" data-f="nao">Não lidos${S.unread ? ` · ${S.unread}` : ''}</button></div>${S.unread ? '<button class="link-gold" id="todosLidos" style="color:#EBCF8F">Marcar todos como lidos</button>' : ''}</div>` })}
    <div class="content pad">${lista.length ? ordem.filter(g => grupos[g]).map(g => `<div class="section"><span class="group-label">${g}</span>${grupos[g].map(a => { const nl = a.publicar_em <= agora && !lidoSet.has(a.id);
      return `<a class="row-card ${nl ? 'unread' : ''}" href="#aviso/${a.id}" style="padding:14px 16px 14px 14px"><span class="icon-tile ${nl ? 'gold' : 'gray'}" style="width:44px;height:44px">${ic.mega()}</span><div class="row-main"><span class="row-title" style="font-weight:${nl ? 800 : 600};${nl ? '' : 'color:#2D3A4A'}">${esc(a.titulo)}</span><span class="row-sub" style="font-weight:600;font-size:12px">${esc(a.departamento_nome || 'SALT-FAAMA')} · ${a.publicar_em > agora ? 'agendado para ' + new Date(a.publicar_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : quando(a.publicar_em)}</span></div>${nl ? '<span style="width:9px;height:9px;flex:none;border-radius:50%;background:#C49C49;box-shadow:0 0 0 3px rgba(196,156,73,.2)" aria-label="Não lido"></span>' : ic.chev()}</a>`; }).join('')}</div>`).join('')
      : `<div class="card empty">${filtro === 'nao' ? 'Tudo lido por aqui.' : 'Nenhum aviso publicado ainda.'}</div>`}</div>`, 'avisos');
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filtroAv = b.dataset.f; pgAvisos(); });
  const tl = document.getElementById('todosLidos'); if (tl) tl.onclick = async () => { tl.disabled = true; await Promise.all(publicados.filter(a => !lidoSet.has(a.id)).map(a => sb.rpc('marcar_lido', { p_aviso: a.id }))); toast('Avisos marcados como lidos.'); pgAvisos(); };
}
async function pgAviso(id) {
  loading('avisos');
  const a = await q(sb.from('avisos').select('*').eq('id', id).maybeSingle());
  if (!a) { app.innerHTML = screen(`<div class="content pad"><div class="card empty">Aviso não encontrado.</div><a class="btn btn-outline" href="#avisos">Voltar</a></div>`, 'avisos'); return; }
  sb.rpc('marcar_lido', { p_aviso: id }).then(() => contarNaoLidos());
  const pode = isAdmin() || a.autor_id === S.perfil.id;
  const dt = new Date(a.publicar_em);
  const publico = { todos: 'todos os alunos', evento: 'os inscritos de um evento', semestre: `o ${a.semestre}º semestre`, monitores: 'a equipe' }[a.publico];
  app.innerHTML = screen(`${topbar('avisos', '<b style="font-size:13px;letter-spacing:.04em;color:var(--navy-800)">Aviso</b>', pode ? `<button class="light-btn" id="del" aria-label="Apagar aviso" style="color:var(--bad)">${ic.trash()}</button>` : '<span style="width:44px"></span>')}
    <article class="article">
      <span class="dept-chip">${ic.mega(15)} ${esc(a.departamento_nome || 'SALT-FAAMA')}</span>
      <h1>${esc(a.titulo)}</h1>
      <span style="font-size:13px;font-weight:600;color:var(--muted2);margin-top:-8px">${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()} · ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <div class="gold-rule"></div>
      <div class="body">${esc(a.corpo)}</div>
      <div style="display:flex;align-items:center;gap:12px;padding:18px 0 0;border-top:1px solid #EEF1F5;margin-top:8px">
        <span style="width:42px;height:42px;flex:none;border-radius:50%;background:linear-gradient(145deg,#0D2A4A,#1C4B7C);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">${esc(iniciais(a.autor_nome) || 'SF')}</span>
        <div style="display:flex;flex-direction:column;gap:1px;min-width:0"><span style="font-size:12px;font-weight:600;color:var(--muted2)">Enviado para ${publico} por</span><b style="font-size:14px;color:var(--navy-800)">${esc(a.autor_nome || 'SALT-FAAMA')}</b><span style="font-size:12.5px;color:var(--muted)">${esc([a.autor_cargo, a.departamento_nome].filter(Boolean).join(' · '))}</span></div>
      </div>
    </article>`, 'avisos', { light: true });
  const d = document.getElementById('del'); if (d) d.onclick = async () => { if (d.dataset.c !== '1') { d.dataset.c = '1'; toast('Toque de novo para apagar este aviso.'); return; } const { error } = await sb.from('avisos').delete().eq('id', id); if (error) return toast(erro(error)); toast('Aviso apagado.'); ir('avisos'); };
}
async function pgNovoAviso() {
  if (!canAviso()) return ir('avisos');
  loading('avisos');
  const dl = await deps();
  let meusDeps;
  if (isAdmin()) meusDeps = dl;
  else { const r = await q(sb.from('departamento_responsaveis').select('departamento_id,cargo').eq('perfil_id', S.perfil.id)); meusDeps = dl.filter(d => r.some(x => x.departamento_id === d.id)); }
  const turmas = await q(sb.from('turmas').select('id,nome,fim').order('inicio', { ascending: false, nullsFirst: false }));
  const st = { publico: 'todos', notificar: true, agendar: false };
  const sem = Array.from({ length: NSEM }, (_, i) => `<option value="${i + 1}">${semTxt(i + 1)}</option>`).join('');
  app.innerHTML = screen(`${topbar('avisos', `<span class="role-chip" style="background:var(--navy-800);color:#E0BF73;border:0">${PAPEL[role()]}</span>`)}
    <div style="padding:22px 22px 0"><h1 style="font-size:27px;font-weight:800;color:var(--navy-800)">Novo aviso</h1></div>
    ${!meusDeps.length ? `<div class="content pad"><div class="banner">Você ainda não está vinculado a nenhum departamento. Peça ao administrador para vincular você ao departamento que coordena.</div></div>` : `
    <form class="content pad" id="f" style="gap:14px" novalidate>
      <section class="card">
        <label class="field"><span style="display:flex;justify-content:space-between"><span style="font-size:13px;font-weight:800;color:var(--navy-800)">Título da notificação</span><span id="cnt" style="font-size:12px;color:var(--muted2);font-variant-numeric:tabular-nums">0/60</span></span>
          <span class="input-wrap"><input id="tit" maxlength="60" required placeholder="Ex.: Semana de Oração: programação atualizada"></span><span class="hint">É o que aparece na barra de notificações do celular.</span></label>
        <div class="notif-preview"><span class="lbl">PRÉVIA NO CELULAR</span><div class="notif"><span class="app"><img src="icons/icon-192.png" alt=""></span><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between"><span style="font-size:11.5px;font-weight:700;color:#3A4757">SALT-FAAMA</span><span style="font-size:11px;color:#5F6C7B">agora</span></div><b id="pv">Título do aviso</b><small id="pvs">Novo aviso. Toque para ler.</small></div></div></div>
      </section>
      <section class="card">
        <label class="field"><span style="font-size:13px;font-weight:800;color:var(--navy-800)">Texto completo do aviso</span><span class="input-wrap ta"><textarea id="corpo" required placeholder="Escreva aqui o aviso completo…"></textarea></span><span class="hint">O aluno vê este texto quando abre o aviso no app.</span></label>
      </section>
      <section class="card" style="gap:16px">
        <label class="field"><span style="font-size:13px;font-weight:800;color:var(--navy-800)">Publicar como</span><span class="input-wrap"><select id="dep">${meusDeps.map(d => `<option value="${d.id}">${esc(d.nome)}</option>`).join('')}</select></span></label>
        <div class="field"><span style="font-size:13px;font-weight:800;color:var(--navy-800)">Enviar para</span><div class="chips" id="pub">${[['todos', 'Todos'], ['evento', 'Um evento'], ['semestre', 'Por semestre'], ['monitores', 'Equipe']].map(([v, l]) => `<button type="button" class="chip ${v === 'todos' ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
          <span class="input-wrap" id="wEv" hidden><select id="ev">${turmas.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></span>
          <span class="input-wrap" id="wSem" hidden><select id="semSel">${sem}</select></span></div>
        <div class="switch-row" style="border-top:1px solid #EEF1F5;padding-top:14px"><div><b>Notificar no celular</b><small>Envia o título como notificação</small></div><button type="button" class="switch" id="sNot" role="switch" aria-checked="true" aria-label="Notificar no celular"></button></div>
        <div class="switch-row"><div><b>Agendar publicação</b><small>Escolha data e hora</small></div><button type="button" class="switch" id="sAg" role="switch" aria-checked="false" aria-label="Agendar publicação"></button></div>
        <span class="input-wrap" id="wAg" hidden><input type="datetime-local" id="ag"></span>
      </section>
      <div class="grid2" style="grid-template-columns:1fr 1.5fr"><a class="btn btn-outline" href="#avisos">Cancelar</a><button class="btn btn-gold" type="submit">${ic.send()} Publicar</button></div>
    </form>`}`, 'avisos', { light: true });
  const f = document.getElementById('f'); if (!f) return;
  const tit = document.getElementById('tit'), pv = document.getElementById('pv'), pvs = document.getElementById('pvs'), depSel = document.getElementById('dep');
  const upd = () => { document.getElementById('cnt').textContent = `${tit.value.length}/60`; pv.textContent = tit.value || 'Título do aviso'; pvs.textContent = `Novo aviso · ${depSel.options[depSel.selectedIndex].text}. Toque para ler.`; };
  tit.oninput = upd; depSel.onchange = upd; upd();
  document.querySelectorAll('#pub .chip').forEach(c => c.onclick = () => { st.publico = c.dataset.v; document.querySelectorAll('#pub .chip').forEach(x => x.classList.toggle('active', x === c)); document.getElementById('wEv').hidden = st.publico !== 'evento'; document.getElementById('wSem').hidden = st.publico !== 'semestre'; });
  const sw = (id, k, cb) => { const el = document.getElementById(id); el.onclick = () => { st[k] = !st[k]; el.setAttribute('aria-checked', String(st[k])); cb && cb(); }; };
  sw('sNot', 'notificar'); sw('sAg', 'agendar', () => document.getElementById('wAg').hidden = !st.agendar);
  f.onsubmit = async e => {
    e.preventDefault();
    const titulo = tit.value.trim(), corpo = document.getElementById('corpo').value.trim();
    if (titulo.length < 3) return toast('Escreva um título para o aviso.');
    if (!corpo) return toast('Escreva o texto completo do aviso.');
    let publicar_em = new Date().toISOString();
    if (st.agendar) { const v = document.getElementById('ag').value; if (!v) return toast('Escolha a data e a hora do agendamento.'); publicar_em = new Date(v).toISOString(); }
    const row = { titulo, corpo, departamento_id: depSel.value, autor_id: S.perfil.id, publico: st.publico, notificar: st.notificar, publicar_em,
      turma_id: st.publico === 'evento' ? document.getElementById('ev').value : null, semestre: st.publico === 'semestre' ? Number(document.getElementById('semSel').value) : null };
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    const { error } = await sb.from('avisos').insert(row); b.disabled = false;
    if (error) return toast(erro(error));
    toast(st.agendar ? 'Aviso agendado.' : 'Aviso publicado.'); ir('avisos');
  };
}

/* ================= CALENDÁRIO ================= */
const CAT = { salt: ['SALT', 'c-salt', '#EDF2F8', 'navy'], faama: ['FAAMA', 'c-faama', '#F4E8CB', 'gold'], feriado: ['Feriado', 'c-feriado', '#F7E7E3', 'red'] };
async function pgCalendario() {
  loading('calendario');
  const base = S.cal || (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(); S.cal = base;
  const y = base.getFullYear(), mo = base.getMonth(); const ini = iso(new Date(y, mo, 1)), fim = iso(new Date(y, mo + 1, 0));
  const [todos, dl] = await Promise.all([q(sb.from('turmas').select('id,nome,inicio,fim,local,categoria,departamento_id').not('inicio', 'is', null).order('inicio')), deps()]);
  const dn = id => (dl.find(d => d.id === id) || {}).nome || '';
  const fimDe = e => e.fim || e.inicio;
  const longo = e => (parseD(fimDe(e)) - parseD(e.inicio)) / 864e5 > 6;
  const doMes = todos.filter(e => e.inicio <= fim && fimDe(e) >= ini);
  // eventos longos (cursos) marcam só o início e o término; eventos curtos marcam todos os dias
  const evDia = dia => doMes.filter(e => longo(e) ? (e.inicio === dia || fimDe(e) === dia) : (e.inicio <= dia && fimDe(e) >= dia));
  const proximos = todos.filter(e => fimDe(e) >= hoje()).slice(0, 10);
  const cat = e => CAT[e.categoria] ? e.categoria : 'salt';
  const primeiro = new Date(y, mo, 1).getDay(), nDias = new Date(y, mo + 1, 0).getDate();
  let cells = ''; for (let i = 0; i < primeiro; i++) cells += '<span></span>';
  for (let d = 1; d <= nDias; d++) {
    const dia = iso(new Date(y, mo, d)), evs = evDia(dia), wd = (primeiro + d - 1) % 7;
    const range = evs.find(e => !longo(e) && fimDe(e) !== e.inicio);
    let cls = 'cal-day'; let style = '';
    if (wd === 0 || wd === 6) cls += ' weekend';
    if (evs.length) cls += ' has';
    if (range) { cls += ' band'; style = `background:${CAT[cat(range)][2]}`; if (dia === range.inicio || wd === 0 || d === 1) cls += ' band-start'; if (dia === fimDe(range) || wd === 6 || d === nDias) cls += ' band-end'; }
    if (dia === hoje()) cls += ' today';
    if (S.calSel === dia) cls += ' sel';
    const dots = [...new Set(evs.map(cat))].map(c => `<i class="${CAT[c][1]}"></i>`).join('');
    cells += `<button class="${cls}" style="${style}" data-dia="${dia}" aria-label="${d} de ${MESES[mo]}${evs.length ? ', ' + evs.length + ' evento(s)' : ''}"><span class="n">${d}</span><span class="dots">${dots}</span></button>`;
  }
  const destino = e => isGestao() ? 'gevento/' + e.id : 'evento/' + e.id;
  const item = (e, dia) => { const [lbl, , , tile] = CAT[cat(e)]; const d = parseD(e.inicio), f = parseD(fimDe(e)); const outroMes = f.getMonth() !== d.getMonth() || f.getFullYear() !== d.getFullYear(); const multi = fimDe(e) !== e.inicio && !outroMes;
    const tileHtml = `<div class="date-tile ${tile}"><b class="${multi ? 'sm' : ''}">${multi ? `${String(d.getDate()).padStart(2, '0')}–${String(f.getDate()).padStart(2, '0')}` : String(d.getDate()).padStart(2, '0')}</b><small>${MES3[d.getMonth()]}</small></div>`;
    const marco = (dia && longo(e) ? (dia === e.inicio ? 'Início · ' : 'Término · ') : '') + (outroMes ? `até ${brCurto(fimDe(e))} · ` : '');
    return `<a class="row-card" href="#${destino(e)}">${tileHtml}<div class="row-main"><span class="row-title">${esc(e.nome)}</span><span class="row-sub">${esc(marco + ([dn(e.departamento_id), e.local].filter(Boolean).join(' · ') || lbl))}</span></div><span class="pill ${tile === 'red' ? 'bad' : tile}">${lbl}</span></a>`; };
  const selList = S.calSel ? evDia(S.calSel) : null;
  app.innerHTML = screen(`${hero({ ov: 'ov', logo: true, right: isGestao() ? `<a class="btn btn-gold btn-sm" href="#form-evento">${ic.plus()} Novo evento</a>` : '',
      extra: `<div style="display:flex;align-items:flex-end;justify-content:space-between;position:relative"><div class="hero-title"><span class="eyebrow">Calendário do SALT</span><h1>${MESES[mo][0].toUpperCase() + MESES[mo].slice(1)} <span style="font-weight:600;color:#B7C6D8">${y}</span></h1></div><div style="display:flex;gap:8px"><button class="glass-btn" id="prev" aria-label="Mês anterior">${ic.back()}</button><button class="glass-btn" id="next" aria-label="Próximo mês" style="transform:scaleX(-1)">${ic.back()}</button></div></div>` })}
    <div class="content ov">
      <section class="card lift cal"><div class="cal-head"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="cal-grid">${cells}</div>
        <div class="legend"><span><i class="c-salt"></i>SALT</span><span><i class="c-faama"></i>FAAMA</span><span><i class="c-feriado"></i>Feriado</span></div></section>
      ${selList ? `<section class="section"><div class="section-head"><h2>${parseD(S.calSel).getDate()} de ${MESES[parseD(S.calSel).getMonth()]}</h2><button class="link-gold" id="limpar">Ver próximos</button></div>${selList.length ? selList.map(e => item(e, S.calSel)).join('') : '<div class="card empty">Nenhum evento neste dia.</div>'}</section>`
        : `<section class="section"><div class="section-head"><h2>Próximos eventos</h2></div>${proximos.length ? proximos.map(e => item(e)).join('') : '<div class="card empty">Nenhum evento a partir de hoje.</div>'}</section>`}
    </div>`, 'calendario');
  document.getElementById('prev').onclick = () => { S.cal = new Date(y, mo - 1, 1); S.calSel = null; pgCalendario(); };
  document.getElementById('next').onclick = () => { S.cal = new Date(y, mo + 1, 1); S.calSel = null; pgCalendario(); };
  app.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => { S.calSel = S.calSel === b.dataset.dia ? null : b.dataset.dia; pgCalendario(); });
  const l = document.getElementById('limpar'); if (l) l.onclick = () => { S.calSel = null; pgCalendario(); };
}

/* ================= CHAMADA ================= */
let stream = null, rafId = null, ultimo = { token: '', t: 0 }, ocupado = false;
function pararCamera() { if (rafId) cancelAnimationFrame(rafId); rafId = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; const s = document.querySelector('.scan-screen'); if (s) s.remove(); }
async function eventosDaEquipe() {
  if (isGestao()) return q(sb.from('turmas').select('*').order('inicio', { ascending: false, nullsFirst: false }));
  const eq = await q(sb.from('evento_equipe').select('turma_id').eq('perfil_id', S.perfil.id));
  if (!eq.length) return [];
  return q(sb.from('turmas').select('*').in('id', eq.map(x => x.turma_id)).order('inicio', { ascending: false, nullsFirst: false }));
}
async function pgChamada(id) {
  if (!canChamada()) return ir('inicio');
  const tab = tabs().includes('chamada') ? 'chamada' : 'gestao';
  if (id) return pgChamadaEvento(id, tab);
  loading(tab);
  const turmas = (await eventosDaEquipe()).filter(t => !encerrado(t) || t.fim >= iso(new Date(Date.now() - 7 * 864e5)));
  const aulasHoje = turmas.length ? await q(sb.from('aulas').select('turma_id,data').eq('data', hoje()).in('turma_id', turmas.map(t => t.id))) : [];
  const temHoje = id => aulasHoje.some(a => a.turma_id === id);
  const dl = await deps(); const dn = id => (dl.find(d => d.id === id) || {}).nome || '';
  const destaque = turmas.find(t => temHoje(t.id)) || turmas.find(t => !encerrado(t));
  const outros = turmas.filter(t => t !== destaque);
  app.innerHTML = screen(`${hero({ logo: true, ov: destaque ? 'ov-xl' : '', right: `<span class="role-chip">${ic.shield()} ${PAPEL[role()]}</span>`, extra: `<div class="hero-title"><h1>Olá, ${esc(primeiroNome(S.perfil.nome))}</h1><span class="sub">Escolha o evento para fazer a chamada.</span></div>` })}
    <div class="content ${destaque ? 'ov-xl' : 'pad'}">
      ${destaque ? `<section class="credential" style="flex-direction:column;cursor:default;gap:16px">${CARD_MOTIF}
        <div style="display:flex;justify-content:space-between;align-items:center;position:relative"><span class="label"><span style="width:7px;height:7px;border-radius:50%;background:#5FD39A;box-shadow:0 0 0 3px rgba(95,211,154,.25)"></span>${temHoje(destaque.id) ? 'AULA DE HOJE' : 'PRÓXIMO EVENTO'}</span><span style="font-size:12px;font-weight:600;color:#B7C6D8">${brCurto(hoje())}</span></div>
        <div style="display:flex;flex-direction:column;gap:6px;position:relative"><span class="name" style="font-size:20px">${esc(destaque.nome)}</span><span class="ra">${esc(dn(destaque.departamento_id) || periodo(destaque))}</span></div>
        <a class="btn btn-white btn-block" href="#chamada/${destaque.id}" style="position:relative">${ic.scan()} Iniciar chamada</a></section>` : ''}
      <section class="section">${outros.length ? `<div class="section-head"><h2>${destaque ? 'Outros eventos' : 'Seus eventos'}</h2></div>` : ''}
        ${outros.map(t => `<a class="row-card" href="#chamada/${t.id}">${dateTile(t.inicio, 'soft')}<div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${esc(dn(t.departamento_id) || periodo(t))}</span>${temHoje(t.id) ? '<span class="status ok">Aula aberta hoje</span>' : ''}</div>${ic.chev()}</a>`).join('')}
        ${!turmas.length ? `<div class="card empty">${isGestao() ? 'Nenhum evento criado ainda. Crie um em Gestão.' : 'Nenhum evento atribuído a você ainda. A coordenação faz essa atribuição.'}</div>` : `<p style="font-size:12px;color:var(--muted2);padding:0 4px">${isGestao() ? 'Como gestão, você vê todos os eventos.' : 'Aparecem aqui apenas os eventos atribuídos a você pela coordenação.'}</p>`}
      </section></div>`, tab);
}
async function pgChamadaEvento(id, tab) {
  loading(tab);
  const t = await q(sb.from('turmas').select('*').eq('id', id).maybeSingle());
  if (!t) return ir('chamada');
  let aulas = [], alunos = [], presentes = new Map(), filtro = 'todos', busca = '';
  async function carregar() {
    const [a, m] = await Promise.all([q(sb.from('aulas').select('*').eq('turma_id', id).order('data', { ascending: false }).order('criado_em', { ascending: false })), q(sb.from('matriculas').select('aluno_id,perfis(nome,ra,semestre)').eq('turma_id', id).eq('status', 'ativa'))]);
    aulas = a; alunos = m.map(x => ({ id: x.aluno_id, ...x.perfis })).sort((p, q2) => p.nome.localeCompare(q2.nome, 'pt-BR'));
    if (!aulas.find(x => x.id === S.chamada.aulaId)) S.chamada.aulaId = (aulas.find(x => x.data === hoje()) || aulas[0] || {}).id || null;
    await carregarPres();
  }
  async function carregarPres() {
    presentes = new Map();
    if (S.chamada.aulaId) (await q(sb.from('presencas').select('aluno_id,em,metodo').eq('aula_id', S.chamada.aulaId))).forEach(p => presentes.set(p.aluno_id, p));
  }
  await carregar();
  function desenhar() {
    const aula = aulas.find(a => a.id === S.chamada.aulaId);
    const np = alunos.filter(a => presentes.has(a.id)).length, pct = alunos.length ? Math.round(100 * np / alunos.length) : 0;
    const vis = alunos.filter(a => (filtro === 'todos' || (filtro === 'p') === presentes.has(a.id)) && (!busca || a.nome.toLowerCase().includes(busca) || a.ra.includes(busca)));
    const nQR = [...presentes.values()].filter(p => p.metodo === 'qr').length;
    app.innerHTML = screen(`${hero({ back: 'chamada', ov: 'ov', title: t.nome, sub: aula ? `${aula.tema ? esc(aula.tema) + ' · ' : ''}${br(aula.data)}` : 'Nenhuma aula aberta' })}
      <div class="content ov" style="gap:14px">
        <section class="card lift">
          <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px"><div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">Presentes</span><span style="font-size:36px;font-weight:800;letter-spacing:-.03em;color:var(--navy-800);line-height:1;font-variant-numeric:tabular-nums">${np}<span style="font-size:18px;font-weight:700;color:var(--muted2);letter-spacing:0"> de ${alunos.length}</span></span></div>
          <div style="display:flex;gap:6px"><span class="pill navy">QR ${nQR}</span><span class="pill gold">Manual ${np - nQR}</span></div></div>
          <div style="height:8px;border-radius:4px;background:#EBEFF4;overflow:hidden"><div style="width:${pct}%;height:100%;border-radius:4px;background:linear-gradient(90deg,#0B2443 0%,#2A5E94 100%)"></div></div>
          <label class="field" style="margin-top:4px">Aula<span class="input-wrap"><select id="aula">${aulas.length ? aulas.map((a, i) => `<option value="${a.id}" ${a.id === S.chamada.aulaId ? 'selected' : ''}>${br(a.data)}${a.tema ? ' — ' + esc(a.tema) : ` — Aula ${aulas.length - i}`}</option>`).join('') : '<option value="">Nenhuma aula aberta</option>'}</select></span></label>
          <button class="link-gold" id="novaAula" style="align-self:flex-start">${ic.plus()} Abrir nova aula</button>
          <button class="btn btn-navy btn-block" id="cam" ${aula ? '' : 'disabled'}>${ic.scan()} Abrir câmera</button>
        </section>
        <span class="input-wrap" style="background:#fff;box-shadow:0 1px 2px rgba(11,36,67,.05)">${ic.search()}<input id="busca" placeholder="Buscar por nome ou RA" value="${esc(busca)}"></span>
        <div class="seg"><button class="${filtro === 'todos' ? 'on' : ''}" data-fl="todos">Todos · ${alunos.length}</button><button class="${filtro === 'p' ? 'on' : ''}" data-fl="p">Presentes · ${np}</button><button class="${filtro === 'a' ? 'on' : ''}" data-fl="a">Ausentes · ${alunos.length - np}</button></div>
        <section class="card" style="padding:4px 16px;gap:0">${vis.length ? vis.map(a => { const p = presentes.get(a.id);
          return `<div class="person-row">${p ? `<span class="avatar">${esc(iniciais(a.nome))}<span class="ck">${ic.check(9, 4)}</span></span>` : `<span class="avatar absent">${esc(iniciais(a.nome))}</span>`}<div class="person-main"><b>${esc(a.nome)}</b><small>RA ${esc(a.ra)}</small></div>
          ${p ? `<button class="link-gold" data-rm="${a.id}" style="color:${p.metodo === 'qr' ? 'var(--ok)' : 'var(--gold-deep)'};font-size:12px">${new Date(p.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${p.metodo === 'qr' ? 'QR' : 'manual'}</button>` : `<button class="btn btn-sm btn-goldline" data-mk="${a.id}" ${aula ? '' : 'disabled'}>Marcar presença</button>`}</div>`; }).join('')
          : `<div class="empty">${alunos.length ? 'Ninguém encontrado.' : 'Nenhum inscrito neste evento ainda.'}</div>`}</section>
        ${alunos.some(a => presentes.has(a.id)) ? '<p style="font-size:12px;color:var(--muted2);padding:0 4px">Para desmarcar uma presença, toque no horário ao lado do nome.</p>' : ''}
      </div>`, tab);
    document.getElementById('aula').onchange = async e => { S.chamada.aulaId = e.target.value || null; await carregarPres(); desenhar(); };
    document.getElementById('busca').oninput = e => { busca = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; desenhar(); const b = document.getElementById('busca'); b.focus(); b.setSelectionRange(pos, pos); };
    app.querySelectorAll('[data-fl]').forEach(b => b.onclick = () => { filtro = b.dataset.fl; desenhar(); });
    app.querySelectorAll('[data-mk]').forEach(b => b.onclick = async () => { b.disabled = true; const { error } = await sb.from('presencas').insert({ aula_id: S.chamada.aulaId, aluno_id: b.dataset.mk, metodo: 'manual', registrado_por: S.perfil.id }); if (error) toast(erro(error)); await carregarPres(); desenhar(); });
    app.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (b.dataset.c !== '1') { b.dataset.c = '1'; b.textContent = 'Desmarcar?'; return; } const { error } = await sb.from('presencas').delete().eq('aula_id', S.chamada.aulaId).eq('aluno_id', b.dataset.rm); if (error) toast(erro(error)); await carregarPres(); desenhar(); });
    document.getElementById('novaAula').onclick = () => abrirSheet(`<h2>Abrir nova aula</h2><form class="form" id="fa"><label class="field">Data<span class="input-wrap"><input type="date" id="ad" value="${hoje()}" required></span></label><label class="field">Tema (opcional)<span class="input-wrap"><input id="at" placeholder="Ex.: Aula 3 — Hermenêutica"></span></label><button class="btn btn-navy btn-block">Abrir aula</button></form>`, sh => {
      sh.querySelector('#fa').onsubmit = async e => { e.preventDefault(); const { data, error } = await sb.from('aulas').insert({ turma_id: id, data: sh.querySelector('#ad').value, tema: sh.querySelector('#at').value.trim() || null, criado_por: S.perfil.id }).select().single(); if (error) return toast(erro(error)); fecharSheet(); S.chamada.aulaId = data.id; await carregar(); desenhar(); toast('Aula aberta.'); };
    });
    document.getElementById('cam').onclick = () => abrirScanner(t, aula, alunos, presentes, async () => { await carregarPres(); desenhar(); });
  }
  desenhar();
}
function abrirSheet(html, cb) { const o = document.createElement('div'); o.className = 'overlay'; o.innerHTML = `<div class="sheet"><div class="grip"></div>${html}</div>`; o.onclick = e => { if (e.target === o) fecharSheet(); }; document.body.appendChild(o); cb && cb(o); }
function fecharSheet() { document.querySelectorAll('.overlay').forEach(o => o.remove()); }

async function abrirScanner(t, aula, alunos, presentes, aoFechar) {
  pararCamera();
  const el = document.createElement('div'); el.className = 'scan-screen';
  const total = alunos.length; let np = alunos.filter(a => presentes.has(a.id)).length;
  el.innerHTML = `<video playsinline muted></video>
    <div class="scan-top"><button class="glass-btn" id="sx" aria-label="Fechar câmera">${ic.back()}</button><div class="ttl"><b>${esc(t.nome)}</b><small>${aula.tema ? esc(aula.tema) + ' · ' : ''}${br(aula.data)}</small></div><div class="counter"><b id="np">${np}</b><small>/${total}</small></div></div>
    <div class="scan-frame" aria-hidden="true"><svg viewBox="0 0 236 236" fill="none"><defs><linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0D592"/><stop offset="1" stop-color="#B48A36"/></linearGradient></defs><path d="M3 52V24A21 21 0 0 1 24 3h28M184 3h28a21 21 0 0 1 21 21v28M233 184v28a21 21 0 0 1-21 21h-28M52 233H24A21 21 0 0 1 3 212v-28" stroke="url(#gc)" stroke-width="5" stroke-linecap="round"/><rect x="30" y="116" width="176" height="2.5" rx="1.25" fill="#E0BF73" fill-opacity=".75"/></svg></div>
    <div class="scan-msg" id="smsg">Abrindo a câmera…</div>
    <div class="scan-bottom"><div id="conf"></div><div class="scan-actions"><button class="btn btn-glass" id="sl">${ic.list()} Ver lista</button><button class="btn btn-gold" id="se">Encerrar chamada</button></div></div>`;
  document.body.appendChild(el);
  const fechar = () => { pararCamera(); aoFechar && aoFechar(); };
  el.querySelector('#sx').onclick = fechar; el.querySelector('#sl').onclick = fechar; el.querySelector('#se').onclick = () => { pararCamera(); ir('chamada'); };
  const msg = t2 => { const m = el.querySelector('#smsg'); if (m) m.textContent = t2; };
  if (!navigator.mediaDevices?.getUserMedia) { msg('Este navegador não permite usar a câmera. Use o Chrome ou o Safari atualizados.'); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }); }
  catch (e) { msg('Não foi possível abrir a câmera. Permita o acesso à câmera nas configurações do navegador.'); return; }
  const v = el.querySelector('video'); v.srcObject = stream; await v.play().catch(() => {});
  msg('Aponte para o QR Code do aluno');
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }); let last = 0;
  const useBD = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  const loop = async ts => {
    rafId = requestAnimationFrame(loop);
    if (ocupado || ts - last < 150 || v.readyState < 2) return; last = ts;
    let txt = null;
    try {
      if (useBD) { const r = await useBD.detect(v); if (r[0]) txt = r[0].rawValue; }
      else { const w = 520, h = Math.round(v.videoHeight * w / v.videoWidth) || 520; cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h); const c = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (c) txt = c.data; }
    } catch (e) {}
    if (txt) processar(txt.trim());
  };
  rafId = requestAnimationFrame(loop);
  const card = (kind, lbl, nome, sub, undo) => {
    const iconK = kind === 'ok' ? ic.check(26, 2.8) : kind === 'warn' ? '!' : ic.x(20, 3);
    el.querySelector('#conf').innerHTML = `<div class="confirm-card"><div class="row"><div class="check-halo ${kind === 'ok' ? '' : kind}"><span style="font-weight:800;font-size:22px">${iconK}</span></div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span class="lbl ${kind === 'ok' ? '' : kind}">${lbl}</span>${nome ? `<span class="nm">${esc(nome)}</span>` : ''}${sub ? `<span class="rr">${esc(sub)}</span>` : ''}</div></div>${undo ? `<div class="undo"><span>Não é esta pessoa?</span><button id="desf">${ic.undo()} Desfazer</button></div>` : ''}</div>`;
    if (undo) el.querySelector('#desf').onclick = undo;
  };
  async function processar(txt) {
    const now = Date.now(); if (txt === ultimo.token && now - ultimo.t < 4000) return; ultimo = { token: txt, t: now };
    const m = /^SALT:([a-f0-9]{32})$/.exec(txt);
    if (!m) { card('bad', 'QR CODE NÃO RECONHECIDO', 'Este código não é do app SALT-FAAMA', ''); return; }
    ocupado = true; msg('Registrando…');
    const { data, error } = await sb.rpc('registrar_presenca', { p_aula: aula.id, p_qr: m[1] });
    ocupado = false; msg('Aponte para o próximo QR Code');
    if (error) { card('bad', 'NÃO FOI POSSÍVEL REGISTRAR', erro(error), ''); return; }
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const sub = data.ra ? `RA ${data.ra} · ${hora}` : '';
    try { navigator.vibrate && navigator.vibrate(data.status === 'registrada' || data.status === 'ja_presente' ? 60 : [40, 60, 40]); } catch (e) {}
    if (data.status === 'registrada') {
      np++; el.querySelector('#np').textContent = np;
      card('ok', 'PRESENÇA REGISTRADA', data.nome, sub, async () => {
        const { error: e2 } = await sb.from('presencas').delete().eq('aula_id', aula.id).eq('aluno_id', data.aluno_id);
        if (e2) return toast(erro(e2)); np--; el.querySelector('#np').textContent = np; ultimo = { token: '', t: 0 };
        card('warn', 'PRESENÇA DESFEITA', data.nome, 'Leia o QR Code correto');
      });
    } else if (data.status === 'ja_presente') card('ok', 'JÁ ESTAVA PRESENTE', data.nome, sub);
    else if (data.status === 'pendente') card('warn', 'INSCRIÇÃO AGUARDANDO APROVAÇÃO', data.nome, sub);
    else if (data.status === 'recusada') card('bad', 'INSCRIÇÃO RECUSADA NESTE EVENTO', data.nome, sub);
    else if (data.status === 'fora_da_turma') card('bad', 'NÃO ESTÁ INSCRITO NESTE EVENTO', data.nome, sub);
    else card('bad', 'QR CODE NÃO ENCONTRADO', 'O aluno precisa ter cadastro no app', '');
  }
}

/* ================= GESTÃO ================= */
async function pgGestao() {
  if (!isGestao()) return ir('inicio');
  loading('gestao');
  const [turmas, pend, dl] = await Promise.all([q(sb.from('turmas').select('*').order('inicio', { ascending: false, nullsFirst: false })), q(sb.from('matriculas').select('turma_id').eq('status', 'pendente')), deps()]);
  const nPend = {}; pend.forEach(p => nPend[p.turma_id] = (nPend[p.turma_id] || 0) + 1);
  const dn = id => (dl.find(d => d.id === id) || {}).nome || 'Sem departamento';
  const ativos = turmas.filter(t => !encerrado(t)), antigos = turmas.filter(encerrado);
  const linha = t => `<a class="row-card" href="#gevento/${t.id}">${dateTile(t.inicio, encerrado(t) ? 'soft' : '')}<div class="row-main"><span class="row-title">${esc(t.nome)}</span><span class="row-sub">${esc(dn(t.departamento_id))}</span>${nPend[t.id] ? `<span class="status gold">${nPend[t.id]} inscrição(ões) aguardando aprovação</span>` : `<span class="status ${t.inscricoes_abertas && !encerrado(t) ? 'ok' : 'muted'}">${encerrado(t) ? 'Encerrado' : t.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}</span>`}</div>${ic.chev()}</a>`;
  app.innerHTML = screen(`${hero({ logo: true, right: `<span class="role-chip">${ic.shield()} ${PAPEL[role()]}</span>`, extra: `<div class="hero-title"><span class="eyebrow">${isAdmin() ? 'Administração' : 'Secretaria do Seminário'}</span><h1>Gestão</h1></div>` })}
    <div class="content pad">
      <div class="shortcuts" style="grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))">
        <a class="shortcut" href="#form-evento"><span class="icon-tile gold">${ic.plus()}</span>Novo evento</a>
        <a class="shortcut" href="#novo-aviso"><span class="icon-tile gold">${ic.mega(20)}</span>Novo aviso</a>
        <a class="shortcut" href="#chamada"><span class="icon-tile">${ic.scan()}</span>Fazer chamada</a>
        ${isAdmin() ? `<a class="shortcut" href="#pessoas"><span class="icon-tile">${ic.users()}</span>Pessoas e acessos</a><a class="shortcut" href="#departamentos"><span class="icon-tile">${ic.dept()}</span>Departamentos</a>` : ''}
      </div>
      <section class="section"><div class="section-head"><h2>Eventos ativos</h2><span style="font-size:13px;color:var(--muted2)">${ativos.length}</span></div>${ativos.length ? ativos.map(linha).join('') : '<div class="card empty">Nenhum evento ativo. Use "Novo evento".</div>'}</section>
      ${antigos.length ? `<section class="section"><div class="section-head"><h2>Encerrados</h2></div>${antigos.map(linha).join('')}</section>` : ''}
    </div>`, 'gestao');
}
async function pgGEvento(id) {
  if (!canChamada() || role() === 'monitor') return ir('inicio');
  const tab = tabs().includes('gestao') ? 'gestao' : 'chamada';
  loading(tab);
  const t = await q(sb.from('turmas').select('*').eq('id', id).maybeSingle());
  if (!t) return ir(tab);
  const [mats, aulas, equipe, dl] = await Promise.all([
    q(sb.from('matriculas').select('id,aluno_id,status,perfis(nome,ra,semestre)').eq('turma_id', id)),
    q(sb.from('aulas').select('id,data').eq('turma_id', id)),
    q(sb.from('evento_equipe').select('perfil_id,funcao,perfis(nome,ra,papel)').eq('turma_id', id)),
    deps()]);
  const pres = aulas.length ? await q(sb.from('presencas').select('aula_id,aluno_id').in('aula_id', aulas.map(a => a.id))) : [];
  const dep = (dl.find(d => d.id === t.departamento_id) || {}).nome;
  const nome = (a, b) => a.perfis.nome.localeCompare(b.perfis.nome, 'pt-BR');
  const pend = mats.filter(m => m.status === 'pendente').sort(nome), ativos = mats.filter(m => m.status === 'ativa').sort(nome), recus = mats.filter(m => m.status === 'recusada').sort(nome);
  const fq = aid => freq(aulas, new Set(pres.filter(p => p.aluno_id === aid).map(p => p.aula_id)));
  const g = isGestao();
  const voltar = g ? 'gestao' : 'chamada';
  app.innerHTML = screen(`${hero({ back: voltar, ov: 'ov', right: g ? `<a class="glass-btn" href="#form-evento/${t.id}" aria-label="Editar evento">${ic.edit()}</a>` : '', eyebrow: dep ? esc(dep) : 'Evento', title: t.nome,
      meta: `<span>${ic.clock('#E0BF73')}${t.carga_horaria} h</span>${t.inicio ? `<span>${ic.calSm('#E0BF73')}${periodo(t)}</span>` : ''}<span>${ic.users('#E0BF73')}${ativos.length} inscrito(s)</span><span>${aulas.length} aula(s)</span>` })}
    <div class="content ov" style="gap:16px">
      <div class="grid2"><a class="btn btn-white" href="#chamada/${t.id}" style="box-shadow:var(--shadow-lift)">${ic.scan()} Chamada</a><a class="btn btn-white" href="#evento/${t.id}" style="box-shadow:var(--shadow-lift)">Página do evento</a></div>
      ${pend.length && g ? `<section class="card" style="gap:0;padding:6px 16px"><div class="section-head" style="padding:10px 0 4px"><h2 style="font-size:16px">Aguardando aprovação · ${pend.length}</h2></div>${pend.map(m => `<div class="person-row"><span class="avatar absent">${esc(iniciais(m.perfis.nome))}</span><div class="person-main"><b>${esc(m.perfis.nome)}</b><small>RA ${esc(m.perfis.ra)} · ${semTxt(m.perfis.semestre)}</small></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-navy" data-ap="${m.id}">Aprovar</button><button class="btn btn-sm btn-danger" data-rc="${m.id}" aria-label="Recusar">${ic.x(12, 3)}</button></div></div>`).join('')}</section>` : ''}
      <section class="card" style="gap:0;padding:6px 16px"><div class="section-head" style="padding:10px 0 4px"><h2 style="font-size:16px">Inscritos e frequência</h2><span style="font-size:12px;color:var(--muted2)">mínimo ${minFreq(t)}%</span></div>
        ${ativos.length ? ativos.map(m => { const f = fq(m.aluno_id); const ok = f.n > 0 && f.pct >= minFreq(t); const pode = g && apto(t, f);
          return `<div class="person-row"><span class="avatar">${esc(iniciais(m.perfis.nome))}</span><div class="person-main"><b>${esc(m.perfis.nome)}</b><small>RA ${esc(m.perfis.ra)} · ${f.p} de ${f.n} aulas</small></div><span class="pill ${f.n ? (ok ? 'ok' : 'bad') : 'navy'}">${f.pct}%</span>${pode ? `<button class="light-btn" data-cert="${m.aluno_id}" aria-label="Baixar certificado" style="width:38px;height:38px;box-shadow:none;background:var(--gold-soft);color:var(--gold-deep)">${ic.seal()}</button>` : ''}${isAdmin() ? `<button class="light-btn" data-rem="${m.id}" aria-label="Remover inscrição" style="width:38px;height:38px;box-shadow:none;background:#F3F5F9;color:var(--muted2)">${ic.trash()}</button>` : ''}</div>`; }).join('') : '<div class="empty">Nenhum inscrito ainda.</div>'}
        ${g && t.fim && t.fim > hoje() && ativos.length ? `<p style="font-size:12px;color:var(--muted2);padding:6px 0 10px">Os certificados ficam disponíveis após o término, em ${br(t.fim)}.</p>` : ''}</section>
      <section class="card" style="gap:0;padding:6px 16px"><div class="section-head" style="padding:10px 0 4px"><h2 style="font-size:16px">Equipe do evento</h2>${g ? '<button class="link-gold" id="addEq">+ Adicionar</button>' : ''}</div>
        ${equipe.length ? equipe.map(e => `<div class="person-row"><span class="avatar">${esc(iniciais(e.perfis.nome))}</span><div class="person-main"><b>${esc(e.perfis.nome)}</b><small>${e.funcao === 'professor' ? 'Professor(a)' : 'Monitor(a)'} · RA ${esc(e.perfis.ra)}</small></div>${g ? `<button class="light-btn" data-req="${e.perfil_id}" aria-label="Remover da equipe" style="width:38px;height:38px;box-shadow:none;background:#F3F5F9;color:var(--muted2)">${ic.x(12, 3)}</button>` : ''}</div>`).join('') : `<div class="empty">${g ? 'Adicione professores e monitores que farão a chamada neste evento.' : 'Nenhuma equipe atribuída.'}</div>`}</section>
      ${recus.length && g ? `<section class="card" style="gap:0;padding:6px 16px"><div class="section-head" style="padding:10px 0 4px"><h2 style="font-size:16px">Recusados</h2></div>${recus.map(m => `<div class="person-row"><span class="avatar absent">${esc(iniciais(m.perfis.nome))}</span><div class="person-main"><b>${esc(m.perfis.nome)}</b><small>RA ${esc(m.perfis.ra)}</small></div><button class="btn btn-sm btn-outline" data-ap="${m.id}">Aprovar</button></div>`).join('')}</section>` : ''}
    </div>`, tab);
  const upd = async (mid, status) => { const { error } = await sb.from('matriculas').update({ status }).eq('id', mid); if (error) return toast(erro(error)); toast(status === 'ativa' ? 'Inscrição aprovada.' : 'Inscrição recusada.'); pgGEvento(id); };
  app.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => upd(b.dataset.ap, 'ativa'));
  app.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => upd(b.dataset.rc, 'recusada'));
  app.querySelectorAll('[data-rem]').forEach(b => b.onclick = async () => { if (b.dataset.c !== '1') { b.dataset.c = '1'; toast('Toque de novo para remover a inscrição.'); return; } const { error } = await sb.from('matriculas').delete().eq('id', b.dataset.rem); if (error) return toast(erro(error)); toast('Inscrição removida.'); pgGEvento(id); });
  app.querySelectorAll('[data-req]').forEach(b => b.onclick = async () => { const { error } = await sb.from('evento_equipe').delete().eq('turma_id', id).eq('perfil_id', b.dataset.req); if (error) return toast(erro(error)); toast('Removido da equipe.'); pgGEvento(id); });
  app.querySelectorAll('[data-cert]').forEach(b => b.onclick = () => { const m = ativos.find(x => x.aluno_id === b.dataset.cert); const f = fq(m.aluno_id); baixar(certificado(t, m.perfis, f.pct, dep), `Certificado - ${t.nome} - ${m.perfis.nome}.pdf`); });
  const add = document.getElementById('addEq');
  if (add) add.onclick = async () => {
    const staff = await q(sb.from('perfis').select('id,nome,ra,papel').in('papel', ['professor', 'monitor']).order('nome'));
    const ja = new Set(equipe.map(e => e.perfil_id)); const disp = staff.filter(s => !ja.has(s.id));
    abrirSheet(`<h2>Adicionar à equipe</h2><p style="font-size:13px;color:var(--muted)">Aparecem professores e monitores. Para incluir outra pessoa, primeiro dê a ela o nível de professor ou monitor em Pessoas e acessos.</p>
      ${disp.length ? `<div>${disp.map(s => `<div class="person-row"><span class="avatar">${esc(iniciais(s.nome))}</span><div class="person-main"><b>${esc(s.nome)}</b><small>${PAPEL[s.papel]} · RA ${esc(s.ra)}</small></div><button class="btn btn-sm btn-navy" data-add="${s.id}" data-f="${s.papel}">Adicionar</button></div>`).join('')}</div>` : '<div class="empty">Ninguém disponível.</div>'}`, sh => {
      sh.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { const { error } = await sb.from('evento_equipe').insert({ turma_id: id, perfil_id: b.dataset.add, funcao: b.dataset.f === 'professor' ? 'professor' : 'monitor' }); if (error) return toast(erro(error)); fecharSheet(); toast('Adicionado à equipe.'); pgGEvento(id); });
    });
  };
}
function sigRow(s = { nome: '', funcao: '' }) { return `<div class="sig"><div class="sig-head"><span>Assinatura</span><button type="button" class="link-gold" data-rmsig style="color:var(--bad);font-size:12px;letter-spacing:0;text-transform:none">Remover</button></div><label class="field">Nome<span class="input-wrap" style="background:#fff"><input name="sigNome" value="${esc(s.nome)}" placeholder="Ex.: Pr. João Silva"></span></label><label class="field">Função<span class="input-wrap" style="background:#fff"><input name="sigFuncao" value="${esc(s.funcao)}" placeholder="Ex.: Diretor do SALT"></span></label></div>`; }
async function pgFormEvento(id) {
  if (!isGestao()) return ir('inicio');
  loading('gestao');
  const dl = await deps();
  let t = { nome: '', descricao: '', carga_horaria: '', inicio: '', fim: '', local: '', requer_aprovacao: false, inscricoes_abertas: true, frequencia_minima: 75, departamento_id: '', assinaturas: [{ nome: '', funcao: 'Coordenação' }, { nome: '', funcao: 'Direção do SALT' }] };
  if (id) { const r = await q(sb.from('turmas').select('*').eq('id', id).maybeSingle()); if (!r) return ir('gestao'); t = r; }
  const st = { aprov: !!t.requer_aprovacao, abertas: !!t.inscricoes_abertas, cat: t.categoria || 'salt' };
  app.innerHTML = screen(`${topbar(id ? 'gevento/' + id : 'gestao')}<div style="padding:22px 22px 0"><h1 style="font-size:27px;font-weight:800;color:var(--navy-800)">${id ? 'Editar evento' : 'Novo evento'}</h1></div>
    <form class="content pad" id="f" novalidate style="gap:14px">
      <section class="card form">
        <label class="field">Nome do evento<span class="input-wrap"><input name="nome" required value="${esc(t.nome)}" placeholder="Ex.: Liderança e Gestão Eclesiástica"></span></label>
        <label class="field">Departamento responsável<span class="input-wrap"><select name="departamento_id" required><option value="">Selecione</option>${dl.map(d => `<option value="${d.id}" ${d.id === t.departamento_id ? 'selected' : ''}>${esc(d.nome)}</option>`).join('')}</select></span></label>
        <label class="field">Descrição (opcional)<span class="input-wrap ta"><textarea name="descricao" style="min-height:90px">${esc(t.descricao)}</textarea></span></label>
        <div class="grid2"><label class="field">Carga horária (h)<span class="input-wrap"><input name="carga_horaria" type="number" min="1" required value="${esc(t.carga_horaria)}"></span></label><label class="field">Frequência mín. (%)<span class="input-wrap"><input name="frequencia_minima" type="number" min="1" max="100" required value="${esc(t.frequencia_minima)}"></span></label></div>
        <div class="grid2"><label class="field">Início<span class="input-wrap"><input name="inicio" type="date" required value="${esc(t.inicio)}"></span></label><label class="field">Término<span class="input-wrap"><input name="fim" type="date" required value="${esc(t.fim)}"></span></label></div>
        <label class="field">Local<span class="input-wrap"><input name="local" value="${esc(t.local)}" placeholder="Ex.: Auditório principal"></span></label>
      </section>
      <section class="card"><b style="font-size:14px;color:var(--navy-800)">Categoria no calendário</b><div class="chips" id="cat">${Object.entries(CAT).map(([k, [l, c]]) => `<button type="button" class="chip ${k === st.cat ? 'active' : ''}" data-v="${k}"><i class="${c}" style="width:8px;height:8px;border-radius:50%;display:inline-block"></i>${l}</button>`).join('')}</div><span style="font-size:12px;color:var(--muted2)">O evento aparece automaticamente no calendário do SALT, do início ao término.</span></section>
      <section class="card"><b style="font-size:14px;color:var(--navy-800)">Como o aluno entra no evento?</b>
        <label class="radio-card ${!st.aprov ? 'on' : ''}"><input type="radio" name="aprov" value="0" ${!st.aprov ? 'checked' : ''}><span><b>Inscrição imediata</b><small>O aluno se inscreve e já fica inscrito.</small></span></label>
        <label class="radio-card ${st.aprov ? 'on' : ''}"><input type="radio" name="aprov" value="1" ${st.aprov ? 'checked' : ''}><span><b>Precisa de aprovação</b><small>A secretaria ou o administrador aprova cada inscrição.</small></span></label>
        <div class="switch-row" style="padding-top:6px"><div><b>Inscrições abertas</b><small>Aparece para os alunos se inscreverem</small></div><button type="button" class="switch" id="sAb" role="switch" aria-checked="${st.abertas}" aria-label="Inscrições abertas"></button></div>
      </section>
      <section class="card"><b style="font-size:14px;color:var(--navy-800)">Assinaturas do certificado</b><div id="sigs" style="display:flex;flex-direction:column;gap:10px">${(t.assinaturas || []).map(sigRow).join('')}</div>
        <button type="button" class="link-gold" id="addSig" style="align-self:flex-start">${ic.plus()} Adicionar assinatura</button><span style="font-size:12px;color:var(--muted2)">Até ${MAXSIG} pessoas, cada uma com nome e função.</span></section>
      <button class="btn btn-gold btn-block" type="submit">${id ? 'Salvar alterações' : 'Criar evento'}</button>
      ${id && isAdmin() ? `<button type="button" class="btn btn-danger btn-block" id="delEv">${ic.trash()} Apagar evento</button>` : ''}
    </form>`, 'gestao', { light: true });
  const f = document.getElementById('f'), box = document.getElementById('sigs');
  f.querySelectorAll('input[name=aprov]').forEach(r => r.onchange = () => { st.aprov = r.value === '1'; f.querySelectorAll('.radio-card').forEach(c => c.classList.toggle('on', c.querySelector('input').checked)); });
  f.querySelectorAll('#cat .chip').forEach(c => c.onclick = () => { st.cat = c.dataset.v; f.querySelectorAll('#cat .chip').forEach(y => y.classList.toggle('active', y === c)); });
  const sab = document.getElementById('sAb'); sab.onclick = () => { st.abertas = !st.abertas; sab.setAttribute('aria-checked', String(st.abertas)); };
  document.getElementById('addSig').onclick = () => { if (box.children.length >= MAXSIG) return toast(`Máximo de ${MAXSIG} assinaturas.`); box.insertAdjacentHTML('beforeend', sigRow()); };
  box.onclick = e => { const b = e.target.closest('[data-rmsig]'); if (b) b.closest('.sig').remove(); };
  f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f); const ns = fd.getAll('sigNome'), fs = fd.getAll('sigFuncao');
    const d = { nome: String(fd.get('nome')).trim(), departamento_id: fd.get('departamento_id') || null, descricao: String(fd.get('descricao')).trim() || null, carga_horaria: Number(fd.get('carga_horaria')), frequencia_minima: Number(fd.get('frequencia_minima')), inicio: fd.get('inicio') || null, fim: fd.get('fim') || null, local: String(fd.get('local')).trim() || null, requer_aprovacao: st.aprov, inscricoes_abertas: st.abertas, categoria: st.cat,
      assinaturas: ns.map((n, i) => ({ nome: String(n).trim(), funcao: String(fs[i] || '').trim() })).filter(s => s.nome || s.funcao).slice(0, MAXSIG) };
    if (!d.nome) return toast('Informe o nome do evento.'); if (!d.departamento_id) return toast('Escolha o departamento responsável.');
    if (!d.carga_horaria) return toast('Informe a carga horária.'); if (!d.inicio || !d.fim) return toast('Informe o início e o término.');
    if (d.fim < d.inicio) return toast('O término precisa ser depois do início.');
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    const r = id ? await sb.from('turmas').update(d).eq('id', id).select().single() : await sb.from('turmas').insert(d).select().single();
    b.disabled = false; if (r.error) return toast(erro(r.error));
    toast(id ? 'Evento atualizado.' : 'Evento criado.'); ir('gevento/' + r.data.id);
  };
  const del = document.getElementById('delEv'); if (del) del.onclick = async () => { if (del.dataset.c !== '1') { del.dataset.c = '1'; del.textContent = 'Toque de novo para apagar (inscrições e presenças também serão apagadas)'; return; } const { error } = await sb.from('turmas').delete().eq('id', id); if (error) return toast(erro(error)); toast('Evento apagado.'); ir('gestao'); };
}

/* ================= PESSOAS (admin) ================= */
async function pgPessoas() {
  if (!isAdmin()) return ir('inicio');
  loading('gestao');
  const equipe = await q(sb.from('perfis').select('id,nome,ra,semestre,papel').neq('papel', 'aluno').order('nome'));
  const ordem = ['admin', 'secretario', 'professor', 'monitor'];
  app.innerHTML = screen(`${hero({ back: 'gestao', eyebrow: 'Administração', title: 'Pessoas e acessos', sub: 'Busque pelo nome ou RA para definir o nível de acesso.' })}
    <div class="content pad">
      <span class="input-wrap" style="background:#fff;box-shadow:var(--shadow-soft)">${ic.search()}<input id="busca" placeholder="Nome ou RA" autocomplete="off"></span>
      <div id="res"></div>
      <section class="section" id="eq"><div class="section-head"><h2>Equipe atual</h2><span style="font-size:13px;color:var(--muted2)">${equipe.length}</span></div>
        ${ordem.map(p => { const l = equipe.filter(x => x.papel === p); return l.length ? `<div class="card" style="gap:0;padding:4px 16px"><span class="group-label" style="padding:12px 0 4px">${PAPEL[p]}${p === 'admin' ? ` · ${l.length}/2` : ''}</span>${l.map(x => linhaPessoa(x)).join('')}</div>` : ''; }).join('') || '<div class="card empty">Ainda não há equipe definida.</div>'}
      </section></div>`, 'gestao');
  let tm; document.getElementById('busca').oninput = e => { clearTimeout(tm); tm = setTimeout(async () => {
    const v = e.target.value.trim().replace(/[,%()*\\]/g, ''); const res = document.getElementById('res');
    if (v.length < 2) { res.innerHTML = ''; return; }
    const r = await sb.from('perfis').select('id,nome,ra,semestre,papel').or(`nome.ilike.%${v}%,ra.ilike.%${v}%`).order('nome').limit(30);
    res.innerHTML = r.error ? `<div class="banner err">${esc(erro(r.error))}</div>` : `<div class="card" style="gap:0;padding:4px 16px">${r.data.length ? r.data.map(x => linhaPessoa(x)).join('') : '<div class="empty">Ninguém encontrado.</div>'}</div>`;
  }, 300); };
}
const linhaPessoa = x => `<a class="person-row" href="#pessoa/${x.id}" style="text-decoration:none;color:inherit"><span class="avatar">${esc(iniciais(x.nome))}</span><div class="person-main"><b>${esc(x.nome)}</b><small>RA ${esc(x.ra)} · ${x.semestre}º sem.</small></div><span class="pill ${x.papel === 'aluno' ? 'navy' : 'gold'}">${PAPEL[x.papel]}</span>${ic.chev()}</a>`;
async function pgPessoa(id) {
  if (!isAdmin()) return ir('inicio');
  loading('gestao');
  const [p, resp, dl] = await Promise.all([q(sb.from('perfis').select('*').eq('id', id).maybeSingle()), q(sb.from('departamento_responsaveis').select('*').eq('perfil_id', id)), deps()]);
  if (!p) return ir('pessoas');
  const depsProf = dl.filter(d => d.chave !== 'secretaria');
  const st = { papel: p.papel };
  const desc = { admin: 'Acesso total. Define os níveis de acesso e os departamentos. Máximo de 2.', secretario: 'Cria eventos, aprova inscrições, cadastra datas no calendário, vê a frequência e emite certificados. Publica avisos como Secretaria do Seminário.', professor: 'Vê os eventos atribuídos, abre aulas, faz chamada e acompanha a frequência. Publica avisos pelos departamentos que coordena.', monitor: 'Faz a chamada nos eventos atribuídos a ele.', aluno: 'Acesso padrão de todo cadastro.' };
  app.innerHTML = screen(`${topbar('pessoas')}
    <div style="padding:22px 22px 0;display:flex;align-items:center;gap:14px"><span class="avatar" style="width:56px;height:56px;font-size:18px">${esc(iniciais(p.nome))}</span><div style="min-width:0"><h1 style="font-size:22px;font-weight:800;color:var(--navy-800);overflow-wrap:anywhere">${esc(p.nome)}</h1><span style="font-size:13px;color:var(--muted)">RA ${esc(p.ra)} · ${semTxt(p.semestre)} · ${esc(p.email)}</span></div></div>
    <form class="content pad" id="f" style="gap:14px">
      <section class="card"><b style="font-size:14px;color:var(--navy-800)">Nível de acesso</b>
        ${['admin', 'secretario', 'professor', 'monitor', 'aluno'].map(k => `<label class="radio-card ${st.papel === k ? 'on' : ''}"><input type="radio" name="papel" value="${k}" ${st.papel === k ? 'checked' : ''} ${p.id === S.perfil.id ? 'disabled' : ''}><span><b>${PAPEL[k]}</b><small>${desc[k]}</small></span></label>`).join('')}
        ${p.id === S.perfil.id ? '<span style="font-size:12px;color:var(--muted2)">Você não pode alterar o seu próprio nível.</span>' : ''}
      </section>
      <section class="card" id="depBox" ${st.papel === 'professor' ? '' : 'hidden'}><b style="font-size:14px;color:var(--navy-800)">Departamentos que coordena</b><span style="font-size:12.5px;color:var(--muted)">Os avisos deste professor saem assinados com o nome dele e o departamento escolhido.</span>
        <div>${depsProf.map(d => { const r = resp.find(x => x.departamento_id === d.id); return `<div class="check-row"><input type="checkbox" id="dp_${d.id}" data-dep="${d.id}" ${r ? 'checked' : ''}><label for="dp_${d.id}" style="flex:1;font-size:14px;font-weight:600;cursor:pointer">${esc(d.nome)}</label><span class="input-wrap" style="min-height:38px;padding:0 10px;width:150px;flex:none"><select data-cargo="${d.id}" style="height:36px;font-size:13px">${['Coordenador(a)', 'Diretor(a)', 'Responsável'].map(c => `<option ${r && r.cargo === c ? 'selected' : ''}>${c}</option>`).join('')}</select></span></div>`; }).join('')}</div>
      </section>
      ${p.id !== S.perfil.id ? '<button class="btn btn-gold btn-block" type="submit">Salvar acesso</button>' : ''}
    </form>`, 'gestao', { light: true });
  const f = document.getElementById('f');
  f.querySelectorAll('input[name=papel]').forEach(r => r.onchange = () => { st.papel = r.value; f.querySelectorAll('.radio-card').forEach(c => c.classList.toggle('on', c.querySelector('input').checked)); document.getElementById('depBox').hidden = st.papel !== 'professor'; });
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    const { error } = await sb.rpc('definir_papel', { p_ra: p.ra, p_papel: st.papel });
    if (error) { b.disabled = false; return toast(erro(error)); }
    if (st.papel === 'professor') {
      const sel = [...f.querySelectorAll('[data-dep]')].filter(c => c.checked).map(c => ({ departamento_id: c.dataset.dep, perfil_id: p.id, cargo: f.querySelector(`[data-cargo="${c.dataset.dep}"]`).value }));
      const manter = new Set(sel.map(s => s.departamento_id));
      const remover = resp.filter(r => !manter.has(r.departamento_id) && depsProf.some(d => d.id === r.departamento_id));
      for (const r of remover) await sb.from('departamento_responsaveis').delete().eq('perfil_id', p.id).eq('departamento_id', r.departamento_id);
      if (sel.length) { const { error: e2 } = await sb.from('departamento_responsaveis').upsert(sel, { onConflict: 'departamento_id,perfil_id' }); if (e2) { b.disabled = false; return toast(erro(e2)); } }
    }
    b.disabled = false; toast(`${primeiroNome(p.nome)} agora é ${PAPEL[st.papel].toLowerCase()}.`); ir('pessoas');
  };
}
async function pgDepartamentos() {
  if (!isAdmin()) return ir('inicio');
  loading('gestao');
  const [dl, resp] = await Promise.all([q(sb.from('departamentos').select('*').order('nome')), q(sb.from('departamento_responsaveis').select('departamento_id,perfil_id,cargo,perfis(nome,papel)'))]);
  app.innerHTML = screen(`${hero({ back: 'gestao', eyebrow: 'Administração', title: 'Departamentos', sub: 'Toque em um departamento para definir quem responde por ele.' })}
    <div class="content pad"><section class="section">${dl.map(d => { const r = resp.filter(x => x.departamento_id === d.id);
      return `<button class="row-card" data-dep="${d.id}" style="align-items:flex-start;padding:14px 16px"><span class="icon-tile ${d.chave === 'secretaria' ? 'gold' : ''}">${ic.dept()}</span><div class="row-main"><span class="row-title">${esc(d.nome)}</span><span class="row-sub">${r.length ? r.map(x => `${esc(x.perfis.nome)} · ${esc(x.cargo)}`).join('<br>') : 'Sem responsável definido'}</span></div>${ic.chev()}</button>`; }).join('')}</section>
      <form class="card" id="f"><b style="font-size:14px;color:var(--navy-800)">Novo departamento</b><span class="input-wrap"><input id="nm" placeholder="Nome do departamento"></span><button class="btn btn-navy btn-sm" style="align-self:flex-start">Adicionar</button></form></div>`, 'gestao');
  document.getElementById('f').onsubmit = async e => { e.preventDefault(); const v = document.getElementById('nm').value.trim(); if (!v) return; const { error } = await sb.from('departamentos').insert({ nome: v }); if (error) return toast(erro(error)); S.deps = null; toast('Departamento criado.'); pgDepartamentos(); };
  app.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => abrirDep(dl.find(d => d.id === b.dataset.dep), resp.filter(x => x.departamento_id === b.dataset.dep)));
}
function abrirDep(d, resp) {
  const sec = d.chave === 'secretaria';
  const cargos = sec ? ['Secretário(a)'] : ['Coordenador(a)', 'Diretor(a)', 'Responsável'];
  abrirSheet(`<h2 style="font-size:19px;font-weight:800;color:var(--navy-800)">${esc(d.nome)}</h2>
    <div><span class="group-label">Responsáveis</span>${resp.length ? resp.map(r => `<div class="person-row"><span class="avatar">${esc(iniciais(r.perfis.nome))}</span><div class="person-main"><b>${esc(r.perfis.nome)}</b><small>${esc(r.cargo)}</small></div><button class="light-btn" data-rm="${r.perfil_id}" aria-label="Remover" style="width:38px;height:38px;box-shadow:none;background:#F3F5F9;color:var(--muted2)">${ic.x(12, 3)}</button></div>`).join('') : '<div class="empty" style="padding:12px 0">Ninguém atribuído ainda.</div>'}</div>
    <div style="display:flex;flex-direction:column;gap:10px"><span class="group-label">Atribuir pessoa</span>
      <span class="input-wrap">${ic.search()}<input id="bq" placeholder="Buscar por nome ou RA" autocomplete="off"></span>
      <span class="input-wrap"><select id="cg">${cargos.map(c => `<option>${c}</option>`).join('')}</select></span>
      <div id="res"></div>
      <span style="font-size:12px;color:var(--muted2)">${sec ? 'Quem for atribuído aqui passa a ter o acesso de Secretário(a).' : 'Se a pessoa for aluno ou monitor, ela passa a ter o acesso de Professor(a), para poder publicar avisos por este departamento.'}</span></div>`, sh => {
    const ja = new Set(resp.map(r => r.perfil_id));
    sh.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const { error } = await sb.from('departamento_responsaveis').delete().eq('departamento_id', d.id).eq('perfil_id', b.dataset.rm); if (error) return toast(erro(error)); fecharSheet(); toast('Responsável removido.'); pgDepartamentos(); });
    let tm; sh.querySelector('#bq').oninput = e => { clearTimeout(tm); tm = setTimeout(async () => {
      const v = e.target.value.trim().replace(/[,%()*\\]/g, ''); const res = sh.querySelector('#res');
      if (v.length < 2) { res.innerHTML = ''; return; }
      const r = await sb.from('perfis').select('id,nome,ra,papel').or(`nome.ilike.%${v}%,ra.ilike.%${v}%`).order('nome').limit(20);
      if (r.error) { res.innerHTML = `<div class="banner err">${esc(erro(r.error))}</div>`; return; }
      const lista = r.data.filter(x => !ja.has(x.id));
      res.innerHTML = lista.length ? lista.map(x => `<div class="person-row"><span class="avatar">${esc(iniciais(x.nome))}</span><div class="person-main"><b>${esc(x.nome)}</b><small>${PAPEL[x.papel]}${x.papel === 'aluno' ? ' · RA ' + esc(x.ra) : ''}</small></div><button class="btn btn-sm btn-navy" data-add="${x.id}" data-ra="${esc(x.ra)}" data-papel="${x.papel}">Atribuir</button></div>`).join('') : '<div class="empty" style="padding:12px 0">Ninguém encontrado.</div>';
      res.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
        b.disabled = true; const papel = b.dataset.papel;
        const novo = sec ? (papel === 'admin' ? null : 'secretario') : (['aluno', 'monitor'].includes(papel) ? 'professor' : null);
        if (novo && novo !== papel) { const { error } = await sb.rpc('definir_papel', { p_ra: b.dataset.ra, p_papel: novo }); if (error) { b.disabled = false; return toast(erro(error)); } }
        const { error } = await sb.from('departamento_responsaveis').upsert({ departamento_id: d.id, perfil_id: b.dataset.add, cargo: sh.querySelector('#cg').value }, { onConflict: 'departamento_id,perfil_id' });
        if (error) { b.disabled = false; return toast(erro(error)); }
        fecharSheet(); toast('Responsável atribuído.'); pgDepartamentos();
      });
    }, 300); };
  });
}

/* ================= CONTA ================= */
async function pgConta() {
  const p = S.perfil;
  const sem = Array.from({ length: NSEM }, (_, i) => `<option value="${i + 1}" ${p.semestre === i + 1 ? 'selected' : ''}>${semTxt(i + 1)}</option>`).join('');
  let deptos = '';
  if (['professor', 'secretario'].includes(role())) { try { const r = await q(sb.from('departamento_responsaveis').select('cargo,departamentos(nome)').eq('perfil_id', p.id)); if (r.length) deptos = r.map(x => `${esc(x.cargo)} · ${esc(x.departamentos.nome)}`).join('<br>'); } catch (e) {} }
  app.innerHTML = screen(`${hero({ logo: true, extra: `<div style="display:flex;align-items:center;gap:14px;position:relative"><span class="avatar-btn" style="width:60px;height:60px"><span style="font-size:19px">${esc(iniciais(p.nome))}</span></span><div style="min-width:0"><h1 style="font-size:22px">${esc(p.nome)}</h1><span class="sub">${ehAluno(p) ? `RA ${esc(p.ra)} · ${semTxt(p.semestre)}` : PAPEL[role()]}</span></div></div>` })}
    <div class="content pad">
      <button class="row-card" id="qr"><span class="icon-tile">${ic.scan()}</span><div class="row-main"><span class="row-title">Meu QR Code</span><span class="row-sub">Abrir credencial em tela cheia</span></div>${ic.chev()}</button>
      ${deptos ? `<div class="card"><b style="font-size:14px;color:var(--navy-800)">Departamentos</b><span style="font-size:13px;color:var(--muted);line-height:1.6">${deptos}</span></div>` : ''}
      <form class="card form" id="f"><b style="font-size:14px;color:var(--navy-800)">Meus dados</b>
        <label class="field">Nome completo<span class="input-wrap">${ic.person()}<input name="nome" required minlength="3" value="${esc(p.nome)}"></span><span class="hint">É o nome que sai nos certificados.</span></label>
        ${ehAluno(p) ? `<label class="field">Semestre atual<span class="input-wrap">${ic.cap()}<select name="semestre">${sem}</select></span></label>` : ''}
        <span style="font-size:12.5px;color:var(--muted)">E-mail: <b>${esc(p.email)}</b>${ehAluno(p) ? ` · RA: <b>${esc(p.ra)}</b>` : ''}</span>
        <button class="btn btn-navy btn-sm" style="align-self:flex-start">Salvar</button></form>
      ${instalarHtml()}
      <button class="btn btn-danger btn-block" id="sair">Sair da conta</button>
      <p style="text-align:center;font-size:11.5px;color:var(--muted2)">SALT-FAAMA · Seminário em Missão</p>
    </div>`, 'conta');
  ligarInstalar();
  document.getElementById('qr').onclick = abrirQR;
  const f = document.getElementById('f');
  f.onsubmit = async e => { e.preventDefault(); const nome = f.nome.value.trim().replace(/\s+/g, ' '), semestre = f.semestre ? Number(f.semestre.value) : p.semestre; if (nome.length < 3) return toast('Informe o nome completo.');
    const { error } = await sb.from('perfis').update({ nome, semestre }).eq('id', p.id); if (error) return toast(erro(error)); S.perfil = { ...p, nome, semestre }; toast('Dados salvos.'); pgConta(); };
  document.getElementById('sair').onclick = async () => { await sb.auth.signOut(); S.auth = 'welcome'; location.hash = ''; };
}

/* ================= CERTIFICADO ================= */
function certificado(t, aluno, pct, dep) {
  const { jsPDF } = window.jspdf; const d = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, navy = [11, 36, 67], gold = [176, 138, 58], ink = [14, 27, 44], cinza = [95, 108, 123];
  d.setDrawColor(...navy); d.setLineWidth(1.6); d.rect(10, 10, W - 20, 190);
  d.setDrawColor(...gold); d.setLineWidth(.4); d.rect(14, 14, W - 28, 182);
  d.setTextColor(...navy); d.setFont('helvetica', 'bold'); d.setFontSize(10);
  d.text('SEMINÁRIO ADVENTISTA LATINO-AMERICANO DE TEOLOGIA · SALT', W / 2, 30, { align: 'center', charSpace: .6 });
  d.setFont('helvetica', 'normal'); d.text('FACULDADE ADVENTISTA DA AMAZÔNIA · FAAMA', W / 2, 36, { align: 'center', charSpace: .6 });
  d.setDrawColor(...gold); d.setLineWidth(.6); d.line(W / 2 - 20, 42, W / 2 + 20, 42);
  d.setFont('times', 'bold'); d.setFontSize(40); d.text('CERTIFICADO', W / 2, 62, { align: 'center', charSpace: 2 });
  d.setTextColor(...ink); d.setFont('times', 'normal'); d.setFontSize(15); d.text('Certificamos que', W / 2, 78, { align: 'center' });
  d.setFont('times', 'bolditalic'); d.setFontSize(28); d.setTextColor(...navy); d.text(aluno.nome, W / 2, 93, { align: 'center', maxWidth: W - 60 });
  d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(...cinza); d.text(`RA ${aluno.ra}`, W / 2, 99, { align: 'center' });
  d.setFont('times', 'normal'); d.setFontSize(15); d.setTextColor(...ink);
  const corpo = `participou do evento ${t.nome}${dep ? `, promovido pelo(a) ${dep}` : ''}, realizado de ${br(t.inicio)} a ${br(t.fim)}, com carga horária de ${t.carga_horaria} horas, tendo obtido frequência de ${pct}%.`;
  d.text(d.splitTextToSize(corpo, W - 80), W / 2, 110, { align: 'center', lineHeightFactor: 1.5 });
  d.text(`${t.local ? t.local + ', ' : ''}${extenso(t.fim && t.fim <= hoje() ? t.fim : hoje())}.`, W / 2, 140, { align: 'center' });
  const sigs = (t.assinaturas || []).filter(s => s.nome || s.funcao);
  if (sigs.length) { const x0 = 30, slot = (W - 60) / sigs.length, len = Math.min(78, slot - 12);
    sigs.forEach((s, i) => { const cx = x0 + slot * (i + .5); d.setDrawColor(...ink); d.setLineWidth(.3); d.line(cx - len / 2, 166, cx + len / 2, 166);
      d.setTextColor(...ink); d.setFont('helvetica', 'bold'); d.setFontSize(sigs.length > 3 ? 9 : 10); const nl = d.splitTextToSize(s.nome || ' ', slot - 6).slice(0, 2); d.text(nl, cx, 172, { align: 'center' });
      d.setFont('helvetica', 'normal'); d.setFontSize(sigs.length > 3 ? 8 : 9); d.setTextColor(...cinza); d.text(d.splitTextToSize(s.funcao || '', slot - 6).slice(0, 2), cx, 172 + nl.length * 4.4, { align: 'center' }); }); }
  d.setTextColor(...gold); d.setFontSize(8); d.text(`Registro: ${t.id.slice(0, 8).toUpperCase()}-${aluno.ra}`, W / 2, 192, { align: 'center' });
  return d.output('blob');
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
