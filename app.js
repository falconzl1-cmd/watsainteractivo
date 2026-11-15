const DEFAULT_CONFIG = {
    backendUrl: "",
    apiKey: "",
    geminiModel: "gemini-3.5-flash-lite",
    whatsappNumber: "584246045675",
    eurRate: 51.50,
    usdRate: 47.20,
    baseCurrency: "EUR",
    voiceURI: "",
    address: "Plaza Venezuela, Av. Principal / detrás de la Torre Previsora, Caracas, Venezuela.",
    addressImageUrl: "",
    hours: "Lunes a Viernes: 8:00 AM a 6:00 PM | Sábados: 8:30 AM a 3:00 PM"
};

const BASE_CATALOG = [
    { id: 'mdf15', code: '000101', name: 'Lámina MDF Crudo 15mm (1.22x2.44m)', price: 34.00, category: 'Tableros', image: 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=300&auto=format&fit=crop&q=60' },
    { id: 'mdf18', code: '000102', name: 'Lámina MDF Crudo 18mm (1.22x2.44m)', price: 40.00, category: 'Tableros', image: 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=300&auto=format&fit=crop&q=60' },
    { id: 'mel_b18', code: '000201', name: 'Melamina Blanca 18mm (1.83x2.44m)', price: 56.00, category: 'Melamina', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&auto=format&fit=crop&q=60' },
    { id: 'mel_m18', code: '000202', name: 'Melamina Maderada 18mm (1.83x2.44m)', price: 64.00, category: 'Melamina', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&auto=format&fit=crop&q=60' },
    { id: 'pvc15', code: '000301', name: 'Lámina PVC Hidrófugo 15mm (1.22x2.44m)', price: 54.00, category: 'PVC', image: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=300&auto=format&fit=crop&q=60' },
    { id: 'formica', code: '000401', name: 'Lámina Formica Decorativa (1.22x2.44m)', price: 26.00, category: 'Laminados', image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=300&auto=format&fit=crop&q=60' }
];

let storeConfig = { ...DEFAULT_CONFIG };
let activeCatalog = [...BASE_CATALOG];
let chatHistory = [];
let cart = {};
let isBotTyping = false;
let autoVoiceEnabled = false;

const voiceMessagesMap = new Map();
let currentUtterance = null;
let activeAudioId = null;

function populateVoiceList() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const select = document.getElementById('cfgVoiceSelect');
    if (!select) return;

    const spanishVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
    const listToShow = spanishVoices.length > 0 ? spanishVoices : voices;

    select.innerHTML = listToShow.map(v =>
        `<option value="${v.voiceURI}" ${storeConfig.voiceURI === v.voiceURI ? 'selected' : ''}>${v.name} (${v.lang})</option>`
    ).join('');

    if (!storeConfig.voiceURI && spanishVoices.length > 0) {
        const best =
            spanishVoices.find(v => v.lang.toLowerCase().includes('es-ve')) ||
            spanishVoices.find(v => v.lang.toLowerCase().includes('es-co')) ||
            spanishVoices.find(v => v.lang.toLowerCase().includes('es-419')) ||
            spanishVoices.find(v => v.lang.toLowerCase().includes('es-mx')) ||
            spanishVoices[0];
        if (best) {
            storeConfig.voiceURI = best.voiceURI;
            select.value = best.voiceURI;
        }
    }
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
    setTimeout(populateVoiceList, 300);
}

window.appPlayVoiceById = function(msgId) {
    if (!('speechSynthesis' in window)) {
        window.appShowToast("Tu navegador no soporta audio de voz");
        return;
    }

    const rawText = voiceMessagesMap.get(msgId);
    if (!rawText) return;

    if (window.speechSynthesis.speaking && activeAudioId === msgId) {
        window.speechSynthesis.cancel();
        resetAudioUI(msgId);
        activeAudioId = null;
        return;
    }

    window.speechSynthesis.cancel();
    if (activeAudioId) resetAudioUI(activeAudioId);

    const cleanText = rawText
        .replace(/\[PRODUCTO:.*?\]/g, '')
        .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\n+/g, '. ')
        .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-VE';
    utterance.rate = 1.02;
    utterance.pitch = 1.02;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const chosenVoice = voices.find(v => v.voiceURI === storeConfig.voiceURI) ||
                            voices.find(v => v.lang.toLowerCase().startsWith('es'));
        if (chosenVoice) utterance.voice = chosenVoice;
    }

    currentUtterance = utterance;
    activeAudioId = msgId;

    const iconEl = document.getElementById(`icon_${msgId}`);
    const waveEl = document.getElementById(`wave_${msgId}`);
    if (iconEl) iconEl.className = "fa-solid fa-stop text-xs";
    if (waveEl) waveEl.classList.add('playing');

    utterance.onend = () => {
        resetAudioUI(msgId);
        activeAudioId = null;
        currentUtterance = null;
    };

    utterance.onerror = () => {
        resetAudioUI(msgId);
        activeAudioId = null;
        currentUtterance = null;
    };

    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
};

function resetAudioUI(msgId) {
    const iconEl = document.getElementById(`icon_${msgId}`);
    const waveEl = document.getElementById(`wave_${msgId}`);
    if (iconEl) iconEl.className = "fa-solid fa-play text-xs translate-x-[1px]";
    if (waveEl) waveEl.classList.remove('playing');
}

window.appTestVoice = function() {
    const testId = 'test_voice_id';
    voiceMessagesMap.set(testId, "¡Epale mi pana! Así suena la voz de tu asesor comercial de SuperFormica en Plaza Venezuela.");
    window.appPlayVoiceById(testId);
};

window.appToggleAutoVoice = function() {
    autoVoiceEnabled = !autoVoiceEnabled;
    const btn = document.getElementById('autoVoiceToggleBtn');
    const icon = document.getElementById('autoVoiceIcon');
    if (autoVoiceEnabled) {
        btn.className = "px-3 py-1.5 rounded-full bg-wa-accent/20 border border-wa-accent text-xs text-wa-accent flex items-center gap-1.5 transition cursor-pointer font-medium";
        icon.className = "fa-solid fa-volume-high text-wa-accent";
        btn.querySelector('span').textContent = "Voz ON";
        window.appShowToast("Voz automática activada");
        window.speechSynthesis.cancel();
    } else {
        btn.className = "px-3 py-1.5 rounded-full bg-wa-bg/70 hover:bg-wa-hover border border-wa-border text-xs text-wa-textSecondary flex items-center gap-1.5 transition cursor-pointer";
        icon.className = "fa-solid fa-volume-xmark text-rose-400";
        btn.querySelector('span').textContent = "Voz OFF";
        window.speechSynthesis.cancel();
    }
};

window.onload = async function() {
    loadSavedConfig();
    populateVoiceList();
    await syncWithBackendHybrid();
    window.appRenderCatalogList();
    window.appUpdateUIWithConfig();
    window.appSetActiveCurrency(storeConfig.baseCurrency || 'EUR');

    await window.appSyncBcv(false);

    const hasKey = Boolean((storeConfig.apiKey || '').trim());
    const welcomeMsg = hasKey
        ? `¡Epale, mi pana! 👋 Bienvenido a **SuperFormica** en **Plaza Venezuela, Caracas**.\n\n[PRODUCTO: mdf15]\n\n¿Qué proyecto tienes en mente hoy o qué material estás buscando?`
        : `¡Epale! 👋 Bienvenido a **SuperFormica** en **Plaza Venezuela, Caracas**.\n\n⚠️ Para activar el asesor IA de Google AI Studio, abre **Configuración (⚙️)** arriba a la derecha y pega tu **API Key** gratuita.`;

    window.appAppendMessage('bot', welcomeMsg, false);
};

function loadSavedConfig() {
    try {
        const saved = localStorage.getItem('superformica_wa_config');
        if (saved) storeConfig = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch (e) {}
    try {
        const savedCat = localStorage.getItem('superformica_custom_catalog');
        if (savedCat) {
            const parsed = JSON.parse(savedCat);
            if (Array.isArray(parsed) && parsed.length > 0) activeCatalog = parsed;
        }
    } catch (e) {}
}

function persistConfig() {
    try { localStorage.setItem('superformica_wa_config', JSON.stringify(storeConfig)); } catch (e) {}
}

async function syncWithBackendHybrid() {
    const backendUrl = (storeConfig.backendUrl || '').trim();
    if (!backendUrl) {
        setConnectionStatus(false, "Modo Autónomo Local");
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const resConfig = await fetch(`${backendUrl}/api/config`, { signal: controller.signal, cache: 'no-store' });
        if (resConfig.ok) {
            const remoteCfg = await resConfig.json();
            const preservedApiKey = (storeConfig.apiKey || '').trim();
            storeConfig = { ...storeConfig, ...remoteCfg };
            if (!String(remoteCfg?.apiKey || '').trim() && preservedApiKey) {
                storeConfig.apiKey = preservedApiKey;
            }
            persistConfig();
        }

        const resCat = await fetch(`${backendUrl}/api/catalogo`, { signal: controller.signal, cache: 'no-store' });
        if (resCat.ok) {
            const remoteCat = await resCat.json();
            if (Array.isArray(remoteCat) && remoteCat.length > 0) {
                activeCatalog = remoteCat;
                localStorage.setItem('superformica_custom_catalog', JSON.stringify(activeCatalog));
            }
        }
        clearTimeout(timeoutId);
        setConnectionStatus(true, "Backend Conectado");
    } catch (e) {
        clearTimeout(timeoutId);
        setConnectionStatus(false, "Modo Autónomo Local");
    }
}

function setConnectionStatus(online, text) {
    const badge = document.getElementById('connectionBadge');
    if (badge) {
        badge.className = online ? "text-[11px] text-emerald-400 flex items-center gap-1" : "text-[11px] text-amber-400 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-circle text-[8px]"></i> ${text}`;
    }
}

window.appFormatBs = function(amount) {
    return Number(amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function getActiveRate() {
    return storeConfig.baseCurrency === 'USD' ? (Number(storeConfig.usdRate) || 47.20) : (Number(storeConfig.eurRate) || 51.50);
}

window.appSyncBcv = async function(showFeedback = true) {
    let updated = false;
    try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && Number(data.promedio) > 0) {
                storeConfig.usdRate = Number(data.promedio);
                storeConfig.eurRate = Number((storeConfig.usdRate * 1.09).toFixed(2));
                updated = true;
            }
        }
    } catch (e) {}

    if (updated) {
        persistConfig();
        window.appUpdateUIWithConfig();
        if (showFeedback) window.appShowToast("¡Tasas BCV actualizadas!");
    } else if (showFeedback) {
        window.appShowToast("Tasas sincronizadas con valores actuales");
    }
};

window.appUpdateUIWithConfig = function() {
    const eurVal = Number(storeConfig.eurRate) || 51.50;
    const usdVal = Number(storeConfig.usdRate) || 47.20;

    const hEur = document.getElementById('headerEurBadge');
    const hUsd = document.getElementById('headerUsdBadge');
    const addrEl = document.getElementById('sidebarAddressText');
    const hoursEl = document.getElementById('sidebarHoursText');
    const statEl = document.getElementById('modalCatalogStats');

    if (hEur) hEur.textContent = `EUR: Bs. ${window.appFormatBs(eurVal)}`;
    if (hUsd) hUsd.textContent = `USD: Bs. ${window.appFormatBs(usdVal)}`;
    if (addrEl) addrEl.textContent = storeConfig.address;
    if (hoursEl) hoursEl.textContent = storeConfig.hours;
    if (statEl) statEl.textContent = `Catálogo activo: ${activeCatalog.length} productos.`;

    window.appRenderCart();
};

window.appSetActiveCurrency = function(curr) {
    storeConfig.baseCurrency = curr;
    persistConfig();
    const btnEur = document.getElementById('cartCurrencyBtnEur');
    const btnUsd = document.getElementById('cartCurrencyBtnUsd');

    if (curr === 'EUR') {
        if (btnEur) btnEur.className = "px-2 py-1 rounded-md text-[10px] font-bold bg-wa-accent text-wa-bg transition cursor-pointer";
        if (btnUsd) btnUsd.className = "px-2 py-1 rounded-md text-[10px] font-bold text-wa-textSecondary hover:text-white transition cursor-pointer";
    } else {
        if (btnUsd) btnUsd.className = "px-2 py-1 rounded-md text-[10px] font-bold bg-wa-accent text-wa-bg transition cursor-pointer";
        if (btnEur) btnEur.className = "px-2 py-1 rounded-md text-[10px] font-bold text-wa-textSecondary hover:text-white transition cursor-pointer";
    }
    window.appRenderCart();
};

function parseCsvRecords(csvText) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const ch = csvText[i];
        const next = csvText[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
            row.push(field.trim());
            field = '';
        } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuotes) {
            if (ch === '\r') i++;
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
        } else if (ch === '\r' && !inQuotes) {
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field.trim());
        rows.push(row);
    }
    return rows;
}

function repairSplitCsvRows(rawRows) {
    const repaired = [];
    let i = 0;
    while (i < rawRows.length) {
        const r = rawRows[i] || [];
        if (r.length >= 3) {
            const code = (r[0] || '').trim();
            const desc = (r[1] || '').replace(/\s+/g, ' ').trim();
            const priceRaw = (r[2] || '').trim();
            repaired.push([code, desc, priceRaw]);
            i++;
        } else if (r.length === 2) {
            const c0 = (r[0] || '').trim();
            const c1 = (r[1] || '').replace(/\s+/g, ' ').trim();
            const nextRow = (i + 1 < rawRows.length) ? (rawRows[i + 1] || []) : null;
            if (nextRow && nextRow.length === 2) {
                const n0 = (nextRow[0] || '').trim();
                const n1 = (nextRow[1] || '').trim();
                if (/^\d+$/.test(c0) && (n0.startsWith('#') || n0.startsWith('·') || n0.toUpperCase().startsWith('VERDE'))) {
                    repaired.push([c0, `${c1} ${n0}`.replace(/\s+/g, ' ').trim(), n1]);
                    i += 2;
                    continue;
                }
            }
            repaired.push([c0, c1, '']);
            i++;
        } else {
            i++;
        }
    }
    return repaired;
}

function parseVenezuelanPrice(rawPrice) {
    const cleaned = String(rawPrice || '').replace(/\$/g, '').replace(/\s+/g, '').trim();
    if (!cleaned || cleaned === '-') return NaN;
    if (cleaned.includes(',') && cleaned.includes('.')) {
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    if (cleaned.includes(',')) {
        return parseFloat(cleaned.replace(',', '.'));
    }
    return parseFloat(cleaned);
}

window.appHandleCatalogUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = String(e.target.result || '').replace(/^\uFEFF/, '');
        const rawRows = parseCsvRecords(text);
        const repairedRows = repairSplitCsvRows(rawRows);
        const newProducts = [];

        repairedRows.forEach((parts, idx) => {
            if (!parts || parts.length < 2) return;
            const firstCol = (parts[0] || '').trim();
            if (!firstCol || firstCol.startsWith('#')) return;
            if (idx === 0 && firstCol.toLowerCase().includes('codigo')) return;

            const code = firstCol;
            const description = (parts[1] || '').trim();
            const parsedPrice = parseVenezuelanPrice(parts[2]);
            const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;

            if (code && description) {
                newProducts.push({
                    id: 'imp_' + code + '_' + idx,
                    code,
                    name: description,
                    price,
                    category: 'Importados',
                    image: 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=300&auto=format&fit=crop&q=60'
                });
            }
        });

        if (newProducts.length > 0) {
            activeCatalog = [...newProducts, ...BASE_CATALOG];
            try {
                localStorage.setItem('superformica_custom_catalog', JSON.stringify(activeCatalog));
            } catch (storageErr) {
                console.warn('No se pudo persistir todo el catálogo en localStorage:', storageErr);
            }
            window.appRenderCatalogList(document.getElementById('catalogSearchInput')?.value || '');
            const statEl = document.getElementById('modalCatalogStats');
            if (statEl) statEl.textContent = `Catálogo activo: ${activeCatalog.length} productos.`;
            window.appShowToast(`¡Se importaron ${newProducts.length} productos!`);
        } else {
            window.appShowToast("Formato no reconocido. Use Codigo,Descripcion,Precio_2");
        }
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
};

window.appClearCatalog = function() {
    activeCatalog = [...BASE_CATALOG];
    localStorage.removeItem('superformica_custom_catalog');
    window.appRenderCatalogList();
    document.getElementById('modalCatalogStats').textContent = `Catálogo restablecido (${activeCatalog.length} productos base).`;
    window.appShowToast("Catálogo restablecido");
};

window.appRenderCatalogList = function(filterQuery = '') {
    const list = document.getElementById('catalogQuickAddList');
    if (!list) return;
    const q = filterQuery.toLowerCase().trim();
    const activeRate = getActiveRate();
    const filtered = activeCatalog.filter(item =>
        !q || item.name.toLowerCase().includes(q) || (item.code && item.code.toLowerCase().includes(q))
    ).slice(0, 250);

    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-xs text-wa-textSecondary italic text-center py-3">No se encontraron productos</div>`;
        return;
    }

    list.innerHTML = filtered.map(item => {
        const safePrice = Number(item.price || 0);
        const priceBs = safePrice * activeRate;
        return `
        <div class="p-2.5 rounded-xl bg-wa-header/70 border border-wa-border/70 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="text-[10px] text-wa-textSecondary font-mono">Cód: ${item.code || 'S/C'}</div>
                <div class="text-xs font-medium text-wa-textPrimary truncate" title="${item.name}">${item.name}</div>
                <div class="text-[11px] text-wa-accent font-semibold">$${safePrice.toFixed(2)} Ref. <span class="text-amber-300 font-normal">(Bs. ${window.appFormatBs(priceBs)})</span></div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="window.appAskAboutProduct('${item.id}')" title="Consultar a la IA" class="w-8 h-8 rounded-lg bg-wa-bg hover:bg-wa-hover border border-wa-border text-wa-textSecondary hover:text-wa-accent flex items-center justify-center transition cursor-pointer">
                    <i class="fa-solid fa-comment-dots text-xs"></i>
                </button>
                <button type="button" onclick="window.appAddToCart('${item.id}')" title="Añadir al cotizador" class="w-8 h-8 rounded-lg bg-wa-accent/20 hover:bg-wa-accent text-wa-accent hover:text-white flex items-center justify-center transition cursor-pointer">
                    <i class="fa-solid fa-plus text-xs"></i>
                </button>
            </div>
        </div>
    `;
    }).join('');
};

window.appAskAboutProduct = function(itemId) {
    const product = activeCatalog.find(p => p.id === itemId || p.code === itemId);
    if (!product) return;
    window.appSendQuickPrompt(`¿Tienes disponible "${product.name}" (código ${product.code || product.id}) y para qué proyectos o cortes lo recomiendas?`);
};

window.appShowAddress = function() {
    const addr = storeConfig.address || DEFAULT_CONFIG.address;
    const hours = storeConfig.hours || DEFAULT_CONFIG.hours;
    const imgUrl = (storeConfig.addressImageUrl || '').trim();
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    const sidebar = document.getElementById('sidebarPanel');
    if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1024) {
        window.appToggleSidebar();
    }
    window.appShowToast("Dirección de SuperFormica");
    const imgLine = imgUrl ? `
🖼️ [Ver imagen de referencia](${imgUrl})` : '';
    const msg = `📍 **Dirección SuperFormica:**
${addr}
🕒 ${hours}
🗺️ [Ver en Google Maps](${mapsUrl})${imgLine}`;
    window.appAppendMessage('bot', msg, false, imgUrl ? `<div class="my-2 rounded-xl overflow-hidden border border-wa-border/80 bg-wa-header shadow-sm"><img src="${imgUrl.replace(/"/g, '&quot;')}" alt="Dirección SuperFormica" class="w-full max-h-48 object-cover" onerror="this.closest('div').remove()"></div>` : '');
};

window.appFilterCatalog = function(query) { window.appRenderCatalogList(query); };

window.appAddToCart = function(itemId) {
    cart[itemId] = (cart[itemId] || 0) + 1;
    window.appRenderCart();
    window.appShowToast("Añadido al cotizador");
};

window.appUpdateCartQty = function(itemId, delta) {
    if (!cart[itemId]) return;
    cart[itemId] += delta;
    if (cart[itemId] <= 0) delete cart[itemId];
    window.appRenderCart();
};

window.appClearCart = function() { cart = {}; window.appRenderCart(); };

window.appRenderCart = function() {
    const container = document.getElementById('cartItemsContainer');
    const badge = document.getElementById('cartBadge');
    if (!container) return;
    const entries = Object.entries(cart);
    let totalItems = 0, totalRef = 0;

    if (entries.length === 0) {
        container.innerHTML = `<div class="text-wa-textSecondary italic py-4 text-center bg-wa-bg/50 rounded-xl border border-wa-border/50">Aún no has agregado materiales</div>`;
        if (badge) badge.classList.add('hidden');
    } else {
        container.innerHTML = entries.map(([id, qty]) => {
            const product = activeCatalog.find(p => p.id === id);
            if (!product) return '';
            const subtotal = product.price * qty;
            totalItems += qty;
            totalRef += subtotal;
            return `
                <div class="p-2.5 rounded-xl bg-wa-bg border border-wa-border flex items-center justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <div class="font-medium text-wa-textPrimary truncate">${product.name}</div>
                        <div class="text-[11px] text-wa-textSecondary">$${product.price.toFixed(2)} c/u • <span class="text-wa-accent font-semibold">$${subtotal.toFixed(2)}</span></div>
                    </div>
                    <div class="flex items-center gap-1.5 bg-wa-header rounded-lg px-1.5 py-1 border border-wa-border shrink-0">
                        <button type="button" onclick="window.appUpdateCartQty('${id}', -1)" class="w-5 h-5 flex items-center justify-center text-wa-textSecondary hover:text-white cursor-pointer">-</button>
                        <span class="font-bold text-xs px-1">${qty}</span>
                        <button type="button" onclick="window.appUpdateCartQty('${id}', 1)" class="w-5 h-5 flex items-center justify-center text-wa-accent hover:text-white cursor-pointer">+</button>
                    </div>
                </div>
            `;
        }).join('');
        if (badge) { badge.textContent = totalItems; badge.classList.remove('hidden'); }
    }

    const activeRate = getActiveRate();
    const totalBs = totalRef * activeRate;
    document.getElementById('cartTotalUsd').textContent = `$${totalRef.toFixed(2)} Ref.`;
    document.getElementById('cartTotalBs').textContent = `Bs. ${window.appFormatBs(totalBs)}`;
};

window.appSendCartToChat = function() {
    const entries = Object.entries(cart);
    if (entries.length === 0) { window.appShowToast("El cotizador está vacío"); return; }
    let text = "Hola, quisiera consultar disponibilidad y presupuesto para:\n";
    let total = 0;
    entries.forEach(([id, qty]) => {
        const p = activeCatalog.find(item => item.id === id);
        if (p) {
            const sub = p.price * qty;
            total += sub;
            text += `- ${qty}x ${p.name} ($${sub.toFixed(2)})\n`;
        }
    });
    text += `Total estimado: $${total.toFixed(2)} Ref.`;
    window.appSendQuickPrompt(text);
};

function normalizeSearchText(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function getRelevantCatalogContext(query = '') {
    const normQuery = normalizeSearchText(query);
    const stopWords = new Set(['hola', 'precio', 'precios', 'tienen', 'hay', 'cuanto', 'cuesta', 'cuestan', 'busco', 'quiero', 'necesito', 'para', 'con', 'por', 'del', 'las', 'los', 'una', 'uno', 'que', 'como', 'donde', 'dime', 'sobre', 'de', 'la', 'el', 'en', 'un', 'mas']);
    const tokens = normQuery
        .split(/[^a-z0-9]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !stopWords.has(t));

    let selected = [];

    if (tokens.length > 0) {
        const scored = [];
        for (let i = 0; i < activeCatalog.length; i++) {
            const p = activeCatalog[i];
            const hay = normalizeSearchText(`${p.code || ''} ${p.name || ''} ${p.category || ''}`);
            let score = 0;
            for (const tok of tokens) {
                if (hay.includes(tok)) {
                    score += (p.code && normalizeSearchText(p.code) === tok) ? 10 : 2;
                }
            }
            if (score > 0) {
                scored.push({ p, score, idx: i });
            }
        }
        scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
        selected = scored.slice(0, 60).map(s => s.p);
    }

    if (selected.length < 15) {
        const seenIds = new Set(selected.map(item => item.id));
        const fallbackPool = activeCatalog.slice(0, 35);
        for (const item of fallbackPool) {
            if (!seenIds.has(item.id)) {
                selected.push(item);
                seenIds.add(item.id);
            }
            if (selected.length >= 35) break;
        }
    }

    const totalCount = activeCatalog.length;
    const headerNote = `(Mostrando ${selected.length} de ${totalCount} productos disponibles en el catálogo activo)`;
    const lines = selected.map(p => `- [ID: ${p.id}] ${p.name}: $${Number(p.price || 0).toFixed(2)} Ref.`).join('\n');
    return `${headerNote}\n${lines}`;
}

function buildSystemPrompt(latestUserText = '') {
    const eurVal = Number(storeConfig.eurRate) || 51.50;
    const usdVal = Number(storeConfig.usdRate) || 47.20;
    return `Eres el asesor comercial estrella de **SuperFormica** en Plaza Venezuela, Caracas. Tu trato es cálido, cercano y profesional venezolano ("mi pana", "con gusto", cordial y directo).
Responde en formato ejecutivo corto (máximo 3-4 líneas o viñetas concisas estilo WhatsApp Business).
Usa ÚNICAMENTE los productos listados en el Catálogo proporcionado a continuación para precios, códigos y disponibilidad.
Cuando recomiendes o menciones un material disponible del catálogo, incluye obligatoriamente la etiqueta exacta en este formato: [PRODUCTO: id_del_producto].
Tasas BCV: EUR Bs.${eurVal.toFixed(2)} | USD Bs.${usdVal.toFixed(2)}.
Catálogo:
${getRelevantCatalogContext(latestUserText)}`;
}

window.appSendMessage = async function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || isBotTyping) return;
    input.value = '';
    input.style.height = 'auto';

    window.appAppendMessage('user', text, true);
    await processBotResponse(text);
};

window.appSendQuickPrompt = function(promptText) {
    if (isBotTyping) return;
    const sidebar = document.getElementById('sidebarPanel');
    if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1024) window.appToggleSidebar();
    window.appAppendMessage('user', promptText, true);
    processBotResponse(promptText);
};

function getAlternatingHistory(latestUserText) {
    const rawTurns = chatHistory.slice(-8).filter(m => m && m.role && Array.isArray(m.parts) && m.parts[0]?.text);
    const cleaned = [];
    for (const turn of rawTurns) {
        const last = cleaned[cleaned.length - 1];
        if (!last || last.role !== turn.role) {
            cleaned.push({ role: turn.role, parts: [{ text: String(turn.parts[0].text) }] });
        }
    }
    if (cleaned.length > 0 && cleaned[0].role !== 'user') {
        cleaned.shift();
    }
    if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
        cleaned.push({ role: 'user', parts: [{ text: latestUserText }] });
    }
    return cleaned;
}

async function processBotResponse(userText) {
    setTypingState(true);
    chatHistory.push({ role: "user", parts: [{ text: userText }] });

    try {
        let replyText = await callGemini(userText);
        if (!/\[PRODUCTO:\s*[a-zA-Z0-9_-]+\]/i.test(replyText)) {
            const normReply = normalizeSearchText(replyText);
            const matchedProducts = [];
            for (const item of activeCatalog) {
                const normName = normalizeSearchText(item.name);
                const normCode = normalizeSearchText(item.code);
                const hitsName = normName.length >= 8 && normReply.includes(normName.slice(0, Math.min(normName.length, 24)));
                const hitsCode = normCode.length >= 4 && new RegExp(`\b${normCode}\b`).test(normReply);
                if (hitsName || hitsCode) {
                    matchedProducts.push(item);
                    if (matchedProducts.length >= 2) break;
                }
            }
            if (matchedProducts.length > 0) {
                replyText += '\n\n' + matchedProducts.map(p => `[PRODUCTO: ${p.id}]`).join('\n');
            }
        }
        chatHistory.push({ role: "model", parts: [{ text: replyText }] });
        setTypingState(false);
        window.appAppendMessage('bot', replyText, false);
    } catch (err) {
        chatHistory.pop();
        setTypingState(false);
        console.error("Error callGemini:", err);
        window.appAppendMessage('bot', `⚠️ **Aviso IA:** ${err.message}`, false);
        const fallback = generateSmartOfflineResponse(userText);
        window.appAppendMessage('bot', fallback, false);
    }
}

async function callGemini(latestUserText) {
    const apiKey = (storeConfig.apiKey || '').trim();
    if (!apiKey) {
        throw new Error("Falta tu API Key de Google AI Studio. Ábrela en Configuración (⚙️) y guarda los cambios.");
    }

    const preferred = (storeConfig.geminiModel || 'gemini-3.5-flash-lite').trim();
    const candidates = Array.from(new Set([preferred, 'gemini-3.5-flash-lite', 'gemini-3.5-flash']));
    const contentsPayload = getAlternatingHistory(latestUserText);
    const systemInstruction = { parts: [{ text: buildSystemPrompt(latestUserText) }] };

    let lastError = "No se obtuvo respuesta de Gemini.";

    for (const model of candidates) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contentsPayload,
                    systemInstruction
                })
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                const parts = data?.candidates?.[0]?.content?.parts || [];
                const text = parts.map(p => p?.text || '').join('').trim();
                if (text) return text;
                lastError = `El modelo ${model} respondió vacío.`;
                continue;
            }

            const apiMsg = data?.error?.message || `HTTP ${response.status}`;
            lastError = `[${model} / ${response.status}] ${apiMsg}`;

            if (response.status === 404 || response.status === 400) {
                continue;
            }
            throw new Error(lastError);
        } catch (netErr) {
            if (netErr.message && netErr.message.startsWith('[')) {
                throw netErr;
            }
            throw new Error(`Error de red al conectar con Google AI Studio: ${netErr.message || netErr}`);
        }
    }

    throw new Error(lastError);
}

function generateSmartOfflineResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('tasa') || q.includes('bcv')) {
        return `📊 **Tasas Oficiales BCV SuperFormica:**\n- 🇪🇺 Euro BCV: Bs. ${window.appFormatBs(storeConfig.eurRate)}\n- 🇺🇸 Dólar BCV: Bs. ${window.appFormatBs(storeConfig.usdRate)}`;
    }
    if (q.includes('mdf')) {
        return `Tenemos láminas disponibles en stock inmediato:\n- [PRODUCTO: mdf15]\n- [PRODUCTO: mdf18]`;
    }
    return `¡Claro que sí, mi pana! En **SuperFormica** Plaza Venezuela tenemos todo para tu proyecto al mejor precio BCV. Escríbenos o agrega materiales al cotizador.`;
}

window.appAppendMessage = function(sender, text, isUser, extraHtml = '') {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.className = `flex w-full flex-col message-row ${isUser ? 'items-end' : 'items-start'} my-2`;

    const timeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

    let richCardsHtml = '';
    let cleanedText = text;
    const productMatches = text.match(/\[PRODUCTO:\s*([a-zA-Z0-9_-]+)\]/g);

    if (productMatches) {
        productMatches.forEach(match => {
            const idMatch = match.match(/\[PRODUCTO:\s*([a-zA-Z0-9_-]+)\]/);
            if (idMatch && idMatch[1]) {
                const prodId = idMatch[1];
                const product = activeCatalog.find(p => p.id === prodId || p.code === prodId);
                if (product) {
                    const activeRate = getActiveRate();
                    const priceBs = product.price * activeRate;
                    const waLink = `https://wa.me/${storeConfig.whatsappNumber}?text=` + encodeURIComponent(`Hola, me interesa el producto ${product.name} ($${product.price.toFixed(2)} / Bs. ${window.appFormatBs(priceBs)})`);

                    richCardsHtml += `
                        <div class="my-2 p-2.5 rounded-xl bg-wa-header border border-wa-border/80 flex items-center gap-3 shadow-sm">
                            <img src="${product.image || 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=300&auto=format&fit=crop&q=60'}" alt="${product.name}" class="w-14 h-14 object-cover rounded-lg shrink-0 bg-wa-bg" onerror="this.src='https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=300&auto=format&fit=crop&q=60'">
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-wa-textPrimary truncate">${product.name}</div>
                                <div class="text-[11px] text-wa-accent font-semibold">$${product.price.toFixed(2)} Ref. <span class="text-amber-300 font-normal">(Bs. ${window.appFormatBs(priceBs)})</span></div>
                                <div class="flex flex-wrap items-center gap-1.5 mt-2">
                                    <button type="button" onclick="window.appAddToCart('${product.id}')" class="px-2.5 py-1 rounded-lg bg-wa-accent/20 hover:bg-wa-accent text-wa-accent hover:text-white text-[10px] font-semibold transition cursor-pointer flex items-center gap-1">
                                        <i class="fa-solid fa-plus text-[9px]"></i> Cotizar
                                    </button>
                                    <button type="button" onclick="window.appSendQuickPrompt('¿Cómo calculo los cortes y despiece para ${product.name}?')" class="px-2.5 py-1 rounded-lg bg-wa-bg hover:bg-wa-hover border border-wa-border text-wa-textSecondary hover:text-white text-[10px] font-medium transition cursor-pointer flex items-center gap-1">
                                        <i class="fa-solid fa-ruler-combined text-[9px]"></i> Cortes
                                    </button>
                                    <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[10px] font-medium transition cursor-pointer flex items-center gap-1">
                                        <i class="fa-brands fa-whatsapp text-[10px]"></i> Pedir WA
                                    </a>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
            cleanedText = cleanedText.replace(match, '');
        });
    }

    let safe = cleanedText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safe = safe
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-wa-accent underline hover:text-emerald-300">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    const formattedHtml = safe.split('\n').map(line => line.trim().startsWith('-') ? `<ul><li>${line.substring(1).trim()}</li></ul>` : `<p>${line}</p>`).join('');

    if (isUser) {
        wrapper.innerHTML = `
            <div class="max-w-[85%] sm:max-w-[72%] bg-wa-outgoing text-wa-textPrimary px-3.5 py-2 rounded-2xl bubble-outgoing shadow-sm text-sm sm:text-[15px] leading-relaxed">
                <div class="msg-content break-words">${formattedHtml}</div>
                <div class="flex items-center justify-end gap-1 mt-1 -mb-0.5 select-none">
                    <span class="text-[10px] text-white/70">${timeStr}</span>
                    <i class="fa-solid fa-check-double text-[11px] text-wa-blueCheck"></i>
                </div>
            </div>
        `;
    } else {
        const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        voiceMessagesMap.set(msgId, text);
        const estSeconds = Math.max(2, Math.ceil(cleanedText.length / 15));

        wrapper.innerHTML = `
            <div class="max-w-[88%] sm:max-w-[75%] bg-wa-incoming text-wa-textPrimary px-3.5 py-2.5 rounded-2xl bubble-incoming shadow-sm text-sm sm:text-[15px] leading-relaxed border border-wa-border/40">
                <div class="flex items-center justify-between gap-3 mb-1.5">
                    <span class="text-[11px] font-semibold text-wa-accent">SuperFormica Asesor</span>
                </div>
                <div class="msg-content break-words">${formattedHtml}</div>
                ${richCardsHtml}${extraHtml || ''}
                <div class="flex items-center justify-between gap-2 mt-2 pt-1 select-none">
                    <button type="button" onclick="window.appPlayVoiceById('${msgId}')" class="flex items-center gap-2 bg-wa-bg/80 hover:bg-wa-hover border border-wa-border px-2.5 py-1 rounded-full text-[11px] text-wa-textSecondary hover:text-wa-accent transition cursor-pointer" title="Escuchar nota de voz">
                        <span class="w-6 h-6 rounded-full bg-wa-accent text-white flex items-center justify-center shrink-0">
                            <i id="icon_${msgId}" class="fa-solid fa-play text-xs translate-x-[1px]"></i>
                        </span>
                        <div id="wave_${msgId}" class="audio-wave">
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                        </div>
                        <span class="text-[10px] font-mono">0:${estSeconds < 10 ? '0' + estSeconds : estSeconds}</span>
                    </button>
                    <span class="text-[10px] text-wa-textSecondary shrink-0">${timeStr}</span>
                </div>
            </div>
        `;

        if (autoVoiceEnabled) {
            setTimeout(() => window.appPlayVoiceById(msgId), 250);
        }
    }

    container.appendChild(wrapper);
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
};

function setTypingState(typing) {
    isBotTyping = typing;
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        if (typing) indicator.classList.remove('hidden');
        else indicator.classList.add('hidden');
    }
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

window.appHandleInputKeydown = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.appSendMessage(); } };
window.appAutoResize = function(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px'; };

window.appExportWhatsApp = function() {
    const phone = storeConfig.whatsappNumber || "584246045675";
    let text = "Hola *SuperFormica* (Plaza Venezuela) 👋, vengo del Asistente Virtual:\n\n";
    const entries = Object.entries(cart);
    if (entries.length > 0) {
        let total = 0;
        entries.forEach(([id, qty]) => {
            const p = activeCatalog.find(item => item.id === id);
            if (p) {
                const sub = p.price * qty;
                total += sub;
                text += `• ${qty}x ${p.name} ($${sub.toFixed(2)})\n`;
            }
        });
        text += `\n*Total:* $${total.toFixed(2)} Ref.\n`;
    }
    text += "¿Me confirman disponibilidad?";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
};

window.appToggleSidebar = function() {
    document.getElementById('sidebarPanel').classList.toggle('-translate-x-full');
    document.getElementById('sidebarBackdrop').classList.toggle('hidden');
};

window.appOpenCartInSidebar = function() {
    window.appSwitchSidebarTab('cart');
    const sidebar = document.getElementById('sidebarPanel');
    if (sidebar && sidebar.classList.contains('-translate-x-full')) window.appToggleSidebar();
};

window.appSwitchSidebarTab = function(tab) {
    const btnShortcuts = document.getElementById('tabBtnShortcuts');
    const btnCart = document.getElementById('tabBtnCart');
    const tabShortcuts = document.getElementById('sidebarTabShortcuts');
    const tabCart = document.getElementById('sidebarTabCart');

    if (tab === 'shortcuts') {
        btnShortcuts.className = "py-3 text-wa-accent border-b-2 border-wa-accent flex items-center justify-center gap-2 transition cursor-pointer";
        btnCart.className = "py-3 text-wa-textSecondary hover:text-wa-textPrimary border-b-2 border-transparent flex items-center justify-center gap-2 transition relative cursor-pointer";
        tabShortcuts.classList.remove('hidden');
        tabCart.classList.add('hidden');
    } else {
        btnCart.className = "py-3 text-wa-accent border-b-2 border-wa-accent flex items-center justify-center gap-2 transition relative cursor-pointer";
        btnShortcuts.className = "py-3 text-wa-textSecondary hover:text-wa-textPrimary border-b-2 border-transparent flex items-center justify-center gap-2 transition cursor-pointer";
        tabCart.classList.remove('hidden');
        tabShortcuts.classList.add('hidden');
    }
};

window.appToggleSearchBar = function() { document.getElementById('chatSearchBar').classList.toggle('hidden'); };
window.appFilterMessages = function(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.message-row').forEach(row => {
        row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? 'flex' : 'none';
    });
};
window.appClearSearch = function() { document.getElementById('chatSearchInput').value = ''; window.appFilterMessages(''); window.appToggleSearchBar(); };

window.appToggleApiKeyVisibility = function() {
    const input = document.getElementById('cfgApiKey');
    const icon = document.getElementById('toggleApiKeyIcon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
};

window.appOpenSettingsModal = function() {
    populateVoiceList();
    document.getElementById('cfgBackendUrl').value = storeConfig.backendUrl || '';
    document.getElementById('cfgApiKey').value = storeConfig.apiKey || '';
    document.getElementById('cfgGeminiModel').value = storeConfig.geminiModel || 'gemini-3.5-flash-lite';
    document.getElementById('cfgEurRate').value = storeConfig.eurRate || 51.50;
    document.getElementById('cfgUsdRate').value = storeConfig.usdRate || 47.20;
    document.getElementById('cfgBaseCurrency').value = storeConfig.baseCurrency || 'EUR';
    const addrInput = document.getElementById('cfgAddress');
    const addrImgInput = document.getElementById('cfgAddressImageUrl');
    if (addrInput) addrInput.value = storeConfig.address || DEFAULT_CONFIG.address;
    if (addrImgInput) addrImgInput.value = storeConfig.addressImageUrl || '';
    document.getElementById('modalCatalogStats').textContent = `Catálogo activo: ${activeCatalog.length} productos.`;
    document.getElementById('settingsModal').classList.remove('hidden');
};

window.appCloseSettingsModal = function() { document.getElementById('settingsModal').classList.add('hidden'); };

window.appSaveSettings = async function() {
    storeConfig.backendUrl = document.getElementById('cfgBackendUrl').value.trim();
    storeConfig.apiKey = document.getElementById('cfgApiKey').value.trim();
    storeConfig.geminiModel = document.getElementById('cfgGeminiModel').value || 'gemini-3.5-flash-lite';
    storeConfig.eurRate = parseFloat(document.getElementById('cfgEurRate').value) || 51.50;
    storeConfig.usdRate = parseFloat(document.getElementById('cfgUsdRate').value) || 47.20;
    storeConfig.baseCurrency = document.getElementById('cfgBaseCurrency').value;
    storeConfig.voiceURI = document.getElementById('cfgVoiceSelect').value;
    const addrInput = document.getElementById('cfgAddress');
    const addrImgInput = document.getElementById('cfgAddressImageUrl');
    if (addrInput) storeConfig.address = addrInput.value.trim() || DEFAULT_CONFIG.address;
    if (addrImgInput) storeConfig.addressImageUrl = addrImgInput.value.trim();
    persistConfig();

    if (storeConfig.backendUrl) {
        try {
            await fetch(`${storeConfig.backendUrl}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(storeConfig)
            });
        } catch (e) {}
    }

    await syncWithBackendHybrid();
    window.appUpdateUIWithConfig();
    window.appCloseSettingsModal();
    window.appShowToast("Configuración guardada con éxito");
};

window.appResetConfig = function() {
    localStorage.removeItem('superformica_wa_config');
    storeConfig = { ...DEFAULT_CONFIG };
    window.appUpdateUIWithConfig();
    window.appOpenSettingsModal();
    window.appShowToast("Configuración restaurada");
};

window.appShowToast = function(msg) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastMessage').textContent = msg;
    toast.classList.remove('opacity-0');
    setTimeout(() => toast.classList.add('opacity-0'), 2800);
};
