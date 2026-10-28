"use strict";

// Boots the real main process with a saved workspace and checks that the
// bundled web app is served from disk at http://<slug>.localhost. Needs
// `npm run prepare:web` first. Run with: npm run smoke:bundled
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "lims-smoke-bundled-"));
app.setPath("userData", userData);
fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ workspace: "https://demo.labshope.com" }));

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};
const finish = () => {
  if (problems.length) {
    console.error("BUNDLED SMOKE FAILED\n - " + problems.join("\n - "));
    app.exit(1);
  } else {
    console.log("BUNDLED SMOKE OK");
    app.exit(0);
  }
};

setTimeout(() => {
  problems.push("timed out");
  finish();
}, 45000).unref();

const waitFor = async (wc, expression, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await wc.executeJavaScript(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

app.on("browser-window-created", (_event, win) => {
  const wc = win.webContents;
  wc.once("did-finish-load", async () => {
    try {
      check(wc.getURL() === "http://demo.localhost/auth/staff", `unexpected URL ${wc.getURL()}`);
      check(
        await waitFor(wc, "document.getElementById('root')?.children.length > 0"),
        "React app did not render from the bundle",
      );
      check(await wc.executeJavaScript("window.location.hostname") === "demo.localhost", "wrong hostname");
      check(await wc.executeJavaScript("window.isSecureContext") === true, "page is not a secure context");

      const missing = await wc.executeJavaScript("fetch('/assets/does-not-exist.js').then(r => r.status)");
      check(missing === 404, `missing asset should 404, got ${missing}`);

      const escaped = await wc.executeJavaScript(
        "fetch('/..%2f..%2fmain.js').then(r => r.text()).catch(() => '')",
      );
      check(!escaped.includes("ipcMain"), "path traversal leaked a file outside the bundle");

      const route = await wc.executeJavaScript("fetch('/admin').then(r => r.text())");
      check(route.includes('id="root"'), "SPA routes should fall back to index.html");
    } catch (error) {
      problems.push(String(error));
    }
    finish();
  });
});

require("../main.js");
