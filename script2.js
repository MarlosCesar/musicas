const TABS_DEFAULT = [
  { name: "Domingo Manhã", type: "default", mode: "offline" },
  { name: "Domingo Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
  { name: "Santa Ceia", type: "default", mode: "offline" }
];
const LOCALSTORE_KEY = "cifras2-app-state-v2";
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCguk";

let state = {
  tabs: [...TABS_DEFAULT],
  cifras: {},
  selection: {},
  currentTab: "Domingo Manhã",
  search: "",
};

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

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
  if (tab) {
    if (mode === "offline") {
      state.cifras[tabName] = [];
      state.selection[tabName] = new Set();
    }
    tab.mode = mode;
    saveState(); renderTabs(); renderCifras();
  }
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

document.addEventListener("DOMContentLoaded", () => {
  const logo = document.querySelector(".logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.onclick = () => {
      location.reload();
    };
  }
});

function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  tabsElem.innerHTML = "";
  state.tabs.forEach((tab, idx) => {
    const isSelected = state.currentTab === tab.name;
    const btn = document.createElement("button");
    btn.className = `tab${isSelected ? " active" : ""} ${tab.mode || "offline"}${tab.type === "custom" ? " custom" : ""}`;

    // X vermelho à esquerda (sempre presente nas custom, visível se ativa ou hover)
    if (tab.type === "custom") {
      const close = document.createElement("button");
      close.className = "tab-close";
      close.innerHTML = "&times;";
      close.onclick = e => {
        e.stopPropagation();
        if (confirm(`Remover a aba "${tab.name}" e todas as suas cifras?`)) {
          removeTab(tab.name);
        }
      };
      btn.appendChild(close);
      btn.onmouseenter = () => btn.classList.add("show-x");
      btn.onmouseleave = () => btn.classList.remove("show-x");
      btn.ontouchstart = () => btn.classList.toggle("show-x");
    }

    // Nome da aba
    const tabLabel = document.createElement("span");
    tabLabel.textContent = tab.name;
    tabLabel.onclick = () => setTab(tab.name);
    btn.appendChild(tabLabel);

    // 3 pontos no lado direito (para todas as abas)
    const more = document.createElement("span");
    more.className = "tab-more";
    more.innerHTML = "&#8942;";
    more.onclick = e => { e.stopPropagation(); showTabModeModal(tab); };
    btn.appendChild(more);

    tabsElem.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  addBtn.textContent = "+";
  addBtn.onclick = showAddTabModal;
  tabsElem.appendChild(addBtn);

  // Scroll horizontal
  let isDown = false, startX, scrollLeft;
  tabsElem.onmousedown = e => { isDown = true; startX = e.pageX - tabsElem.offsetLeft; scrollLeft = tabsElem.scrollLeft; };
  tabsElem.onmouseleave = () => isDown = false;
  tabsElem.onmouseup = () => isDown = false;
  tabsElem.onmousemove = e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabsElem.offsetLeft;
    tabsElem.scrollLeft = scrollLeft - (x - startX);
  };
  tabsElem.addEventListener('touchstart', e => {
    isDown = true; startX = e.touches[0].pageX - tabsElem.offsetLeft; scrollLeft = tabsElem.scrollLeft;
  });
  tabsElem.addEventListener('touchend', () => isDown = false);
  tabsElem.addEventListener('touchmove', e => {
    if (!isDown) return;
    const x = e.touches[0].pageX - tabsElem.offsetLeft;
    tabsElem.scrollLeft = scrollLeft - (x - startX);
  });
  tabsElem.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      tabsElem.scrollLeft += e.deltaX;
      e.preventDefault();
    }
  }, { passive: false });
}
function removeTab(tabName) {
  state.tabs = state.tabs.filter(t => t.name !== tabName);
  delete state.cifras[tabName];
  delete state.selection[tabName];
  if (state.currentTab === tabName) state.currentTab = TABS_DEFAULT[0].name;
  saveState(); renderTabs(); setTab(state.currentTab);
}
function renderCifras() {
  const list = document.getElementById("cifra-list");
  const empty = document.getElementById("empty-state");
  const tab = state.currentTab;
  let cifras = (state.cifras[tab] || []);
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
      img.alt = stripExtension(cifra.title);
      img.onclick = e => { openFullscreen(cifra.fullUrl || cifra.url, stripExtension(cifra.title)); e.stopPropagation(); };
      img.onerror = function() {
        img.src = "https://cdn.jsdelivr.net/gh/marloscesar/musicas@main/fallback-thumbnail.png";
      };
      // Nome
      const title = document.createElement("div");
      title.className = "cifra-title";
      title.textContent = stripExtension(cifra.title);
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

document.getElementById("fab").onclick = () => {
  document.getElementById("file-input").click();
};
document.getElementById("file-input").onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(file);
    const id = Math.random().toString(36).slice(2) + Date.now();
    state.cifras[tab].push({ id, url, title: file.name, fullUrl: url });
  }
  saveState();
  renderCifras();
  toast(`${files.length} cifra(s) adicionada(s)!`);
};

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

const searchBar = document.getElementById("search-bar");
const searchDropdown = document.getElementById("search-dropdown");
let searchResults = [];
let searchTimeout = null;
searchBar.oninput = async (e) => {
  const val = e.target.value.trim();
  if (searchTimeout) clearTimeout(searchTimeout);
  if (val.length === 0) {
    searchDropdown.classList.add("hidden");
    searchResults = [];
    return;
  }
  searchDropdown.innerHTML = '<li style="color:#aaa;">Buscando cifras...</li>';
  searchDropdown.classList.remove("hidden");
  searchTimeout = setTimeout(async () => {
    const files = await searchDrive(val);
    searchResults = files;
    if (!files.length) {
      searchDropdown.innerHTML = '<li style="color:#aaa;">Nenhuma música encontrada</li>';
      return;
    }
    searchDropdown.innerHTML = '';
    files.forEach((f, idx) => {
      const li = document.createElement("li");
      li.textContent = stripExtension(f.name);
      li.onclick = () => {
        addCifraFromDrive(f);
        searchDropdown.classList.add("hidden");
        searchBar.value = "";
      };
      searchDropdown.appendChild(li);
    });
  }, 400);
};
searchBar.onfocus = () => {
  if (searchResults.length) searchDropdown.classList.remove("hidden");
};
searchBar.onblur = () => setTimeout(() => searchDropdown.classList.add("hidden"), 180);

async function searchDrive(query) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${GOOGLE_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false+and+name+contains+'${encodeURIComponent(query)}'&fields=files(id,name,thumbnailLink,iconLink,mimeType)&key=${GOOGLE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}
function addCifraFromDrive(file) {
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  if (state.cifras[tab].some(c => c.id === file.id)) return;
  let fullUrl = "";
  let thumbUrl = file.thumbnailLink || file.iconLink;
  if (file.mimeType && file.mimeType.startsWith("image/")) {
    fullUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
    thumbUrl = file.thumbnailLink || fullUrl;
  } else {
    fullUrl = `https://drive.google.com/file/d/${file.id}/view?usp=sharing`;
    thumbUrl = file.iconLink || fullUrl;
  }
  state.cifras[tab].push({
    id: file.id,
    title: file.name,
    url: thumbUrl,
    fullUrl: fullUrl
  });
  saveState();
  renderCifras();
  toast(`Cifra "${stripExtension(file.name)}" adicionada!`);
}

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

// Fullscreen garantido para ocupar 100% da tela, centralizado, sem distorção
function openFullscreen(url, title) {
  const overlay = document.getElementById("fullscreen-overlay");
  overlay.innerHTML = `
    <button class="close-fullscreen">&times;</button>
    <div class="fullscreen-img-wrapper">
      <img class="fullscreen-img" src="${url}" alt="${title || 'Cifra'}" />
    </div>
  `;
  overlay.classList.remove("hidden");
  overlay.querySelector(".close-fullscreen").onclick = () => overlay.classList.add("hidden");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.add("hidden"); };
  const img = overlay.querySelector(".fullscreen-img");
  img.onerror = function() {
    img.src = "https://cdn.jsdelivr.net/gh/marloscesar/musicas@main/fallback-thumbnail.png";
  };
}

function isSelected(id) {
  const tab = state.currentTab;
  return state.selection[tab] && state.selection[tab].has(id);
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

window.onload = () => {
  loadState();
  renderTabs();
  setTab(state.currentTab);
};
