const TABS_DEFAULT = [
  { name: "Domingo Manhã", type: "default", mode: "offline" },
  { name: "Domingo Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
  { name: "Santa Ceia", type: "default", mode: "offline" }
];
const LOCALSTORE_KEY = "cifras2-app-state-v1";
const POLL_INTERVAL = 5000; // ms, para atualizar abas online

// Google Drive Config
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCguk";

let state = {
  tabs: [...TABS_DEFAULT], // {name, type, mode, privacy}
  cifras: {}, // {tabName: [cifraObj]}
  selection: {}, // {tabName: Set}
  currentTab: "Domingo Manhã",
  search: "",
  onlineCache: {}, // {tabName: [cifraObj]}
};

let pollTimer = null;

// --- State Management ---
function saveState() {
  localStorage.setItem(LOCALSTORE_KEY, JSON.stringify({
    tabs: state.tabs,
    cifras: state.cifras,
    selection: state.selection,
    currentTab: state.currentTab
  }));
}
function loadState() {
  const s = localStorage.getItem(LOCALSTORE_KEY);
  if (s) {
    const loaded = JSON.parse(s);
    state.tabs = loaded.tabs || [...TABS_DEFAULT];
    state.cifras = loaded.cifras || {};
    state.selection = loaded.selection || {};
    state.currentTab = loaded.currentTab || "Domingo Manhã";
  }
}
function setTab(tabName) {
  state.currentTab = tabName;
  renderTabs();
  renderCifras();
  updateFloatControls();
}
function addTab(name, privacy="public", mode="offline") {
  if (state.tabs.some(t => t.name === name)) return false;
  state.tabs.push({ name, type: "custom", privacy, mode });
  state.cifras[name] = [];
  saveState(); renderTabs(); setTab(name);
  return true;
}
function setTabMode(tabName, mode) {
  const tab = state.tabs.find(t => t.name === tabName);
  if (tab) { tab.mode = mode; saveState(); renderTabs(); renderCifras(); }
}
function removeCifras(tab, ids) {
  state.cifras[tab] = (state.cifras[tab] || []).filter(cifra => !ids.includes(cifra.id));
  state.selection[tab] = new Set();
  saveState(); renderCifras(); updateFloatControls();
}
function clearSelection(tab) {
  state.selection[tab] = new Set();
  updateFloatControls();
}

// --- UI Rendering ---
function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  tabsElem.innerHTML = "";
  state.tabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab${state.currentTab === tab.name ? " active" : ""} ${tab.mode || "offline"}`;
    btn.textContent = tab.name;
    btn.onclick = () => setTab(tab.name);
    // Menu nas abas padrão
    if (tab.type === "default") {
      const more = document.createElement("span");
      more.className = "tab-more";
      more.innerHTML = "&#8942;";
      more.onclick = e => { e.stopPropagation(); showTabModeModal(tab); };
      btn.appendChild(more);
    }
    tabsElem.appendChild(btn);
  });
  // Botão de adicionar aba
  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  addBtn.textContent = "+";
  addBtn.onclick = showAddTabModal;
  tabsElem.appendChild(addBtn);
  handleTabScrollArrows();
}
function renderCifras() {
  const list = document.getElementById("cifra-list");
  const empty = document.getElementById("empty-state");
  const tab = state.currentTab;
  let cifras = (state.cifras[tab] || []);
  // Filtro de busca
  if (state.search && state.search.length > 0) {
    cifras = cifras.filter(c => c.title.toLowerCase().includes(state.search.toLowerCase()));
  }
  list.innerHTML = "";
  if (!cifras.length) {
    empty.style.display = "flex";
    list.style.display = "none";
  } else {
    empty.style.display = "none";
    list.style.display = "flex";
    cifras.forEach(cifra => {
      const li = document.createElement("li");
      li.className = "cifra-container" + (isSelected(cifra.id) ? " selected" : "");
      // Seleção
      li.onclick = e => {
        if (state.selection[tab] && state.selection[tab].has(cifra.id)) {
          state.selection[tab].delete(cifra.id);
        } else {
          if (!state.selection[tab]) state.selection[tab] = new Set();
          state.selection[tab].add(cifra.id);
        }
        updateFloatControls();
        renderCifras();
        e.stopPropagation();
      };
      // Imagem
      const img = document.createElement("img");
      img.className = "cifra-img";
      img.src = cifra.url;
      img.alt = cifra.title;
      img.onclick = e => { openFullscreen(cifra.url); e.stopPropagation(); };
      // Nome
      const title = document.createElement("div");
      title.className = "cifra-title";
      title.textContent = cifra.title;
      li.appendChild(img);
      li.appendChild(title);
      list.appendChild(li);
    });
  }
}
function updateFloatControls() {
  const float = document.getElementById("float-controls");
  const tab = state.currentTab;
  const selected = (state.selection[tab] && state.selection[tab].size) ? state.selection[tab] : new Set();
  if (selected.size === 0) {
    float.classList.add("hidden");
  } else {
    float.classList.remove("hidden");
  }
}

// --- FAB menu ---
document.getElementById("fab").onclick = () => {
  document.getElementById("fab-menu").classList.toggle("hidden");
};
document.getElementById("fab-local").onclick = () => {
  document.getElementById("fab-menu").classList.add("hidden");
  document.getElementById("file-input").click();
};
document.getElementById("fab-cloud").onclick = () => {
  document.getElementById("fab-menu").classList.add("hidden");
  showCloudModal();
};

// --- File input upload ---
document.getElementById("file-input").onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(file);
    const id = Math.random().toString(36).slice(2) + Date.now();
    state.cifras[tab].push({ id, url, title: file.name });
  }
  saveState();
  renderCifras();
  toast(`${files.length} cifra(s) adicionada(s)!`);
};

// --- Float controls events ---
document.getElementById("select-all-btn").onclick = () => {
  const tab = state.currentTab;
  if (!state.selection[tab]) state.selection[tab] = new Set();
  const all = state.cifras[tab] || [];
  if (state.selection[tab].size === all.length) {
    state.selection[tab].clear();
  } else {
    all.forEach(c => state.selection[tab].add(c.id));
  }
  updateFloatControls();
  renderCifras();
};
document.getElementById("clear-selection-btn").onclick = () => {
  clearSelection(state.currentTab);
  renderCifras();
};
document.getElementById("delete-selected-btn").onclick = () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  removeCifras(tab, selected);
  renderCifras();
  toast("Cifra(s) excluída(s).");
};

// --- Search bar ---
document.getElementById("search-bar").oninput = async (e) => {
  const val = e.target.value.trim();
  state.search = val;
  // Busca online se houver termo
  if (val.length) {
    // Busca no Google Drive
    const files = await searchDrive(val);
    // Mostra modal para selecionar
    showCloudModal(files);
  } else {
    renderCifras();
  }
};

// --- Tab scroll and arrows ---
function handleTabScrollArrows() {
  const tabs = document.getElementById("tabs");
  const left = document.getElementById("tab-scroll-left");
  const right = document.getElementById("tab-scroll-right");
  function updateArrows() {
    left.classList.toggle("visible", tabs.scrollLeft > 16);
    right.classList.toggle("visible", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 16);
  }
  updateArrows();
  tabs.onscroll = updateArrows;
  // Mouse na borda mostra seta
  document.body.onmousemove = e => {
    const { clientX, clientY } = e;
    if (clientY < 130) {
      if (clientX < 40) left.classList.add("visible");
      else left.classList.remove("visible");
      if (window.innerWidth - clientX < 40) right.classList.add("visible");
      else right.classList.remove("visible");
    }
  };
  left.onclick = () => tabs.scrollBy({ left: -180, behavior: "smooth" });
  right.onclick = () => tabs.scrollBy({ left: 180, behavior: "smooth" });
  // Abas arrastáveis no touch
  let isDown = false, startX, scrollLeft;
  tabs.addEventListener('touchstart', e => {
    isDown = true; startX = e.touches[0].pageX - tabs.offsetLeft; scrollLeft = tabs.scrollLeft;
  });
  tabs.addEventListener('touchend', () => isDown = false);
  tabs.addEventListener('touchmove', e => {
    if (!isDown) return;
    const x = e.touches[0].pageX - tabs.offsetLeft;
    tabs.scrollLeft = scrollLeft - (x - startX);
  });
  // Mouse wheel horizontal no desktop
  tabs.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      tabs.scrollLeft += e.deltaX;
      e.preventDefault();
    }
  }, { passive: false });
}

// --- Modal: adicionar aba ---
function showAddTabModal() {
  const modal = document.getElementById("add-tab-modal");
  modal.classList.remove("hidden");
  document.getElementById("add-tab-name").value = "";
  document.getElementById("save-add-tab-btn").onclick = () => {
    const name = document.getElementById("add-tab-name").value.trim();
    const privacy = document.querySelector('input[name="tab-privacy"]:checked').value;
    if (name) {
      addTab(name, privacy);
      modal.classList.add("hidden");
    }
  };
  document.getElementById("close-add-tab-modal").onclick = () => modal.classList.add("hidden");
}

// --- Modal: modo da aba ---
function showTabModeModal(tab) {
  const modal = document.getElementById("tab-mode-modal");
  modal.classList.remove("hidden");
  const radios = modal.querySelectorAll('input[name="tab-mode"]');
  radios.forEach(r => r.checked = (r.value === (tab.mode || "offline")));
  document.getElementById("save-tab-mode-btn").onclick = () => {
    const mode = modal.querySelector('input[name="tab-mode"]:checked').value;
    setTabMode(tab.name, mode);
    modal.classList.add("hidden");
  };
  document.getElementById("close-tab-mode-modal").onclick = () => modal.classList.add("hidden");
}

// --- Modal: nuvem ---
function showCloudModal(files=[]) {
  const modal = document.getElementById("cloud-modal");
  modal.classList.remove("hidden");
  const list = document.getElementById("cloud-list");
  list.innerHTML = "";
  // Busca se necessário
  if (!files.length) {
    list.innerHTML = "<div>Buscando cifras na nuvem...</div>";
    searchDrive(state.search || "").then(files => showCloudModal(files));
    return;
  }
  if (!files.length) {
    list.innerHTML = "<div>Nenhum resultado encontrado.</div>";
    return;
  }
  files.forEach(f => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = f.id;
    const img = document.createElement("img");
    img.src = f.thumbnailLink || f.iconLink;
    img.width = 40; img.height = 56; img.alt = f.name;
    const span = document.createElement("span");
    span.textContent = f.name;
    label.appendChild(cb); label.appendChild(img); label.appendChild(span);
    list.appendChild(label);
  });
  document.getElementById("add-cloud-btn").onclick = () => {
    const selected = Array.from(list.querySelectorAll("input:checked")).map(cb => cb.value);
    const tab = state.currentTab;
    if (!state.cifras[tab]) state.cifras[tab] = [];
    files.filter(f => selected.includes(f.id)).forEach(f => {
      state.cifras[tab].push({
        id: f.id,
        title: f.name,
        url: `https://drive.google.com/uc?export=view&id=${f.id}`
      });
    });
    saveState();
    renderCifras();
    modal.classList.add("hidden");
    toast(`${selected.length} cifra(s) adicionada(s) da nuvem!`);
  };
  document.getElementById("close-cloud-modal").onclick = () => modal.classList.add("hidden");
}
// --- Google Drive Search ---
async function searchDrive(query) {
  // Folder must be shared publicly!
  const url = `https://www.googleapis.com/drive/v3/files?q='${GOOGLE_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false+and+name+contains+'${encodeURIComponent(query)}'&fields=files(id,name,thumbnailLink,iconLink)&key=${GOOGLE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}

// --- Fullscreen ---
function openFullscreen(url) {
  const overlay = document.getElementById("fullscreen-overlay");
  overlay.innerHTML = `<button class="close-fullscreen">&times;</button>
    <img class="fullscreen-img" src="${url}" alt="Cifra" />`;
  overlay.classList.remove("hidden");
  overlay.querySelector(".close-fullscreen").onclick = () => overlay.classList.add("hidden");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.add("hidden"); };
}

// --- Selection helpers ---
function isSelected(id) {
  const tab = state.currentTab;
  return state.selection[tab] && state.selection[tab].has(id);
}

// --- Toast ---
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// --- Polling for online tabs ---
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    // Para simplificação: só online tabs, e simula atualização
    state.tabs.filter(tab => tab.mode === "online").forEach(async tab => {
      // Aqui deveria integrar com backend/realtime (ex: Firebase, WebSocket)
      // Aqui apenas simula update local, mas pode ser expandido para uso real
    });
  }, POLL_INTERVAL);
}

// --- Startup ---
window.onload = () => {
  loadState();
  renderTabs();
  setTab(state.currentTab);
  startPolling();
};
