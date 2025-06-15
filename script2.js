const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" }
];

const LOCALSTORE_KEY = "cifras2-app-state-v4";
const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCguk";
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive";
const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

let state = {
  tabs: [...TABS_DEFAULT],
  cifras: {},
  selection: {},
  currentTab: "Domingo Manhã",
  search: "",
  onlineCache: {},
  darkMode: localStorage.getItem('darkMode') === 'true',
  currentTransposition: 0
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

function updateFloatControls() {
  const floatControls = document.getElementById('float-controls');
  if (!floatControls) return;

  const currentCifras = state.cifras[state.currentTab] || [];
  const selectedCount = state.selection[state.currentTab]?.size || 0;
  
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  const renameSelectedBtn = document.getElementById('rename-selected-btn');
  const uploadSelectedBtn = document.getElementById('upload-selected-btn');
  const transposeBtn = document.getElementById('transpose-btn');

  if (currentCifras.length > 0) {
    floatControls.classList.remove('hidden');
  } else {
    floatControls.classList.add('hidden');
    return;
  }

  if (selectedCount > 0) {
    deleteSelectedBtn.classList.remove('hidden');
    clearSelectionBtn.classList.remove('hidden');
    transposeBtn.classList.remove('hidden');
  } else {
    deleteSelectedBtn.classList.add('hidden');
    clearSelectionBtn.classList.add('hidden');
    transposeBtn.classList.add('hidden');
  }

  if (selectedCount === 1) {
    renameSelectedBtn.classList.remove('hidden');
    uploadSelectedBtn.classList.remove('hidden');
  } else {
    renameSelectedBtn.classList.add('hidden');
    uploadSelectedBtn.classList.add('hidden');
  }
}

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
        ${tab.type === 'custom' ? '<button class="ml-auto delete-tab-btn text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>' : ''}
      `;
      
      tabBtn.onclick = () => {
        setCurrentTab(tab.name);
        if (window.innerWidth < 768) {
          closeMobileMenu();
        }
      };
      
      const deleteBtn = tabBtn.querySelector('.delete-tab-btn');
      if (deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          deleteTab(tab.name);
        };
      }
      
      container.appendChild(tabBtn);
    });
    
    // Botão para adicionar nova aba
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-add mt-4 w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200';
    addBtn.innerHTML = '<i class="fas fa-plus mr-2"></i> Adicionar Categoria';
    addBtn.onclick = addNewTab;
    container.appendChild(addBtn);
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
      
      if (isSelected(cifra.id)) {
        li.classList.add('selected');
      }
      
      li.innerHTML = `
        <div class="cifra-header">
          <h3 class="cifra-title">${stripExtension(cifra.title)}</h3>
          <div class="cifra-actions">
            <button class="edit-btn" data-id="${cifra.id}"><i class="fas fa-pen"></i></button>
            <button class="delete-btn" data-id="${cifra.id}"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        ${cifra.url ? `<img src="${cifra.url}" alt="${cifra.title}" class="cifra-image" data-id="${cifra.id}">` : ''}
      `;
      
      li.addEventListener('click', (e) => {
        if (e.target.closest('.edit-btn, .delete-btn')) return;
        
        const tab = state.currentTab;
        if (!state.selection[tab]) state.selection[tab] = new Set();
        
        if (state.selection[tab].has(cifra.id)) {
          state.selection[tab].delete(cifra.id);
        } else {
          state.selection[tab].add(cifra.id);
        }
        
        saveState();
        renderCifras();
        updateFloatControls();
      });
      
      const img = li.querySelector('.cifra-image');
      if (img) {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          openFullscreenView(cifra);
        });
      }
      
      const editBtn = li.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renameCifra(cifra.id);
        });
      }
      
      const deleteBtn = li.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCifra(cifra.id);
        });
      }
      
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

function addNewTab() {
  const tabName = prompt("Nome da nova categoria:");
  if (tabName && tabName.trim() !== "") {
    if (state.tabs.some(tab => tab.name === tabName)) {
      showToast("Já existe uma categoria com esse nome");
      return;
    }
    
    state.tabs.push({
      name: tabName.trim(),
      type: "custom",
      mode: "offline"
    });
    
    state.cifras[tabName.trim()] = [];
    saveState();
    renderTabs();
    setCurrentTab(tabName.trim());
  }
}

function deleteTab(tabName) {
  if (confirm(`Tem certeza que deseja excluir a categoria "${tabName}" e todas as suas cifras?`)) {
    const index = state.tabs.findIndex(tab => tab.name === tabName);
    if (index !== -1) {
      state.tabs.splice(index, 1);
      delete state.cifras[tabName];
      
      if (state.currentTab === tabName) {
        state.currentTab = state.tabs[0]?.name || "";
      }
      
      saveState();
      renderTabs();
      renderCifras();
      showToast("Categoria excluída");
    }
  }
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
  
  if (fabMenu) {
    fabMenu.classList.toggle('open');
  }
  
  if (overlay) {
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

function isSelected(id) {
  const tab = state.currentTab;
  return state.selection[tab] && state.selection[tab].has(id);
}

function clearSelection() {
  const tab = state.currentTab;
  if (state.selection[tab]) {
    state.selection[tab] = new Set();
    saveState();
    renderCifras();
    updateFloatControls();
  }
}

function deleteCifra(id) {
  if (confirm("Tem certeza que deseja excluir esta cifra?")) {
    const tab = state.currentTab;
    state.cifras[tab] = state.cifras[tab].filter(cifra => cifra.id !== id);
    
    if (state.selection[tab]) {
      state.selection[tab].delete(id);
    }
    
    saveState();
    renderCifras();
    showToast("Cifra excluída");
  }
}

function renameCifra(id) {
  const tab = state.currentTab;
  const cifra = state.cifras[tab].find(c => c.id === id);
  if (!cifra) return;
  
  const newTitle = prompt("Novo nome para a cifra:", stripExtension(cifra.title));
  if (newTitle !== null && newTitle.trim() !== "") {
    cifra.title = newTitle.trim();
    saveState();
    renderCifras();
    showToast("Cifra renomeada");
  }
}

// ==================== FUNÇÕES DE VISUALIZAÇÃO EM TELA CHEIA ====================

function openFullscreenView(cifra) {
  const overlay = document.getElementById('fullscreen-overlay');
  const img = document.getElementById('fullscreen-image');
  
  if (!overlay || !img) return;
  
  img.src = cifra.url;
  img.dataset.id = cifra.id;
  
  overlay.classList.add('active');
  
  // Configurar zoom e pan
  setupImageZoom(img);
  
  // Configurar botão de fechar
  const closeBtn = overlay.querySelector('.close-fullscreen');
  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.classList.remove('active');
    };
  }
  
  // Configurar botões de zoom
  const zoomInBtn = overlay.querySelector('.zoom-in');
  const zoomOutBtn = overlay.querySelector('.zoom-reset');
  const zoomResetBtn = overlay.querySelector('.zoom-out');
  
  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      const currentScale = parseFloat(img.style.transform.replace('scale(', '').replace(')', '')) || 1;
      img.style.transform = `scale(${currentScale + 0.2})`;
    };
  }
  
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      const currentScale = parseFloat(img.style.transform.replace('scale(', '').replace(')', '')) || 1;
      if (currentScale > 0.4) {
        img.style.transform = `scale(${currentScale - 0.2})`;
      }
    };
  }
  
  if (zoomResetBtn) {
    zoomResetBtn.onclick = () => {
      img.style.transform = 'scale(1)';
    };
  }
  
  // Configurar botão de detecção de acordes
  const detectChordsBtn = overlay.querySelector('.detect-chords');
  if (detectChordsBtn) {
    detectChordsBtn.onclick = () => {
      detectChordsInImage(cifra.url);
    };
  }
}

function setupImageZoom(imgElement) {
  let scale = 1;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  
  imgElement.style.transformOrigin = 'center center';
  
  imgElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const rect = imgElement.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.4, Math.min(3, scale * delta));
    
    imgElement.style.transformOrigin = `${offsetX}px ${offsetY}px`;
    imgElement.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
  });
  
  imgElement.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Botão esquerdo do mouse
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      imgElement.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ==================== OCR E TRANSPOSIÇÃO DE ACORDES ====================

async function detectChordsInImage(imageUrl) {
  showToast("Processando imagem para detectar acordes...");
  
  try {
    const overlay = document.getElementById('fullscreen-overlay');
    const progressIndicator = document.createElement('div');
    progressIndicator.className = 'progress-indicator';
    overlay.appendChild(progressIndicator);
    
    const { data: { text, words } } = await Tesseract.recognize(
      imageUrl,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            progressIndicator.style.transform = `scaleX(${m.progress})`;
          }
        }
      }
    );
    
    overlay.removeChild(progressIndicator);
    
    const chords = extractChordsFromText(text);
    showToast(`${chords.length} acordes detectados`);
    
    displayDetectedChords(words, chords);
  } catch (error) {
    console.error("Erro no OCR:", error);
    showToast("Erro ao processar imagem");
  }
}

function extractChordsFromText(text) {
  const chordRegex = /[A-G][#b]?(m|7|9|11|13|6|sus|dim|aug)?\b/g;
  return [...new Set(text.match(chordRegex) || [])];
}

function displayDetectedChords(words, chords) {
  const overlay = document.getElementById('fullscreen-overlay');
  const img = document.getElementById('fullscreen-image');
  const chordOverlays = document.getElementById('chord-overlays');
  
  if (!overlay || !img || !chordOverlays) return;
  
  chordOverlays.innerHTML = '';
  
  // Obter dimensões da imagem e do container
  const imgRect = img.getBoundingClientRect();
  const imgNaturalWidth = img.naturalWidth;
  const imgNaturalHeight = img.naturalHeight;
  const scaleX = imgRect.width / imgNaturalWidth;
  const scaleY = imgRect.height / imgNaturalHeight;
  
  // Filtrar palavras que são acordes
  const chordWords = words.filter(word => {
    return chords.some(chord => word.text.trim() === chord);
  });
  
  // Criar overlays para cada acorde detectado
  chordWords.forEach(word => {
    const chord = word.text.trim();
    const bbox = word.bbox;
    
    const chordElement = document.createElement('div');
    chordElement.className = 'chord-overlay';
    chordElement.textContent = chord;
    chordElement.dataset.original = chord;
    
    // Posicionar o overlay com base nas coordenadas do OCR
    const left = (bbox.x0 * scaleX) + imgRect.left;
    const top = (bbox.y0 * scaleY) + imgRect.top;
    const width = (bbox.x1 - bbox.x0) * scaleX;
    
    chordElement.style.left = `${left}px`;
    chordElement.style.top = `${top}px`;
    chordElement.style.minWidth = `${width}px`;
    
    chordOverlays.appendChild(chordElement);
  });
  
  // Mostrar controles de transposição
  const transposeBtn = overlay.querySelector('.detect-chords');
  if (transposeBtn) {
    transposeBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Transpor';
    transposeBtn.onclick = () => {
      openTransposeModal(chords);
    };
  }
}

function openTransposeModal(chords) {
  const modal = document.getElementById('transpose-modal');
  const transposeValue = document.getElementById('transpose-value');
  const transposeUp = document.getElementById('transpose-up');
  const transposeDown = document.getElementById('transpose-down');
  const applyBtn = document.getElementById('apply-transposition');
  const resetBtn = document.getElementById('reset-transposition');
  
  if (!modal || !transposeValue || !transposeUp || !transposeDown || !applyBtn || !resetBtn) return;
  
  state.currentTransposition = 0;
  transposeValue.textContent = '0';
  
  modal.classList.add('active');
  
  transposeUp.onclick = () => {
    state.currentTransposition++;
    transposeValue.textContent = state.currentTransposition > 0 ? `+${state.currentTransposition}` : state.currentTransposition;
    updateChordOverlays();
  };
  
  transposeDown.onclick = () => {
    state.currentTransposition--;
    transposeValue.textContent = state.currentTransposition > 0 ? `+${state.currentTransposition}` : state.currentTransposition;
    updateChordOverlays();
  };
  
  applyBtn.onclick = () => {
    modal.classList.remove('active');
    showToast(`Acordes transpostos ${state.currentTransposition > 0 ? '+' : ''}${state.currentTransposition} semitons`);
  };
  
  resetBtn.onclick = () => {
    state.currentTransposition = 0;
    transposeValue.textContent = '0';
    updateChordOverlays();
  };
  
  const closeBtn = document.getElementById('close-transpose-modal');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.classList.remove('active');
    };
  }
}

function updateChordOverlays() {
  const chordOverlays = document.querySelectorAll('.chord-overlay');
  chordOverlays.forEach(overlay => {
    const originalChord = overlay.dataset.original;
    const transposedChord = transposeChord(originalChord, state.currentTransposition);
    overlay.textContent = transposedChord;
  });
}

// ==================== INTEGRAÇÃO COM GOOGLE DRIVE ====================

async function gapiAuth() {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error("Google API não carregada"));
      return;
    }
    
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(response.error);
          showToast('Falha na autenticação com Google');
        } else {
          gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
          }).then(() => {
            resolve(response);
            showToast('Conectado ao Google Drive');
          }).catch(error => {
            reject(error);
            showToast('Erro ao inicializar API do Google');
          });
        }
      },
      error_callback: (error) => {
        reject(error);
        showToast('Erro na autenticação');
      }
    });
    
    client.requestAccessToken();
  });
}

async function searchDriveCifras(query) {
  try {
    await gapiAuth();
    
    const response = await gapi.client.drive.files.list({
      q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false and name contains '${query}'`,
      fields: 'files(id, name, thumbnailLink)',
      pageSize: 10
    });
    
    return response.result.files || [];
  } catch (error) {
    console.error("Erro ao buscar no Drive:", error);
    showToast("Erro ao buscar no Google Drive");
    return [];
  }
}

async function uploadToDrive(cifra) {
  try {
    await gapiAuth();
    
    const fileBlob = await fetch(cifra.url).then(r => r.blob());
    const metadata = {
      name: cifra.title,
      mimeType: fileBlob.type || 'image/jpeg',
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob);
    
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
      {
        method: 'POST',
        headers: new Headers({
          'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
        }),
        body: form
      }
    );
    
    if (!response.ok) {
      throw new Error(await response.text());
    }
    
    const data = await response.json();
    showToast(`${cifra.title} enviado para o Drive`);
    return data;
  } catch (error) {
    console.error("Erro no upload para o Drive:", error);
    showToast("Erro ao enviar para o Google Drive");
    throw error;
  }
}

// ==================== MANIPULAÇÃO DE ARQUIVOS ====================

function setupFileInput() {
  const fileInput = document.getElementById('file-input');
  const fabImport = document.getElementById('fab-import');
  
  if (!fileInput || !fabImport) return;
  
  fabImport.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const tab = state.currentTab;
    if (!state.cifras[tab]) state.cifras[tab] = [];
    
    let addedCount = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      
      try {
        const base64 = await fileToBase64(file);
        const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        state.cifras[tab].push({
          id,
          url: base64,
          title: file.name,
          createdAt: new Date().toISOString()
        });
        
        addedCount++;
      } catch (error) {
        console.error("Erro ao processar arquivo:", error);
      }
    }
    
    if (addedCount > 0) {
      saveState();
      renderCifras();
      showToast(`${addedCount} cifra(s) adicionada(s)`);
    } else {
      showToast("Nenhuma imagem válida encontrada");
    }
    
    fileInput.value = '';
  });
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
  
  // Configuração da busca
  setupSearch();
  
  // Configuração do input de arquivo
  setupFileInput();
  
  // Configuração dos controles flutuantes
  setupFloatControls();
  
  // Configuração do botão de upload para o Drive
  setupDriveUpload();
  
  // Configuração do botão de transposição
  setupTransposeButton();
}

function setupFloatControls() {
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearBtn = document.getElementById('clear-selection-btn');
  const deleteBtn = document.getElementById('delete-selected-btn');
  const renameBtn = document.getElementById('rename-selected-btn');
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const tab = state.currentTab;
      state.selection[tab] = new Set(state.cifras[tab].map(c => c.id));
      saveState();
      renderCifras();
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSelection);
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const tab = state.currentTab;
      const selected = Array.from(state.selection[tab] || []);
      if (selected.length > 0 && confirm(`Tem certeza que deseja excluir ${selected.length} cifra(s)?`)) {
        state.cifras[tab] = state.cifras[tab].filter(c => !selected.includes(c.id));
        state.selection[tab] = new Set();
        saveState();
        renderCifras();
        showToast(`${selected.length} cifra(s) excluída(s)`);
      }
    });
  }
  
  if (renameBtn) {
    renameBtn.addEventListener('click', () => {
      const tab = state.currentTab;
      const selected = Array.from(state.selection[tab] || []);
      if (selected.length === 1) {
        renameCifra(selected[0]);
      }
    });
  }
}

function setupDriveUpload() {
  const uploadBtn = document.getElementById('upload-selected-btn');
  if (!uploadBtn) return;
  
  uploadBtn.addEventListener('click', async () => {
    const tab = state.currentTab;
    const selected = Array.from(state.selection[tab] || []);
    
    if (selected.length === 0) {
      showToast("Selecione pelo menos uma cifra para enviar");
      return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
      for (const id of selected) {
        const cifra = state.cifras[tab].find(c => c.id === id);
        if (cifra) {
          await uploadToDrive(cifra);
        }
      }
    } catch (error) {
      console.error("Erro no upload:", error);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
    }
  });
}

function setupTransposeButton() {
  const transposeBtn = document.getElementById('transpose-btn');
  if (!transposeBtn) return;
  
  transposeBtn.addEventListener('click', () => {
    const tab = state.currentTab;
    const selected = Array.from(state.selection[tab] || []);
    
    if (selected.length === 1) {
      const cifra = state.cifras[tab].find(c => c.id === selected[0]);
      if (cifra && cifra.url) {
        openFullscreenView(cifra);
        setTimeout(() => {
          const detectBtn = document.querySelector('.detect-chords');
          if (detectBtn) detectBtn.click();
        }, 300);
      }
    }
  });
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initDarkMode();
  renderTabs();
  renderCifras();
  setupEventListeners();
  
  // Carregar Google API
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  
  console.log('Aplicativo inicializado com sucesso');
});

// Redimensionamento da janela
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) {
    closeMobileMenu();
  }
});
