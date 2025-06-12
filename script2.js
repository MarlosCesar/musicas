const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" }
];

const LOCALSTORE_KEY = "cifras2-app-state-v2";
const POLL_INTERVAL = 5000;
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCguk";
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive";

let state = {
  tabs: [...TABS_DEFAULT],
  cifras: {},
  selection: {},
  currentTab: "Domingo Manhã",
  search: "",
  onlineCache: {}
};

let pollTimer = null;
let editingTabIndex = null;
let newTabValue = "";

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  tabsElem.innerHTML = "";

  state.tabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab${state.currentTab === tab.name ? " active" : ""} ${tab.mode || "offline"}`;
    btn.tabIndex = 0;

    if (editingTabIndex === idx) {
      btn.style.position = "relative";
      btn.innerHTML = `<input id="new-tab-input" type="text" value="${newTabValue}" placeholder="Nova aba" />`;

      const popup = document.createElement("div");
      popup.className = "tab-popup-actions";
      popup.style.top = "calc(100% + 6px)";
      popup.style.left = "0";
      setTimeout(() => popup.classList.add("show"), 10);

      const actions = [
        {
          icon: "<i class='fas fa-check'></i>",
          title: "OK",
          onClick: () => {
            const val = btn.querySelector("input").value.trim();
            if (val) {
              state.tabs[idx] = { name: val, type: "custom", mode: "offline" };
              state.cifras[val] = [];
              editingTabIndex = null;
              newTabValue = "";
              saveState();
              renderTabs();
              setTab(val);
            }
          }
        },
        {
          icon: "<i class='fas fa-eraser'></i>",
          title: "Limpar",
          onClick: () => {
            btn.querySelector("input").value = "";
            btn.querySelector("input").focus();
          }
        },
        {
          icon: "<i class='fas fa-times'></i>",
          title: "Cancelar",
          onClick: () => {
            editingTabIndex = null;
            newTabValue = "";
            renderTabs();
          }
        },
        {
          icon: "<i class='fas fa-pen'></i>",
          title: "Renomear",
          onClick: () => {
            const input = btn.querySelector("input");
            input.focus();
            input.setSelectionRange(0, input.value.length);
          }
        }
      ];

      actions.forEach(act => {
        const b = document.createElement("button");
        b.innerHTML = act.icon;
        b.title = act.title;
        b.className = "tab-popup-btn";
        b.onclick = (e) => {
          e.stopPropagation();
          act.onClick();
        };
        popup.appendChild(b);
      });

      btn.appendChild(popup);

      setTimeout(() => {
        const input = btn.querySelector("input");
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          input.oninput = (e) => newTabValue = e.target.value;
          input.onkeydown = (e) => {
            if (e.key === "Enter") actions[0].onClick();
            if (e.key === "Escape") actions[2].onClick();
          };
        }
      }, 10);
    } else {
      btn.textContent = tab.name;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (tab?.type === "custom") {
          editingTabIndex = idx;
          newTabValue = tab.name;
          renderTabs();
        } else {
          setTab(tab.name);
        }
      };
    }
    tabsElem.appendChild(btn);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  addBtn.innerHTML = "<i class='fas fa-plus'></i> Adicionar Categoria";
  addBtn.onclick = (e) => {
    e.stopPropagation();
    if (editingTabIndex !== null) return;
    state.tabs.push({ name: "", type: "custom", mode: "offline" });
    editingTabIndex = state.tabs.length - 1;
    newTabValue = "";
    renderTabs();
  };
  tabsElem.appendChild(addBtn);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function waitForGapi() {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      setTimeout(resolve, 500);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function gapiAuth() {
  await waitForGapi();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      },
      error_callback: (error) => {
        reject(error);
      }
    });
    client.requestAccessToken();
  });
}

function saveState() {
  const selectionToSave = {};
  for (const tab in state.selection) {
    selectionToSave[tab] = Array.from(state.selection[tab] || []);
  }
  localStorage.setItem(LOCALSTORE_KEY, JSON.stringify({
    tabs: state.tabs,
    cifras: state.cifras,
    selection: selectionToSave,
    currentTab: state.currentTab
  }));
}

function loadState() {
  const s = localStorage.getItem(LOCALSTORE_KEY);
  if (s) {
    const loaded = JSON.parse(s);
    state.tabs = loaded.tabs || [...TABS_DEFAULT];
    state.cifras = loaded.cifras || {};
    state.selection = {};
    if (loaded.selection) {
      for (const tab in loaded.selection) {
        state.selection[tab] = new Set(Array.isArray(loaded.selection[tab]) ? loaded.selection[tab] : Object.values(loaded.selection[tab]));
      }
    }
    state.currentTab = loaded.currentTab || "Domingo Manhã";
  }
}

function setTab(tabName) {
  state.currentTab = tabName;
  renderTabs();
  renderCifras();
  updateFloatControls();
}

function addTab(name, privacy = "public", mode = "offline") {
  if (state.tabs.some(t => t.name === name)) return false;
  state.tabs.push({ name, type: "custom", privacy, mode });
  state.cifras[name] = [];
  saveState();
  renderTabs();
  setTab(name);
  return true;
}

function setTabMode(tabName, mode) {
  const tab = state.tabs.find(t => t.name === tabName);
  if (tab) {
    tab.mode = mode;
    saveState();
    renderTabs();
    renderCifras();
  }
}

function removeCifras(tab, ids) {
  state.cifras[tab] = (state.cifras[tab] || []).filter(cifra => !ids.includes(cifra.id));
  state.selection[tab] = new Set();
  saveState();
  renderCifras();
  updateFloatControls();
}

function clearSelection(tab) {
  state.selection[tab] = new Set();
  updateFloatControls();
}

function renderCifras() {
  const cifraList = document.getElementById("cifra-list");
  const emptyState = document.getElementById("empty-state");
  const floatControls = document.getElementById("float-controls");
  const currentCifras = state.cifras[state.currentTab] || [];

  cifraList.innerHTML = "";

  if (currentCifras.length === 0) {
    emptyState.style.display = "flex";
    cifraList.style.display = "none";
    floatControls.classList.add("hidden");
  } else {
    emptyState.style.display = "none";
    cifraList.style.display = "block";
    floatControls.classList.remove("hidden");

    currentCifras.forEach(cifra => {
      const li = document.createElement("li");
      li.className = "cifra-item";
      li.dataset.id = cifra.id;
      li.innerHTML = `
        <div class="cifra-header">
          <input type="checkbox" class="cifra-checkbox" data-id="${cifra.id}" ${state.selection[state.currentTab]?.has(cifra.id) ? "checked" : ""}>
          <span class="cifra-title">${cifra.title}</span>
          <div class="cifra-actions">
            <button class="edit-cifra-btn" data-id="${cifra.id}" title="Editar"><i class='fas fa-pen'></i></button>
            <button class="delete-cifra-btn" data-id="${cifra.id}" title="Excluir"><i class='fas fa-trash'></i></button>
          </div>
        </div>
        <div class="cifra-content">
          ${cifra.content}
        </div>
      `;
      cifraList.appendChild(li);
    });
  }
  updateFloatControls();
}

function updateFloatControls() {
  const currentCifras = state.cifras[state.currentTab] || [];
  const selectedCount = state.selection[state.currentTab]?.size || 0;
  const selectAllBtn = document.getElementById("select-all-btn");
  const clearSelectionBtn = document.getElementById("clear-selection-btn");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");
  const renameSelectedBtn = document.getElementById("rename-selected-btn");
  const uploadSelectedBtn = document.getElementById("upload-selected-btn");

  if (currentCifras.length > 0) {
    selectAllBtn.style.display = "inline-block";
    clearSelectionBtn.style.display = "inline-block";
    deleteSelectedBtn.style.display = "inline-block";
  } else {
    selectAllBtn.style.display = "none";
    clearSelectionBtn.style.display = "none";
    deleteSelectedBtn.style.display = "none";
  }

  if (selectedCount > 0) {
    deleteSelectedBtn.classList.remove("hidden");
    clearSelectionBtn.classList.remove("hidden");
  } else {
    deleteSelectedBtn.classList.add("hidden");
    clearSelectionBtn.classList.add("hidden");
  }

  if (selectedCount === 1) {
    renameSelectedBtn.classList.remove("hidden");
    uploadSelectedBtn.classList.remove("hidden");
  } else {
    renameSelectedBtn.classList.add("hidden");
    uploadSelectedBtn.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderTabs();
  renderCifras();
  updateFloatControls();

  // Hamburger menu functionality
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  const sidebarMenu = document.getElementById('sidebar-menu');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  hamburgerBtn.addEventListener('click', () => {
    sidebarMenu.classList.toggle('open');
    sidebarOverlay.classList.toggle('hidden');
  });

  sidebarOverlay.addEventListener('click', () => {
    sidebarMenu.classList.remove('open');
    sidebarOverlay.classList.add('hidden');
  });

  // FAB and FAB Menu
  const fab = document.getElementById("fab");
  const fabMenu = document.getElementById("fab-menu");
  const fullscreenOverlay = document.getElementById("fullscreen-overlay");

  fab.addEventListener("click", () => {
    fabMenu.classList.toggle("hidden");
    fullscreenOverlay.classList.toggle("hidden");
  });

  fullscreenOverlay.addEventListener("click", () => {
    fabMenu.classList.add("hidden");
    fullscreenOverlay.classList.add("hidden");
  });

  // FAB Menu buttons
  document.getElementById("fab-buscar2").addEventListener("click", () => {
    document.getElementById("file-input").click();
    fabMenu.classList.add("hidden");
    fullscreenOverlay.classList.add("hidden");
  });

  document.getElementById("fab-camera").addEventListener("click", () => {
    showToast("Funcionalidade de câmera em desenvolvimento!");
    fabMenu.classList.add("hidden");
    fullscreenOverlay.classList.add("hidden");
  });

  document.getElementById("fab-upload").addEventListener("click", async () => {
    try {
      await gapiAuth();
      showToast("Autenticação com Google Drive bem-sucedida!");
    } catch (error) {
      console.error("Erro na autenticação com Google Drive:", error);
      showToast("Erro na autenticação com Google Drive.");
    }
    fabMenu.classList.add("hidden");
    fullscreenOverlay.classList.add("hidden");
  });

  // Dark Mode Toggle
  document.getElementById("fab-darkmode").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const icon = document.getElementById("icon-modo-escuro");
    if (document.body.classList.contains("dark-mode")) {
      icon.textContent = "☀️";
    } else {
      icon.textContent = "🌙";
    }
  });

  // File input
  document.getElementById("file-input").addEventListener("change", async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      const currentTabName = state.currentTab;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const dataUrl = await fileToBase64(file);
          const newCifra = {
            id: Date.now().toString(),
            title: stripExtension(file.name),
            content: `<img src="${dataUrl}" alt="${file.name}" style="max-width: 100%; height: auto;">`
          };
          state.cifras[currentTabName] = state.cifras[currentTabName] || [];
          state.cifras[currentTabName].push(newCifra);
        } else if (file.type === "text/plain") {
          const textContent = await file.text();
          const newCifra = {
            id: Date.now().toString(),
            title: stripExtension(file.name),
            content: `<pre>${textContent}</pre>`
          };
          state.cifras[currentTabName] = state.cifras[currentTabName] || [];
          state.cifras[currentTabName].push(newCifra);
        } else {
          showToast(`Tipo de arquivo não suportado: ${file.type}`);
        }
      }
      saveState();
      renderCifras();
    }
  });

  // Cifra selection
  document.getElementById("cifra-list").addEventListener("change", (event) => {
    if (event.target.classList.contains("cifra-checkbox")) {
      const cifraId = event.target.dataset.id;
      if (event.target.checked) {
        state.selection[state.currentTab] = state.selection[state.currentTab] || new Set();
        state.selection[state.currentTab].add(cifraId);
      } else {
        state.selection[state.currentTab]?.delete(cifraId);
      }
      updateFloatControls();
    }
  });

  // Floating action buttons
  document.getElementById("select-all-btn").addEventListener("click", () => {
    state.selection[state.currentTab] = new Set(state.cifras[state.currentTab].map(c => c.id));
    renderCifras();
  });

  document.getElementById("clear-selection-btn").addEventListener("click", () => {
    clearSelection(state.currentTab);
    renderCifras();
  });

  document.getElementById("delete-selected-btn").addEventListener("click", () => {
    if (confirm("Tem certeza que deseja excluir as cifras selecionadas?")) {
      removeCifras(state.currentTab, Array.from(state.selection[state.currentTab]));
    }
  });

  document.getElementById("rename-selected-btn").addEventListener("click", () => {
    const selectedId = Array.from(state.selection[state.currentTab])[0];
    const cifra = state.cifras[state.currentTab].find(c => c.id === selectedId);
    if (cifra) {
      const newTitle = prompt("Renomear cifra:", cifra.title);
      if (newTitle !== null && newTitle.trim() !== "") {
        cifra.title = newTitle.trim();
        saveState();
        renderCifras();
      }
    }
  });

  document.getElementById("upload-selected-btn").addEventListener("click", async () => {
    const selectedId = Array.from(state.selection[state.currentTab])[0];
    const cifra = state.cifras[state.currentTab].find(c => c.id === selectedId);
    if (cifra) {
      try {
        await gapiAuth();
        showToast("Autenticação com Google Drive bem-sucedida!");
        const response = await gapi.client.drive.files.create({
          name: `${cifra.title}.html`,
          mimeType: 'text/html',
          fields: 'id',
          parents: [GOOGLE_DRIVE_FOLDER_ID],
        }, {
          content: cifra.content,
        });
        console.log('Arquivo enviado:', response.result);
        showToast('Cifra enviada para o Google Drive!');
      } catch (error) {
        console.error('Erro ao enviar para o Google Drive:', error);
        showToast('Erro ao enviar para o Google Drive.');
      }
    }
  });

  // Cloud modal - CÓDIGO CORRIGIDO
  document.getElementById("close-cloud-modal")?.addEventListener("click", () => {
    document.getElementById("cloud-modal").classList.add("hidden");
    
    // Debug final (opcional)
    console.log("Modal ocultada visualmente. Classe atual:", 
        document.getElementById("cloud-modal").className);
});

  // Search bar
  document.getElementById("search-bar").addEventListener("input", (event) => {
    state.search = event.target.value.toLowerCase();
    renderCifras();
  });
});

function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}
