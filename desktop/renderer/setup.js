"use strict";

const form = document.getElementById("form");
const input = document.getElementById("workspace");
const errorEl = document.getElementById("error");
const submit = document.getElementById("submit");
const cancel = document.getElementById("cancel");

window.lims.getState().then((state) => {
  if (!state) return;
  input.value = state.workspace;
  cancel.hidden = !state.workspace;
  document.getElementById("version").textContent = `Version ${state.version}`;
  if (state.baseDomain) {
    document.getElementById("hint").innerHTML =
      `For example <strong>your-lab</strong> or <strong>your-lab.${state.baseDomain}</strong>.`;
  }
  input.select();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submit.disabled = true;
  submit.textContent = "Checking…";
  try {
    const result = await window.lims.saveWorkspace(input.value);
    if (!result.ok) errorEl.textContent = result.error;
  } catch {
    errorEl.textContent = "Something went wrong. Please try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Continue";
  }
});

cancel.addEventListener("click", () => window.lims.cancelSetup());
