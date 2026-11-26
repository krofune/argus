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
    if (preview()) return toast("샘플·조회 화면은 계정에 저장할 수 없습니다", true);
    var st = store.getState();
    var name = (st.businessOverview && st.businessOverview.projectName) || curName || "";
    if (asNew || !curId) {
      name = prompt("저장할 이름", name || "이름 없는 검토");
      if (name === null) return;
    }
    var data = JSON.parse(file.serializeProject(pick(st)));
    var row = { name: name || "이름 없는 검토", kind: "분양형", data: data, updated_at: new Date().toISOString() };
    var q = (!asNew && curId) ? sb.from("fs_projects").update(row).eq("id", curId).select("id,name").single()
      : sb.from("fs_projects").insert(row).select("id,name").single();
    var r = await q;
    if (r.error) return toast(needTable(r.error), true);
    curId = r.data.id; curName = r.data.name; savedSig = sig(); dirty = false; remember(); paint();
    toast("계정에 저장했습니다");
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
    $("#fsc-list").onclick = function (e) { var b = e.target.closest("[data-id]"); if (b) open(b.dataset.id); };
    document.addEventListener("click", function (e) { if (!e.target.closest(".fsc-lw")) $("#fsc-list").classList.remove("on"); });
    paint();
  }
  window.ArgusFSCloud = { init: init };
})();
