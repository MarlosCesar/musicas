const TABS_DEFAULT = [
  { name: "Domingo Manhã", type: "default", mode: "offline" },
  { name: "Domingo Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
  { name: "Santa Ceia", type: "default", mode: "offline" }
];
const LOCALSTORE_KEY = "cifras2-app-state-v2";
const POLL_INTERVAL = 5000;

const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCguk";
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";

let state = {
  tabs: [...TABS_DEFAULT],
  cifras: {},
  selection: {},
  currentTab: "Domingo Manhã",
  search: "",
  onlineCache: {},
};

let pollTimer = null;

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
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
function renderTabs() {
  const tabsElem = document.getElementById("tabs");
  tabsElem.innerHTML = "";
  state.tabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab${state.currentTab === tab.name ? " active" : ""} ${tab.mode || "offline"}`;
    btn.textContent = tab.name;
    btn.onclick = () => setTab(tab.name);
    if (tab.type === "default") {
      const more = document.createElement("span");
      more.className = "tab-more";
      more.innerHTML = "&#8942;";
      more.onclick = e => { e.stopPropagation(); showTabModeModal(tab); };
      btn.appendChild(more);
    }
    tabsElem.appendChild(btn);
  });
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
      
      // Corrige a URL para imagens do Drive
      if (cifra.driveId) {
        img.src = `https://drive.google.com/thumbnail?id=${cifra.driveId}&sz=w200`;
      } else {
        img.src = cifra.url;
      }
      
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
document.getElementById("fab").onclick = () => {
  document.getElementById("fab-menu").classList.toggle("hidden");
};

document.getElementById("fab-buscar").onclick = () => {
  document.getElementById("fab-menu").classList.add("hidden");
  document.getElementById("file-input").click();
};

document.getElementById("fab-camera").onclick = () => {
  document.getElementById("fab-menu").classList.add("hidden");
  document.getElementById("fab-camera").onclick = openCameraCapture;
};

document.getElementById("fab-upload").onclick = async () => {
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

// --- Camera Capture ---
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
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      overlay.remove();

      const url = URL.createObjectURL(blob);
      const now = new Date();
      const title = `Foto ${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,"0")}-${now.getDate().toString().padStart(2,"0")} ${now.getHours().toString().padStart(2,"0")}.${now.getMinutes().toString().padStart(2,"0")}.${now.getSeconds().toString().padStart(2,"0")}.jpg`;
      const id = "foto-" + now.getTime();

      const tab = state.currentTab;
      if (!state.cifras[tab]) state.cifras[tab] = [];
      state.cifras[tab].push({
        id,
        title,
        url,
        createdAt: now.toISOString()
      });
      if (!state.selection[tab]) state.selection[tab] = new Set();
      state.selection[tab].add(id);

      saveState();
      renderCifras();
    }, "image/jpeg", 0.92);
  };
}

// --- Search bar e dropdown de busca ---
document.getElementById("search-bar").oninput = async (e) => {
  const val = e.target.value.trim();
  state.search = val;
  renderCifras();
  const dropdown = document.getElementById("search-dropdown");
  if (val.length === 0) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }
  dropdown.innerHTML = "<li>Buscando na nuvem...</li>";
  dropdown.classList.remove("hidden");
  const files = await searchDrive(val);
  dropdown.innerHTML = "";
  if (!files.length) {
    dropdown.innerHTML = "<li>Nenhuma cifra encontrada</li>";
    return;
  }
  files.forEach(f => {
    const li = document.createElement("li");
    li.textContent = stripExtension(f.name);
    li.onclick = () => {
      addCifraFromDrive(f);
      dropdown.classList.add("hidden");
      document.getElementById("search-bar").value = "";
      state.search = "";
      renderCifras();
    };
    dropdown.appendChild(li);
  });
};

document.getElementById("search-bar").onfocus = () => {
  if (state.search) document.getElementById("search-dropdown").classList.remove("hidden");
};

document.getElementById("search-bar").onblur = () => setTimeout(() => {
  document.getElementById("search-dropdown").classList.add("hidden");
}, 200);

// --- Adicionar cifra da nuvem ---
function addCifraFromDrive(file) {
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  if (state.cifras[tab].some(c => c.id === file.id)) return;
  
  // URL corrigida para imagens do Drive
  const driveUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`;
  
  state.cifras[tab].push({
    id: file.id,
    title: file.name,
    url: driveUrl,
    driveId: file.id // Armazena o ID do Drive para referência
  });
  saveState();
  renderCifras();
  toast(`Cifra "${file.name}" adicionada!`);
}

// --- Google Drive Search ---
async function searchDrive(query) {
  if (!query) return [];
  const url = `https://www.googleapis.com/drive/v3/files?q='${GOOGLE_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false+and+name+contains+'${encodeURIComponent(query)}'&fields=files(id,name,thumbnailLink,iconLink,mimeType)&key=${GOOGLE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}

// --- Fullscreen ---
function openFullscreen(cifra) {
  console.log("URL recebida:", cifra);
  const overlay = document.getElementById("fullscreen-overlay");
  // Use sempre o campo url
  let fullscreenUrl = cifra.url;
  overlay.innerHTML = `<button class="close-fullscreen">&times;</button>
    <div class="fullscreen-img-wrapper">
      <img class="fullscreen-img" src="${fullscreenUrl}" alt="${cifra.title}" />
    </div>`;
  overlay.classList.remove("hidden");
  overlay.querySelector(".close-fullscreen").onclick = () => {
    overlay.classList.add("hidden");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };
  overlay.onclick = e => { 
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  };
  // Entrar em fullscreen nativo
  if (overlay.requestFullscreen) {
    overlay.requestFullscreen();
  } else if (overlay.webkitRequestFullscreen) {
    overlay.webkitRequestFullscreen();
  } else if (overlay.msRequestFullscreen) {
    overlay.msRequestFullscreen();
  }

  // === Zoom e Pan ===
  const img = overlay.querySelector(".fullscreen-img");
  let scale = 1, lastScale = 1, startX = 0, startY = 0, lastX = 0, lastY = 0, isDragging = false;
  let pinchStartDist = null, pinchStartScale = null;

  // Mouse wheel zoom
  img.onwheel = function(e) {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    // Zoom focal point
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.5, Math.min(5, scale * delta));
    img.style.transformOrigin = `${offsetX}px ${offsetY}px`;
    img.style.transform = `scale(${scale}) translate(${lastX}px, ${lastY}px)`;
  };

  // Mouse drag (pan)
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

  // Touch pinch zoom e pan
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

  // Duplo clique/double tap para resetar zoom
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
}

// --- Upload para Google Drive ---
async function uploadCifraToDrive(cifra) {
  // Implemente aqui sua integração OAuth2 real Google Drive!
  alert("Upload real para o Google Drive precisa ser implementado com OAuth2!");
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

// --- Startup ---
window.onload = () => {
  loadState();
  renderTabs();
  setTab(state.currentTab);
  startPolling();
};
