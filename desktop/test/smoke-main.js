"use strict";

// Boots the real main process against a throw-away profile and checks that the
// bundled local pages load, the preload bridge works and the CSP allows our
// scripts. Run with: npm run smoke
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "lims-smoke-")));

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};
const finish = () => {
  if (problems.length) {
    console.error("SMOKE FAILED\n - " + problems.join("\n - "));
    app.exit(1);
  } else {
    console.log("SMOKE OK");
    app.exit(0);
  }
};

setTimeout(() => {
  problems.push("timed out");
  finish();
}, 30000).unref();

app.on("browser-window-created", (_event, win) => {
  const wc = win.webContents;
  wc.on("console-message", (event) => {
    if (/Content Security Policy|Refused to/i.test(event.message)) problems.push(`CSP: ${event.message}`);
  });

  wc.once("did-finish-load", async () => {
    try {
      check(wc.getURL().endsWith("setup.html"), `expected setup page on first run, got ${wc.getURL()}`);
      check(await wc.executeJavaScript("typeof window.lims?.saveWorkspace") === "function", "preload bridge missing on setup page");

      await new Promise((resolve) => setTimeout(resolve, 500));
      const version = await wc.executeJavaScript("document.getElementById('version').textContent");
      check(/^Version /.test(version), "setup.js did not run (CSP or IPC problem)");

      const invalid = await wc.executeJavaScript("window.lims.saveWorkspace('bad name!')");
      check(invalid.ok === false && Boolean(invalid.error), "invalid workspace should be rejected");

      await win.loadFile(path.join(__dirname, "..", "renderer", "offline.html"), {
        query: { host: "https://demo.labshope.com", reason: "net::ERR_INTERNET_DISCONNECTED" },
      });
      const text = await wc.executeJavaScript("document.getElementById('message').textContent");
      check(text.includes("demo.labshope.com"), "offline page did not render the host");
      check(await wc.executeJavaScript("typeof window.lims?.retry") === "function", "retry bridge missing on offline page");
    } catch (error) {
      problems.push(String(error));
    }
    finish();
  });
});

require("../main.js");
