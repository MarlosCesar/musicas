// === Configuração inicial ===
const TABS_DEFAULT = [
  { name: "Domingo Manhã", type: "default", mode: "offline" },
  { name: "Domingo Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
  { name: "Santa Ceia", type: "default", mode: "offline" }
];
const LOCALSTORE_KEY = "cifras2-app-state-v3";
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";

let state = {
  tabs: [...TABS_DEFAULT],
  cifras: {},
  selection: {},
  currentTab: "Domingo Manhã"
};

// === Utilidades ===
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

// === Tabs ===
function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  if (!tabsElem) return;
  tabsElem.innerHTML = "";
  state.tabs.forEach((tab) => {
    const isSelected = state.currentTab === tab.name;
    const btn = document.createElement("button");
    btn.className = `tab${isSelected ? " active" : ""} ${tab.mode || "offline"}${tab.type === "custom" ? " custom" : ""}`;

    // Botão X para abas custom
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

    // 3 pontos
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
}
function setTab(tabName) {
  state.currentTab = tabName;
  renderTabs();
  renderCifras();
  renderFloatControls();
}
function addTab(name, privacy = "public", mode = "offline") {
  if (state.tabs.some(t => t.name === name)) return false;
  state.tabs.push({ name, type: "custom", privacy, mode });
  state.cifras[name] = [];
  saveState(); renderTabs(); setTab(name);
  return true;
}
function removeTab(tabName) {
  state.tabs = state.tabs.filter(t => t.name !== tabName);
  delete state.cifras[tabName];
  delete state.selection[tabName];
  if (state.currentTab === tabName) state.currentTab = TABS_DEFAULT[0].name;
  saveState(); renderTabs(); setTab(state.currentTab);
}

// === Modal para adicionar aba ===
function showAddTabModal() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <label>Nome da nova aba:</label>
      <input type="text" id="add-tab-name" />
      <button id="save-add-tab-btn" class="add-btn">Adicionar</button>
      <button id="close-add-tab-modal" class="close-modal">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector("#add-tab-name");
  input.focus();

  modal.querySelector("#save-add-tab-btn").onclick = () => {
    const name = input.value.trim();
    if (name) {
      addTab(name);
      document.body.removeChild(modal);
    }
  };
  modal.querySelector("#close-add-tab-modal").onclick = () => document.body.removeChild(modal);
}

// === Modal para modo da aba (pode adaptar conforme seu design) ===
function showTabModeModal(tab) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <label>Modo da aba:</label>
      <div>
        <label><input type="radio" name="tab-mode" value="offline" ${tab.mode === "offline" ? "checked" : ""}/> Offline</label>
        <label><input type="radio" name="tab-mode" value="online" ${tab.mode === "online" ? "checked" : ""}/> Online</label>
      </div>
      <button id="save-tab-mode-btn" class="add-btn">Salvar</button>
      <button id="close-tab-mode-modal" class="close-modal">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#save-tab-mode-btn").onclick = () => {
    const mode = modal.querySelector('input[name="tab-mode"]:checked').value;
    tab.mode = mode;
    saveState();
    renderTabs(); renderCifras();
    document.body.removeChild(modal);
  };
  modal.querySelector("#close-tab-mode-modal").onclick = () => document.body.removeChild(modal);
}

// === Lista de cifras ===
function renderCifras() {
  const list = document.getElementById("cifra-list");
  const empty = document.getElementById("empty-state");
  if (!list || !empty) return;
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
      li.onclick = e => {
        if (state.selection[tab] && state.selection[tab].has(cifra.id)) {
          state.selection[tab].delete(cifra.id);
        } else {
          if (!state.selection[tab]) state.selection[tab] = new Set();
          state.selection[tab].add(cifra.id);
        }
        renderFloatControls();
        renderCifras();
        e.stopPropagation();
      };
      const img = document.createElement("img");
      img.className = "cifra-img";
      img.src = cifra.url;
      img.alt = stripExtension(cifra.title);
      img.onclick = e => { openFullscreen(cifra.fullUrl || cifra.url, stripExtension(cifra.title), cifra.isImage !== false); e.stopPropagation(); };
      img.onerror = function() {
        img.src = "https://cdn.jsdelivr.net/gh/marloscesar/musicas@main/fallback-thumbnail.png";
      };
      const title = document.createElement("div");
      title.className = "cifra-title";
      title.textContent = stripExtension(cifra.title);
      li.appendChild(img);
      li.appendChild(title);
      list.appendChild(li);
    });
  }
}

// === FAB menu (Buscar, Tirar foto, Upload) ===
document.addEventListener("DOMContentLoaded", () => {
  // Logo reload
  const logo = document.querySelector(".logo");
  if (logo) logo.onclick = () => location.reload();

  const fab = document.getElementById("fab");
  if (fab) {
    fab.onclick = (e) => {
      e.stopPropagation();
      const menu = document.getElementById("fab-menu");
      if (menu) menu.classList.toggle("hidden");
    };
  }
  document.body.onclick = () => {
    const menu = document.getElementById("fab-menu");
    if (menu) menu.classList.add("hidden");
  };

  const fabBuscar = document.getElementById("fab-buscar");
  if (fabBuscar) fabBuscar.onclick = () => {
    document.getElementById("fab-menu").classList.add("hidden");
    document.getElementById("search-bar").focus();
  };
  const fabCamera = document.getElementById("fab-camera");
  if (fabCamera) fabCamera.onclick = () => {
    document.getElementById("fab-menu").classList.add("hidden");
    openCameraCapture();
  };
  const fabUpload = document.getElementById("fab-upload");
  if (fabUpload) fabUpload.onclick = () => {
    document.getElementById("fab-menu").classList.add("hidden");
    document.getElementById("file-input").click();
  };

  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    const tab = state.currentTab;
    if (!state.cifras[tab]) state.cifras[tab] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      const id = Math.random().toString(36).slice(2) + Date.now();
      state.cifras[tab].push({ id, url, title: file.name, fullUrl: url, isImage: true });
    }
    saveState();
    renderCifras();
    renderFloatControls();
    toast(`${files.length} cifra(s) adicionada(s)!`);
  };
});

// === Camera Capture ===
function openCameraCapture() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <video id="camera-video" autoplay playsinline style="width:100%;max-width:400px;border-radius:10px;"></video>
      <button id="snap-btn" style="margin:18px auto 0 auto;display:block;">Capturar</button>
      <button id="close-camera-modal" class="close-modal">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);

  const video = modal.querySelector("#camera-video");
  const snapBtn = modal.querySelector("#snap-btn");
  const closeBtn = modal.querySelector("#close-camera-modal");

  let stream;
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(s => {
      stream = s;
      video.srcObject = stream;
    });

  snapBtn.onclick = () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const id = Math.random().toString(36).slice(2) + Date.now();
      const tab = state.currentTab;
      if (!state.cifras[tab]) state.cifras[tab] = [];
      const nomePadrao = `FOTO_${new Date().toLocaleDateString().replace(/\//g, '')}_${Date.now()}`;
      state.cifras[tab].push({ id, url, title: nomePadrao, fullUrl: url, isImage: true });
      saveState();
      renderCifras();
      renderFloatControls();
      toast("Foto capturada!");
    }, "image/jpeg", 0.92);

    if (stream) stream.getTracks().forEach(track => track.stop());
    document.body.removeChild(modal);
  };

  closeBtn.onclick = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    document.body.removeChild(modal);
  };
}

// === Float Controls: Excluir, Renomear, Upload ===
function renderFloatControls() {
  const float = document.getElementById("float-controls");
  const tab = state.currentTab;
  if (!float) return;
  const selected = (state.selection[tab] && state.selection[tab].size) ? Array.from(state.selection[tab]) : [];
  float.innerHTML = '';

  if (selected.length === 0) {
    float.classList.add("hidden");
    return;
  }
  float.classList.remove("hidden");

  const btnDelete = document.createElement("button");
  btnDelete.id = "delete-selected-btn";
  btnDelete.innerHTML = "Excluir";
  btnDelete.onclick = () => {
    removeCifras(tab, selected);
    renderFloatControls();
    renderCifras();
    toast("Cifra(s) excluída(s).");
  };
  float.appendChild(btnDelete);

  if (selected.length === 1) {
    const btnRename = document.createElement("button");
    btnRename.id = "rename-selected-btn";
    btnRename.innerHTML = "Renomear";
    btnRename.onclick = () => showRenameModal(selected[0]);
    float.appendChild(btnRename);
  }
  if (selected.length >= 1) {
    const btnUpload = document.createElement("button");
    btnUpload.id = "upload-selected-btn";
    btnUpload.innerHTML = "Upload";
    btnUpload.onclick = () => showUploadModal(selected);
    float.appendChild(btnUpload);
  }
}

// === Modal de Renomear ===
function showRenameModal(cifraId) {
  const tab = state.currentTab;
  const cifra = (state.cifras[tab] || []).find(c => c.id === cifraId);
  if (!cifra) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <label>NOVO NOME:</label>
      <input type="text" id="rename-input" value="${stripExtension(cifra.title)}" style="text-transform:uppercase;" />
      <button id="save-rename-btn" class="add-btn">Renomear</button>
      <button id="close-rename-modal" class="close-modal">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector("#rename-input");
  input.focus();
  input.selectionStart = 0;
  input.selectionEnd = input.value.length;

  modal.querySelector("#save-rename-btn").onclick = () => {
    let novoNome = input.value.trim().toUpperCase();
    if (novoNome === "") {
      toast("O nome não pode ser vazio.");
      return;
    }
    cifra.title = novoNome;
    saveState();
    renderCifras();
    renderFloatControls();
    document.body.removeChild(modal);
    showUploadPrompt([cifra]);
  };
  modal.querySelector("#close-rename-modal").onclick = () => document.body.removeChild(modal);
}

// === Modal de Upload ===
function showUploadModal(ids) {
  const tab = state.currentTab;
  const cifras = (state.cifras[tab] || []).filter(c => ids.includes(c.id));
  showUploadPrompt(cifras);
}
function showUploadPrompt(cifras) {
  const modal = document.createElement("div");
  modal.className = "modal";
  const plural = cifras.length > 1;
  modal.innerHTML = `
    <div class="modal-content">
      <div>Deseja fazer Upload dessa${plural ? 's' : ''} cifra${plural ? 's' : ''} agora?</div>
      <button id="upload-confirm-btn" class="add-btn" style="margin-top:18px;">Sim</button>
      <button id="upload-cancel-btn" class="add-btn" style="background:#ccc;color:#222;margin-top:8px;">Não</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#upload-cancel-btn").onclick = () => document.body.removeChild(modal);

  modal.querySelector("#upload-confirm-btn").onclick = async () => {
    for (const cifra of cifras) {
      await uploadCifraToDrive(cifra);
    }
    document.body.removeChild(modal);
    toast(`${cifras.length} cifra(s) enviada(s) para o Google Drive!`);
  };
}

// === Upload para Google Drive com OAuth2 ===
async function uploadCifraToDrive(cifra) {
  const access_token = window.GDRIVE_ACCESS_TOKEN || null;
  if (!access_token) {
    toast("Você precisa autenticar com o Google antes de fazer upload.");
    requestGoogleAuth();
    return;
  }
  const response = await fetch(cifra.fullUrl || cifra.url);
  const blob = await response.blob();
  const metadata = {
    name: cifra.title + ".jpg",
    parents: [GOOGLE_DRIVE_FOLDER_ID]
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + access_token
    },
    body: form
  });
}

// === OAuth2 Google Sign-In ===
function requestGoogleAuth() {
  // Use a popup Google OAuth2 flow
  const redirect_uri = window.location.origin + window.location.pathname;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file");
  const client_id = GOOGLE_CLIENT_ID;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=token&scope=${scope}&prompt=consent`;
  window.open(authUrl, "_blank", "width=500,height=650");
  alert('Após autenticar, copie o access_token da URL e cole no console como: window.GDRIVE_ACCESS_TOKEN = "SEU_TOKEN_AQUI";');
}

// === Fullscreen ===
function openFullscreen(url, title, isImage = true) {
  const overlay = document.getElementById("fullscreen-overlay");
  if (!overlay) return;
  overlay.innerHTML = `
    <button class="close-fullscreen">&times;</button>
    <div class="fullscreen-img-wrapper">
      ${isImage ? `<img class="fullscreen-img" src="${url}" alt="${title || 'Cifra'}" />`
                : `<iframe src="${url}" class="fullscreen-iframe"></iframe>`}
    </div>
  `;
  overlay.classList.remove("hidden");
  overlay.querySelector(".close-fullscreen").onclick = () => overlay.classList.add("hidden");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.add("hidden"); };
  if(isImage){
    const img = overlay.querySelector(".fullscreen-img");
    img.onerror = function() {
      img.src = "https://cdn.jsdelivr.net/gh/marloscesar/musicas@main/fallback-thumbnail.png";
    };
  }
}

// === Inicialização ===
window.onload = () => {
  loadState();
  renderTabs();
  setTab(state.currentTab);
};
