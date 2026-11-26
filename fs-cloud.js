/* Argus F/S 검토 — 회원 계정 저장 막대 (원본에 없는 Argus 기능)
 * Supabase fs_projects 테이블(본인·워크스페이스 멤버)에 저장한다. 탭마다 따로 동작한다.
 *  - 사업수지(suzy.land 원본): serializeProject 파일 형식 그대로, kind '분양형'
 *  - 재무모델링(모델터 원본, iframe fm-app.html): 모델터 스냅샷(wsSnapshot) 그대로 data.fm 에, kind '재무모델 · 오피스 매입' 등
 * 원본의 브라우저 임시저장은 그대로 두고, 계정 저장은 '저장' 버튼을 눌렀을 때만 한다.
 */
(function () {
  "use strict";
  var L, store, file, sb, myId = null;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var LOGIN = "로그인 후 사용할 수 있습니다";
  // 탭별 문서 상태
  var DOC = { su: { id: null, name: "", own: true, dirty: false, saved: "" }, fm: { id: null, name: "", own: true, dirty: false, saved: "" } };
  function mode() { return document.body.classList.contains("fs-fm") ? "fm" : "su"; }
  function D() { return DOC[mode()]; }

  // ── 사업수지 어댑터
  function pick(st) { return { businessOverview: st.businessOverview, saleTypes: st.saleTypes, salePlans: st.salePlans, expenseInput: st.expenseInput, otherIncomeItems: st.otherIncomeItems }; }
  var SU = {
    sig: function () { try { return JSON.stringify(pick(store.getState())); } catch (e) { return ""; } },
    preview: function () { try { return L(2101).getActiveSlot() === "sample-preview" ? file.getPreviewKind() : null; } catch (e) { return null; } },
    started: function () { return !SU.preview() && store.getState().hasStartedProject; },
    data: function () { return JSON.parse(file.serializeProject(pick(store.getState()))); },
    kind: function () { return "분양형"; },
    name: function () { var bo = store.getState().businessOverview || {}; return bo.projectName || ""; },
    apply: function (data) {
      var p = file.parseProjectFile(JSON.stringify(data));
      if (!p.ok) throw new Error(p.error);
      try { if (SU.preview()) file.exitSampleMode(); } catch (e) {}
      store.getState().loadProject(p.data);
      window.ArgusFSHost.push("/input/business-overview");
    },
    reset: function () { return Promise.resolve(SU.preview() ? L(56599).exitSampleMode() : null).then(function () { store.getState().resetProject(); window.ArgusFSHost.push("/input/business-overview"); }); }
  };

  // ── 재무모델링(모델터) 어댑터 — 같은 사이트 안 iframe 이라 원본 함수(wsSnapshot·wsApplySnapshot 등)를 그대로 부른다
  function W() { var f = $("#fmf"); return f && f.contentWindow; }
  function fmReady() { var w = W(); return !!(w && typeof w.wsSnapshot === "function" && typeof w.wsApplySnapshot === "function"); }
  function whenFm() {
    if (location.hash.indexOf("#/fm") !== 0) location.hash = "#/fm";
    return new Promise(function (ok, no) { var n = 0; (function t() { if (fmReady()) return ok(W()); if (++n > 150) return no(new Error("재무모델링 화면을 불러오지 못했습니다")); setTimeout(t, 100); })(); });
  }
  var FM = {
    snap: function () { return W().wsSnapshot(); },
    sig: function () { try { return fmReady() ? JSON.stringify(FM.snap()) : ""; } catch (e) { return ""; } },
    preview: function () { return null; },
    started: function () { return true; },
    data: function () { return { fm: FM.snap() }; },
    label: function () { try { return W().eval("DEALS[cur].label"); } catch (e) { return ""; } },
    kind: function () { return "재무모델 · " + (FM.label() || "딜"); },
    name: function () { try { return (FM.snap().s.asset || "").trim(); } catch (e) { return ""; } },
    apply: function (data) {
      var w = W(), s = data && data.fm && w.JSON.parse(JSON.stringify(data.fm));   // 화면(iframe) 쪽 객체로 바꿔서 원본 검사 통과
      if (!s || !w.wsValidSnapshot(s)) throw new Error("재무모델 입력 형식이 아닙니다");
      w.wsApplySnapshot(s);
    },
    reset: function () {
      W().eval("WS={dealId:null,versionId:null,savedHash:null};window.rrModel=null;window.rrState=null;scenOn=false;scenState={};" +
        "state={};stackState={};refiState={};exampleKeys=new Set();exUserEdited=false;srcTags={};depth='standard';" +
        "try{refreshSlotSel()}catch(e){}renderTabs();renderForm();restoreInputs();update();window.scrollTo(0,0);");
      return Promise.resolve();
    }
  };
  function A() { return mode() === "fm" ? FM : SU; }

  function toast(msg, bad) {
    var t = $("#fsc-toast"); t.textContent = msg; t.className = "fsc-toast on" + (bad ? " bad" : "");
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = "fsc-toast"; }, 2600);
  }
  function remember() { try { localStorage.setItem("argus.fs.current", JSON.stringify({ id: DOC.su.id, name: DOC.su.name })); localStorage.setItem("argus.fm.current", JSON.stringify({ id: DOC.fm.id, name: DOC.fm.name })); } catch (e) {} }
  function paint() {
    var a = A(), d = D(), fm = mode() === "fm", pv = a.preview();
    $("#fsc-name").innerHTML = pv ? '<span class="fsc-pv">' + (pv === "file" ? "조회 중인 파일" : "샘플") + " — 저장하면 내 검토로 복사</span>"
      : d.id ? esc(d.name || "이름 없는 검토") + (d.dirty ? ' <span class="fsc-dirty">● 저장 안 됨</span>' : ' <span class="fsc-ok">계정에 저장됨</span>')
      : '<span class="fsc-tmp">브라우저 임시저장</span>' + (fm || (a.sig() && store.getState().hasStartedProject) ? ' <span class="fsc-dirty">계정에 아직 저장 안 됨</span>' : "");
    ["#fsc-save", "#fsc-saveas"].forEach(function (s) { $(s).disabled = false; });
    $("#fsc-del").style.display = d.id && !pv && d.own ? "" : "none";
    $("#fsc-ws").style.display = "";
    $("#fsc-fmenu").innerHTML = fm
      ? '<button class="fsc-li" data-f="fmload"><b>파일 불러오기</b><span>Argus 백업 파일(.argus)을 열어 이어서 작업</span></button><button class="fsc-li" data-f="fmexport"><b>파일 내보내기</b><span>지금 입력을 백업 파일(.argus)로 받기</span></button>'
      : '<button class="fsc-li" data-f="load"><b>파일 불러오기</b><span>내보낸 .json 파일을 열어 이어서 작업</span></button><button class="fsc-li" data-f="view"><b>파일 조회</b><span>읽기 전용으로 결과만 보기 (지금 입력값은 그대로)</span></button>';
  }
  function track() { var d = D(); if (d.id && !A().preview()) { var was = d.dirty; d.dirty = A().sig() !== d.saved; if (was !== d.dirty) paint(); } }
  function needTable(err) {
    var m = String((err && (err.message || err.hint || err.code)) || err);
    if (/fs_projects|relation|does not exist|PGRST205|42P01/.test(m)) return "계정 저장 테이블이 아직 없습니다. Supabase SQL Editor에서 supabase/schema.sql 을 한 번 실행해 주세요.";
    return "저장 오류: " + m.slice(0, 160);
  }

  async function save(asNew) {
    var a = A(), d = D();
    if (mode() === "fm" && !fmReady()) { toast("재무모델링 화면을 불러오는 중입니다", true); return false; }
    var pv = a.preview();                       // 샘플·조회 중이면: 그 내용을 내 검토로 새로 저장하고 그 검토로 전환
    if (pv) {
      asNew = true;
      if ((!d.id || d.dirty) && !confirm("샘플을 내 검토로 저장하면, 이 브라우저에 임시저장된 사업수지 작업(계정에 저장 안 된 내용)은 샘플 내용으로 바뀝니다. 계속할까요?")) return false;
    }
    var name = a.name() || d.name || "";
    if (asNew || !d.id) { name = prompt(pv ? "샘플을 내 검토로 저장합니다. 저장할 이름" : "저장할 이름", name || "이름 없는 검토"); if (name === null) return false; }
    var row = { name: name || "이름 없는 검토", kind: a.kind(), data: a.data(), updated_at: new Date().toISOString() };
    var r = await ((!asNew && d.id) ? sb.from("fs_projects").update(row).eq("id", d.id).select("id,name").single()
      : sb.from("fs_projects").insert(row).select("id,name").single());
    if (r.error) { toast(needTable(r.error), true); return false; }
    if (pv) { try { await L(56599).exitSampleMode(); } catch (e) {} var pp = file.parseProjectFile(JSON.stringify(row.data)); if (pp.ok) store.getState().loadProject(pp.data); }
    if (asNew || !d.id) d.own = true;
    d.id = r.data.id; d.name = r.data.name; d.saved = a.sig(); d.dirty = false; remember(); paint();
    toast(pv ? "샘플을 '" + d.name + "'(으)로 계정에 저장했습니다 — 이제 내 검토로 수정할 수 있습니다" : "계정에 저장했습니다");
    return true;
  }

  async function list() {
    var box = $("#fsc-list");
    if (box.classList.contains("on")) { box.classList.remove("on"); return; }
    box.innerHTML = '<div class="fsc-li note">불러오는 중…</div>'; box.classList.add("on");
    var r = await sb.from("fs_projects").select("id,name,kind,updated_at,user_id").order("updated_at", { ascending: false }).limit(200);
    if (r.error) { box.innerHTML = '<div class="fsc-li note">' + esc(needTable(r.error)) + "</div>"; return; }
    if (!r.data.length) { box.innerHTML = '<div class="fsc-li note">계정에 저장된 검토가 없습니다. 입력 후 [계정에 저장]을 눌러 주세요.</div>'; return; }
    box.innerHTML = r.data.map(function (p) {
      return '<button class="fsc-li" data-id="' + p.id + '"><b>' + esc(p.name) + '</b><span>' + (myId && p.user_id !== myId ? "공유받음 · " : "") + esc(p.kind) + " · " + new Date(p.updated_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) + "</span></button>";
    }).join("");
  }

  // 검토 열기 — 저장된 종류에 맞는 탭(사업수지/재무모델링)으로 이동해서 연다
  async function open(id) {
    $("#fsc-list").classList.remove("on");
    var r = await sb.from("fs_projects").select("id,name,data,user_id,kind").eq("id", id).single();
    if (r.error) return toast(needTable(r.error), true);
    var isFm = !!(r.data.data && r.data.data.fm), m = isFm ? "fm" : "su", d = DOC[m];
    try {
      if (isFm) await whenFm(); else if (mode() === "fm") location.hash = "#/input/business-overview";
    } catch (e) { return toast(e.message, true); }
    var a = isFm ? FM : SU;
    if (a.started() && (d.dirty || !d.id) && d.id !== r.data.id && !confirm((isFm ? "재무모델링" : "사업수지") + " 화면의 지금 입력값을 '" + r.data.name + "'(으)로 바꿀까요? 저장하지 않은 내용은 사라집니다.")) return;
    try { a.apply(r.data.data); } catch (e) { return toast("불러오기 실패: " + e.message, true); }
    d.own = !myId || r.data.user_id === myId;
    d.id = r.data.id; d.name = r.data.name; d.dirty = false; remember();
    setTimeout(function () { d.saved = a.sig(); paint(); }, 300);
    toast("'" + d.name + "'을(를) 열었습니다");
  }

  async function del() {
    var d = D();
    if (!d.id || !confirm("'" + d.name + "'을(를) 계정에서 삭제할까요? 되돌릴 수 없습니다. (지금 화면의 입력값은 그대로 남습니다)")) return;
    var r = await sb.from("fs_projects").delete().eq("id", d.id);
    if (r.error) return toast(needTable(r.error), true);
    toast("'" + d.name + "'을(를) 삭제했습니다");
    d.id = null; d.name = ""; remember(); paint();
  }

  // ── 새로 만들기: 저장된 검토는 바로 새로(이전 검토는 내 F/S 목록에 그대로), 저장 안 된 변경은 저장/버리기/취소 선택
  function startNew(msg) {
    var d = D();
    A().reset().then(function () {
      d.own = true; d.id = null; d.name = ""; d.saved = ""; d.dirty = false; remember(); paint(); toast(msg || "새 검토를 시작했습니다");
    });
  }
  function ask(cb) {
    var d = D(), m = document.createElement("div"); m.className = "fsc-modal";
    m.innerHTML = '<div class="box"><b>새 검토 만들기</b><p>' + (d.id ? "'" + esc(d.name) + "'에 저장하지 않은 변경이 있습니다." : "지금 작업이 아직 계정에 저장되지 않았습니다.") +
      '</p><div class="act"><button data-a="cancel">취소</button><button data-a="discard">저장하지 않고 새로 만들기</button><button class="pri" data-a="save">저장하고 새로 만들기</button></div></div>';
    m.onclick = function (e) { var b = e.target.closest("[data-a]"); if (!b && e.target !== m) return; m.remove(); cb(b ? b.dataset.a : "cancel"); };
    document.body.appendChild(m); m.querySelector(".pri").focus();
  }
  function newProject() {
    var a = A(), d = D();
    if (mode() === "fm" && !fmReady()) return toast("재무모델링 화면을 불러오는 중입니다", true);
    if (a.preview() || !a.started() || (d.id && !d.dirty))
      return startNew(d.id ? "새 검토를 시작했습니다 — '" + d.name + "'은(는) 내 F/S 목록에 있습니다" : null);
    ask(function (x) {
      if (x === "discard") startNew();
      else if (x === "save") save(false).then(function (ok) { if (ok) startNew("저장하고 새 검토를 시작했습니다 — 이전 검토는 내 F/S 목록에 있습니다"); });
    });
  }

  // ── 파일 (사업수지: .json 불러오기·조회 / 재무모델링: .modelter 불러오기·내보내기)
  function pickFile(accept, cb) {
    var f = document.createElement("input"); f.type = "file"; f.accept = accept;
    f.onchange = function () { var x = f.files && f.files[0]; if (x) x.text().then(cb); };
    f.click();
  }
  function loadFile() {
    pickFile(".json,application/json", function (text) {
      var p = file.parseProjectFile(text);
      if (!p.ok) return toast("불러오기 실패: " + p.error, true);
      if (SU.started() && !confirm("지금 화면의 입력값을 불러온 파일로 바꿀까요? 되돌릴 수 없습니다.")) return;
      Promise.resolve(SU.preview() ? L(56599).exitSampleMode() : null).then(function () {
        store.getState().loadProject(p.data); DOC.su.id = null; DOC.su.name = ""; remember(); paint();
        window.ArgusFSHost.push("/input/business-overview"); toast("파일을 불러왔습니다 — 계정에 저장하려면 [계정에 저장]");
      });
    });
  }
  function viewFile() {
    pickFile(".json,application/json", function (text) {
      L(56599).enterFilePreviewMode(text).then(function (r) {
        if (!r.ok) return toast("조회 실패: " + r.error, true);
        paint(); window.ArgusFSHost.push("/output/summary");
      });
    });
  }
  function fmLoad() {
    pickFile(".argus,.modelter,.json,application/json", function (text) {
      var o, v;
      try { o = JSON.parse(text); } catch (e) { return toast("Argus 백업 파일이 아닙니다", true); }
      if (!o || o.fileType !== "MODELTER_DEAL_EXPORT" || !o.deal || !Array.isArray(o.deal.versions) || !o.deal.versions.length) return toast("Argus 백업(.argus) 파일이 아닙니다", true);
      v = o.deal.versions.filter(function (x) { return x.id === o.deal.currentVersionId; })[0] || o.deal.versions[o.deal.versions.length - 1];
      if (DOC.fm.dirty && !confirm("지금 화면의 입력값을 불러온 파일로 바꿀까요? 저장하지 않은 내용은 사라집니다.")) return;
      try { FM.apply({ fm: v.snap }); } catch (e) { return toast("불러오기 실패: " + e.message, true); }
      DOC.fm.id = null; DOC.fm.name = ""; remember(); paint(); toast("'" + (o.deal.name || "딜") + "'을(를) 불러왔습니다 — 계정에 저장하려면 [계정에 저장]");
    });
  }
  function fmExport() { try { W().wsExportCurrent(); } catch (e) { toast("내보내기 실패: " + e.message, true); } }
  function sample() {
    if (mode() === "fm") {
      if (!fmReady()) return;
      if (DOC.fm.dirty && !confirm("예시값으로 바꿀까요? 저장하지 않은 입력은 사라집니다.")) return;
      W().fillExample(); DOC.fm.id = null; DOC.fm.name = ""; remember(); paint(); return;
    }
    L(56599).enterSampleMode().then(function (r) {
      if (!r.ok) return toast("샘플을 불러오지 못했습니다: " + r.error, true);
      paint(); window.ArgusFSHost.push("/output/summary");
    });
  }

  // ── 재무모델링 화면 위 [저장 ↓] · [새창으로 보기] — 모델터 원본 버튼(엑셀·티저·IC 패키지)을 그대로 누른다
  function fmDownload(which) {
    var b = W() && W().document.getElementById(which);
    if (!b) return toast("내려받기 버튼을 찾지 못했습니다", true);
    b.click();
  }

  // ── 재무모델 비교: 원본 '딜 비교' 화면을 그대로 쓰되, 비교 대상을 원본 딜 보관함 대신 계정에 저장한 재무모델로 바꿔 넣는다
  async function fmCompare() {
    if (!sb) return toast(LOGIN, true);
    var w; try { w = await whenFm(); } catch (e) { return toast(e.message, true); }
    var r = await sb.from("fs_projects").select("id,name,kind,data,updated_at").like("kind", "재무모델%").order("updated_at", { ascending: false }).limit(30);
    if (r.error) return toast(needTable(r.error), true);
    var slots = {};
    r.data.forEach(function (p) {
      if (!p.data || !p.data.fm) return;
      var nm = p.name || "이름 없는 모델", k = nm, i = 2;
      while (slots[k]) k = nm + " (" + i++ + ")";
      try { var sn = w.JSON.parse(JSON.stringify(p.data.fm)); if (w.wsValidSnapshot(sn)) slots[k] = sn; } catch (e) {}
    });
    if (!Object.keys(slots).length) toast("계정에 저장한 재무모델이 없습니다 — [계정에 저장] 후 비교할 수 있습니다", true);
    w.loadSlots = function () { return slots; };
    try { w.eval("CMP_SEL=null"); } catch (e) {}
    var b = w.document.getElementById("cmpOpen"); if (b) b.click();
  }

  // ── 워크스페이스에 추가: 계정에 저장된 검토를 워크스페이스 카드로 올림 (멤버가 열람·편집)
  function money(v) { return isFinite(v) ? Math.round(v / 1e5) / 1e3 + "억" : "–"; }   // 천원 → 억원
  function pct(v) { return v != null && isFinite(v) ? (v * 100).toFixed(2) + "%" : "–"; }
  async function toWs(ev) {
    var btn = ev.currentTarget, d = D(), card;
    if (!window.ARGUS_WS) return toast("워크스페이스 기능을 불러오지 못했습니다", true);
    if (!d.id || d.dirty) { if (!(await save(false))) return; }
    if (mode() === "fm") {
      var sn = FM.snap(), sm = {}; try { sm = W().wsSummary(sn) || {}; } catch (e) {}
      var price = sm.price != null ? sm.price * 1e6 : null;   // 모델터 매입가 단위: 백만원
      card = { title: d.name || FM.name() || "이름 없는 모델", land: null, amount: price,
        meta: { 유형: FM.kind(), 매입가: price ? Math.round(price / 1e8).toLocaleString() + "억" : "–", "Levered IRR": pct(sm.IRR), "Equity Multiple": sm.EM != null ? sm.EM.toFixed(2) + "x" : "–",
          "최소 DSCR": sm.minDSCR != null ? sm.minDSCR.toFixed(2) + "x" : "–", "Exit Cap": sm.exitCap != null ? pct(sm.exitCap > 1 ? sm.exitCap / 100 : sm.exitCap) : "–" },
        body: "<p>F/S 검토 · 재무모델링 (" + esc(FM.label()) + "). 워크스페이스 멤버는 아래 F/S 검토 링크로 열어 보고, 편집자는 수정·저장할 수 있습니다.</p>" };
    } else {
      var st = store.getState(), bo = st.businessOverview || {}, s2 = null;
      try { s2 = L(57101).runPipeline(st).summary.target; } catch (e) {}
      var meta = { 유형: "분양형 사업수지", 주용도: bo.mainUse || "", 대지면적: bo.landAreaSqm ? Math.round(bo.landAreaSqm).toLocaleString() + "㎡" : "",
        공사기간: bo.constructionPeriodMonths ? bo.constructionPeriodMonths + "개월" : "" };
      if (s2) { meta["수입 계"] = money(s2.totalRevenueThousand); meta["지출 계"] = money(s2.totalExpenseThousand);
        meta["이익(토지비 포함)"] = money(s2.profitIncludingLandThousand); meta["이익률"] = isFinite(s2.profitRateIncludingLand) ? (s2.profitRateIncludingLand * 100).toFixed(1) + "%" : "–"; }
      card = { title: d.name || bo.projectName || "이름 없는 검토", land: bo.landAreaSqm || null, amount: s2 && isFinite(s2.totalRevenueThousand) ? s2.totalRevenueThousand * 1000 : null, meta: meta,
        body: "<p>F/S 검토 · 사업수지 (분양형). 워크스페이스 멤버는 아래 F/S 검토 링크로 열어 보고, 편집자는 수정·저장할 수 있습니다.</p>" };
    }
    window.ARGUS_WS.pick(btn, Object.assign({ kind: "fs", ref: "FS:" + d.id, board: "F/S 검토", org: "", orgUrl: "", loc: "", bldg: null,
      posted: new Date().toISOString().slice(0, 10), end: "", links: [{ t: "F/S 검토 - " + (mode() === "fm" ? "재무모델링" : "사업수지") + ": " + card.title, u: "fs.html?open=" + d.id }] }, card));
  }

  function init() {
    L = window.ArgusFS.load; store = L(2101).useProjectStore; file = L(4486);
    sb = window.ArgusAuth && window.ArgusAuth.client ? window.ArgusAuth.client() : null;
    try { var c = JSON.parse(localStorage.getItem("argus.fs.current") || "{}"); DOC.su.id = c.id || null; DOC.su.name = c.name || ""; } catch (e) {}
    try { var c2 = JSON.parse(localStorage.getItem("argus.fm.current") || "{}"); DOC.fm.id = c2.id || null; DOC.fm.name = c2.name || ""; } catch (e) {}
    DOC.su.saved = DOC.su.id ? SU.sig() : "";
    store.subscribe(function () { if (DOC.su.id && !SU.preview()) DOC.su.dirty = SU.sig() !== DOC.su.saved; if (mode() === "su") paint(); });
    try { L(2101).useSlotStore.subscribe(function () { paint(); }); } catch (e) {}
    // 재무모델링: 모델터는 변경 알림이 없어 1.5초마다 비교 (처음 열 때 저장본 기준값을 잡음)
    var fmBase = false;
    setInterval(function () { if (!fmReady()) return; if (!fmBase) { fmBase = true; if (DOC.fm.id) DOC.fm.saved = FM.sig(); } if (mode() === "fm") track(); }, 1500);
    window.addEventListener("hashchange", function () { setTimeout(paint, 0); });
    var guard = function (fn) { return function (e) { sb ? fn(e) : toast(LOGIN, true); }; };
    $("#fsc-open").onclick = guard(list);
    $("#fsc-save").onclick = guard(function () { save(false); });
    $("#fsc-saveas").onclick = guard(function () { save(true); });
    $("#fsc-del").onclick = del;
    $("#fsc-new").onclick = newProject;
    $("#fsc-ws").onclick = guard(toWs);
    $("#fsc-sample").onclick = sample;
    $("#fsc-file").onclick = function () { $("#fsc-fmenu").classList.toggle("on"); };
    $("#fsc-fmenu").onclick = function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return; $("#fsc-fmenu").classList.remove("on");
      ({ load: loadFile, view: viewFile, fmload: fmLoad, fmexport: fmExport })[b.dataset.f]();
    };
    $("#fsc-list").onclick = function (e) { var b = e.target.closest("[data-id]"); if (b) open(b.dataset.id); };
    var dl = $("#fmt-dl"), dm = $("#fmt-dmenu");
    if (dl) {
      dl.onclick = function () { dm.classList.toggle("on"); };
      dm.onclick = function (e) { var b = e.target.closest("[data-d]"); if (!b) return; dm.classList.remove("on"); fmDownload(b.dataset.d); };
      var nt = $("#fmt-note"), nm = $("#fmt-nmenu"); nt.onclick = function () { nm.classList.toggle("on"); dm.classList.remove("on"); };
      $("#fmt-cmp").onclick = fmCompare;
      $("#fmt-pop").onclick = function () { window.open("fm-app.html?v=" + (window.ArgusFMVer || ""), "argus-fm", "width=1440,height=900"); };
    }
    document.addEventListener("click", function (e) { if (!e.target.closest(".fsc-lw")) { $("#fsc-list").classList.remove("on"); $("#fsc-fmenu").classList.remove("on"); if (dm) dm.classList.remove("on"); if ($("#fmt-nmenu")) $("#fmt-nmenu").classList.remove("on"); } });
    paint();
    if (sb) sb.auth.getSession().then(function (x) { myId = x.data.session && x.data.session.user.id; paint(); });
    var o = new URLSearchParams(location.search).get("open");   // 워크스페이스 카드의 [F/S 검토 열기]
    if (o && sb) { history.replaceState(null, "", location.pathname + location.hash); setTimeout(function () { open(o); }, 300); }
  }
  window.ArgusFSCloud = { init: init };
})();
