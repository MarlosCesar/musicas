const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" }
];

const LOCALSTORE_KEY = "cifras2-app-state-v2";
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
  darkMode: localStorage.getItem('darkMode') === 'true'
};

// ==================== FUNÇÕES AUXILIARES ====================

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
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
        showToast('Erro na autenticação: ' + response.error);
        console.error('Erro na autenticação:', response.error);
        document.getElementById('fab-upload').disabled = false;
      } else {
        resolve(response);
        showToast('Autenticação bem-sucedida!');
      }
    },
    error_callback: (error) => {
      reject(error);
      showToast('Erro na autenticação: ' + error.message);
      console.error('Erro no callback:', error);
      document.getElementById('fab-upload').disabled = false;
    }
    });
    client.requestAccessToken();
  });
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ==================== GERENCIAMENTO DE ESTADO ====================

function saveState() {
  const selectionToSave = {};
  for (const tab in state.selection) {
    selectionToSave[tab] = Array.from(state.selection[tab] || []);
  }
  localStorage.setItem(LOCALSTORE_KEY, JSON.stringify({
    tabs: state.tabs,
    cifras: state.cifras,
    selection: selectionToSave,
    currentTab: state.currentTab,
    darkMode: state.darkMode
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
    state.darkMode = loaded.darkMode || false;
  }
}

function initDarkMode() {
  if (state.darkMode) {
    document.body.classList.add('dark-mode');
    const icon = document.getElementById('icon-modo-escuro');
    if (icon) icon.textContent = '☀️';
  }
}

// ==================== FUNÇÕES DE RENDERIZAÇÃO ====================

function getTabIcon(tabName) {
  if (tabName.includes("Manhã")) return "fa-sun";
  if (tabName.includes("Noite")) return "fa-moon";
  if (tabName.includes("Segunda") || tabName.includes("Quarta")) return "fa-calendar-day";
  return "fa-music";
}

function renderTabs() {
  const desktopTabs = document.getElementById("tabs");
  const mobileTabs = document.getElementById("mobile-tabs");
  
  [desktopTabs, mobileTabs].forEach(container => {
    if (!container) return;
    container.innerHTML = "";
    
    state.tabs.forEach((tab, index) => {
      const tabBtn = document.createElement("button");
      tabBtn.className = `tab-btn flex items-center px-4 py-3 rounded-lg transition-colors duration-200 ${
        state.currentTab === tab.name ? 
        'bg-blue-500 text-white' : 
        'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`;
      
      tabBtn.innerHTML = `
        <i class="fas ${getTabIcon(tab.name)} mr-3"></i>
        <span>${tab.name}</span>
      `;
      
      tabBtn.onclick = () => {
        setTab(tab.name);
        if (window.innerWidth < 768) {
          document.getElementById("mobile-menu")?.classList.add("hidden");
        }
      };
      
      container.appendChild(tabBtn);
    });
  });
}

function renderCifras() {
  const cifraList = document.getElementById("cifra-list");
  const emptyState = document.getElementById("empty-state");
  const floatControls = document.getElementById("float-controls");
  const currentCifras = state.cifras[state.currentTab] || [];

  if (!cifraList || !emptyState || !floatControls) return;

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
          <span class="cifra-title">${cifra.title.replace('.jpg', '')}</span>
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
  const floatControls = document.getElementById("float-controls");
  if (!floatControls) return;

  const currentCifras = state.cifras[state.currentTab] || [];
  const selectedCount = state.selection[state.currentTab]?.size || 0;
  const selectAllBtn = document.getElementById("select-all-btn");
  const clearSelectionBtn = document.getElementById("clear-selection-btn");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");
  const renameSelectedBtn = document.getElementById("rename-selected-btn");
  const uploadSelectedBtn = document.getElementById("upload-selected-btn");

  if (!selectAllBtn || !clearSelectionBtn || !deleteSelectedBtn || !renameSelectedBtn || !uploadSelectedBtn) return;

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

// ==================== FUNÇÕES DE GERENCIAMENTO ====================

function setTab(tabName) {
  state.currentTab = tabName;
  saveState();
  renderTabs();
  renderCifras();
}

function addTab(name, privacy = "public", mode = "offline") {
  if (state.tabs.some(t => t.name === name)) return false;
  state.tabs.push({ name, type: "custom", privacy, mode });
  state.cifras[name] = state.cifras[name] || [];
  saveState();
  renderTabs();
  setTab(name);
  return true;
}

function removeCifras(tab, ids) {
  if (!state.cifras[tab]) return;
  
  state.cifras[tab] = state.cifras[tab].filter(cifra => !ids.includes(cifra.id));
  state.selection[tab] = new Set();
  saveState();
  renderCifras();
}

function clearSelection(tab) {
  if (!state.selection[tab]) return;
  state.selection[tab] = new Set();
  updateFloatControls();
}

function setTabAndHighlight(cifra) {
  const tabName = Object.keys(state.cifras).find(tab => 
    state.cifras[tab].some(c => c.id === cifra.id));
  
  if (tabName) {
    setTab(tabName);
    setTimeout(() => {
      const element = document.querySelector(`[data-id="${cifra.id}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        element.classList.add('highlight');
        setTimeout(() => element.classList.remove('highlight'), 2000);
      }
    }, 100);
  }
}

// ==================== CONFIGURAÇÕES DE UI ====================

function setupMenu() {
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  const sidebarMenu = document.getElementById('sidebar-menu');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const mobileMenu = document.getElementById('mobile-menu');

  if (hamburgerBtn && mobileMenu) {
    hamburgerBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  if (sidebarOverlay && sidebarMenu) {
    sidebarOverlay.addEventListener('click', () => {
      sidebarMenu.classList.remove('open');
      sidebarOverlay.classList.add('hidden');
    });
  }
}

function setupSearch() {
  const searchBar = document.getElementById('search-bar');
  const dropdown = document.getElementById('search-dropdown');

  if (!searchBar || !dropdown) return;

  searchBar.addEventListener('input', debounce((event) => {
    const searchTerm = event.target.value.toLowerCase().trim();
    dropdown.innerHTML = "";
    
    if (searchTerm.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.classList.remove('hidden');

    const allCifras = Object.values(state.cifras).flat();
    const filtered = allCifras
      .filter(c => c.title.toLowerCase().includes(searchTerm))
      .sort((a, b) => a.title.localeCompare(b.title));

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'p-3 text-gray-500 dark:text-gray-400';
      li.textContent = 'Nenhuma cifra encontrada';
      dropdown.appendChild(li);
    } else {
      filtered.forEach(cifra => {
        const li = document.createElement('li');
        li.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors duration-200';
        li.innerHTML = `
          <div class="font-medium">${cifra.title.replace('.jpg', '')}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">${Object.keys(state.cifras).find(tab => 
            state.cifras[tab].some(c => c.id === cifra.id))}</div>
        `;
        li.onclick = () => {
          setTabAndHighlight(cifra);
          dropdown.classList.add('hidden');
          searchBar.value = '';
        };
        dropdown.appendChild(li);
      });
    }
  }, 300));

  document.addEventListener('click', (e) => {
    if (searchBar && dropdown && !searchBar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function setupFloatControls() {
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  const renameSelectedBtn = document.getElementById('rename-selected-btn');
  const uploadSelectedBtn = document.getElementById('upload-selected-btn');

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      state.selection[state.currentTab] = new Set(state.cifras[state.currentTab].map(c => c.id));
      renderCifras();
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      clearSelection(state.currentTab);
      renderCifras();
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      if (confirm("Tem certeza que deseja excluir as cifras selecionadas?")) {
        removeCifras(state.currentTab, Array.from(state.selection[state.currentTab]));
      }
    });
  }

  if (renameSelectedBtn) {
    renameSelectedBtn.addEventListener('click', () => {
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
  }

  if (uploadSelectedBtn) {
    uploadSelectedBtn.addEventListener('click', async () => {
      const selectedId = Array.from(state.selection[state.currentTab])[0];
      const cifra = state.cifras[state.currentTab].find(c => c.id === selectedId);
      if (cifra) {
        try {
          uploadSelectedBtn.disabled = true;
          await gapiAuth();
          
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
        } finally {
          uploadSelectedBtn.disabled = false;
        }
      }
    });
  }
}

function setupCloudModal() {
  const cloudModal = document.getElementById('cloud-modal');
  const closeCloudModal = document.getElementById('close-cloud-modal');
  const addCloudBtn = document.getElementById('add-cloud-btn');

  if (closeCloudModal && cloudModal) {
    closeCloudModal.addEventListener('click', () => {
      cloudModal.classList.add('hidden');
    });
  }

  if (addCloudBtn) {
    addCloudBtn.addEventListener('click', () => {
      // Implementar lógica de adição da nuvem
      cloudModal.classList.add('hidden');
    });
  }
}

function setupFAB() {
  const fab = document.getElementById('fab');
  const fabMenu = document.getElementById('fab-menu');
  const fullscreenOverlay = document.getElementById('fullscreen-overlay');
  const fabBuscar2 = document.getElementById('fab-buscar2');
  const fabCamera = document.getElementById('fab-camera');
  const fileInput = document.getElementById('file-input');

  if (fab && fabMenu && fullscreenOverlay) {
    fab.addEventListener('click', () => {
      fabMenu.classList.toggle('hidden');
      fullscreenOverlay.classList.toggle('hidden');
    });
  }

  if (fabBuscar2 && fileInput) {
    fabBuscar2.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fabCamera) {
    fabCamera.addEventListener('click', () => {
      // Implementar lógica da câmera
      showToast('Funcionalidade de câmera em desenvolvimento');
    });
  }
}

function setupDarkMode() {
  const darkModeBtn = document.getElementById('fab-darkmode');
  const icon = document.getElementById('icon-modo-escuro');
  
  if (darkModeBtn && icon) {
    darkModeBtn.addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      localStorage.setItem('darkMode', state.darkMode);
      
      document.body.classList.toggle('dark-mode');
      icon.textContent = state.darkMode ? '☀️' : '🌙';
    });
  }
}

function setupFileUpload() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files.length) return;

    try {
      for (const file of files) {
        const cifra = {
          id: Date.now().toString(),
          title: stripExtension(file.name),
          content: file.type.startsWith('image/') 
            ? `<img src="${await fileToBase64(file)}" alt="${file.name}">`
            : `<pre>${await file.text()}</pre>`
        };
        
        state.cifras[state.currentTab] = state.cifras[state.currentTab] || [];
        state.cifras[state.currentTab].push(cifra);
      }
      
      saveState();
      renderCifras();
      showToast(`${files.length} arquivo(s) adicionado(s) com sucesso!`);
    } catch (error) {
      console.error('Erro ao processar arquivos:', error);
      showToast('Erro ao processar arquivos');
    } finally {
      event.target.value = ''; // Reset input
    }
  });
}

function setupMusicPlayer() {
  // Implementação básica - pode ser expandida
  const audio = new Audio();
  let currentSong = null;
  
  function playSong(song) {
    currentSong = song;
    audio.src = song.url;
    audio.play().catch(e => console.error("Erro ao reproduzir:", e));
  }
  
  // Exemplo de como integrar com as cifras
  document.addEventListener('play-song', (e) => {
    playSong(e.detail);
  });
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inicialização do estado
  loadState();
  initDarkMode();
  
  // 2. Renderização inicial
  renderTabs();
  renderCifras();
  
  // 3. Configurações de UI
  setupMenu();
  setupSearch();
  setupFloatControls();
  setupCloudModal();
  setupFAB();
  setupDarkMode();
  setupFileUpload();
  setupMusicPlayer();

  console.log('Aplicativo inicializado com sucesso');
});
