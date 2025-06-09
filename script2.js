const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
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
  onlineCache: {},
};

let pollTimer = null;
let editingTabIndex = null;
let newTabValue = "";

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

const style = document.createElement('style');
style.textContent = `
  .tab-popup-actions {
    background: var(--white);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 6px 8px;
    display: flex;
    flex-direction: row;
    gap: 6px;
    margin-top: 4px;
    position: absolute;
    z-index: 100;
    animation: fadeInScale 0.2s ease-out forwards;
  }

  .tab-popup-btn {
    background: none;
    border: none;
    font-size: 1.1rem;
    color: var(--accent);
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }
  .tab-popup-btn:hover {
    background: var(--primary-xlight);
    transform: scale(1.1);
  }

  @keyframes fadeInScale {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }
`;
document.head.appendChild(style);

// renderTabs atualizado com popup de ações com ícones
function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  tabsElem.innerHTML = "";
  state.tabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab${state.currentTab === tab.name ? " active" : ""} ${tab.mode || "offline"}`;
    btn.tabIndex = 0;

    if (editingTabIndex === idx) {
      btn.style.position = "relative";
      btn.innerHTML = `<input id="new-tab-input" type="text" value="${newTabValue}" placeholder="Nova aba" style="width:100px; font-size:1em; border:none; outline:2px solid var(--accent); border-radius:8px; padding:4px 8px;" autofocus />`;

      const popup = document.createElement("div");
      popup.className = "tab-popup-actions";

      const actions = [
        { icon: "<i class='fas fa-check'></i>", title: "OK", onClick: () => {
          const val = btn.querySelector("input").value.trim();
          if (val !== "") {
            state.tabs[idx] = { name: val, type: "custom", mode: "offline" };
            state.cifras[val] = [];
            editingTabIndex = null;
            newTabValue = "";
            saveState();
            renderTabs();
            setTab(val);
          }
        } },
        { icon: "<i class='fas fa-eraser'></i>", title: "Limpar", onClick: () => {
          const input = btn.querySelector("input");
          input.value = "";
          input.focus();
        } },
        { icon: "<i class='fas fa-times'></i>", title: "Cancelar", onClick: () => {
          state.tabs.splice(idx, 1);
          editingTabIndex = null;
          newTabValue = "";
          renderTabs();
        } },
        { icon: "<i class='fas fa-pen'></i>", title: "Renomear", onClick: () => {
          const input = btn.querySelector("input");
          input.focus();
          input.selectionStart = 0;
          input.selectionEnd = input.value.length;
        } }
      ];

      actions.forEach(act => {
        const b = document.createElement("button");
        b.innerHTML = act.icon;
        b.title = act.title;
        b.className = "tab-popup-btn";
        b.onclick = (e) => { e.stopPropagation(); act.onClick(); };
        popup.appendChild(b);
      });

      btn.appendChild(popup);

      setTimeout(() => {
        const input = btn.querySelector("input");
        if (input) {
          input.focus();
          input.selectionStart = input.value.length;
          input.oninput = (e) => newTabValue = e.target.value;
          input.onkeydown = (e) => {
            if (e.key === "Enter") actions[0].onClick(e);
            if (e.key === "Escape") actions[2].onClick(e);
          };
        }
      }, 10);
    } else {
      btn.textContent = tab.name;
      btn.onclick = () => setTab(tab.name);

      if (tab.type === "custom") {
        const close = document.createElement("button");
        close.innerHTML = "&#10006;";
        close.title = "Excluir aba";
        close.className = "tab-close";
        close.onclick = (e) => {
          e.stopPropagation();
          const removed = state.tabs.splice(idx, 1)[0];
          delete state.cifras[removed.name];
          if (state.currentTab === removed.name) {
            setTab(state.tabs[0]?.name || "");
          } else {
            renderTabs();
            renderCifras();
          }
          saveState();
        };
        btn.classList.add('custom');
        btn.appendChild(close);

        btn.addEventListener('touchstart', (e) => {
          btn.classList.toggle('tab-show-x');
          setTimeout(() => btn.classList.remove('tab-show-x'), 2000);
        });
      }
    }
    tabsElem.appendChild(btn);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  addBtn.innerHTML = "<i class='fas fa-plus'></i>";
  addBtn.onclick = () => {
    if (editingTabIndex !== null) return;
    state.tabs.push({ name: "", type: "custom", mode: "offline" });
    editingTabIndex = state.tabs.length - 1;
    newTabValue = "";
    renderTabs();
  };
  tabsElem.appendChild(addBtn);
}

// --- Função para converter File em base64 (data URL) ---
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
      // Tempo para inicialização
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

// --- State Management ---
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
        state.selection[tab] = new Set(Array.isArray(loaded.selection[tab]) 
          ? loaded.selection[tab] 
          : Object.values(loaded.selection[tab]));
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
function renderCifras() {
  const list = document.getElementById("cifra-list");
  const empty = document.getElementById("empty-state");
  const tab = state.currentTab;
  let cifras = (state.cifras[tab] || []); // NÃO filtra mais por state.search
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
        updateFloatControls();
        renderCifras();
        e.stopPropagation();
      };

      const img = document.createElement("img");
      img.className = "cifra-img";
      img.src = cifra.driveId
        ? `https://drive.google.com/thumbnail?id=${cifra.driveId}&sz=w200`
        : cifra.url;
      img.alt = cifra.title;
      img.onclick = e => { openFullscreen(cifra); e.stopPropagation(); };

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
  const selected = (state.selection[tab] && state.selection[tab].size) ? Array.from(state.selection[tab]) : [];
  document.getElementById("select-all-btn").classList.remove("hidden");
  document.getElementById("clear-selection-btn").classList.remove("hidden");
  document.getElementById("delete-selected-btn").classList.remove("hidden");
  document.getElementById("rename-selected-btn").classList.toggle("hidden", selected.length !== 1);
  document.getElementById("upload-selected-btn").classList.toggle("hidden", selected.length === 0);
  if (selected.length === 0) {
    float.classList.add("hidden");
  } else {
    float.classList.remove("hidden");
  }
}

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

document.getElementById("rename-selected-btn").onclick = () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (selected.length === 1) showRenameModal(selected[0]);
};

document.getElementById("upload-selected-btn").onclick = async () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (selected.length) {
    for (const id of selected) {
      const cifra = (state.cifras[tab] || []).find(c => c.id === id);
      if (cifra) await uploadCifraToDrive(cifra);
    }
    toast("Upload realizado para o Google Drive!");
  }
};

// --- Modal de Renomear ---
function showRenameModal(cifraId) {
  const tab = state.currentTab;
  const cifra = (state.cifras[tab] || []).find(c => c.id === cifraId);
  if (!cifra) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <label>NOVO NOME:</label>
      <input type="text" id="rename-input" value="${cifra.title}" style="text-transform:uppercase;" />
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
    updateFloatControls();
    document.body.removeChild(modal);
  };
  modal.querySelector("#close-rename-modal").onclick = () => document.body.removeChild(modal);
}

// --- FAB menu ---
// Exibe/esconde o menu ao clicar no FAB
document.getElementById("fab").onclick = (e) => {
  const fabMenu = document.getElementById("fab-menu");
  fabMenu.classList.toggle("hidden");
  e.stopPropagation(); // Impede o clique de propagar e fechar imediatamente
};

// Fecha o FAB menu ao clicar em qualquer parte da tela fora do próprio FAB e menu
document.addEventListener('click', (e) => {
  const fab = document.getElementById('fab');
  const fabMenu = document.getElementById('fab-menu');
  if (!fabMenu || !fab) return;
  // Só fecha se o menu estiver aberto, e o clique não for nem no FAB nem dentro do menu
  if (!fabMenu.classList.contains('hidden') && !fabMenu.contains(e.target) && e.target !== fab) {
    fabMenu.classList.add('hidden');
  }
});

document.getElementById("fab-buscar2")?.addEventListener('click', () => {
  document.getElementById("fab-menu").classList.add("hidden");
  document.getElementById("file-input").click();
});

document.getElementById("fab-camera")?.addEventListener('click', () => {
  document.getElementById("fab-menu").classList.add("hidden");
  openCameraCapture();
});

document.getElementById("fab-upload")?.addEventListener('click', async () => {
  document.getElementById("fab-menu").classList.add("hidden");
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (!selected.length) {
    toast("Selecione uma ou mais cifras para enviar ao Google Drive.");
    return;
  }
  for (const id of selected) {
    const cifra = (state.cifras[tab] || []).find(c => c.id === id);
    if (cifra) await uploadCifraToDrive(cifra);
  }
  toast("Upload realizado para o Google Drive!");
});

window.addEventListener("DOMContentLoaded", () => {
  const fabMenu = document.getElementById("fab-menu");
  if (!document.getElementById("fab-darkmode")) {
    const darkBtn = document.createElement("button");
    darkBtn.id = "fab-darkmode";
    darkBtn.className = "fab-menu-btn";
    darkBtn.innerHTML = `<span id="icon-modo-escuro">🌙</span> Modo Escuro`;
    fabMenu.appendChild(darkBtn);

    darkBtn.onclick = (e) => {
      e.stopPropagation(); // Impede que o clique feche o menu
      document.body.classList.toggle("dark-mode");
      darkBtn.innerHTML = document.body.classList.contains("dark-mode")
        ? `<span id="icon-modo-claro">☀️</span> Modo Claro`
        : `<span id="icon-modo-escuro">🌙</span> Modo Escuro`;
      // Removido o fabMenu.classList.add("hidden") para manter o menu aberto
    };
  }
});

// --- File input upload (BASE64) ---
document.getElementById("file-input").onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  let addedCount = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const base64 = await fileToBase64(file);
    const id = Math.random().toString(36).slice(2) + Date.now();
    state.cifras[tab].push({ id, url: base64, title: file.name });
    addedCount++;
  }
  saveState();
  renderCifras();
  toast(`${addedCount} cifra(s) adicionada(s)!`);
};

// --- Camera Capture (BASE64) ---
async function openCameraCapture() {
  let overlay = document.getElementById("camera-capture-overlay");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "camera-capture-overlay";
  overlay.style.cssText = `
    z-index: 99999; position: fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center;
  `;

  overlay.innerHTML = `
    <video id="camera-video" autoplay playsinline style="width:100vw; height:100vh; object-fit:cover; background:#222"></video>
    <div style="margin:1em 0">
      <button id="camera-capture-btn" style="font-size:1.2em;">📸 Capturar Foto</button>
      <button id="camera-cancel-btn" style="font-size:1.2em; margin-left:1em;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector("#camera-video");
  const captureBtn = overlay.querySelector("#camera-capture-btn");
  const cancelBtn = overlay.querySelector("#camera-cancel-btn");

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: { exact: "environment" }
      },
      audio: false
    });
    video.srcObject = stream;
  } catch (e) {
    overlay.remove();
    alert("Não foi possível acessar a câmera.");
    return;
  }

  cancelBtn.onclick = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    overlay.remove();
  };

  captureBtn.onclick = () => {
    if (video.readyState < 2) {
      toast("Aguardando câmera...");
      return;
    }
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const width = settings.width || video.videoWidth;
    const height = settings.height || video.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(blob => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      overlay.remove();

      const url = URL.createObjectURL(blob);
      const now = new Date();
      const title = `Foto ${now.toISOString().replace(/[:T]/g, '-').split('.')[0]}`;
      const id = "foto-" + now.getTime();

      const tab = state.currentTab;
      if (!state.cifras[tab]) state.cifras[tab] = [];
      state.cifras[tab].push({ id, title, url, createdAt: now.toISOString() });
      if (!state.selection[tab]) state.selection[tab] = new Set();
      state.selection[tab].add(id);

      saveState();
      renderCifras();
    }, "image/jpeg", 0.98);
  };
}

// --- Busca Inteligente Local nas Cifras da Aba Atual ---
function buscaCifrasLocal(query, cifrasTab) {
  if (!query) return [];
  const q = query.toLowerCase();
  const resultado = [];
  const usados = new Set();

  cifrasTab.filter(c => c.title.toLowerCase().startsWith(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .forEach(c => { resultado.push(c); usados.add(c.id); });

  cifrasTab.filter(c => c.title.toLowerCase() === q && !usados.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .forEach(c => { resultado.push(c); usados.add(c.id); });

  cifrasTab.filter(c => !usados.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .forEach(c => { resultado.push(c); usados.add(c.id); });

  cifrasTab.filter(c => c.title.toLowerCase().includes(q) && !usados.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .forEach(c => { resultado.push(c); usados.add(c.id); });

  return resultado.slice(0, 20);
}

// Modifique a função searchDrive para incluir autenticação
async function searchDrive(query) {
  try {
    // Verifica se está autenticado
    if (!window.gapi || !gapi.auth2.getAuthInstance().isSignedIn.get()) {
      await gapiAuth();
    }
    
    if (!query) return [];
    const url = `https://www.googleapis.com/drive/v3/files?q='${GOOGLE_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false+and+name+contains+'${encodeURIComponent(query)}'&fields=files(id,name,thumbnailLink)&key=${GOOGLE_API_KEY}`;
    
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('Erro na busca do Drive:', resp.statusText);
      return [];
    }
    
    const data = await resp.json();
    return data.files || [];
  } catch (error) {
    console.error('Erro na busca do Drive:', error);
    return [];
  }
}

// Atualize o evento de input da barra de busca
// --- Busca com dropdown vinculado à caixa de busca ---
// Atualize o evento de busca para manter o dropdown vinculado à caixa
document.getElementById("search-bar").oninput = async (e) => {
  const val = e.target.value.trim();
  state.search = val;
  
  const dropdown = document.getElementById("search-dropdown");
  const searchBar = document.getElementById("search-bar");
  
  // Posiciona o dropdown abaixo da caixa de busca
  const searchRect = searchBar.getBoundingClientRect();
  dropdown.style.top = `${searchRect.bottom + window.scrollY}px`;
  dropdown.style.left = `${searchRect.left + window.scrollX}px`;
  dropdown.style.width = `${searchRect.width}px`;

  // Restante do código de busca permanece o mesmo...
  const cifrasTab = state.cifras[state.currentTab] || [];

  if (val.length === 0) {
    dropdown.classList.add("hidden");
    renderCifras();
    return;
  }

  dropdown.classList.remove("hidden");
  dropdown.innerHTML = "<li class='dropdown-loading'>Buscando...</li>";

  const resultadosLocal = buscaCifrasLocal(val, cifrasTab);
  let filesNuvem = [];
  
  try {
    filesNuvem = await searchDrive(val);
  } catch (error) {
    console.error("Erro na busca no Drive:", error);
  }

  updateDropdownResults(dropdown, resultadosLocal, filesNuvem, cifrasTab);
};

// Função para atualizar os resultados no dropdown
function updateDropdownResults(dropdown, resultadosLocal, filesNuvem, cifrasTab) {
  dropdown.innerHTML = "";

  const createHeader = (text) => {
    const header = document.createElement("li");
    header.className = "dropdown-header";
    header.textContent = text;
    return header;
  };

  // Ordenar local e nuvem antes de exibir
  resultadosLocal.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  filesNuvem.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  if (resultadosLocal.length) {
    dropdown.appendChild(createHeader("Nesta aba"));
    resultadosLocal.forEach(c => {
      const li = createDropdownItem(c.title, () => {
        const searchBar = document.getElementById("search-bar");
        if (searchBar) searchBar.value = "";
        state.search = "";
        dropdown.classList.add("hidden");
      });
      dropdown.appendChild(li);
    });
  }

  const idsLocais = new Set(cifrasTab.map(c => c.id));
  const filesNuvemFiltrados = filesNuvem.filter(f => !idsLocais.has(f.id));

  if (filesNuvemFiltrados.length) {
    dropdown.appendChild(createHeader("No Google Drive"));
    filesNuvemFiltrados.forEach(f => {
      const li = createDropdownItem(f.name, async () => {
        try {
          await addCifraFromDrive(f);
        } catch (error) {
          toast("Erro ao adicionar cifra");
          console.error(error);
        }
      });
      dropdown.appendChild(li);
    });
  }

  if (!resultadosLocal.length && !filesNuvemFiltrados.length) {
    const li = document.createElement("li");
    li.className = "dropdown-empty";
    li.textContent = "Nenhum resultado encontrado";
    dropdown.appendChild(li);
  }
}

// --- MODIFICADA: createDropdownItem (estilo mais profissional) ---
function createDropdownItem(text, onClick) {
  const li = document.createElement("li");
  li.className = "dropdown-item";
  li.style.padding = "6px 10px";
  li.style.cursor = "pointer";
  li.style.transition = "background 0.2s ease";
  li.style.fontWeight = "500";
  li.style.borderBottom = "1px solid #eee";
  li.textContent = stripExtension(text);
  li.onmouseover = () => li.style.background = "#f2f2f2";
  li.onmouseout = () => li.style.background = "";
  li.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return li;
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById("search-dropdown");
  const searchBar = document.getElementById("search-bar");
  
  if (!dropdown.contains(e.target) && e.target !== searchBar) {
    dropdown.classList.add("hidden");
  }
});

// Manter dropdown visível enquanto o input está em foco
document.getElementById("search-bar").addEventListener('focus', () => {
  if (state.search) {
    document.getElementById("search-dropdown").classList.remove("hidden");
  }
});

// Função para buscar no Google Drive (já existente no seu código)
async function searchDrive(query) {
  if (!query) return [];
  const url = `https://www.googleapis.com/drive/v3/files?q='${GOOGLE_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false+and+name+contains+'${encodeURIComponent(query)}'&fields=files(id,name,thumbnailLink)&key=${GOOGLE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}

// Função para adicionar a cifra vinda do Drive (já existente no seu código)
function addCifraFromDrive(file) {
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  if (state.cifras[tab].some(c => c.id === file.id)) return;
  const driveUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`;
  state.cifras[tab].push({
    id: file.id,
    title: file.name,
    url: driveUrl,
    driveId: file.id
  });
  saveState();
  renderCifras();
  toast(`Cifra adicionada!`);

  // Limpa a search bar completamente após adicionar
  const searchBar = document.getElementById("search-bar");
  if (searchBar) {
    searchBar.value = "";
    state.search = "";
    document.getElementById("search-dropdown").classList.add("hidden");
  }
}

// --- OCR/TRANSPOSE INTEGRAÇÃO PARA CIFRA EM IMAGEM ---
function getProxiedUrl(originalUrl) {
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  return "https://cors-proxy-cifras.onrender.com/proxy?url=" + encodeURIComponent(originalUrl);
}

function openFullscreen(cifra) {
  const overlay = document.getElementById("fullscreen-overlay");
  let fullscreenUrl = getProxiedUrl(cifra.url); // <-- Aqui usamos o proxy!
  overlay.innerHTML = `
    <button class="close-fullscreen">&times;</button>
    <div class="fullscreen-img-wrapper" style="position:relative;">
      <img class="fullscreen-img" id="fullscreen-img" src="${fullscreenUrl}" alt="${cifra.title}" />
      <div id="tone-controls" class="fullscreen-tone-controls hidden">
        <button id="tone-down">-</button>
        <span class="tone-label" id="tone-value">0</span>
        <button id="tone-up">+</button>
      </div>
      <div id="overlay-notes"></div>
    </div>
    <div id="transp-overlay-msg" style="position:absolute;bottom:40px;left:0;right:0;text-align:center;font-size:1.2em;color:#fff;text-shadow:0 2px 8px #000;display:none;">
      <span>Reconhecendo notas... Aguarde.</span>
    </div>
  `;
  overlay.classList.remove("hidden");
  overlay.querySelector(".close-fullscreen").onclick = () => {
    overlay.classList.add("hidden");
    if (document.fullscreenElement) document.exitFullscreen();
  };
  overlay.onclick = e => { 
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      if (document.fullscreenElement) document.exitFullscreen();
    }
  };
  if (overlay.requestFullscreen) overlay.requestFullscreen();

  // === Zoom e Pan ===
  const img = document.getElementById("fullscreen-img");
  let scale = 1, lastScale = 1, startX = 0, startY = 0, lastX = 0, lastY = 0, isDragging = false;
  let pinchStartDist = null, pinchStartScale = null;
  img.onwheel = function(e) {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.5, Math.min(5, scale * delta));
    img.style.transformOrigin = `${offsetX}px ${offsetY}px`;
    img.style.transform = `scale(${scale}) translate(${lastX}px, ${lastY}px)`;
  };
  img.onmousedown = function(e) {
    isDragging = true;
    startX = e.clientX - lastX;
    startY = e.clientY - lastY;
    e.preventDefault();
  };
  overlay.onmousemove = function(e) {
    if (isDragging) {
      lastX = e.clientX - startX;
      lastY = e.clientY - startY;
      img.style.transform = `scale(${scale}) translate(${lastX}px, ${lastY}px)`;
    }
  };
  overlay.onmouseup = function() { isDragging = false; };
  overlay.onmouseleave = function() { isDragging = false; };
  img.ontouchstart = function(e) {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = scale;
    } else if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX - lastX;
      startY = e.touches[0].clientY - lastY;
    }
  };
  img.ontouchmove = function(e) {
    if (e.touches.length === 2 && pinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      scale = Math.max(0.5, Math.min(5, pinchStartScale * dist / pinchStartDist));
      img.style.transform = `scale(${scale}) translate(${lastX}px, ${lastY}px)`;
      e.preventDefault();
    } else if (e.touches.length === 1 && isDragging) {
      lastX = e.touches[0].clientX - startX;
      lastY = e.touches[0].clientY - startY;
      img.style.transform = `scale(${scale}) translate(${lastX}px, ${lastY}px)`;
      e.preventDefault();
    }
  };
  img.ontouchend = function(e) {
    if (e.touches.length < 2) {
      pinchStartDist = null;
      pinchStartScale = null;
    }
    if (e.touches.length === 0) {
      isDragging = false;
    }
  };
  let lastTapTime = 0;
  img.ondblclick = function(e) {
    scale = 1; lastX = 0; lastY = 0;
    img.style.transform = '';
  };
  img.ontouchend = function(e) {
    if (e.touches.length === 0) {
      const now = Date.now();
      if (now - lastTapTime < 350) {
        scale = 1; lastX = 0; lastY = 0;
        img.style.transform = '';
      }
      lastTapTime = now;
      isDragging = false;
    }
  };

  // ---- OCR e Overlay de Notas ----
  const overlayNotes = document.getElementById("overlay-notes");
  const transpMsg = document.getElementById("transp-overlay-msg");
  const controls = document.getElementById("tone-controls");
  let currentTone = 0;
  let notesData = [];

  // Função de transposição (cromática, com sufixos)
  const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  function normalizeNote(note) {
    switch(note) {
      case "Db": return "C#";
      case "Eb": return "D#";
      case "Gb": return "F#";
      case "Ab": return "G#";
      case "Bb": return "A#";
      default: return note;
    }
  }
  function transposeChord(chord, semitones) {
    const regex = /^([A-G](#|b)?)([^/\s]*)?(\/([A-G](#|b)?))?/;
    const match = chord.match(regex);
    if (!match) return chord;
    let root = normalizeNote(match[1]);
    let suffix = match[3] || "";
    let bass = match[5] ? normalizeNote(match[5]) : null;
    let idx = NOTES_SHARP.indexOf(root);
    if (idx === -1) return chord;
    let newIdx = (idx + semitones + 12) % 12;
    let newRoot = NOTES_SHARP[newIdx];
    let newBass = "";
    if (bass) {
      let idxBass = NOTES_SHARP.indexOf(bass);
      if (idxBass !== -1) {
        let newIdxBass = (idxBass + semitones + 12) % 12;
        newBass = "/" + NOTES_SHARP[newIdxBass];
      } else {
        newBass = "/" + bass;
      }
    }
    return `${newRoot}${suffix}${newBass}`;
  }

  function renderOverlays() {
    overlayNotes.innerHTML = "";
    notesData.forEach(note => {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.left = `${note.bbox.x0}px`;
      div.style.top = `${note.bbox.y0}px`;
      div.style.background = "#fff";
      div.style.color = "#222";
      div.style.fontWeight = "bold";
      div.style.borderRadius = "4px";
      div.style.padding = "1px 5px";
      div.style.fontSize = "1.1em";
      div.style.boxShadow = "0 1px 2px #999";
      div.style.pointerEvents = "none";
      div.style.zIndex = "10020";
      div.textContent = transposeChord(note.text, currentTone);
      overlayNotes.appendChild(div);
    });
  }

  function detectNotes() {
    transpMsg.style.display = "block";
    overlayNotes.innerHTML = "";
    controls.classList.add("hidden");
    Tesseract.recognize(img.src, 'eng', {
      logger: m => { transpMsg.querySelector("span").textContent = "Reconhecendo: " + (m.progress*100).toFixed(0) + "%"; }
    }).then(({ data }) => {
      notesData = [];
      (data.words||[]).forEach(wordObj => {
        if (/^[A-G][#b]?(m|sus|dim|aug|add|maj|min|[0-9]*)?$/i.test(wordObj.text.trim())) {
          notesData.push({
            text: wordObj.text.trim(),
            bbox: wordObj.bbox
          });
        }
      });
      if (notesData.length === 0) {
        transpMsg.querySelector("span").textContent = "Nenhuma nota reconhecida. Melhore a imagem ou tente outro idioma.";
        setTimeout(()=>{ transpMsg.style.display = "none"; }, 3000);
      } else {
        renderOverlays();
        transpMsg.style.display = "none";
        controls.classList.remove("hidden");
      }
    });
  }

  // Triplo clique para rodar o OCR
  let clickCount = 0, clickTimer = null;
  img.addEventListener('click', function() {
    clickCount++;
    if (clickCount === 3) {
      clickCount = 0;
      clearTimeout(clickTimer);
      detectNotes();
    } else {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(()=>{ clickCount = 0; }, 700);
    }
  });

  // Controles de tonalidade
  document.getElementById("tone-up").onclick = () => {
    currentTone++;
    document.getElementById("tone-value").textContent = currentTone > 0 ? `+${currentTone}` : currentTone;
    renderOverlays();
  };
  document.getElementById("tone-down").onclick = () => {
    currentTone--;
    document.getElementById("tone-value").textContent = currentTone > 0 ? `+${currentTone}` : currentTone;
    renderOverlays();
  };
}

// --- Upload para Google Drive ---
async function uploadCifraToDrive(cifra) {
  try {
    const tokenResponse = await gapiAuth();
    const accessToken = tokenResponse.access_token;

    // 1. Obter o blob da imagem
    let fileBlob;
    if (cifra.url.startsWith('blob:')) {
      fileBlob = await fetch(cifra.url).then(r => r.blob());
    } else if (cifra.url.startsWith('data:')) {
      const byteString = atob(cifra.url.split(',')[1]);
      const mimeType = cifra.url.match(/:(.*?);/)[1];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      fileBlob = new Blob([ab], { type: mimeType });
    } else {
      throw new Error("Tipo de URL não suportado");
    }

    // 2. Criar metadados
    const metadata = {
      name: cifra.title,
      mimeType: fileBlob.type || "image/jpeg",
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };

    // 3. Configurar o upload
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    // 4. Fazer a requisição
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
      {
        method: 'POST',
        headers: new Headers({
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${form._boundary}`
        }),
        body: form
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Detalhes do erro:", errorData);
      throw new Error(`Erro no upload: ${errorData.error.message}`);
    }

    return await response.json();

  } catch (error) {
    console.error("Erro completo:", error);
    toast(`Falha no upload: ${error.message}`);
    throw error;
  }
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

// --- Modal: nuvem ---
function showCloudModal(files=[]) {
  const modal = document.getElementById("cloud-modal");
  modal.classList.remove("hidden");
  const list = document.getElementById("cloud-list");
  list.innerHTML = "";
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
    img.src = `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`;
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
        url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`,
        driveId: f.id
      });
    });
    saveState();
    renderCifras();
    modal.classList.add("hidden");
    toast(`${selected.length} cifra(s) adicionada(s) da nuvem!`);
  };
  document.getElementById("close-cloud-modal").onclick = () => modal.classList.add("hidden");
}

// --- Polling for online tabs ---
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    state.tabs.filter(tab => tab.mode === "online").forEach(async tab => {
      // Simulação, expanda para integração real se desejar
    });
  }, POLL_INTERVAL);
}

// --- Algoritmo de transposição para cifra em texto ---
const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function normalizeNote(note) {
  switch(note) {
    case "Db": return "C#";
    case "Eb": return "D#";
    case "Gb": return "F#";
    case "Ab": return "G#";
    case "Bb": return "A#";
    default: return note;
  }
}
function transposeChord(chord, semitones) {
  const regex = /^([A-G](#|b)?)([^/\s]*)?(\/([A-G](#|b)?))?$/;
  const match = chord.match(regex);
  if (!match) return chord;
  let root = normalizeNote(match[1]);
  let suffix = match[3] || "";
  let bass = match[5] ? normalizeNote(match[5]) : null;
  let idx = NOTES_SHARP.indexOf(root);
  if (idx === -1) return chord;
  let newIdx = (idx + semitones + 12) % 12;
  let newRoot = NOTES_SHARP[newIdx];
  let newBass = "";
  if (bass) {
    let idxBass = NOTES_SHARP.indexOf(bass);
    if (idxBass !== -1) {
      let newIdxBass = (idxBass + semitones + 12) % 12;
      newBass = "/" + NOTES_SHARP[newIdxBass];
    } else {
      newBass = "/" + bass;
    }
  }
  return `<span class="nota-sobreposta">${newRoot}${suffix}${newBass}</span>`;
}
function transposeTextCifra(text, semitones) {
  const chordRegex = /\b([A-G](#|b)?([a-z0-9º°+\-\(\)]*)?(\/[A-G](#|b)?)?)\b/g;
  return text.replace(chordRegex, (match) => transposeChord(match, semitones));
}

// --- FULLSCREEN PARA CIFRA DE TEXTO ---
function abrirCifraTextoFullscreen() {
  const cifraOriginal = document.getElementById("cifra-texto-bloco").innerText;
  let currentTransposition = 0;

  const overlay = document.getElementById("fullscreen-overlay");
  overlay.innerHTML = `
    <button class="close-fullscreen">&times;</button>
    <div style="position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;">
      <pre id="cifra-texto-full" style="font-size:1.1em;max-width:90vw;max-height:80vh;overflow:auto;background:#fff;color:#222;padding:25px 18px 18px 18px;border-radius:12px;box-shadow:0 2px 16px #0008;">
      </pre>
      <div id="tone-controls-text" class="fullscreen-tone-controls hidden">
        <button id="tone-down-text">-</button>
        <span class="tone-label" id="tone-value-text">0</span>
        <button id="tone-up-text">+</button>
      </div>
    </div>
  `;
  overlay.classList.remove("hidden");

  function atualizarCifraTexto() {
    overlay.querySelector("#cifra-texto-full").innerHTML = transposeTextCifra(cifraOriginal, currentTransposition);
    overlay.querySelector("#tone-value-text").textContent = currentTransposition > 0 ? `+${currentTransposition}` : currentTransposition;
  }
  atualizarCifraTexto();

  overlay.querySelector(".close-fullscreen").onclick = () => {
    overlay.classList.add("hidden");
    if (document.fullscreenElement) document.exitFullscreen();
  };
  overlay.onclick = e => { 
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      if (document.fullscreenElement) document.exitFullscreen();
    }
  };
  if (overlay.requestFullscreen) overlay.requestFullscreen();

  let clickCount = 0, clickTimer = null;
  const pre = overlay.querySelector("#cifra-texto-full");
  const controls = overlay.querySelector("#tone-controls-text");
  pre.addEventListener('click', function() {
    clickCount++;
    if (clickCount === 3) {
      controls.classList.remove("hidden");
      clickCount = 0;
      clearTimeout(clickTimer);
    } else {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(()=>{ clickCount = 0; }, 500);
    }
  });

  overlay.querySelector("#tone-up-text").onclick = () => {
    currentTransposition++;
    atualizarCifraTexto();
  };
  overlay.querySelector("#tone-down-text").onclick = () => {
    currentTransposition--;
    atualizarCifraTexto();
  };
}

// --- Startup ---
window.onload = () => {
  loadState();
  renderTabs();
  setTab(state.currentTab);
  if (typeof startPolling === "function") startPolling();
};
