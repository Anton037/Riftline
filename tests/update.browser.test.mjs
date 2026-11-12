// Real worker lifecycle with tiny pages: same-version updates, failed installs and offline old resources.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const template = fs.readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
const release = (name) => {
  const bundle = `game-v3.61.0-${name.repeat(16)}.js`;
  const html = `<script src="${bundle}"></script><script>navigator.serviceWorker.register('./sw.js')</script>`;
  const worker =
    template
      .replace(/const FILES = \[[^\]]*\];/, `const FILES = ${JSON.stringify(["./", "index.html", bundle])};`)
      .replaceAll("__RL_GAME_FILE__", bundle)
      .replaceAll("__RL_VERSION_DASHED__", "3-61-0")
      .replaceAll("__RL_VERSION__", "3.61.0")
      .replaceAll("__RL_BUILD__", "same-build")
      .replaceAll("__RL_ASSETS__", name.repeat(16)) +
    // Fixture-only identity readback: installation, activation and fetch routing stay real.
    `\nself.addEventListener('message', e => { if (e.data === 'fixture-release') e.ports[0].postMessage('${name}'); });`;
  return { bundle, files: { "": html, "index.html": html, "sw.js": worker, [bundle]: `window.release = '${name}'` } };
};

test("updates keep installed snapshots intact and old bundles available offline", { timeout: 20000 }, async (t) => {
  const a = release("a"),
    b = release("b"),
    broken = release("c");
  delete broken.files[broken.bundle];
  let current = a;
  const { server, url } = await serve("dist", 0, {
    base: "/Riftline/",
    intercept(req, res) {
      const name = new URL(req.url, "http://x").pathname.slice("/Riftline/".length);
      const body = current.files[name];
      res.writeHead(body === undefined ? 404 : 200, {
        "content-type": name.endsWith(".js") ? "application/javascript" : "text/html",
        "cache-control": "no-store",
      });
      res.end(body ?? "missing");
      return true;
    },
  });
  let browser;
  const stopServer = async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  t.after(async () => {
    await browser?.close();
    await stopServer();
  });
  browser = await chromium.launch({ args: launchArgs() });
  t.signal.addEventListener("abort", () => void browser.close().catch(() => {}), { once: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.release === "a");
  // A separate deployment on this origin must survive activation and cache cleanup.
  const foreign = `riftline:${encodeURIComponent(new URL("/Preview/", url).href)}:sentinel`;
  await page.evaluate(async (key) => {
    await caches.open(key);
  }, foreign);
  current = broken;
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    const worker = reg.installing;
    if (worker)
      await new Promise((resolve) => {
        const changed = () => {
          if (["redundant", "installed"].includes(worker.state)) resolve();
        };
        worker.addEventListener("statechange", changed);
        changed();
      });
    if (reg.waiting) throw Error("Broken release unexpectedly installed");
  });
  current = b;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  // Merely receiving B online must not replace A's installed offline HTML.
  assert.equal(
    await page.evaluate(async () => {
      const key = (await caches.keys()).find((k) => k.includes("same-build-" + "a".repeat(16)));
      return (await (await caches.open(key)).match("index.html")).text();
    }),
    a.files["index.html"],
  );
  // Playwright 1.64 polls the Promise itself as truthy and returns even when it resolves false.
  // Use lifecycle events and an awaited browser Promise for asynchronous identity checks.
  await page.evaluate(async () => {
    const identify = (worker) =>
      new Promise((resolve) => {
        if (!worker || worker.state === "redundant") return resolve(null);
        const channel = new MessageChannel();
        const finish = (value) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(value);
        };
        const timer = setTimeout(() => finish(null), 1000);
        channel.port1.onmessage = (event) => finish(event.data);
        try {
          worker.postMessage("fixture-release", [channel.port2]);
        } catch {
          finish(null);
        }
      });
    const reg = await navigator.serviceWorker.getRegistration();
    await new Promise((resolve, reject) => {
      const observed = new Set();
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", check);
        reg.removeEventListener("updatefound", check);
        for (const worker of observed) worker.removeEventListener("statechange", check);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        const state = (worker) => worker?.state || null;
        finish(
          new Error(
            "Release B did not activate and take control: " +
              JSON.stringify({
                installing: state(reg.installing),
                waiting: state(reg.waiting),
                active: state(reg.active),
                controller: state(navigator.serviceWorker.controller),
              }),
          ),
        );
      }, 5000);
      function check() {
        // Subscribe synchronously, including to the controller while registration references change.
        // An identity request must not serialize or suppress another worker's lifecycle notification.
        for (const worker of [reg.installing, reg.waiting, reg.active, navigator.serviceWorker.controller]) {
          if (!worker) continue;
          if (!observed.has(worker)) {
            observed.add(worker);
            worker.addEventListener("statechange", check);
          }
          void identify(worker).then((identity) => {
            if (settled || identity !== "b") return;
            if (reg.waiting === worker) worker.postMessage("skipWaiting");
            if (navigator.serviceWorker.controller === worker && worker.state === "activated") finish();
          }, finish);
        }
      }
      navigator.serviceWorker.addEventListener("controllerchange", check);
      reg.addEventListener("updatefound", check);
      check();
    });
  });
  assert.equal(await page.evaluate(() => window.release), "a", "Existing page stays on its running bundle");
  await stopServer();
  await page.context().setOffline(true);
  const old = await page.evaluate(async (bundle) => {
    const response = await fetch(bundle);
    return { status: response.status, body: await response.text() };
  }, a.bundle);
  assert.equal(old.status, 200);
  assert.equal(old.body, a.files[a.bundle]);
  await page.reload();
  try {
    await page.waitForFunction(() => window.release === "b");
  } catch (error) {
    t.diagnostic(
      JSON.stringify(
        await page.evaluate(async () => ({
          release: window.release,
          html: document.documentElement.outerHTML,
          caches: await Promise.all(
            (await caches.keys()).map(async (key) => ({
              key,
              html: await (await (await caches.open(key)).match("index.html"))?.text(),
            })),
          ),
        })),
      ),
    );
    throw error;
  }
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.includes(foreign));
  assert.equal(keys.filter((k) => k.includes("same-build-")).length, 2, "Only the two complete snapshots survive");
});
