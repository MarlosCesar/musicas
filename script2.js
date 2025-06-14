const TABS_DEFAULT = [
    { name: "Domingo Manhã", type: "default", mode: "offline" },
    { name: "Domingo Noite", type: "default", mode: "offline" },
    { name: "Segunda", type: "default", mode: "offline" },
    { name: "Quarta", type: "default", mode: "offline" }
];

const LOCALSTORE_KEY = "cifras2-app-state-v3";
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive";

let state = {
    tabs: [...TABS_DEFAULT],
    cifras: {},
    selection: {},
    currentTab: "Domingo Manhã",
    search: "",
    darkMode: false
};

// Utility Functions
function stripExtension(filename) {
    return filename.replace(/\.[^/.]+$/, "");
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// State Management
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
    const saved = localStorage.getItem(LOCALSTORE_KEY);
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            state.tabs = loaded.tabs || [...TABS_DEFAULT];
            state.cifras = loaded.cifras || {};
            state.selection = {};
            
            if (loaded.selection) {
                for (const tab in loaded.selection) {
                    state.selection[tab] = new Set(loaded.selection[tab]);
                }
            }
            
            state.currentTab = loaded.currentTab || "Domingo Manhã";
            state.darkMode = loaded.darkMode || false;
            
            if (state.darkMode) {
                document.body.classList.add("dark-mode");
                document.getElementById("icon-modo-escuro").textContent = '☀️';
            }
        } catch (e) {
            console.error("Error loading state:", e);
        }
    }
}

// Google Drive Integration
function loadGapi() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function gapiAuth() {
    await loadGapi();
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

// UI Rendering
function renderTabs() {
    const desktopTabs = document.getElementById("tabs");
    const mobileTabs = document.getElementById("mobile-tabs");
    
    [desktopTabs, mobileTabs].forEach(container => {
        if (!container) return;
        container.innerHTML = "";
        
        state.tabs.forEach(tab => {
            const tabBtn = document.createElement("button");
            tabBtn.className = `tab-btn ${state.currentTab === tab.name ? "active" : ""}`;
            tabBtn.textContent = tab.name;
            tabBtn.onclick = () => {
                setTab(tab.name);
                document.getElementById("mobile-menu").classList.add("hidden");
                document.getElementById("sidebar-overlay").classList.add("hidden");
            };
            container.appendChild(tabBtn);
        });
    });
}

function setTab(tabName) {
    state.currentTab = tabName;
    renderTabs();
    renderCifras();
    updateFloatControls();
}

function renderCifras() {
    const cifraList = document.getElementById("cifra-list");
    const emptyState = document.getElementById("empty-state");
    const currentCifras = state.cifras[state.currentTab] || [];

    cifraList.innerHTML = "";

    if (currentCifras.length === 0) {
        emptyState.style.display = "flex";
        cifraList.style.display = "none";
    } else {
        emptyState.style.display = "none";
        cifraList.style.display = "block";

        currentCifras.forEach(cifra => {
            const li = document.createElement("li");
            li.className = "cifra-item";
            li.dataset.id = cifra.id;
            li.innerHTML = `
                <div class="cifra-header">
                    <span class="cifra-title">${stripExtension(cifra.title)}</span>
                    <div class="cifra-actions">
                        <button class="edit-cifra-btn" data-id="${cifra.id}" title="Editar">
                            <i class='fas fa-pen'></i>
                        </button>
                        <button class="delete-cifra-btn" data-id="${cifra.id}" title="Excluir">
                            <i class='fas fa-trash'></i>
                        </button>
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
    const floatControls = document.getElementById("float-controls");
    
    if (currentCifras.length > 0) {
        floatControls.classList.remove("hidden");
    } else {
        floatControls.classList.add("hidden");
    }

    document.getElementById("select-all-btn").style.display = currentCifras.length > 0 ? "inline-block" : "none";
    document.getElementById("clear-selection-btn").style.display = currentCifras.length > 0 ? "inline-block" : "none";
    document.getElementById("delete-selected-btn").style.display = selectedCount > 0 ? "inline-block" : "none";
    document.getElementById("rename-selected-btn").classList.toggle("hidden", selectedCount !== 1);
    document.getElementById("upload-selected-btn").classList.toggle("hidden", selectedCount !== 1);
}

// Core Functions
function addTab(name) {
    if (!name || state.tabs.some(t => t.name === name)) {
        showToast("Nome já existe ou é inválido");
        return false;
    }
    
    state.tabs.push({ name, type: "custom", mode: "offline" });
    state.cifras[name] = state.cifras[name] || [];
    saveState();
    renderTabs();
    setTab(name);
    showToast(`Categoria "${name}" adicionada`);
    return true;
}

function removeCifras(tab, ids) {
    if (!ids || ids.length === 0) return;
    
    state.cifras[tab] = (state.cifras[tab] || []).filter(cifra => !ids.includes(cifra.id));
    state.selection[tab] = new Set();
    saveState();
    renderCifras();
    showToast(`${ids.length} cifra(s) removida(s)`);
}

function clearSelection(tab) {
    state.selection[tab] = new Set();
    updateFloatControls();
}

async function uploadToDrive(cifra) {
    try {
        await gapiAuth();
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gapi.auth.getToken().access_token}`,
                'Content-Type': 'multipart/related'
            },
            body: JSON.stringify({
                name: `${cifra.title}.html`,
                mimeType: 'text/html',
                parents: [GOOGLE_DRIVE_FOLDER_ID]
            })
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        showToast('Cifra enviada para o Google Drive!');
        return true;
    } catch (error) {
        console.error('Erro ao enviar para o Google Drive:', error);
        showToast('Erro ao enviar para o Google Drive');
        return false;
    }
}

// Event Listeners
function setupEventListeners() {
    // Menu Hamburguer
    document.getElementById("hamburger-menu-btn").addEventListener("click", () => {
        document.getElementById("mobile-menu").classList.toggle("hidden");
    });

    // Sidebar Overlay
    document.getElementById("sidebar-overlay").addEventListener("click", () => {
        document.getElementById("mobile-menu").classList.add("hidden");
        document.getElementById("sidebar-overlay").classList.add("hidden");
    });

    // Add Tab
    document.getElementById("add-tab-btn").addEventListener("click", () => {
        const tabName = prompt("Nome da nova categoria:");
        if (tabName && tabName.trim()) {
            addTab(tabName.trim());
        }
    });

    // Search
    document.getElementById("search-bar").addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const dropdown = document.getElementById("search-dropdown");
        dropdown.innerHTML = "";
        
        if (term.length < 2) {
            dropdown.classList.add("hidden");
            return;
        }
        
        dropdown.classList.remove("hidden");
        
        Object.values(state.cifras).flat()
            .filter(c => c.title.toLowerCase().includes(term))
            .sort((a, b) => a.title.localeCompare(b.title))
            .forEach(cifra => {
                const li = document.createElement("li");
                li.textContent = stripExtension(cifra.title);
                li.onclick = () => {
                    const tabName = Object.keys(state.cifras).find(tab => 
                        state.cifras[tab].some(c => c.id === cifra.id));
                    if (tabName) setTab(tabName);
                    dropdown.classList.add("hidden");
                    e.target.value = "";
                };
                dropdown.appendChild(li);
            });
    });

    // FAB Menu
    const fab = document.getElementById("fab");
    const fabMenu = document.getElementById("fab-menu");
    const overlay = document.getElementById("fullscreen-overlay");
    
    fab.addEventListener("click", () => {
        fabMenu.classList.toggle("hidden");
        overlay.classList.toggle("hidden");
    });
    
    overlay.addEventListener("click", () => {
        fabMenu.classList.add("hidden");
        overlay.classList.add("hidden");
    });

    // File Upload
    document.getElementById("file-input").addEventListener("change", async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        
        for (const file of files) {
            const cifra = {
                id: Date.now().toString(),
                title: file.name,
                content: file.type.startsWith('image/') 
                    ? `<img src="${await fileToBase64(file)}" alt="${file.name}" style="max-width:100%;">`
                    : `<pre>${await file.text()}</pre>`
            };
            
            state.cifras[state.currentTab] = state.cifras[state.currentTab] || [];
            state.cifras[state.currentTab].push(cifra);
        }
        
        saveState();
        renderCifras();
        e.target.value = '';
        showToast(`${files.length} arquivo(s) adicionado(s)`);
    });

    // Float Controls
    document.getElementById("select-all-btn").addEventListener("click", () => {
        state.selection[state.currentTab] = new Set(state.cifras[state.currentTab].map(c => c.id));
        renderCifras();
        showToast("Todas as cifras selecionadas");
    });

    document.getElementById("clear-selection-btn").addEventListener("click", () => {
        clearSelection(state.currentTab);
        showToast("Seleção limpa");
    });

    document.getElementById("delete-selected-btn").addEventListener("click", () => {
        const selected = Array.from(state.selection[state.currentTab] || []);
        if (selected.length === 0) return;
        
        if (confirm(`Tem certeza que deseja excluir ${selected.length} cifra(s) selecionada(s)?`)) {
            removeCifras(state.currentTab, selected);
        }
    });

    document.getElementById("rename-selected-btn").addEventListener("click", () => {
        const selectedId = Array.from(state.selection[state.currentTab] || [])[0];
        if (!selectedId) return;
        
        const cifra = state.cifras[state.currentTab].find(c => c.id === selectedId);
        if (!cifra) return;
        
        const newTitle = prompt("Novo nome para a cifra:", stripExtension(cifra.title));
        if (newTitle !== null && newTitle.trim() !== "") {
            cifra.title = newTitle.trim();
            saveState();
            renderCifras();
            showToast("Cifra renomeada");
        }
    });

    document.getElementById("upload-selected-btn").addEventListener("click", async () => {
        const selectedId = Array.from(state.selection[state.currentTab] || [])[0];
        if (!selectedId) return;
        
        const cifra = state.cifras[state.currentTab].find(c => c.id === selectedId);
        if (!cifra) return;
        
        await uploadToDrive(cifra);
    });

    // Dark Mode
    document.getElementById("fab-darkmode").addEventListener("click", () => {
        state.darkMode = !state.darkMode;
        document.body.classList.toggle("dark-mode");
        document.getElementById("icon-modo-escuro").textContent = state.darkMode ? '☀️' : '🌙';
        saveState();
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-wrap")) {
            document.getElementById("search-dropdown").classList.add("hidden");
        }
    });
}

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    setupEventListeners();
    renderTabs();
    renderCifras();
    
    // Load Google API
    loadGapi().catch(e => console.log("Google API load error:", e));
    
    console.log("Aplicativo inicializado com sucesso");
});
