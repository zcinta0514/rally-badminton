"""Play a point in the selected match format, online or from the installed PWA."""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


OUT = Path(__file__).resolve().parents[1] / "artifacts" / "tournament-arena"
CASES = {"phone": (844, 390), "compact": (667, 375)}
SNAPSHOT = """() => {
  const el = document.getElementById('court'), gl = el.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    venue: el.dataset.venue, canvas: [el.width, el.height],
    viewport: [innerWidth, innerHeight, devicePixelRatio],
    gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    contextLost: gl?.isContextLost(),
    hud: ['score-self','score-other'].map(id => document.getElementById(id)?.textContent),
    message: document.getElementById('match-message')?.textContent,
    diagnostics: window.rallyDiagnostics,
    scoreDisplayDigits: window.testScoreboardDigits?.slice(-2)
  };
}"""


def verify(browser, url, case, lineup, offline):
    width, height = CASES[case]
    run_name = f"{case}-{lineup}" + ("-offline" if offline else "")
    context = browser.new_context(viewport={"width": width,"height": height},
                                  is_mobile=True, has_touch=True, device_scale_factor=1)
    page = context.new_page()
    # Observe the real score texture as its two cells are rendered. Forward
    # the call unmodified so both the match and its canvas remain untouched.
    page.add_init_script(r"""(() => {
      window.testScoreboardDigits = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(value, ...tail) {
        if (this.canvas.width === 768 && this.canvas.height === 300 && /^\d{2}$/.test(String(value)))
          window.testScoreboardDigits.push(String(value));
        return original.call(this, value, ...tail);
      };
    })();""")
    page.set_default_timeout(45_000)
    report = {"case": case, "lineup": lineup, "offline": offline, "url": url, "modelResponses": [], "console": [],
              "errors": [], "requestsFailed": []}
    def on_response(r):
        path = urlparse(r.url).path.lower()
        if path.endswith(".glb"):
            report["modelResponses"].append([path,r.status])
        if path.endswith((".glb",".js",".css")) and r.status >= 400:
            report["errors"].append(f"HTTP {r.status}: {path}")
    def on_console(msg):
        t=msg.text
        if msg.type in ["error","warning"]:
            report["console"].append([msg.type,t[:650]])
        if re.search(r'context lost|shader error|error compiling|error linking|could not be loaded|GLTFLoader.*error|THREE\.PropertyBinding: No target node', t, re.I):
            report["errors"].append(t[:650])
    page.on("response",on_response)
    page.on("console",on_console)
    page.on("pageerror",lambda exc: report["errors"].append(str(exc)))
    page.on("requestfailed",lambda req: report["requestsFailed"].append([req.url,req.failure]))
    try:
        print(case, "opening local build", flush=True)
        page.goto(url,wait_until="domcontentloaded",timeout=90_000)
        page.locator("#loading").wait_for(state="hidden",timeout=90_000)
        if offline:
            page.wait_for_function("""async () => {
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg?.active) return false;
                const modelURL = new URL('src/models/tournament-hall.glb', reg.scope);
                return Boolean(await caches.match(modelURL));
            }""", timeout=120_000)
            context.set_offline(True)
            page.reload(wait_until="domcontentloaded",timeout=90_000)
            page.locator("#loading").wait_for(state="hidden",timeout=90_000)
            assert page.evaluate("Boolean(navigator.serviceWorker.controller) && !navigator.onLine")
        for button in ["#dismiss-playtest-notice","#onboarding-skip"]:
            if page.locator(button).is_visible():
                page.locator(button).tap()
        page.locator("#open-solo").tap()
        page.locator("#start-ai").tap()
        page.locator(f'#ai-lineup [data-lineup="{lineup}"]').tap()
        page.locator("#start-ai-confirm").tap()
        print(case, "entered AI match", flush=True)
        page.wait_for_function("document.querySelector('#court').dataset.venue === 'tournament'",timeout=120_000)
        page.wait_for_function("window.rallyDiagnostics?.statePhase === 'serve' && !window.rallyDiagnostics.entrance.active",timeout=90_000)
        before = report["before"] = page.evaluate(SNAPSHOT)
        assert before["diagnostics"]["format"] == lineup
        assert before["diagnostics"]["playerCount"] == (4 if lineup == "doubles" else 2)
        assert before["diagnostics"]["score"] == [0, 0]
        page.screenshot(path=str(OUT/f"{run_name}-serve.png"),timeout=45_000)
        # Use the mobile shot control for the initial serve, then let the
        # normal simulation and opponent AI complete the point.
        btn = page.locator('button[data-shot="clear"]')
        btn.tap()
        print(case, "served via shot button", flush=True)
        page.wait_for_function("window.rallyDiagnostics?.hitId > 0",timeout=60_000)
        page.wait_for_function("window.rallyDiagnostics?.score?.some(n => n > 0)",timeout=120_000)
        after = report["after"] = page.evaluate(SNAPSHOT)
        assert list(map(int, after["hud"])) == after["diagnostics"]["score"]
        assert list(map(int, after["scoreDisplayDigits"])) == after["diagnostics"]["score"]
        assert after["contextLost"] is False
        assert after["diagnostics"]["renderer"]["calls"] > 0
        assert after["diagnostics"]["renderer"]["triangles"] > 0
        assert any("tournament-hall.glb" in path and 200<=status<400 for path,status in report["modelResponses"])
        assert not [item for item in report["requestsFailed"] if ".glb" in item[0]]
        page.screenshot(path=str(OUT/f"{run_name}-point.png"),timeout=45_000)
        assert not report["errors"], report["errors"]
        print(case, "passed", after["hud"], after["diagnostics"]["renderer"],flush=True)
        report["passed"] = True
    except Exception as exc:
        report.update(passed=False,failure=str(exc))
        try:
            report["failureSnapshot"]=page.evaluate(SNAPSHOT)
            page.screenshot(path=str(OUT/f"{run_name}-failure.png"),timeout=15_000)
        except Exception as nested:
            report["snapshotFailure"]=str(nested)
        print(case,"failed",str(exc),flush=True)
    finally:
        (OUT/f"{run_name}-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        context.close()
    return report["passed"]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url",default="http://127.0.0.1:4731/")
    parser.add_argument("--case",choices=list(CASES))
    parser.add_argument("--lineup", choices=["singles","doubles"], default="singles")
    parser.add_argument("--offline", action="store_true")
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    exe=Path(os.environ["ProgramFiles"])/"Google/Chrome/Application/chrome.exe"
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=str(exe),headless=True,args=["--enable-unsafe-swiftshader","--no-first-run"])
        try:
            results=[verify(browser,args.url,k,args.lineup,args.offline) for k in ([args.case] if args.case else CASES)]
        finally:
            browser.close()
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
