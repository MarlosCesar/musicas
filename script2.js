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

// Atualize renderTabs() para renderizar também no mobile
function renderTabs() {
    const desktopTabs = document.getElementById("tabs");
    const mobileTabs = document.getElementById("mobile-tabs");
    
    [desktopTabs, mobileTabs].forEach(container => {
        if (!container) return;
        container.innerHTML = "";
        
        state.tabs.forEach(tab => {
            const tabBtn = document.createElement("button");
            tabBtn.className = "tab-btn"; // Estilize conforme necessário
            tabBtn.textContent = tab.name;
            tabBtn.onclick = () => {
                setTab(tab.name);
                document.getElementById("mobile-menu").classList.add("hidden");
            };
            container.appendChild(tabBtn);
        });
    });
}

// Controle do menu hamburguer
document.getElementById("hamburger-menu-btn").addEventListener("click", () => {
    const menu = document.getElementById("mobile-menu");
    menu.classList.toggle("hidden");
});

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

  document.addEventListener("DOMContentLoaded", async () => {
    // 1. Inicialização do estado
    loadState();
    
    // 2. Renderização inicial
    renderTabs();
    renderCifras();
    updateFloatControls();

    // 3. Controle do menu hamburguer e sidebar
    const setupMenu = () => {
        const hamburgerBtn = document.getElementById('hamburger-menu-btn');
        const sidebarMenu = document.getElementById('sidebar-menu');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const mobileMenu = document.getElementById('mobile-menu');

        hamburgerBtn?.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });

        sidebarOverlay?.addEventListener('click', () => {
            sidebarMenu.classList.remove('open');
            sidebarOverlay.classList.add('hidden');
        });
    };

    // 4. Sistema de busca melhorado
    const setupSearch = () => {
        const searchBar = document.getElementById('search-bar');
        const dropdown = document.getElementById('search-dropdown');

        searchBar?.addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            dropdown.innerHTML = "";
            
            if (searchTerm.length < 2) {
                dropdown.classList.add('hidden');
                return;
            }

            dropdown.classList.remove('hidden');

            // Filtra e ordena alfabeticamente
            const allCifras = Object.values(state.cifras).flat();
            const filtered = allCifras
                .filter(c => c.title.toLowerCase().includes(searchTerm))
                .sort((a, b) => a.title.localeCompare(b.title));

            filtered.forEach(cifra => {
                const li = document.createElement('li');
                li.textContent = cifra.title.replace('.jpg', '');
                li.onclick = () => {
                    const tabName = Object.keys(state.cifras).find(tab => 
                        state.cifras[tab].some(c => c.id === cifra.id));
                    if (tabName) setTab(tabName);
                    dropdown.classList.add('hidden');
                };
                dropdown.appendChild(li);
            });
        });

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!searchBar.contains(e.target) {
                dropdown.classList.add('hidden');
            }
        });
    };

    // 5. Controles flutuantes
    const setupFloatControls = () => {
        document.getElementById('select-all-btn')?.addEventListener('click', () => {
            state.selection[state.currentTab] = new Set(state.cifras[state.currentTab].map(c => c.id));
            renderCifras();
        });

        document.getElementById('clear-selection-btn')?.addEventListener('click', () => {
            clearSelection(state.currentTab);
            renderCifras();
        });

        document.getElementById('delete-selected-btn')?.addEventListener('click', () => {
            if (confirm("Tem certeza que deseja excluir as cifras selecionadas?")) {
                removeCifras(state.currentTab, Array.from(state.selection[state.currentTab]));
            }
        });
    };

    // 6. Modal da nuvem
    const setupCloudModal = () => {
        const cloudModal = document.getElementById('cloud-modal');
        document.getElementById('close-cloud-modal')?.addEventListener('click', () => {
            cloudModal.classList.add('hidden');
        });

        // Implementação do carregamento da nuvem
        document.getElementById('fab-upload')?.addEventListener('click', async () => {
            try {
                await gapiAuth();
                cloudModal.classList.remove('hidden');
                // Carregar cifras da nuvem aqui
            } catch (error) {
                showToast('Erro ao acessar a nuvem');
            }
        });
    };

    // 7. FAB e ações
    const setupFAB = () => {
        const fab = document.getElementById('fab');
        const fabMenu = document.getElementById('fab-menu');
        const fullscreenOverlay = document.getElementById('fullscreen-overlay');

        fab?.addEventListener('click', () => {
            fabMenu.classList.toggle('hidden');
            fullscreenOverlay.classList.toggle('hidden');
        });

        document.getElementById('fab-buscar2')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
    };

    // 8. Modo escuro
    const setupDarkMode = () => {
        document.getElementById('fab-darkmode')?.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const icon = document.getElementById('icon-modo-escuro');
            icon.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
        });
    };

    // 9. Upload de arquivos
    const setupFileUpload = () => {
        document.getElementById('file-input')?.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (!files.length) return;

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
            event.target.value = ''; // Reset input
        });
    };

    // Inicializar todos os módulos
    setupMenu();
    setupSearch();
    setupFloatControls();
    setupCloudModal();
    setupFAB();
    setupDarkMode();
    setupFileUpload();

    // Debug
    console.log('Aplicativo inicializado com sucesso');
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
  // Atualize a função de busca (por volta da linha 400)
document.getElementById("search-bar").addEventListener("input", async (event) => {
    const searchTerm = event.target.value.toLowerCase();
    const dropdown = document.getElementById("search-dropdown");
    
    dropdown.innerHTML = "";
    dropdown.classList.remove("hidden");

    if (searchTerm.length < 2) {
        dropdown.classList.add("hidden");
        return;
    }

    // Filtra e ordena alfabeticamente
    const allCifras = Object.values(state.cifras).flat();
    const filtered = allCifras
        .filter(c => c.title.toLowerCase().includes(searchTerm))
        .sort((a, b) => a.title.localeCompare(b.title));

    filtered.forEach(cifra => {
        const li = document.createElement("li");
        li.textContent = cifra.title.replace('.jpg', ''); // Remove .jpg
        li.onclick = () => setTabAndHighlight(cifra);
        dropdown.appendChild(li);
    });
});

function setTabAndHighlight(cifra) {
    // Encontra a aba onde a cifra está
    const tabName = Object.keys(state.cifras).find(tab => 
        state.cifras[tab].some(c => c.id === cifra.id));
    
    if (tabName) {
        setTab(tabName);
        // Scroll e destaque para a cifra
        document.querySelector(`[data-id="${cifra.id}"]`)?.scrollIntoView();
    }
}
