const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" }
];

const LOCALSTORE_KEY = "cifras2-app-state-v3";
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

function getTabIcon(tabName) {
  if (tabName.includes("Manhã")) return "fa-sun";
  if (tabName.includes("Noite")) return "fa-moon";
  if (tabName.includes("Segunda") || tabName.includes("Quarta")) return "fa-calendar-day";
  return "fa-music";
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
  const saved = localStorage.getItem(LOCALSTORE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.tabs = parsed.tabs || [...TABS_DEFAULT];
    state.cifras = parsed.cifras || {};
    state.selection = {};
    
    if (parsed.selection) {
      for (const tab in parsed.selection) {
        state.selection[tab] = new Set(parsed.selection[tab]);
      }
    }
    
    state.currentTab = parsed.currentTab || "Domingo Manhã";
    state.darkMode = parsed.darkMode || false;
  }
}

function initDarkMode() {
  if (state.darkMode) {
    document.body.classList.add('dark-mode');
    const icon = document.getElementById('darkmode-icon');
    if (icon) icon.textContent = '☀️';
  }
}

// ==================== FUNÇÕES DE RENDERIZAÇÃO ====================

function renderTabs() {
  const desktopTabs = document.getElementById('tabs');
  const mobileTabs = document.getElementById('mobile-tabs');
  
  [desktopTabs, mobileTabs].forEach(container => {
    if (!container) return;
    container.innerHTML = '';
    
    state.tabs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${
        state.currentTab === tab.name 
          ? 'bg-blue-500 text-white' 
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`;
      
      tabBtn.innerHTML = `
        <i class="fas ${getTabIcon(tab.name)} mr-3"></i>
        <span>${tab.name}</span>
      `;
      
      tabBtn.onclick = () => {
        setCurrentTab(tab.name);
        if (window.innerWidth < 768) {
          closeMobileMenu();
        }
      };
      
      container.appendChild(tabBtn);
    });
  });
}

function renderCifras() {
  const cifraList = document.getElementById('cifra-list');
  const emptyState = document.getElementById('empty-state');
  
  if (!cifraList || !emptyState) return;
  
  cifraList.innerHTML = '';
  const currentCifras = state.cifras[state.currentTab] || [];
  
  if (currentCifras.length === 0) {
    emptyState.style.display = 'flex';
    cifraList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    cifraList.style.display = 'block';
    
    currentCifras.forEach(cifra => {
      const li = document.createElement('li');
      li.className = 'cifra-item';
      li.dataset.id = cifra.id;
      
      li.innerHTML = `
        <div class="cifra-header">
          <h3 class="cifra-title">${cifra.title.replace('.jpg', '')}</h3>
          <div class="cifra-actions">
            <button class="edit-btn" data-id="${cifra.id}"><i class="fas fa-pen"></i></button>
            <button class="delete-btn" data-id="${cifra.id}"><i class="fas fa-trash"></i></button>
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

// ==================== FUNÇÕES DE GERENCIAMENTO ====================

function setCurrentTab(tabName) {
  state.currentTab = tabName;
  saveState();
  renderCifras();
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('sidebar-overlay');
  
  if (menu && overlay) {
    menu.classList.toggle('open');
    overlay.classList.toggle('hidden');
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('sidebar-overlay');
  
  if (menu && overlay) {
    menu.classList.remove('open');
    overlay.classList.add('hidden');
  }
}

function toggleFabMenu() {
  const fabMenu = document.getElementById('fab-menu');
  const overlay = document.getElementById('fullscreen-overlay');
  
  if (fabMenu && overlay) {
    fabMenu.classList.toggle('open');
    overlay.classList.toggle('hidden');
  }
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  localStorage.setItem('darkMode', state.darkMode);
  
  document.body.classList.toggle('dark-mode');
  const icon = document.getElementById('darkmode-icon');
  if (icon) {
    icon.textContent = state.darkMode ? '☀️' : '🌙';
  }
  
  saveState();
}

// ==================== CONFIGURAÇÃO DE EVENTOS ====================

function setupEventListeners() {
  // Menu Hamburguer
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleMobileMenu);
  }
  
  // Overlay do menu mobile
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeMobileMenu);
  }
  
  // Dark Mode Toggle
  const darkModeBtn = document.getElementById('darkmode-toggle');
  if (darkModeBtn) {
    darkModeBtn.addEventListener('click', toggleDarkMode);
  }
  
  // FAB e menu FAB
  const fab = document.getElementById('fab');
  if (fab) {
    fab.addEventListener('click', toggleFabMenu);
  }
  
  // Overlay do FAB
  const fabOverlay = document.getElementById('fullscreen-overlay');
  if (fabOverlay) {
    fabOverlay.addEventListener('click', toggleFabMenu);
  }
  
  // Configuração da busca
  setupSearch();
  
  // Configuração dos controles flutuantes
  setupFloatControls();
}

function setupSearch() {
  const searchBar = document.getElementById('search-bar');
  const dropdown = document.getElementById('search-dropdown');
  
  if (!searchBar || !dropdown) return;
  
  searchBar.addEventListener('input', debounce((e) => {
    const term = e.target.value.toLowerCase().trim();
    dropdown.innerHTML = '';
    
    if (term.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }
    
    dropdown.classList.remove('hidden');
    
    const allCifras = Object.values(state.cifras).flat();
    const results = allCifras
      .filter(c => c.title.toLowerCase().includes(term))
      .sort((a, b) => a.title.localeCompare(b.title));
    
    if (results.length === 0) {
      const li = document.createElement('li');
      li.className = 'p-3 text-gray-500';
      li.textContent = 'Nenhum resultado encontrado';
      dropdown.appendChild(li);
    } else {
      results.forEach(cifra => {
        const li = document.createElement('li');
        li.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer';
        li.textContent = cifra.title.replace('.jpg', '');
        li.addEventListener('click', () => {
          setCurrentTab(Object.keys(state.cifras).find(tab => 
            state.cifras[tab].some(c => c.id === cifra.id)));
          dropdown.classList.add('hidden');
          searchBar.value = '';
        });
        dropdown.appendChild(li);
      });
    }
  }, 300));
  
  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function setupFloatControls() {
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearBtn = document.getElementById('clear-selection-btn');
  const deleteBtn = document.getElementById('delete-selected-btn');
  const renameBtn = document.getElementById('rename-selected-btn');
  const uploadBtn = document.getElementById('upload-selected-btn');
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      state.selection[state.currentTab] = new Set(
        state.cifras[state.currentTab].map(c => c.id)
      );
      renderCifras();
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selection[state.currentTab] = new Set();
      renderCifras();
    });
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja excluir as cifras selecionadas?')) {
        const ids = Array.from(state.selection[state.currentTab]);
        state.cifras[state.currentTab] = state.cifras[state.currentTab].filter(
          c => !ids.includes(c.id)
        );
        state.selection[state.currentTab] = new Set();
        saveState();
        renderCifras();
      }
    });
  }
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initDarkMode();
  renderTabs();
  renderCifras();
  setupEventListeners();
  
  // Adaptar layout inicial baseado no tamanho da tela
  if (window.innerWidth >= 768) {
    document.getElementById('sidebar-menu')?.classList.remove('hidden');
  }
  
  console.log('Aplicativo inicializado com sucesso');
});

// Redimensionamento da janela
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) {
    closeMobileMenu();
  }
});
