"use strict";

const KEY = "pomolog.v1";
// 凌晨 4 点切日：按自然日切会把 00:30 的番茄算进第二天，周统计就错位
const DAY_CUT = 4 * 3600 * 1000;

const SUBJECTS = [
  { k: "english", n: "英语" },
  { k: "math",    n: "高数" },
  { k: "other",   n: "其他" }
];

const PRESETS = [
  { k: "english", min: 35, label: "英语 35" },
  { k: "math",    min: 50, label: "高数 50" },
  { k: "other",   min: 25, label: "通用 25" },
  { sep: true },
  { k: "rest",    min: 5,  label: "短休 5" },
  { k: "rest",    min: 10, label: "长休 10" }
];

const $ = id => document.getElementById(id);

/* ================= 数据层 ================= */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.log)) {
      raw.mins = raw.mins || {};
      return raw;
    }
  } catch (e) { /* 数据坏了就重来，不阻塞使用 */ }
  return { log: [], subject: "english", mins: { english: 35, math: 50, other: 25 }, lastExport: 0 };
}

let db = load();

// 数据在不在，必须让他知道。file:// 在部分浏览器上会禁掉 localStorage，
// 静默失败等于记账记在空气里 —— 宁可弹一条黄条，也不要让他两周后才发现是空的
let storageOK = true;

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { storageOK = false; }
}

function probeStorage() {
  try {
    localStorage.setItem(KEY + ".probe", "1");
    localStorage.removeItem(KEY + ".probe");
  } catch (e) { storageOK = false; }
  if (!storageOK) {
    const w = document.createElement("div");
    w.className = "warn";
    w.textContent = "这个浏览器不允许本页面使用本地存储，记录只在本次打开有效。建议用 Chrome 打开这个文件，或者每结束一个番茄点一次「导出 CSV」。";
    document.querySelector(".wrap").prepend(w);
  }
}

function dkey(ms) {
  const d = new Date(ms - DAY_CUT);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

function hhmm(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function subjName(k) {
  const s = SUBJECTS.find(x => x.k === k);
  return s ? s.n : k;
}

/* ================= 计时状态 ================= */

const T = {
  kind: "focus",     // focus | rest
  state: "idle",     // idle | running | paused
  totalSec: 35 * 60,
  leftMs: 35 * 60 * 1000,
  endAt: 0,          // running 时的绝对结束时刻（关掉页面也能恢复）
  startedAt: 0       // 本轮真实开始时刻，记账用
};

function plannedSec() {
  if (T.kind === "rest") return T.totalSec;
  return (db.mins[db.subject] || 25) * 60;
}

function syncTotal() {
  if (T.state !== "idle") return;
  T.totalSec = plannedSec();
  T.leftMs = T.totalSec * 1000;
}

/* ================= 渲染 ================= */

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

function renderTimer() {
  let left = T.leftMs;
  if (T.state === "running") left = Math.max(0, T.endAt - Date.now());

  const txt = fmt(left);
  $("clock").textContent = txt;
  $("barFill").style.width = (100 - (left / (T.totalSec * 1000)) * 100).toFixed(2) + "%";

  const kindWord = T.kind === "focus" ? "专注" : "休息";
  const stateWord = T.state === "running" ? "进行中" : T.state === "paused" ? "已暂停" : "未开始";
  const who = T.kind === "focus" ? subjName(db.subject) : "";
  $("status").innerHTML = kindWord + (who ? " · " + who : "") + " · <b>" + stateWord + "</b>";

  const btn = $("btnMain");
  btn.textContent = T.state === "running" ? "暂停" : T.state === "paused" ? "继续" : "开始";
  $("btnDrop").disabled = T.state === "idle";
  $("btnDrop").textContent = T.kind === "rest" ? "结束休息" : "放弃";

  // 标签页标题跟着倒计时走：钉在浏览器里扫一眼 tab 就知道还剩多久
  if (T.state === "idle") document.title = "番茄账";
  else document.title = txt + " · " + (T.kind === "focus" ? (who || "专注") : "休息");

  document.body.dataset.kind = T.kind;
}

function renderSubjects() {
  const box = $("subjects");
  box.innerHTML = "";
  SUBJECTS.forEach(s => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = s.n;
    b.setAttribute("aria-pressed", String(db.subject === s.k));
    b.onclick = () => {
      if (T.state !== "idle") return;
      db.subject = s.k;
      persist();
      syncTotal();
      renderSubjects();
      renderPresets();
      renderTimer();
    };
    box.appendChild(b);
  });
}

function renderPresets() {
  const box = $("presets");
  box.innerHTML = "";
  PRESETS.forEach(p => {
    if (p.sep) {
      const s = document.createElement("i");
      s.className = "preset-sep";
      box.appendChild(s);
      return;
    }
    const b = document.createElement("button");
    b.className = "preset";
    b.textContent = p.label;
    const active = p.k === "rest"
      ? (T.kind === "rest" && T.totalSec === p.min * 60)
      : (T.kind === "focus" && db.subject === p.k && (db.mins[p.k] || 25) === p.min);
    b.setAttribute("aria-pressed", String(active));
    b.onclick = () => {
      if (T.state !== "idle") return;
      if (p.k === "rest") {
        T.kind = "rest"; T.totalSec = p.min * 60;
      } else {
        T.kind = "focus"; db.subject = p.k; db.mins[p.k] = p.min;
        T.totalSec = p.min * 60;
        persist();
      }
      T.leftMs = T.totalSec * 1000;
      renderSubjects(); renderPresets(); renderTimer();
    };
    box.appendChild(b);
  });

  const inp = document.createElement("input");
  inp.className = "custom";
  inp.type = "number";
  inp.min = "1"; inp.max = "180";
  inp.placeholder = "自定";
  inp.title = "自定义分钟数，回车生效";
  inp.onkeydown = e => {
    if (e.key !== "Enter") return;
    const v = parseInt(inp.value, 10);
    if (!(v > 0 && v <= 180)) return;
    if (T.state !== "idle") return;
    if (T.kind === "focus") db.mins[db.subject] = v;
    T.totalSec = v * 60;
    T.leftMs = T.totalSec * 1000;
    inp.value = "";
    persist(); renderPresets(); renderTimer();
  };
  box.appendChild(inp);
}

function todayLog() {
  const k = dkey(Date.now());
  return db.log.filter(r => dkey(r.t * 1000) === k);
}

function renderToday() {
  const rows = todayLog();
  const done = rows.filter(r => r.ok);
  const drop = rows.filter(r => !r.ok);
  const doneMin = done.reduce((a, r) => a + r.d, 0) / 60;
  const dropMin = drop.reduce((a, r) => a + r.d, 0) / 60;

  const bySub = {};
  SUBJECTS.forEach(s => bySub[s.k] = 0);
  done.forEach(r => { bySub[r.s] = (bySub[r.s] || 0) + r.d / 60; });

  const parts = [
    { n: done.length, l: "完成的番茄" },
    { n: Math.round(doneMin), l: "完成分钟" }
  ];
  SUBJECTS.forEach(s => {
    if (bySub[s.k] > 0) parts.push({ n: Math.round(bySub[s.k]), l: s.n + " 分钟" });
  });

  let html = parts.map(p =>
    '<div class="stat"><div class="n">' + p.n + '</div><div class="l">' + p.l + '</div></div>'
  ).join("");

  // 放弃的那部分单独列，不并进总数：混进去会让"今天学了多久"虚高，藏起来又是自欺
  if (dropMin > 0) {
    html += '<div class="stat drop"><div class="n">' + Math.round(dropMin) +
            '</div><div class="l">未完成分钟</div></div>';
  }
  $("today").innerHTML = html;
}

function renderWeek() {
  const box = $("week");
  box.innerHTML = "";
  const days = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const ms = now - i * 86400000;
    const k = dkey(ms);
    const min = db.log.filter(r => dkey(r.t * 1000) === k).reduce((a, r) => a + r.d, 0) / 60;
    days.push({ k, min, now: i === 0 });
  }
  const max = Math.max(1, ...days.map(d => d.min));
  const names = ["日", "一", "二", "三", "四", "五", "六"];

  days.forEach(d => {
    const col = document.createElement("div");
    col.className = "wcol";
    // 手写解析，不用 new Date("YYYY-MM-DD")：Safari 对无时区字符串的解析历史上有坑
    const dt = new Date(+d.k.slice(0, 4), +d.k.slice(5, 7) - 1, +d.k.slice(8, 10));

    const val = document.createElement("div");
    val.className = "wval";
    val.textContent = d.min > 0 ? Math.round(d.min) : "";

    const bar = document.createElement("div");
    bar.className = "wbar" + (d.min > 0 ? "" : " zero");
    if (d.min > 0) bar.style.height = Math.max(10, Math.round((d.min / max) * 60)) + "px";
    bar.title = d.k + " · " + Math.round(d.min) + " 分钟";

    const lab = document.createElement("div");
    lab.className = "wlab" + (d.now ? " now" : "");
    lab.textContent = names[dt.getDay()];

    col.appendChild(val); col.appendChild(bar); col.appendChild(lab);
    box.appendChild(col);
  });
}

let logFilter = "today";

function renderLog() {
  const box = $("logBody");
  box.innerHTML = "";
  let rows = logFilter === "today" ? todayLog() : db.log.slice();
  rows.sort((a, b) => b.t - a.t);

  if (!rows.length) {
    box.innerHTML = '<div class="empty">' +
      (logFilter === "today" ? "今天还没有记录。按空格开始第一个番茄。" : "还没有任何记录。") +
      '</div>';
    return;
  }

  rows.slice(0, 300).forEach(r => {
    const start = r.t * 1000;
    const end = start + r.d * 1000;
    const row = document.createElement("div");
    row.className = "row" + (r.ok ? "" : " bad");

    const tm = document.createElement("div");
    tm.className = "tm";
    tm.textContent = hhmm(start) + "–" + hhmm(end);

    const sj = document.createElement("div");
    sj.className = "sj";
    sj.textContent = subjName(r.s);

    const mn = document.createElement("div");
    mn.className = "mn";
    mn.textContent = Math.round(r.d / 60) + " 分";

    const nt = document.createElement("div");
    nt.className = "nt";
    const inp = document.createElement("input");
    inp.className = "note";
    inp.value = r.n || "";
    inp.placeholder = "补一句：这个番茄在做什么";
    inp.onchange = () => {
      const item = db.log.find(x => x.t === r.t);
      if (item) { item.n = inp.value.trim(); persist(); }
    };
    nt.appendChild(inp);

    row.appendChild(tm); row.appendChild(sj); row.appendChild(mn); row.appendChild(nt);
    box.appendChild(row);
  });
}

function renderAll() {
  renderSubjects(); renderPresets(); renderTimer();
  renderToday(); renderWeek(); renderLog();
  checkBackup();
}

function checkBackup() {
  if (db.log.length < 5) { $("backupHint").textContent = ""; return; }
  if (!db.lastExport) { $("backupHint").textContent = "还没导出过备份"; return; }
  const days = (Date.now() - db.lastExport) / 86400000;
  $("backupHint").textContent = days > 7 ? "距上次导出 " + Math.floor(days) + " 天，建议导一次" : "";
}

/* ================= 计时逻辑 ================= */

let raf = null;

function startTimer() {
  if (T.state === "running") return;
  if (T.state === "idle") T.startedAt = Date.now();
  T.endAt = Date.now() + T.leftMs;
  T.state = "running";
  renderTimer();
  loop();
}

function pauseTimer() {
  if (T.state !== "running") return;
  T.leftMs = Math.max(0, T.endAt - Date.now());
  T.state = "paused";
  stopLoop();
  renderTimer();
}

function stopLoop() {
  if (raf) { clearInterval(raf); raf = null; }
}

function loop() {
  stopLoop();
  raf = setInterval(() => {
    // 用绝对结束时刻计算，而不是递减：标签页被后台节流后仍能校准回来
    const left = T.endAt - Date.now();
    if (left <= 0) { complete(); return; }
    renderTimer();
  }, 200);
  renderTimer();
}

function complete() {
  stopLoop();
  T.leftMs = 0;
  renderTimer();

  if (T.kind === "focus") {
    // 走到这里说明 left 已经归零，计划时长 = 实际专注时长
    db.log.push({
      t: Math.floor(T.startedAt / 1000),
      d: T.totalSec,
      s: db.subject,
      ok: 1,
      n: ""
    });
    persist();
    beep("focus");
    flash();

    const todayDone = todayLog().filter(r => r.ok).length;
    const longBreak = todayDone % 4 === 0;
    T.kind = "rest";
    T.totalSec = (longBreak ? 10 : 5) * 60;
    T.leftMs = T.totalSec * 1000;
    T.state = "idle";
    T.startedAt = 0;
    // 休息自动开始：休息不需要意志力，自动进入才不会卡在"要不要休息"上
    startTimer();
  } else {
    beep("rest");
    flash();
    T.kind = "focus";
    T.totalSec = plannedSec();
    T.leftMs = T.totalSec * 1000;
    T.state = "idle";
    T.startedAt = 0;
  }

  renderAll();
}

function drop() {
  if (T.state === "idle") return;
  stopLoop();
  // 跑着的时候 leftMs 是旧值，先按绝对时刻校准，否则"放弃"会把时长算错
  if (T.state === "running") T.leftMs = Math.max(0, T.endAt - Date.now());

  if (T.kind === "focus") {
    const used = Math.round((T.totalSec * 1000 - T.leftMs) / 1000);
    if (used >= 60) {
      // 记成"放弃"而不是丢弃：数据要诚实，不然今天的账是假的
      db.log.push({ t: Math.floor(T.startedAt / 1000), d: used, s: db.subject, ok: 0, n: "" });
      persist();
    }
  }

  T.state = "idle";
  T.startedAt = 0;
  T.kind = "focus";
  T.totalSec = plannedSec();
  T.leftMs = T.totalSec * 1000;
  renderAll();
}

/* ================= 声音 / 反馈 ================= */

let actx = null;

function beep(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    // 专注结束用下行（放松），休息结束用上行（唤醒）
    const freqs = kind === "focus" ? [659.25, 493.88] : [523.25, 783.99];
    const now = actx.currentTime;
    freqs.forEach((f, i) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = now + i * 0.17;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + 0.9);
    });
  } catch (e) { /* 静音就静音，不因此中断计时 */ }
}

function flash() {
  document.body.classList.remove("flash");
  void document.body.offsetWidth;
  document.body.classList.add("flash");
  document.body.classList.add("ring");
  setTimeout(() => {
    document.body.classList.remove("flash");
    document.body.classList.remove("ring");
  }, 2400);
}

/* ================= 导出 ================= */

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv() {
  const rows = [["日期", "开始", "结束", "科目", "分钟", "状态", "备注"]];
  db.log.slice().sort((a, b) => a.t - b.t).forEach(r => {
    const start = r.t * 1000;
    rows.push([
      dkey(start), hhmm(start), hhmm(start + r.d * 1000),
      subjName(r.s), (r.d / 60).toFixed(0), r.ok ? "完成" : "放弃", r.n || ""
    ]);
  });
  // BOM：不加的话 Excel 会把中文读成乱码
  // 末尾补 CRLF：只有表头（零记录）时 join 不产生任何换行，
  // 而部分解析器读到没有终止符的最后一行会把它丢掉
  const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const name = "番茄账_" + dkey(Date.now()) + ".csv";

  db.lastExport = Date.now();
  persist();
  checkBackup();

  // 桌面端走原生写盘。WKWebView 不实现浏览器的下载流程，a[download] 会静默失败，
  // 而这个应用的立身之本就是"记录拿得走"，所以这条路必须存在。
  if (window.__TAURI__ && window.__TAURI__.core) {
    try {
      await window.__TAURI__.core.invoke("save_text", { filename: name, content: csv });
      flashLabel("btnCsv", "已存到下载目录");
      return;
    } catch (e) {
      // 落到浏览器下载，至少还有一条路，不吞掉本次导出
    }
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  flashLabel("btnCsv", "已导出");
}

function flashLabel(id, text) {
  const el = $(id);
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => { el.textContent = old; }, 2600);
}

async function copyAll() {
  const txt = JSON.stringify(db.log, null, 2);
  const ok = await tryCopy(txt);
  if (ok) {
    $("btnCopy").textContent = "已复制 " + db.log.length + " 条";
    setTimeout(() => { $("btnCopy").textContent = "复制全部数据"; }, 1800);
  } else {
    window.prompt("复制下面这段保存：", txt);
  }
}

async function tryCopy(txt) {
  // file:// 协议下 navigator.clipboard 常常不可用，用隐藏 textarea 兜底
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

/* ================= 事件 / 启动 ================= */

$("btnMain").onclick = () => {
  if (T.state === "running") pauseTimer(); else startTimer();
};
$("btnDrop").onclick = drop;
$("btnCsv").onclick = exportCsv;
$("btnCopy").onclick = copyAll;

$("tabToday").onclick = () => {
  logFilter = "today";
  $("tabToday").setAttribute("aria-pressed", "true");
  $("tabAll").setAttribute("aria-pressed", "false");
  renderLog();
};
$("tabAll").onclick = () => {
  logFilter = "all";
  $("tabToday").setAttribute("aria-pressed", "false");
  $("tabAll").setAttribute("aria-pressed", "true");
  renderLog();
};

document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (e.code === "Space") {
    e.preventDefault();
    if (T.state === "running") pauseTimer(); else startTimer();
  }
  if (e.key === "r" || e.key === "R") {
    if (T.state === "idle") return;
    drop();
  }
});

// 从后台切回来时立即校准一次，不等下一个 tick
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && T.state === "running") renderTimer();
});

// 启动时若发现上一次还有未结束的计时（比如误刷新），接着跑
(function boot() {
  probeStorage();
  syncTotal();
  renderAll();

  const raw = localStorage.getItem(KEY + ".pending");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && p.endAt > Date.now() && p.endAt - Date.now() <= p.totalSec * 1000) {
        T.kind = p.kind; T.totalSec = p.totalSec; T.startedAt = p.startedAt;
        T.leftMs = p.endAt - Date.now(); T.endAt = p.endAt; T.state = "running";
        loop();
        renderTimer();
      }
    } catch (e) {}
    localStorage.removeItem(KEY + ".pending");
  }
})();

// 记下正在跑的计时，刷新页面能接上
setInterval(() => {
  if (T.state === "running") {
    localStorage.setItem(KEY + ".pending", JSON.stringify({
      kind: T.kind, totalSec: T.totalSec, startedAt: T.startedAt, endAt: T.endAt
    }));
  } else {
    localStorage.removeItem(KEY + ".pending");
  }
}, 3000);
