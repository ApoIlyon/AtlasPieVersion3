import { invoke } from "@tauri-apps/api/core";

const profileList = document.getElementById("profile-list");
const addProfileForm = document.getElementById("add-profile-form");
const addProfileNameInput = document.getElementById("add-profile-name");
const addProfileExeInput = document.getElementById("add-profile-exe");
const saveButton = document.getElementById("save-settings-btn");
const resetButton = document.getElementById("reset-settings-btn");
const runExeButton = document.getElementById("run-exe-btn");
const runAhkButton = document.getElementById("run-ahk-btn");
const statusText = document.getElementById("status-text");

let currentSettings = null;

function renderProfiles(settings) {
  profileList.innerHTML = "";
  settings.appProfiles.forEach((profile) => {
    const li = document.createElement("li");
    li.className = "profile-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = profile.enable;
    checkbox.addEventListener("change", () => {
      profile.enable = checkbox.checked;
    });
    const header = document.createElement("div");
    header.className = "profile-header";
    header.textContent = profile.name;
    const details = document.createElement("div");
    details.className = "profile-details";
    details.innerHTML = `
      <p><strong>EXE:</strong> ${profile.ahkHandles.join(", ") || "—"}</p>
      <p><strong>Pie keys:</strong> ${profile.pieKeys.length}</p>
    `;
    header.prepend(checkbox);
    li.appendChild(header);
    li.appendChild(details);
    profileList.appendChild(li);
  });
}

async function loadSettings() {
  try {
    currentSettings = await invoke("load_settings_cmd");
    renderProfiles(currentSettings);
    statusText.textContent = "Настройки загружены";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Ошибка загрузки настроек";
  }
}

async function saveSettings() {
  if (!currentSettings) return;
  try {
    currentSettings = await invoke("save_settings_cmd", { settings: currentSettings });
    renderProfiles(currentSettings);
    statusText.textContent = "Настройки сохранены";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Ошибка сохранения настроек";
  }
}

async function resetSettings() {
  try {
    currentSettings = await invoke("reset_settings_cmd");
    renderProfiles(currentSettings);
    statusText.textContent = "Настройки сброшены";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Ошибка сброса настроек";
  }
}

async function addProfile(event) {
  event.preventDefault();
  const name = addProfileNameInput.value.trim();
  const exe = addProfileExeInput.value.trim();
  if (!name) {
    statusText.textContent = "Введите имя профиля";
    return;
  }
  const profile = {
    name,
    ahkHandles: exe ? [exe] : [],
    enable: true,
    hoverActivation: false,
    pieEnableKey: {
      useEnableKey: false,
      enableKey: "capslock",
      toggle: false,
      sendOriginalFunc: false,
    },
    pieKeys: [],
  };
  try {
    currentSettings = await invoke("add_profile_cmd", { profile });
    addProfileForm.reset();
    renderProfiles(currentSettings);
    statusText.textContent = "Профиль добавлен";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Ошибка добавления профиля";
  }
}

async function runPieMenu(useAhk) {
  try {
    await invoke("run_pie_menu_cmd", { useAhk });
    statusText.textContent = useAhk ? "Запущен PieMenu.ahk" : "Запущен PieMenu.exe";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Не удалось запустить PieMenu";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  addProfileForm.addEventListener("submit", addProfile);
  saveButton.addEventListener("click", saveSettings);
  resetButton.addEventListener("click", resetSettings);
  runExeButton.addEventListener("click", () => runPieMenu(false));
  runAhkButton.addEventListener("click", () => runPieMenu(true));
});
