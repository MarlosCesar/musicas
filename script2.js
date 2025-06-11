// --- Constantes e Estado ---
const TABS_DEFAULT = [
  { name: "D. Manhã", type: "default", mode: "offline" },
  { name: "D. Noite", type: "default", mode: "offline" },
  { name: "Segunda", type: "default", mode: "offline" },
  { name: "Quarta", type: "default", mode: "offline" },
];
const LOCALSTORE_KEY = "cifras2-app-state-v2";
const POLL_INTERVAL = 5000;

const GOOGLE_DRIVE_FOLDER_ID = "1OzrvB4NCBRTDgMsE_AhQy0b11bdn3v82";
const GOOGLE_API_KEY = "AIzaSyD2qLxX7fYIMxt34aeWWDsx_nWaSsFCGuk"; // Verifique se essa chave está segura em produção!
const GOOGLE_CLIENT_ID = "977942417278-0mfg7iehelnjfqmk5a32elsr7ll8hkil.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive";

let state = {
  tabs: [...TABS_DEFAULT], // Manteremos o estado das abas, mas elas serão acessadas via menu
  cifras: {},
  selection: {},
  currentTab: "D. Manhã", // Ajustado para uma das abas padrão
  search: "",
  onlineCache: {},
};

let pollTimer = null;
let editingTabIndex = null; // Mantido para futuras expansões ou edição de nomes via modal
let newTabValue = "";

// --- Funções Utilitárias ---
function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

// --- Funções de Autenticação Google API ---
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

// --- Gerenciamento de Estado (LocalStorage) ---
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
    state.currentTab = loaded.currentTab || "D. Manhã"; // Garante que a aba padrão exista
    // Garante que todas as abas padrão existam no state.cifras
    TABS_DEFAULT.forEach(defaultTab => {
      if (!state.cifras[defaultTab.name]) {
        state.cifras[defaultTab.name] = [];
      }
    });
    // Garante que abas personalizadas também tenham suas cifras
    state.tabs.forEach(tab => {
        if (!state.cifras[tab.name]) {
            state.cifras[tab.name] = [];
        }
    });
  } else {
      // Se não houver estado salvo, inicializa cifras para TABS_DEFAULT
      TABS_DEFAULT.forEach(defaultTab => {
        state.cifras[defaultTab.name] = [];
      });
  }
}

// --- Funções de Aba/Contexto ---
function setTab(tabName) {
  state.currentTab = tabName;
  // Não precisamos mais renderizar 'tabs' visíveis, apenas atualizar o título ou destaque se houver
  // Exemplo: document.getElementById('current-tab-title').textContent = tabName;
  renderCifras();
  updateFloatControls();
  // Fecha o menu de navegação após selecionar uma aba (se estiver aberto em mobile)
  const navLinks = document.getElementById('nav-links');
  const menuToggle = document.getElementById('menu-toggle');
  const menuOverlay = document.getElementById('menu-overlay');

  if (navLinks.classList.contains('active')) {
      navLinks.classList.remove('active');
      menuToggle.classList.remove('open');
      menuOverlay.classList.add('hidden');
      document.body.classList.remove('overflow-hidden'); // Libera o scroll do body
  }
}

function addTab(name, type = "custom", mode = "offline") {
    if (state.tabs.some(t => t.name === name)) {
        toast("Aba com este nome já existe.");
        return false;
    }
    state.tabs.push({ name, type, mode });
    state.cifras[name] = []; // Inicializa a lista de cifras para a nova aba
    saveState();
    // Não renderiza mais tabs visíveis, mas a nova aba será listada no menu
    // Chame aqui a atualização do menu se ele for dinâmico
    setTab(name);
    toast(`Aba "${name}" adicionada.`);
    return true;
}


function setTabMode(tabName, mode) {
  const tab = state.tabs.find(t => t.name === tabName);
  if (tab) { tab.mode = mode; saveState(); renderCifras(); }
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

// --- Renderização de UI ---
function renderCifras() {
  const list = document.getElementById("cifra-list");
  const empty = document.getElementById("empty-state");
  const tab = state.currentTab;
  let cifras = (state.cifras[tab] || []).filter(cifra => {
    // Filtra pelo termo de busca se houver
    return state.search ? stripExtension(cifra.title).toLowerCase().includes(state.search.toLowerCase()) : true;
  });

  list.innerHTML = "";
  if (!cifras.length && !state.search) { // Mostra empty state apenas se não houver cifras E NÃO estiver buscando
    empty.classList.remove("hidden"); // Tailwind: usa hidden/flex
    list.classList.add("hidden");
  } else if (!cifras.length && state.search) { // Se buscando e não encontrou
    empty.classList.add("hidden");
    list.classList.remove("hidden");
    list.innerHTML = `
        <li class="w-full text-center py-8 text-gray-600 dark:text-gray-400">
            Nenhuma cifra encontrada para "${state.search}" nesta aba.
        </li>
    `;
  }
  else {
    empty.classList.add("hidden");
    list.classList.remove("hidden");
    // Adaptação para usar classes Tailwind
    list.classList.add("grid", "grid-cols-2", "sm:grid-cols-3", "md:grid-cols-4", "lg:grid-cols-5", "gap-4", "max-w-4xl", "mx-auto"); // Flexbox ajustado para grid
    cifras.forEach(cifra => {
      const li = document.createElement("li");
      li.className = `cifra-container relative group cursor-pointer border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200
                      ${isSelected(cifra.id) ? "ring-2 ring-indigo-500 dark:ring-sky-400 bg-indigo-50 dark:bg-zinc-700" : "bg-white dark:bg-zinc-800"}`;
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
      img.className = "cifra-img w-full h-40 object-cover object-center transition-transform duration-200 group-hover:scale-105";
      img.src = cifra.driveId
        ? `https://drive.google.com/thumbnail?id=${cifra.driveId}&sz=w300` // Tamanho maior para thumbnail
        : cifra.url;
      img.alt = cifra.title;
      img.loading = "lazy"; // Carregamento lazy
      img.onclick = e => {
        openFullscreen(cifra);
        e.stopPropagation();
      };

      const title = document.createElement("div");
      title.className = "cifra-title p-3 text-sm font-medium truncate text-gray-700 dark:text-gray-200";
      title.textContent = stripExtension(cifra.title);

      // Ícone de seleção
      const selectIcon = document.createElement('div');
      selectIcon.className = `absolute top-2 right-2 text-xl ${isSelected(cifra.id) ? 'text-indigo-600 dark:text-sky-400 opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-100'} transition-opacity duration-200`;
      selectIcon.innerHTML = `<i class="fas fa-check-circle"></i>`;


      li.appendChild(img);
      li.appendChild(title);
      li.appendChild(selectIcon); // Adiciona o ícone
      list.appendChild(li);
    });
  }
}

function updateFloatControls() {
  const float = document.getElementById("float-controls");
  const tab = state.currentTab;
  const selected = (state.selection[tab] && state.selection[tab].size) ? Array.from(state.selection[tab]) : [];

  // Altera a visibilidade dos botões baseado na seleção
  document.getElementById("rename-selected-btn").classList.toggle("hidden", selected.length !== 1);
  document.getElementById("upload-selected-btn").classList.toggle("hidden", selected.length === 0);

  // Esconde/mostra a barra flutuante
  if (selected.length === 0) {
    float.classList.add("hidden");
  } else {
    float.classList.remove("hidden");
  }
}

// --- Eventos dos Controles Flutuantes ---
document.getElementById("select-all-btn").onclick = () => {
  const tab = state.currentTab;
  if (!state.selection[tab]) state.selection[tab] = new Set();
  const allCifrasInTab = state.cifras[tab] || [];
  const currentlySelectedCount = state.selection[tab].size;

  if (currentlySelectedCount === allCifrasInTab.length) {
    // Se tudo já está selecionado, deseleciona tudo
    state.selection[tab].clear();
  } else {
    // Senão, seleciona tudo
    allCifrasInTab.forEach(c => state.selection[tab].add(c.id));
  }
  updateFloatControls();
  renderCifras();
};

document.getElementById("clear-selection-btn").onclick = () => {
  clearSelection(state.currentTab);
  renderCifras();
  toast("Seleção limpa.");
};

document.getElementById("delete-selected-btn").onclick = () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (selected.length === 0) {
    toast("Nenhuma cifra selecionada para excluir.");
    return;
  }

  if (confirm(`Tem certeza que deseja excluir ${selected.length} cifra(s)?`)) {
    removeCifras(tab, selected);
    renderCifras();
    toast(`Cifra(s) excluída(s)!`);
  }
};

document.getElementById("rename-selected-btn").onclick = () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (selected.length === 1) {
    showRenameModal(selected[0]);
  } else {
    toast("Selecione apenas uma cifra para renomear.");
  }
};

document.getElementById("upload-selected-btn").onclick = async () => {
  const tab = state.currentTab;
  const selected = Array.from(state.selection[tab] || []);
  if (selected.length === 0) {
    toast("Selecione uma ou mais cifras para enviar ao Google Drive.");
    return;
  }

  // Desativa os botões para evitar cliques múltiplos
  document.getElementById("upload-selected-btn").disabled = true;
  toast("Enviando para o Google Drive...");

  try {
    for (const id of selected) {
      const cifra = (state.cifras[tab] || []).find(c => c.id === id);
      if (cifra) {
        await uploadCifraToDrive(cifra);
      }
    }
    toast("Upload realizado para o Google Drive!");
    // Limpa a seleção após o upload bem-sucedido
    clearSelection(tab);
    renderCifras();
  } catch (error) {
    console.error("Erro no upload:", error);
    toast(`Falha no upload: ${error.message}`);
  } finally {
    // Reativa os botões
    document.getElementById("upload-selected-btn").disabled = false;
  }
};


// --- Modal de Renomear ---
function showRenameModal(cifraId) {
  const tab = state.currentTab;
  const cifra = (state.cifras[tab] || []).find(c => c.id === cifraId);
  if (!cifra) return;

  // Cria o modal com classes Tailwind
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4";
  modal.innerHTML = `
    <div class="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-sm relative">
      <button id="close-rename-modal" class="absolute top-3 right-3 text-gray-500 dark:text-gray-400 text-2xl hover:text-gray-700 dark:hover:text-gray-200">&times;</button>
      <h2 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">Renomear Cifra</h2>
      <label for="rename-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NOVO NOME:</label>
      <input type="text" id="rename-input" value="${stripExtension(cifra.title)}" class="w-full p-2 border border-gray-300 dark:border-zinc-600 rounded-md mb-4 text-gray-800 dark:bg-zinc-700 dark:text-gray-100 focus:ring focus:ring-indigo-300 focus:border-indigo-500" style="text-transform:uppercase;" />
      <button id="save-rename-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200 dark:bg-sky-500 dark:hover:bg-sky-600">Renomear</button>
    </div>
  `;
  document.body.appendChild(modal);

  const input = modal.querySelector("#rename-input");
  input.focus();
  input.setSelectionRange(0, input.value.length); // Seleciona todo o texto

  modal.querySelector("#save-rename-btn").onclick = () => {
    let novoNome = input.value.trim().toUpperCase();
    if (novoNome === "") {
      toast("O nome não pode ser vazio.");
      return;
    }
    // Verifica se já existe uma cifra com o mesmo nome (ignorando a extensão e o próprio item)
    const existingCifra = state.cifras[tab].find(c => stripExtension(c.title).toUpperCase() === novoNome && c.id !== cifraId);
    if (existingCifra) {
        toast("Já existe uma cifra com esse nome nesta aba.");
        return;
    }

    cifra.title = novoNome;
    saveState();
    renderCifras();
    updateFloatControls();
    modal.remove(); // Usa .remove() para remover o elemento
    toast("Cifra renomeada!");
  };
  modal.querySelector("#close-rename-modal").onclick = () => modal.remove();
}

// --- FAB (Floating Action Button) ---
// O FAB agora é um botão simples para abrir/fechar o menu em mobile
document.getElementById("fab").onclick = (e) => {
    const fabIcon = document.querySelector("#fab i");
    if (fabIcon.classList.contains("fa-plus")) {
        fabIcon.classList.remove("fa-plus");
        fabIcon.classList.add("fa-times"); // Ícone de "X" quando aberto
    } else {
        fabIcon.classList.remove("fa-times");
        fabIcon.classList.add("fa-plus"); // Ícone de "+" quando fechado
    }
    // Para o FAB em si, ele pode abrir um menu *contextual* no futuro ou ativar um modo.
    // As ações de importar/câmera/upload estão agora no menu de navegação lateral para mobile
    // ou no FAB Menu se você decidir mantê-lo para desktop.

    // No seu HTML atual, o FAB Menu (`#fab-menu`) é comentado. Se você quer ele de volta,
    // descomente-o e adicione a lógica aqui.
    // Por enquanto, o FAB será mais um indicador visual.
};

// --- Input de Arquivo (BASE64) ---
document.getElementById("file-input").onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];
  let addedCount = 0;

  if (files.length === 0) {
      toast("Nenhum arquivo selecionado.");
      return;
  }

  // Opcional: mostrar um carregamento
  toast("Adicionando cifras...");

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      toast(`Arquivo "${file.name}" não é uma imagem e foi ignorado.`);
      continue;
    }
    const base64 = await fileToBase64(file);
    const id = Math.random().toString(36).slice(2) + Date.now();
    const title = stripExtension(file.name); // Garante que o título não tenha extensão

    // Verifica se já existe uma cifra com o mesmo título na aba atual
    if (state.cifras[tab].some(c => stripExtension(c.title).toUpperCase() === title.toUpperCase())) {
        toast(`A cifra "${title}" já existe nesta aba.`);
        continue;
    }

    state.cifras[tab].push({ id, url: base64, title: title });
    addedCount++;
  }
  saveState();
  renderCifras();
  if (addedCount > 0) {
    toast(`${addedCount} cifra(s) adicionada(s)!`);
  } else {
    toast("Nenhuma cifra nova adicionada.");
  }
  // Limpa o input para permitir o upload do mesmo arquivo novamente, se necessário
  e.target.value = '';
};

// --- Captura de Câmera (BASE64) ---
async function openCameraCapture() {
  let overlay = document.getElementById("camera-capture-overlay");
  if (overlay) overlay.remove(); // Remove qualquer overlay existente
  overlay = document.createElement("div");
  overlay.id = "camera-capture-overlay";
  // Adiciona classes Tailwind para o overlay
  overlay.className = "fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-95 z-[99999]"; // z-index alto

  overlay.innerHTML = `
    <video id="camera-video" autoplay playsinline class="w-full h-full object-cover bg-zinc-900"></video>
    <div class="absolute bottom-4 flex space-x-4">
      <button id="camera-capture-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg text-lg transition-colors duration-200 dark:bg-sky-500 dark:hover:bg-sky-600">
        <i class="fas fa-camera mr-2"></i> Capturar Foto
      </button>
      <button id="camera-cancel-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg text-lg transition-colors duration-200">
        Cancelar
      </button>
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
        facingMode: { exact: "environment" } // Preferir câmera traseira
      },
      audio: false
    });
    video.srcObject = stream;
  } catch (e) {
    overlay.remove();
    toast("Não foi possível acessar a câmera. Verifique as permissões.");
    console.error("Erro ao acessar câmera:", e);
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
      // Gerar um título único baseado na data/hora
      const title = `Foto-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      const id = "foto-" + now.getTime();

      const tab = state.currentTab;
      if (!state.cifras[tab]) state.cifras[tab] = [];

      // Verifica se já existe uma cifra com o mesmo título na aba atual
      if (state.cifras[tab].some(c => stripExtension(c.title).toUpperCase() === title.toUpperCase())) {
          toast(`A cifra "${title}" já existe nesta aba.`);
          return;
      }

      state.cifras[tab].push({ id, title, url, createdAt: now.toISOString() });
      if (!state.selection[tab]) state.selection[tab] = new Set();
      state.selection[tab].add(id); // Seleciona a imagem recém-capturada

      saveState();
      renderCifras();
      toast("Foto adicionada!");
    }, "image/jpeg", 0.98); // Qualidade da imagem JPEG
  };
}

// --- Busca Inteligente Local e no Google Drive ---
function buscaCifrasLocal(query, cifrasTab) {
  if (!query) return [];
  const q = query.toLowerCase();
  // Filtra as cifras da aba atual que contêm a query no título
  return cifrasTab.filter(cifra => stripExtension(cifra.title).toLowerCase().includes(q))
    .sort((a, b) => stripExtension(a.title).localeCompare(stripExtension(b.title), 'pt-BR')); // Ordena alfabeticamente
}

async function searchDrive(query) {
  try {
    // Verifica se está autenticado
    if (!window.gapi || !gapi.auth2.getAuthInstance() || !gapi.auth2.getAuthInstance().isSignedIn.get()) {
      await gapiAuth(); // Tenta autenticar se não estiver logado
    }

    if (!query) return [];
    // Busca arquivos de imagem e PDF dentro da pasta especificada
    const queryParams = `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`;
    const nameSearch = query ? ` and name contains '${encodeURIComponent(query)}'` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${queryParams}${nameSearch}&fields=files(id,name,thumbnailLink,mimeType)&key=${GOOGLE_API_KEY}`;

    const resp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
        }
    });

    if (!resp.ok) {
      // Se a resposta não for OK, tenta pegar o erro do corpo
      const errorData = await resp.json();
      console.error('Erro na busca do Drive:', resp.status, resp.statusText, errorData);
      throw new Error(`Erro na busca do Drive: ${errorData.error.message || resp.statusText}`);
    }

    const data = await resp.json();
    return data.files || [];
  } catch (error) {
    console.error('Erro na busca do Drive (catch):', error);
    // Adiciona uma mensagem de erro mais útil ao usuário
    if (error.message.includes("Token is invalid") || error.message.includes("Login required")) {
        toast("Autenticação Google Drive falhou. Tente novamente.");
    } else {
        toast("Erro ao buscar no Google Drive.");
    }
    return [];
  }
}

// --- Atualiza o Dropdown de Busca ---
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
  dropdown.classList.add('md:absolute'); // Garante que a posição seja absoluta em desktop

  const cifrasTab = state.cifras[state.currentTab] || [];

  if (val.length === 0) {
    dropdown.classList.add("hidden");
    renderCifras(); // Renderiza todas as cifras da aba se a busca estiver vazia
    return;
  }

  dropdown.classList.remove("hidden");
  dropdown.innerHTML = "<li class='dropdown-loading p-2 text-gray-600 dark:text-gray-400'>Buscando...</li>";

  const resultadosLocal = buscaCifrasLocal(val, cifrasTab);
  let filesNuvem = [];

  // Busca no Drive apenas se houver um termo de busca substancial
  if (val.length >= 2) { // Ex: busca no drive a partir de 2 caracteres
    try {
      filesNuvem = await searchDrive(val);
    } catch (error) {
      console.error("Erro na busca no Drive:", error);
      toast("Erro ao buscar no Google Drive. Tente novamente mais tarde.");
    }
  }

  updateDropdownResults(dropdown, resultadosLocal, filesNuvem, cifrasTab);
};


function updateDropdownResults(dropdown, resultadosLocal, filesNuvem, cifrasTab) {
  dropdown.innerHTML = "";

  const createHeader = (text) => {
    const header = document.createElement("li");
    header.className = "dropdown-header font-semibold text-gray-700 dark:text-gray-200 px-3 py-2 bg-gray-100 dark:bg-zinc-700 border-b border-gray-200 dark:border-zinc-600";
    header.textContent = text;
    return header;
  };

  // Filtrar duplicatas (cifras locais que já estão na nuvem e vice-versa)
  const localIds = new Set(resultadosLocal.map(c => c.driveId || c.id)); // Usa driveId se houver
  const uniqueFilesNuvem = filesNuvem.filter(f => !localIds.has(f.id));

  // Exibe resultados locais
  if (resultadosLocal.length) {
    dropdown.appendChild(createHeader("Nesta Aba"));
    resultadosLocal.forEach(c => {
      const li = createDropdownItem(stripExtension(c.title), () => {
        // Ao clicar em uma cifra local, apenas a exibe na lista filtrada
        state.search = stripExtension(c.title); // Define a busca para o nome completo da cifra
        document.getElementById("search-bar").value = stripExtension(c.title);
        dropdown.classList.add("hidden");
        renderCifras(); // Re-renderiza a lista principal filtrada
      });
      dropdown.appendChild(li);
    });
  }

  // Exibe resultados do Google Drive
  if (uniqueFilesNuvem.length) {
    dropdown.appendChild(createHeader("No Google Drive"));
    uniqueFilesNuvem.forEach(f => {
      const li = createDropdownItem(`${stripExtension(f.name)} (Drive)`, async () => {
        try {
          await addCifraFromDrive(f);
          document.getElementById("search-bar").value = ""; // Limpa a barra após adicionar
          state.search = ""; // Limpa o estado da busca
          dropdown.classList.add("hidden");
          toast(`"${stripExtension(f.name)}" adicionada da nuvem!`);
        } catch (error) {
          toast("Erro ao adicionar cifra do Drive.");
          console.error(error);
        }
      });
      dropdown.appendChild(li);
    });
  }

  if (!resultadosLocal.length && !uniqueFilesNuvem.length) {
    const li = document.createElement("li");
    li.className = "dropdown-empty p-2 text-gray-600 dark:text-gray-400";
    li.textContent = `Nenhum resultado encontrado para "${state.search}".`;
    dropdown.appendChild(li);
  }
}

// --- Cria Item de Dropdown (melhorado visualmente) ---
function createDropdownItem(text, onClick) {
  const li = document.createElement("li");
  li.className = "dropdown-item px-3 py-2 cursor-pointer text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors duration-150";
  li.textContent = text;
  li.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return li;
}

// --- Fechar dropdown ao clicar fora ---
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById("search-dropdown");
  const searchBar = document.getElementById("search-bar");

  // Garante que o dropdown esteja aberto e que o clique não foi na barra de busca nem no próprio dropdown
  if (dropdown && searchBar && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== searchBar) {
    dropdown.classList.add("hidden");
  }
});

// Manter dropdown visível enquanto o input está em foco E há texto na busca
document.getElementById("search-bar").addEventListener('focus', () => {
  if (state.search.length > 0) { // Mostra o dropdown se já houver algo digitado
    document.getElementById("search-dropdown").classList.remove("hidden");
  }
});


// --- Adicionar Cifra do Drive ---
function addCifraFromDrive(file) {
  const tab = state.currentTab;
  if (!state.cifras[tab]) state.cifras[tab] = [];

  // Verifica se a cifra (pelo driveId ou id padrão) já existe na aba atual
  if (state.cifras[tab].some(c => c.driveId === file.id || c.id === file.id)) {
      toast(`A cifra "${stripExtension(file.name)}" já existe nesta aba.`);
      return;
  }

  // Gera uma URL de thumbnail com resolução um pouco maior para visualização
  const thumbnailUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s1000') : null;
  // Se for PDF, o Tesseract.js precisará de uma URL para processamento, mas o thumbnail é o que veremos.
  // Para PDFs, Tesseract.js não pode processar diretamente do Drive thumbnail, precisaria de uma biblioteca de PDF.
  // Por ora, tratamos como imagem para exibição.

  state.cifras[tab].push({
    id: file.id, // ID do Drive como ID principal
    title: file.name,
    url: thumbnailUrl || `https://drive.google.com/uc?export=view&id=${file.id}`, // Fallback para visualização direta se não houver thumbnail
    driveId: file.id,
    mimeType: file.mimeType // Guarda o mimeType para futuras integrações (ex: PDFs)
  });
  saveState();
  renderCifras();
  toast(`Cifra "${stripExtension(file.name)}" adicionada!`);

  // Limpa a search bar e esconde o dropdown
  const searchBar = document.getElementById("search-bar");
  if (searchBar) {
    searchBar.value = "";
    state.search = "";
    document.getElementById("search-dropdown").classList.add("hidden");
  }
}


// --- Proxy para Imagens (OCR/Fullscreen) ---
function getProxiedUrl(originalUrl) {
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  // Use o seu proxy apenas para URLs externas que não são do Drive.
  // URLs do Google Drive já devem ser acessíveis (thumbnail ou uc?export=view).
  // Verifique a URL para evitar proxy desnecessário em URLs do Google Drive.
  if (originalUrl.includes("drive.google.com")) {
      return originalUrl;
  }
  return "https://cors-proxy-cifras.onrender.com/proxy?url=" + encodeURIComponent(originalUrl);
}

// --- Função de Tela Cheia (Fullscreen) para Cifras (Imagem) ---
function openFullscreen(cifra) {
  const overlay = document.getElementById("fullscreen-overlay");
  let fullscreenUrl = getProxiedUrl(cifra.url);

  // Considerar o mimeType para exibir PDF vs Imagem
  const isPdf = cifra.mimeType && cifra.mimeType === 'application/pdf';
  let contentHtml = '';

  if (isPdf) {
    // Para PDFs, um iframe é mais adequado. Não haverá OCR direto.
    contentHtml = `
      <iframe src="https://docs.google.com/gview?url=${encodeURIComponent(cifra.url)}&embedded=true"
              class="fullscreen-pdf" frameborder="0" style="width:100%;height:100%;"></iframe>
      <div id="transp-overlay-msg" class="absolute bottom-40 left-0 right-0 text-center text-lg text-white text-shadow-md hidden">
        <span>Transposição não disponível para PDFs.</span>
      </div>
    `;
  } else {
    // Para imagens, manter o comportamento de imagem com OCR
    contentHtml = `
      <div class="fullscreen-img-wrapper relative w-full h-full flex items-center justify-center">
        <img class="fullscreen-img max-w-full max-h-full object-contain" id="fullscreen-img" src="${fullscreenUrl}" alt="${cifra.title}" />
        <div id="tone-controls" class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 bg-opacity-75 text-white rounded-full p-2 flex items-center space-x-3 hidden">
          <button id="tone-down" class="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 w-8 h-8 flex items-center justify-center font-bold text-lg">-</button>
          <span class="tone-label text-xl font-semibold" id="tone-value">0</span>
          <button id="tone-up" class="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 w-8 h-8 flex items-center justify-center font-bold text-lg">+</button>
        </div>
        <div id="overlay-notes" class="absolute inset-0 pointer-events-none"></div>
      </div>
      <div id="transp-overlay-msg" class="absolute bottom-40 left-0 right-0 text-center text-lg text-white text-shadow-md hidden">
        <span>Reconhecendo notas... Aguarde.</span>
      </div>
    `;
  }

  overlay.innerHTML = `
    <button class="close-fullscreen absolute top-4 right-4 text-white text-4xl leading-none font-light opacity-80 hover:opacity-100 transition-opacity duration-200 z-50">&times;</button>
    ${contentHtml}
  `;
  overlay.classList.remove("hidden");

  // Fecha overlay ao clicar no X ou fora do conteúdo
  overlay.querySelector(".close-fullscreen").onclick = () => {
    overlay.classList.add("hidden");
    if (document.fullscreenElement) document.exitFullscreen();
  };
  overlay.onclick = e => {
    // Só fecha se o clique for diretamente no overlay, não em filhos
    if (e.target === overlay || e.target.id === "fullscreen-overlay") {
      overlay.classList.add("hidden");
      if (document.fullscreenElement) document.exitFullscreen();
    }
  };

  // Entra em fullscreen (melhora a imersão)
  if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(err => {
          console.warn("Não foi possível entrar em fullscreen:", err);
      });
  }

  if (isPdf) {
      // Se for PDF, não há lógica de zoom/pan ou OCR
      return;
  }

  // === Zoom e Pan (para imagens) ===
  const img = document.getElementById("fullscreen-img");
  let scale = 1, lastScale = 1, startX = 0, startY = 0, lastX = 0, lastY = 0, isDragging = false;
  let pinchStartDist = null, pinchStartScale = null;

  // Reset transform
  const resetTransform = () => {
    scale = 1;
    lastX = 0;
    lastY = 0;
    img.style.transform = 'translate(0px, 0px) scale(1)'; // Define explicitamente para evitar valores residuais
    img.style.transformOrigin = 'center center'; // Reseta a origem
  };
  resetTransform(); // Garante o estado inicial

  img.onwheel = function(e) {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1; // Diminui ou aumenta
    scale = Math.max(0.5, Math.min(5, scale * delta)); // Limites de zoom
    img.style.transformOrigin = `${offsetX}px ${offsetY}px`;
    img.style.transform = `translate(${lastX}px, ${lastY}px) scale(${scale})`;
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
      img.style.transform = `translate(${lastX}px, ${lastY}px) scale(${scale})`;
    }
  };
  overlay.onmouseup = function() { isDragging = false; };
  overlay.onmouseleave = function() { isDragging = false; }; // Para evitar "drag fantasma"

  img.ontouchstart = function(e) {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = scale;
      isDragging = false; // Desativa arrasto de 1 dedo durante pinça
    } else if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX - lastX;
      startY = e.touches[0].clientY - lastY;
    }
    e.preventDefault(); // Evita scroll da página
  };
  img.ontouchmove = function(e) {
    if (e.touches.length === 2 && pinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      scale = Math.max(0.5, Math.min(5, pinchStartScale * dist / pinchStartDist));
      img.style.transform = `translate(${lastX}px, ${lastY}px) scale(${scale})`;
    } else if (e.touches.length === 1 && isDragging) {
      lastX = e.touches[0].clientX - startX;
      lastY = e.touches[0].clientY - startY;
      img.style.transform = `translate(${lastX}px, ${lastY}px) scale(${scale})`;
    }
    e.preventDefault(); // Evita scroll da página
  };
  img.ontouchend = function(e) {
    if (e.touches.length < 2) { // Reset pinch data if less than 2 fingers remain
      pinchStartDist = null;
      pinchStartScale = null;
    }
    if (e.touches.length === 0) { // All fingers lifted
      isDragging = false;
    }
  };

  // Duplo clique/toque para resetar zoom/pan
  let lastTapTime = 0;
  img.ondblclick = resetTransform;
  img.addEventListener('touchend', function(e) {
      if (e.touches.length === 0) {
          const now = Date.now();
          if (now - lastTapTime < 350) { // Considera duplo toque em 350ms
              resetTransform();
          }
          lastTapTime = now;
      }
  });


  // ---- OCR e Overlay de Notas ----
  const overlayNotes = document.getElementById("overlay-notes");
  const transpMsg = document.getElementById("transp-overlay-msg");
  const controls = document.getElementById("tone-controls");
  let currentTone = 0;
  let notesData = [];

  // Função de transposição (cromática, com sufixos)
  const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  function normalizeNote(note) {
    // Converte enharmônicos para sustenidos
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
    // Regex melhorado para capturar a nota raiz, o sufixo e o baixo (se houver)
    // Ex: Am7/G -> [Am7, A, m7, /G, G]
    const regex = /^([A-G](#|b)?)([^/\s]*)?(\/([A-G](#|b)?))?$/i;
    const match = chord.match(regex);
    if (!match) return chord; // Se não for um formato de cifra reconhecível, retorna original

    let root = normalizeNote(match[1]); // Nota raiz (ex: C, C#, D)
    let suffix = match[3] || ""; // Sufixo (ex: m7, sus4, dim, aug, etc.)
    let bass = match[5] ? normalizeNote(match[5]) : null; // Nota do baixo (ex: G, A#)

    let idx = NOTES_SHARP.indexOf(root);
    if (idx === -1) return chord; // Se a nota raiz não for reconhecida, retorna original

    let newIdx = (idx + semitones + 12) % 12; // Garante que o índice esteja entre 0 e 11
    let newRoot = NOTES_SHARP[newIdx];

    let newBass = "";
    if (bass) {
      let idxBass = NOTES_SHARP.indexOf(bass);
      if (idxBass !== -1) {
        let newIdxBass = (idxBass + semitones + 12) % 12;
        newBass = "/" + NOTES_SHARP[newIdxBass];
      } else {
        // Se a nota do baixo não for reconhecida, mantém como está
        newBass = "/" + bass;
      }
    }
    return `${newRoot}${suffix}${newBass}`;
  }

  function renderOverlays() {
    overlayNotes.innerHTML = "";
    const imgRect = img.getBoundingClientRect(); // Pega as dimensões e posição da imagem atual
    const wrapperRect = img.parentElement.getBoundingClientRect(); // Pega as dimensões do wrapper para cálculo de offset

    notesData.forEach(note => {
      const div = document.createElement("div");
      div.className = "absolute bg-white text-zinc-900 font-bold rounded px-1 text-base shadow-md pointer-events-none z-50 transition-all duration-100"; // Classes Tailwind
      div.style.left = `${(note.bbox.x0 / img.naturalWidth) * imgRect.width}px`;
      div.style.top = `${(note.bbox.y0 / img.naturalHeight) * imgRect.height}px`;
      div.style.fontSize = `${(note.bbox.height / img.naturalHeight) * imgRect.height * 0.7}px`; // Tamanho da fonte proporcional
      div.textContent = transposeChord(note.text, currentTone);

      // Posiciona em relação ao wrapper e à imagem escalonada
      const xOffset = imgRect.left - wrapperRect.left;
      const yOffset = imgRect.top - wrapperRect.top;
      div.style.transform = `translate(${xOffset}px, ${yOffset}px)`;

      overlayNotes.appendChild(div);
    });
  }

  function detectNotes() {
    transpMsg.classList.remove("hidden"); // Usa Tailwind hidden
    transpMsg.querySelector("span").textContent = "Iniciando reconhecimento...";
    overlayNotes.innerHTML = "";
    controls.classList.add("hidden");

    Tesseract.recognize(img.src, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
            transpMsg.querySelector("span").textContent = `Reconhecendo: ${(m.progress * 100).toFixed(0)}%`;
        }
      }
    }).then(({ data }) => {
      notesData = [];
      (data.words || []).forEach(wordObj => {
        // Regex mais robusto para identificar cifras
        // Ex: C, C#, Dm, F7, Gsus4, Am/G, D/F#
        if (/^[A-G](#|b)?(maj|min|m|sus|dim|aug|add|alt)?[0-9]*(\/[A-G](#|b)?)?$/i.test(wordObj.text.trim())) {
          notesData.push({
            text: wordObj.text.trim(),
            bbox: wordObj.bbox
          });
        }
      });
      if (notesData.length === 0) {
        transpMsg.querySelector("span").textContent = "Nenhuma nota reconhecida. Tente uma imagem mais clara.";
        setTimeout(() => { transpMsg.classList.add("hidden"); }, 3000);
      } else {
        renderOverlays();
        transpMsg.classList.add("hidden");
        controls.classList.remove("hidden");
      }
    }).catch(err => {
        console.error("Erro no Tesseract OCR:", err);
        transpMsg.querySelector("span").textContent = "Erro no reconhecimento OCR.";
        setTimeout(() => { transpMsg.classList.add("hidden"); }, 3000);
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
      clickTimer = setTimeout(()=>{ clickCount = 0; }, 700); // Reset em 700ms
    }
  });

  // Controles de tonalidade
  document.getElementById("tone-up").onclick = () => {
    currentTone++;
    document.getElementById("tone-value").textContent = currentTone > 0 ? `+${currentTone}` : currentTone === 0 ? "0" : currentTone;
    renderOverlays();
  };
  document.getElementById("tone-down").onclick = () => {
    currentTone--;
    document.getElementById("tone-value").textContent = currentTone > 0 ? `+${currentTone}` : currentTone === 0 ? "0" : currentTone;
    renderOverlays();
  };

    // Re-renderiza overlays quando a imagem é carregada (para garantir posicionamento correto)
    img.onload = () => {
        if (notesData.length > 0) { // Apenas se já houver notas detectadas
            renderOverlays();
        }
    };
}


// --- Upload para Google Drive ---
async function uploadCifraToDrive(cifra) {
  try {
    const tokenResponse = await gapiAuth(); // Garante autenticação
    const accessToken = tokenResponse.access_token;

    // 1. Obter o blob da imagem/arquivo
    let fileBlob;
    // Se já tem driveId, significa que já está no Drive, então pula o upload
    if (cifra.driveId) {
        toast(`"${stripExtension(cifra.title)}" já está no Google Drive.`);
        return;
    }

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
      throw new Error("Tipo de URL não suportado para upload (apenas data: ou blob:).");
    }

    // 2. Criar metadados
    const metadata = {
      name: `${stripExtension(cifra.title)}.jpeg`, // Salva sempre como JPEG para consistência
      mimeType: "image/jpeg", // Força o MIME Type para JPEG
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };

    // 3. Converte o blob para JPEG se não for, e comprime
    const convertedBlob = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85); // Qualidade JPEG 85%
        };
        img.src = URL.createObjectURL(fileBlob);
    });

    // 4. Configurar o upload
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', convertedBlob); // Usa o blob convertido/comprimido

    // 5. Fazer a requisição
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
      {
        method: 'POST',
        headers: new Headers({
          'Authorization': `Bearer ${accessToken}`
          // 'Content-Type': `multipart/related; boundary=${form._boundary}` // O fetch geralmente lida com isso
        }),
        body: form
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Detalhes do erro:", errorData);
      throw new Error(`Erro no upload: ${errorData.error.message}`);
    }

    const result = await response.json();
    // Atualiza a cifra local com o ID do Drive para não reenviar
    const tab = state.currentTab;
    const currentCifra = state.cifras[tab].find(c => c.id === cifra.id);
    if (currentCifra) {
        currentCifra.driveId = result.id;
        currentCifra.url = `https://drive.google.com/thumbnail?id=${result.id}&sz=w1000`; // Atualiza para URL do Drive
        saveState();
        renderCifras();
    }
    toast(`Cifra "${stripExtension(cifra.title)}" enviada para o Google Drive!`);
    return result;

  } catch (error) {
    console.error("Erro completo no upload:", error);
    toast(`Falha no upload: ${error.message}`);
    throw error;
  }
}

// --- Funções de Seleção ---
function isSelected(id) {
  const tab = state.currentTab;
  return state.selection[tab] && state.selection[tab].has(id);
}

// --- Toast (Mensagens Curtas) ---
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show", "opacity-100", "translate-y-0"); // Classes Tailwind para animação
  setTimeout(() => {
    t.classList.remove("opacity-100", "translate-y-0");
    t.classList.add("opacity-0", "translate-y-4"); // Esconde e move para baixo
    setTimeout(() => t.classList.remove("show"), 300); // Remove display none após a transição
  }, 2500); // Tempo visível da mensagem
}


// --- Modal de Cifras na Nuvem ---
function showCloudModal(files = []) {
  const modal = document.getElementById("cloud-modal");
  modal.classList.remove("hidden"); // Mostra o modal (Tailwind)

  const list = document.getElementById("cloud-list");
  list.innerHTML = "";

  // Se não houver arquivos passados, busca (primeira chamada)
  if (!files.length && !state.onlineCache.cloudFiles) { // Adicionado onlineCache para evitar chamadas duplicadas
    list.innerHTML = "<div class='text-center py-4 text-gray-600 dark:text-gray-400'>Buscando cifras na nuvem...</div>";
    searchDrive(state.search || "").then(foundFiles => {
        state.onlineCache.cloudFiles = foundFiles; // Cacheia os resultados
        showCloudModal(foundFiles);
    }).catch(err => {
        list.innerHTML = "<div class='text-center py-4 text-red-500'>Erro ao carregar cifras da nuvem.</div>";
        console.error("Erro ao buscar cloud files:", err);
    });
    return;
  }

  const filesToShow = files.length > 0 ? files : (state.onlineCache.cloudFiles || []);

  if (!filesToShow.length) {
    list.innerHTML = "<div class='text-center py-4 text-gray-600 dark:text-gray-400'>Nenhuma cifra encontrada na nuvem.</div>";
    return;
  }

  // Filtra as que já estão na aba atual para evitar duplicatas visuais
  const currentTabCifrasIds = new Set((state.cifras[state.currentTab] || []).map(c => c.driveId || c.id));
  const filteredFiles = filesToShow.filter(f => !currentTabCifrasIds.has(f.id));

  if (!filteredFiles.length) {
    list.innerHTML = "<div class='text-center py-4 text-gray-600 dark:text-gray-400'>Todas as cifras da nuvem já estão nesta aba.</div>";
    document.getElementById("add-cloud-btn").disabled = true; // Desabilita botão se não houver o que adicionar
    return;
  } else {
      document.getElementById("add-cloud-btn").disabled = false;
  }


  filteredFiles.forEach(f => {
    const label = document.createElement("label");
    // Classes Tailwind para o item da lista
    label.className = "flex items-center space-x-3 py-2 px-3 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors duration-150";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = f.id;
    // Classes Tailwind para checkbox
    cb.className = "form-checkbox h-5 w-5 text-indigo-600 dark:text-sky-400 rounded focus:ring-indigo-500 dark:focus:ring-sky-400 border-gray-300 dark:border-zinc-600";

    const img = document.createElement("img");
    img.src = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+/, '=s80') : `https://drive.google.com/uc?export=view&id=${f.id}`; // Melhor thumbnail
    img.width = 40; img.height = 56; img.alt = stripExtension(f.name);
    // Classes Tailwind para imagem
    img.className = "w-10 h-14 object-cover rounded-sm";

    const span = document.createElement("span");
    span.textContent = stripExtension(f.name);
    // Classes Tailwind para texto
    span.className = "text-gray-800 dark:text-gray-200 text-sm font-medium truncate";

    label.appendChild(cb); label.appendChild(img); label.appendChild(span);
    list.appendChild(label);
  });

  document.getElementById("add-cloud-btn").onclick = () => {
    const selected = Array.from(list.querySelectorAll("input:checked")).map(cb => cb.value);
    const tab = state.currentTab;
    if (!state.cifras[tab]) state.cifras[tab] = [];

    let addedCount = 0;
    filteredFiles.filter(f => selected.includes(f.id)).forEach(f => {
      // Dupla checagem para evitar adicionar duplicatas
      if (!state.cifras[tab].some(c => c.driveId === f.id || c.id === f.id)) {
          addCifraFromDrive(f); // Usa a função existente para adicionar
          addedCount++;
      }
    });
    saveState();
    renderCifras();
    modal.classList.add("hidden");
    if (addedCount > 0) {
        toast(`${addedCount} cifra(s) adicionada(s) da nuvem!`);
    } else {
        toast("Nenhuma cifra nova selecionada para adicionar.");
    }
  };
  document.getElementById("close-cloud-modal").onclick = () => {
      modal.classList.add("hidden");
      state.onlineCache.cloudFiles = null; // Limpa o cache ao fechar
  };
}

// --- Polling (Ainda como placeholder) ---
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    // Implemente a lógica de polling real aqui, se necessário.
    // Por exemplo, para verificar se novas cifras foram adicionadas a abas online.
    console.log("Polling for online tabs...");
  }, POLL_INTERVAL);
}

// --- Algoritmo de Transposição para Cifra em Texto (Já Existente) ---
// (Mantido, pois é para funcionalidade de OCR/Edição de texto)
const NOTES_SHARP_TRANSPOSE = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]; // Renomeado para evitar conflito

function normalizeNoteTranspose(note) {
  switch(note) {
    case "Db": return "C#"; case "Eb": return "D#"; case "Gb": return "F#";
    case "Ab": return "G#"; case "Bb": return "A#";
    default: return note;
  }
}

function transposeChordText(chord, semitones) {
  const regex = /^([A-G](#|b)?)([^/\s]*)?(\/([A-G](#|b)?))?$/i; // Regex mais preciso
  const match = chord.match(regex);
  if (!match) return chord;

  let root = normalizeNoteTranspose(match[1]);
  let suffix = match[3] || "";
  let bass = match[5] ? normalizeNoteTranspose(match[5]) : null;

  let idx = NOTES_SHARP_TRANSPOSE.indexOf(root);
  if (idx === -1) return chord; // Se a nota raiz não for reconhecida, retorna original

  let newIdx = (idx + semitones + 12) % 12;
  let newRoot = NOTES_SHARP_TRANSPOSE[newIdx];

  let newBass = "";
  if (bass) {
    let idxBass = NOTES_SHARP_TRANSPOSE.indexOf(bass);
    if (idxBass !== -1) {
      let newIdxBass = (idxBass + semitones + 12) % 12;
      newBass = "/" + NOTES_SHARP_TRANSPOSE[newIdxBass];
    } else {
      newBass = "/" + bass; // Se o baixo não for reconhecido, mantém
    }
  }
  return `<span class="nota-sobreposta">${newRoot}${suffix}${newBass}</span>`;
}

function transposeTextCifra(text, semitones) {
  // Regex para pegar cifras que podem ter sufixos complexos e baixo
  const chordRegex = /\b([A-G][#b]?(maj|min|m|sus|dim|aug|add|alt)?[0-9]*(\/[A-G][#b]?)?)\b/g;
  return text.replace(chordRegex, (match) => transposeChordText(match, semitones));
}


// --- FULLSCREEN PARA CIFRA DE TEXTO (Ainda não implementado no HTML) ---
// Manter esta função para o futuro, caso você adicione cifras em texto puro
function abrirCifraTextoFullscreen() {
  const cifraOriginal = document.getElementById("cifra-texto-bloco").innerText;
  let currentTransposition = 0;

  const overlay = document.getElementById("fullscreen-overlay");
  overlay.innerHTML = `
    <button class="close-fullscreen">&times;</button>
    <div class="relative w-full h-full flex items-center justify-center p-4">
      <pre id="cifra-texto-full" class="font-mono text-base md:text-lg max-w-full max-h-[80vh] overflow-auto bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 p-6 rounded-lg shadow-xl whitespace-pre-wrap"></pre>
      <div id="tone-controls-text" class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 bg-opacity-75 text-white rounded-full p-2 flex items-center space-x-3 hidden">
        <button id="tone-down-text" class="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 w-8 h-8 flex items-center justify-center font-bold text-lg">-</button>
        <span class="tone-label text-xl font-semibold" id="tone-value-text">0</span>
        <button id="tone-up-text" class="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 w-8 h-8 flex items-center justify-center font-bold text-lg">+</button>
      </div>
    </div>
  `;
  overlay.classList.remove("hidden");

  function atualizarCifraTexto() {
    overlay.querySelector("#cifra-texto-full").innerHTML = transposeTextCifra(cifraOriginal, currentTransposition);
    overlay.querySelector("#tone-value-text").textContent = currentTransposition > 0 ? `+${currentTransposition}` : currentTransposition === 0 ? "0" : currentTransposition;
  }
  atualizarCifraTexto();

  overlay.querySelector(".close-fullscreen").onclick = () => {
    overlay.classList.add("hidden");
    if (document.fullscreenElement) document.exitFullscreen();
  };
  overlay.onclick = e => {
    if (e.target === overlay || e.target.id === "fullscreen-overlay") {
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

// --- Event Listeners Globais ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    // No seu HTML atual, não há mais `tabsElem` para renderizar as abas como botões fixos.
    // A navegação de abas agora é via menu hambúrguer.

    // Configuração do Menu Hambúrguer
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks = document.getElementById('nav-links');
    const menuOverlay = document.getElementById('menu-overlay');
    const hasSubmenus = document.querySelectorAll('.nav-links .has-submenu');

    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        menuToggle.classList.toggle('open');
        menuOverlay.classList.toggle('hidden');
        document.body.classList.toggle('overflow-hidden'); // Para desativar scroll do body
        // Fecha submenus abertos ao abrir/fechar o menu principal
        if (!navLinks.classList.contains('active')) {
            hasSubmenus.forEach(item => item.classList.remove('open'));
        }
    });

    // Fechar menu/overlay ao clicar fora
    menuOverlay.addEventListener('click', () => {
        navLinks.classList.remove('active');
        menuToggle.classList.remove('open');
        menuOverlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        hasSubmenus.forEach(item => item.classList.remove('open'));
    });

    // Funcionalidade de Submenu em Mobile (ao clicar no item pai)
    hasSubmenus.forEach(item => {
        const parentLink = item.querySelector('.nav-link');
        parentLink.addEventListener('click', (e) => {
            // Verifica se é mobile (se o menuToggle está visível)
            if (window.getComputedStyle(menuToggle).display !== 'none') {
                e.preventDefault(); // Impede a navegação direta do link pai
                item.classList.toggle('open'); // Alterna a classe 'open' para mostrar/esconder submenu
                // Fecha outros submenus se houver
                hasSubmenus.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('open');
                    }
                });
            }
            // Se for desktop, o CSS de hover do Tailwind já deve gerenciar o submenu
        });

        // Fecha o menu principal e submenus ao clicar em um item de submenu
        item.querySelectorAll('.sub-menu a').forEach(subLink => {
            subLink.addEventListener('click', () => {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('open');
                menuOverlay.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
                hasSubmenus.forEach(sub => sub.classList.remove('open')); // Fecha todos os submenus
            });
        });
    });


    // --- Modo Escuro ---
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    // Carrega a preferência de tema
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark'); // Adiciona classe 'dark' ao <html>
    } else if (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Se não houver preferência salva, usa a do sistema
        document.documentElement.classList.add('dark');
    }

    // Alterna o tema ao clicar no botão
    darkModeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        const isDarkMode = document.documentElement.classList.contains('dark');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });

    // Inicializa a renderização das cifras da aba atual
    setTab(state.currentTab);
    if (typeof startPolling === "function") startPolling();

    // Eventos para as opções do menu (Importar, Tirar Foto, Enviar p/ Nuvem)
    // Estas opções agora devem ser links dentro do `nav-links` no HTML
    // Você precisará adicionar IDs ou classes para identificá-los:
    document.querySelector('a[href="#importar-imagem"]')
      ?.addEventListener('click', () => {
        document.getElementById("file-input").click();
      });

    document.querySelector('a[href="#tirar-foto"]')
      ?.addEventListener('click', () => {
        openCameraCapture();
      });

    document.querySelector('a[href="#enviar-nuvem-add"]')
      ?.addEventListener('click', async () => {
        // Esta opção pode abrir o modal de nuvem ou disparar o upload de selecionadas
        // Dependendo do que você quer que ela faça.
        // Se for upload de selecionadas, use a lógica do botão `#upload-selected-btn`
        // Se for para abrir o modal de seleção na nuvem:
        showCloudModal([]); // Abre o modal para selecionar da nuvem
      });

    document.querySelector('a[href="#adicionar-selecionadas"]')
      ?.addEventListener('click', async () => {
        // Esta opção deve abrir o modal de seleção na nuvem
        showCloudModal([]);
      });
});

