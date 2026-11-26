/* Argus F/S 검토 — 회원 계정 저장 막대 (원본에 없는 Argus 기능)
 * Supabase fs_projects 테이블(본인만 읽기·쓰기)에 원본 파일 형식(serializeProject) 그대로 저장한다.
 * 원본의 브라우저 임시저장은 그대로 두고, 계정 저장은 '저장' 버튼을 눌렀을 때만 한다.
 */
(function () {
  "use strict";
  var L, store, file, sb, curId = null, curName = "", dirty = false, savedSig = "";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var KEY = "argus.fs.current";

  function pick(st) { return { businessOverview: st.businessOverview, saleTypes: st.saleTypes, salePlans: st.salePlans, expenseInput: st.expenseInput, otherIncomeItems: st.otherIncomeItems }; }
  function sig() { try { return JSON.stringify(pick(store.getState())); } catch (e) { return ""; } }
  function preview() { try { return L(2101).getActiveSlot() === "sample-preview" ? file.getPreviewKind() : null; } catch (e) { return null; } }
  function toast(msg, bad) {
    var t = $("#fsc-toast"); t.textContent = msg; t.className = "fsc-toast on" + (bad ? " bad" : "");
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = "fsc-toast"; }, 2600);
  }
  function remember() { try { localStorage.setItem(KEY, JSON.stringify({ id: curId, name: curName })); } catch (e) {} }
  function paint() {
    var pv = preview();
    $("#fsc-name").innerHTML = pv ? '<span class="fsc-pv">' + (pv === "file" ? "조회 중인 파일" : "샘플") + " — 계정 저장 불가</span>"
      : curId ? esc(curName || "이름 없는 검토") + (dirty ? ' <span class="fsc-dirty">● 저장 안 됨</span>' : ' <span class="fsc-ok">계정에 저장됨</span>')
      : '<span class="fsc-tmp">브라우저 임시저장</span>' + (sig() && store.getState().hasStartedProject ? ' <span class="fsc-dirty">계정에 아직 저장 안 됨</span>' : "");
    ["#fsc-save", "#fsc-saveas"].forEach(function (s) { $(s).disabled = !!pv; });
    $("#fsc-del").style.display = curId && !pv ? "" : "none";
  }
  function needTable(err) {
    var m = String((err && (err.message || err.hint || err.code)) || err);
    if (/fs_projects|relation|does not exist|PGRST205|42P01/.test(m)) return "계정 저장 테이블이 아직 없습니다. Supabase SQL Editor에서 supabase/schema.sql 을 한 번 실행해 주세요.";
    return "저장 오류: " + m.slice(0, 160);
  }

  async function save(asNew) {
    if (preview()) { toast("샘플·조회 화면은 계정에 저장할 수 없습니다", true); return false; }
    var st = store.getState();
    var name = (st.businessOverview && st.businessOverview.projectName) || curName || "";
    if (asNew || !curId) {
      name = prompt("저장할 이름", name || "이름 없는 검토");
      if (name === null) return false;
    }
    var data = JSON.parse(file.serializeProject(pick(st)));
    var row = { name: name || "이름 없는 검토", kind: "분양형", data: data, updated_at: new Date().toISOString() };
    var q = (!asNew && curId) ? sb.from("fs_projects").update(row).eq("id", curId).select("id,name").single()
      : sb.from("fs_projects").insert(row).select("id,name").single();
    var r = await q;
    if (r.error) { toast(needTable(r.error), true); return false; }
    curId = r.data.id; curName = r.data.name; savedSig = sig(); dirty = false; remember(); paint();
    toast("계정에 저장했습니다");
    return true;
  }

  async function list() {
    var box = $("#fsc-list");
    if (box.classList.contains("on")) { box.classList.remove("on"); return; }
    box.innerHTML = '<div class="fsc-li note">불러오는 중…</div>'; box.classList.add("on");
    var r = await sb.from("fs_projects").select("id,name,kind,updated_at").order("updated_at", { ascending: false }).limit(200);
    if (r.error) { box.innerHTML = '<div class="fsc-li note">' + esc(needTable(r.error)) + "</div>"; return; }
    if (!r.data.length) { box.innerHTML = '<div class="fsc-li note">계정에 저장된 검토가 없습니다. 입력 후 [계정에 저장]을 눌러 주세요.</div>'; return; }
    box.innerHTML = r.data.map(function (p) {
      return '<button class="fsc-li" data-id="' + p.id + '"><b>' + esc(p.name) + '</b><span>' + esc(p.kind) + " · " + new Date(p.updated_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) + "</span></button>";
    }).join("");
  }

  async function open(id) {
    $("#fsc-list").classList.remove("on");
    if (store.getState().hasStartedProject && (dirty || !curId) && !confirm("지금 화면의 입력값을 계정에 저장된 검토로 바꿀까요? 저장하지 않은 내용은 사라집니다.")) return;
    var r = await sb.from("fs_projects").select("id,name,data").eq("id", id).single();
    if (r.error) return toast(needTable(r.error), true);
    var p = file.parseProjectFile(JSON.stringify(r.data.data));
    if (!p.ok) return toast("불러오기 실패: " + p.error, true);
    try { if (preview()) file.exitSampleMode(); } catch (e) {}
    store.getState().loadProject(p.data);
    curId = r.data.id; curName = r.data.name; savedSig = sig(); dirty = false; remember(); paint();
    window.ArgusFSHost.push("/input/business-overview");
    toast("'" + curName + "'을(를) 열었습니다");
  }

  async function del() {
    if (!curId || !confirm("'" + curName + "'을(를) 계정에서 삭제할까요? 되돌릴 수 없습니다. (지금 화면의 입력값은 그대로 남습니다)")) return;
    var r = await sb.from("fs_projects").delete().eq("id", curId);
    if (r.error) return toast(needTable(r.error), true);
    toast("'" + curName + "'을(를) 삭제했습니다");
    curId = null; curName = ""; remember(); paint();
  }

  // ── 원본 첫 화면에 있던 기능 (새로 만들기 · 파일 불러오기/조회 · 샘플 보기)
  function S() { return L(56599); }
  function started() { return !preview() && store.getState().hasStartedProject; }
  // 새로 만들기: 지금 검토가 계정에 저장돼 있으면 바로 새로 시작(이전 검토는 내 F/S 목록에 그대로),
  // 저장 안 된 변경이 있으면 [저장하고 새로 만들기 / 저장하지 않고 새로 만들기 / 취소] 중 선택
  function startNew(msg) {
    Promise.resolve(preview() ? S().exitSampleMode() : null).then(function () {
      store.getState().resetProject(); curId = null; curName = ""; savedSig = ""; dirty = false; remember(); paint();
      window.ArgusFSHost.push("/input/business-overview"); toast(msg || "새 검토를 시작했습니다");
    });
  }
  function ask(cb) {
    var m = document.createElement("div"); m.className = "fsc-modal";
    m.innerHTML = '<div class="box"><b>새 검토 만들기</b><p>' + (curId ? "'" + esc(curName) + "'에 저장하지 않은 변경이 있습니다." : "지금 작업이 아직 계정에 저장되지 않았습니다.") +
      '</p><div class="act"><button data-a="cancel">취소</button><button data-a="discard">저장하지 않고 새로 만들기</button><button class="pri" data-a="save">저장하고 새로 만들기</button></div></div>';
    m.onclick = function (e) { var b = e.target.closest("[data-a]"); if (!b && e.target !== m) return; m.remove(); cb(b ? b.dataset.a : "cancel"); };
    document.body.appendChild(m); m.querySelector(".pri").focus();
  }
  function newProject() {
    if (preview() || !store.getState().hasStartedProject || (curId && !dirty))
      return startNew(curId ? "새 검토를 시작했습니다 — '" + curName + "'은(는) 내 F/S 목록에 있습니다" : null);
    ask(function (a) {
      if (a === "discard") startNew();
      else if (a === "save") save(false).then(function (ok) { if (ok) startNew("저장하고 새 검토를 시작했습니다 — 이전 검토는 내 F/S 목록에 있습니다"); });
    });
  }
  function pickFile(cb) {
    var f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
    f.onchange = function () { var x = f.files && f.files[0]; if (x) x.text().then(cb); };
    f.click();
  }
  function loadFile() {
    pickFile(function (text) {
      var p = file.parseProjectFile(text);
      if (!p.ok) return toast("불러오기 실패: " + p.error, true);
      if (started() && !confirm("지금 화면의 입력값을 불러온 파일로 바꿀까요? 되돌릴 수 없습니다.")) return;
      Promise.resolve(preview() ? S().exitSampleMode() : null).then(function () {
        store.getState().loadProject(p.data); curId = null; curName = ""; remember(); paint();
        window.ArgusFSHost.push("/input/business-overview"); toast("파일을 불러왔습니다 — 계정에 저장하려면 [계정에 저장]");
      });
    });
  }
  function viewFile() {
    pickFile(function (text) {
      S().enterFilePreviewMode(text).then(function (r) {
        if (!r.ok) return toast("조회 실패: " + r.error, true);
        paint(); window.ArgusFSHost.push("/output/summary");
      });
    });
  }
  function sample() {
    S().enterSampleMode().then(function (r) {
      if (!r.ok) return toast("샘플을 불러오지 못했습니다: " + r.error, true);
      paint(); window.ArgusFSHost.push("/output/summary");
    });
  }

  function init() {
    L = window.ArgusFS.load; store = L(2101).useProjectStore; file = L(4486);
    sb = window.ArgusAuth && window.ArgusAuth.client ? window.ArgusAuth.client() : null;
    try { var c = JSON.parse(localStorage.getItem(KEY) || "{}"); curId = c.id || null; curName = c.name || ""; } catch (e) {}
    savedSig = curId ? sig() : "";
    store.subscribe(function () { if (curId && !preview()) dirty = sig() !== savedSig; paint(); });
    try { L(2101).useSlotStore.subscribe(function () { paint(); }); } catch (e) {}
    window.addEventListener("hashchange", paint);
    $("#fsc-open").onclick = function () { sb ? list() : toast("로그인 후 사용할 수 있습니다", true); };
    $("#fsc-save").onclick = function () { sb ? save(false) : toast("로그인 후 사용할 수 있습니다", true); };
    $("#fsc-saveas").onclick = function () { sb ? save(true) : toast("로그인 후 사용할 수 있습니다", true); };
    $("#fsc-del").onclick = del;
    $("#fsc-new").onclick = newProject;
    $("#fsc-sample").onclick = sample;
    $("#fsc-file").onclick = function () { $("#fsc-fmenu").classList.toggle("on"); };
    $("#fsc-fmenu").onclick = function (e) { var b = e.target.closest("[data-f]"); if (!b) return; $("#fsc-fmenu").classList.remove("on"); b.dataset.f === "load" ? loadFile() : viewFile(); };
    $("#fsc-list").onclick = function (e) { var b = e.target.closest("[data-id]"); if (b) open(b.dataset.id); };
    document.addEventListener("click", function (e) { if (!e.target.closest(".fsc-lw")) { $("#fsc-list").classList.remove("on"); $("#fsc-fmenu").classList.remove("on"); } });
    paint();
  }
  window.ArgusFSCloud = { init: init };
})();
