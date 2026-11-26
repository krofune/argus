/* Argus F/S 검토 — 원본(suzy.land) 화면 모듈을 Argus 페이지 안에서 띄우는 틀.
 * - 해시 라우터: #/input/business-overview 처럼 원본 경로를 그대로 쓴다 (Next.js 라우터 대체).
 * - 새 창(부가세 상세 등): 원본이 여는 '/경로'를 이 페이지의 '#/경로'로 바꿔 연다.
 * - PDF 한글 글꼴: 원본 서버(/api/korean-font) 대신 Argus에 둔 글꼴(fs-fonts.json)을 쓴다.
 * - 저장: 원본처럼 브라우저 임시저장 + Argus 회원 계정(Supabase fs_projects) 저장.
 */
(function () {
  "use strict";
  var BASE = window.ArgusFSBase;

  // ── 해시 라우터 (원본 경로 유지)
  var subs = new Set();
  function cur() {
    var h = location.hash.replace(/^#/, "") || "/";
    var i = h.indexOf("?");
    return { path: i < 0 ? h : h.slice(0, i), query: i < 0 ? "" : h.slice(i + 1), href: h };
  }
  var snap = cur();
  window.addEventListener("hashchange", function () { snap = cur(); subs.forEach(function (f) { f(); }); window.scrollTo(0, 0); });
  function subscribe(f) { subs.add(f); return function () { subs.delete(f); }; }
  function push(p) { if (("#" + p) !== location.hash) location.hash = p; }
  var React, h;
  function useLoc() { return React.useSyncExternalStore(subscribe, function () { return snap; }); }
  var router = { push: push, replace: function (p) { location.replace("#" + p); }, back: function () { history.back(); },
    forward: function () { history.forward(); }, refresh: function () {}, prefetch: function () {} };
  window.ArgusFSRouter = {
    push: push,
    useRouter: function () { return router; },
    usePathname: function () { return useLoc().path; },
    useSearchParams: function () { var q = useLoc().query; return React.useMemo(function () { return new URLSearchParams(q); }, [q]); },
    Link: function (props) {
      var href = typeof props.href === "string" ? props.href : (props.href && props.href.pathname) || "/";
      var rest = Object.assign({}, props); delete rest.href; delete rest.prefetch; delete rest.replace; delete rest.scroll;
      rest.href = "#" + href;
      rest.onClick = function (ev) { props.onClick && props.onClick(ev); if (!ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); push(href); } };
      return h("a", rest);
    }
  };

  // ── 새 창: 원본의 '/경로' → 이 페이지 '#/경로'
  var _open = window.open.bind(window);
  window.open = function (url, name, feat) {
    if (typeof url === "string" && url.charAt(0) === "/") url = location.pathname + location.search + "#" + url;
    return _open(url, name, feat);
  };

  // ── PDF 한글 글꼴: 원본 서버 API 대신 Argus 글꼴 파일
  var _fetch = window.fetch.bind(window), fontP = null;
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    if (u.indexOf("/api/korean-font") === 0) {
      fontP = fontP || _fetch(BASE + "fs-fonts.json?v=" + window.ArgusFSVer).then(function (r) { return r.text(); });
      return fontP.then(function (t) { return new Response(t, { status: 200, headers: { "Content-Type": "application/json" } }); });
    }
    if (u.indexOf("/api/") === 0) return Promise.resolve(new Response("{}", { status: 200 }));   // 원본 서버 호출은 막는다
    return _fetch(input, init);
  };

  // ── 화면 구성
  var INPUT = { "/input/business-overview": 692, "/input/sale-price": 27857, "/input/sale-plan": 96512,
    "/input/expense-items": 29137, "/input/expense-plan": 47764 };
  var OUTPUT = { "/output/summary": 30732, "/output/cashflow": 99795, "/output/sensitivity": 89240 };
  var POPUP = { "/cashflow-table": 95556, "/commission-detail": 12658, "/installment-amounts": 59471,
    "/installment-interest-detail": 81589, "/sale-price-aggregate": 5483, "/vat-detail": 76957 };

  function mount(el) {
    var L = window.ArgusFS.load;
    React = L(71645); h = React.createElement;
    var RD = L(46480), Sync = L(32341).CrossWindowStoreSync;
    var comp = function (id) { return L(id).default; };
    function Boundary(props) { return h(EB, props); }
    class EB extends React.Component {
      constructor(p) { super(p); this.state = { err: null }; }
      static getDerivedStateFromError(e) { return { err: e }; }
      componentDidCatch(e) { console.error("[F/S]", e); }
      render() {
        if (this.state.err) return h("div", { className: "fs-err" }, "화면을 표시하는 중 문제가 생겼습니다. 입력값은 저장되어 있으니 새로고침해 주세요.",
          h("button", { onClick: () => this.setState({ err: null }) }, "다시 시도"));
        return this.props.children;
      }
    }
    function Start() {
      React.useEffect(function () {
        try { if (L(65370).getActiveSlot() === "sample-preview") L(56599).exitSampleMode(); } catch (e) {}
        location.replace("#/input/business-overview");
      }, []);
      return null;
    }
    function App() {
      var loc = useLoc(), p = loc.path, page;
      document.body.classList.toggle("fs-popup", !!POPUP[p] || (window.opener && /^kennen-/.test(window.name || "")));
      if (INPUT[p]) page = h(comp(24085), null, h(comp(INPUT[p])));
      else if (OUTPUT[p]) page = h(comp(96015), null, h(comp(OUTPUT[p])));
      else if (POPUP[p]) page = h(comp(POPUP[p]));
      else if (p === "/fm") page = null;   // 재무모델링 탭 (fs.html 이 별도 화면으로 띄움)
      else page = h(Start);   // 원본 첫 화면 대신 바로 사업개요로 (새로 만들기·파일·샘플은 위쪽 막대에)
      return h(React.Fragment, null, h(Sync), h(Boundary, { key: p }, page));
    }
    RD.createRoot(el).render(h(App));
  }
  window.ArgusFSHost = { mount: mount, push: push };
})();
