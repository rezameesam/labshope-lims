"use strict";

const params = new URLSearchParams(window.location.search);
const host = params.get("host");
const reason = params.get("reason");

if (host) {
  document.getElementById("message").textContent =
    `LabShope LIMS couldn't reach ${host.replace(/^https?:\/\//, "")}. Check your internet connection and try again.`;
}
if (reason) document.getElementById("reason").textContent = reason.replace(/^net::/, "");

document.getElementById("retry").addEventListener("click", () => window.lims.retry());
document.getElementById("change").addEventListener("click", () => window.lims.changeWorkspace());

// Retry automatically as soon as the machine reports it is back online.
window.addEventListener("online", () => window.lims.retry());
