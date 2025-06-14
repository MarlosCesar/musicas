const TABS_DEFAULT = [
    { name: "Domingo Manhã", type: "default", mode: "offline" },
    { name: "Domingo Noite", type: "default", mode: "offline" },
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
    onlineCache: {}
};

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
    const saved = localStorage.getItem(LOCALSTORE_KEY);
    if (saved) {
        const loaded = JSON.parse(saved);
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
                document.getElementById("sidebar-menu").classList.remove("open");
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

function addTab(name) {
    if (state.tabs.some(t => t.name === name)) return false;
    state.tabs.push({ name, type: "custom", mode: "offline" });
    state.cifras[name] = state.cifras[name] || [];
    saveState();
    renderTabs();
    setTab(name);
    return true;
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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadState();
    renderTabs();
    renderCifras();

    // Menu Hamburguer
    document.getElementById("hamburger-menu-btn").addEventListener("click", () => {
        document.getElementById("mobile-menu").classList.toggle("hidden");
    });

    // Adicionar nova aba
    document.getElementById("add-tab-btn").addEventListener("click", () => {
        const tabName = prompt("Nome da nova categoria:");
        if (tabName && tabName.trim()) {
            addTab(tabName.trim());
        }
    });

    // Busca
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
                li.textContent = cifra.title.replace('.jpg', '');
                li.onclick = () => {
                    const tabName = Object.keys(state.cifras).find(tab => 
                        state.cifras[tab].some(c => c.id === cifra.id));
                    if (tabName) setTab(tabName);
                    dropdown.classList.add("hidden");
                };
                dropdown.appendChild(li);
            });
    });

    // FAB
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

    // Upload de arquivos
    document.getElementById("file-input").addEventListener("change", async (e) => {
        const files = e.target.files;
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
        e.target.value = '';
    });

    // Controles flutuantes
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

    // Modo escuro
    document.getElementById("fab-darkmode").addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        const icon = document.getElementById("icon-modo-escuro");
        icon.textContent = document.body.classList.contains("dark-mode") ? '☀️' : '🌙';
        saveState();
    });

    // Carregar modo escuro salvo
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add("dark-mode");
        document.getElementById("icon-modo-escuro").textContent = '☀️';
    }
});
