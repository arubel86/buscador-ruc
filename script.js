/**
 * ==============================================================================
 * AIZPRUA S.E. - VALIDADOR DE RUC & DV PANAMÁ (MOTOR DE BÚSQUEDA EN VIVO ESTRICTO)
 * ==============================================================================
 */

// ── UTILIDAD DE SANITIZACIÓN (XSS PROTECTION) ───────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── ESTADO GLOBAL Y ELEMENTOS DOM ──────────────────────────
const API_BASE = (window.location.protocol === "file:" || (window.location.port !== "3000" && window.location.port !== ""))
  ? "http://localhost:3000"
  : "";

let currentResult = null;
let tipoContribuyenteActual = "JURIDICA";
let isSearching = false;

// ── INICIALIZACIÓN Y MANEJO DEL FORMULARIO DGI ─────────────
document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") lucide.createIcons();
  cargashistorialReciente();
  configurarPegadoInteligente();
  actualizarRucConstruido();

  // Escuchar tecla Enter en cualquiera de los campos del formulario DGI
  const inputs = document.querySelectorAll(".form-control, .form-select");
  inputs.forEach(input => {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        ejecutarBusquedaDesglosadaDgi();
      }
    });
  });

  // Cerrar modal con tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarModalPazYSalvo();
    }
  });
});

// Detector y distribuidor inteligente de pegado (Smart Paste)
function configurarPegadoInteligente() {
  const inputs = [
    document.getElementById("juridicaTomo"),
    document.getElementById("juridicaFolio"),
    document.getElementById("juridicaAsiento"),
    document.getElementById("naturalFolio"),
    document.getElementById("naturalAsiento"),
    document.getElementById("naturalNtRuc")
  ];

  inputs.forEach(inp => {
    if (!inp) return;
    inp.addEventListener("paste", (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData("text") || "";
      if (pasted.includes("-") || pasted.includes("NT") || pasted.trim().length >= 7) {
        e.preventDefault();
        sincronizarFormularioConRuc(pasted);
      }
    });
  });
}

// Sincroniza las casillas del formulario a partir de cualquier cadena RUC
function sincronizarFormularioConRuc(rucRaw) {
  if (!rucRaw) return;
  let limpio = String(rucRaw).trim().toUpperCase();
  limpio = limpio.replace(/^(RUC|CEDULA|CÉDULA|CUI)\s*[:#-]?\s*/i, "").trim();
  limpio = limpio.replace(/[\s\-_/]+DV\s*[:#-]?\s*\d+$/i, "").trim();
  limpio = limpio.replace(/\s*-\s*/g, "-");

  const tipoSelect = document.getElementById("dgiTipoSelect");

  if (limpio.includes("NT")) {
    if (tipoSelect) tipoSelect.value = "NATURAL_NT";
    tipoContribuyenteActual = "NATURAL_NT";
    const ntInp = document.getElementById("naturalNtRuc");
    if (ntInp) ntInp.value = limpio;
  } else if (/^[0-9A-Z]{1,3}-\d+-\d+$/i.test(limpio)) {
    const parts = limpio.split("-");
    const provVal = parts[0].toUpperCase();
    const provSelect = document.getElementById("naturalProvincia");
    const hasOption = Array.from(provSelect?.options || []).some(o => o.value.toUpperCase() === provVal);

    if (hasOption || parseInt(provVal, 10) <= 13) {
      if (tipoSelect) tipoSelect.value = "NATURAL";
      tipoContribuyenteActual = "NATURAL";
      if (provSelect) provSelect.value = provVal;
      const fInp = document.getElementById("naturalFolio");
      const aInp = document.getElementById("naturalAsiento");
      if (fInp) fInp.value = parts[1] || "";
      if (aInp) aInp.value = parts[2] || "";
    } else {
      // Formato Jurídico Tomo-Folio-Asiento
      if (tipoSelect) tipoSelect.value = "JURIDICA";
      tipoContribuyenteActual = "JURIDICA";
      const tInp = document.getElementById("juridicaTomo");
      const fInp = document.getElementById("juridicaFolio");
      const aInp = document.getElementById("juridicaAsiento");
      if (tInp) tInp.value = parts[0] || "";
      if (fInp) fInp.value = parts[1] || "";
      if (aInp) aInp.value = parts[2] || "";
    }
  } else if (/^\d+-\d+-\d+$/.test(limpio)) {
    const parts = limpio.split("-");
    if (tipoSelect) tipoSelect.value = "JURIDICA";
    tipoContribuyenteActual = "JURIDICA";
    const tInp = document.getElementById("juridicaTomo");
    const fInp = document.getElementById("juridicaFolio");
    const aInp = document.getElementById("juridicaAsiento");
    if (tInp) tInp.value = parts[0] || "";
    if (fInp) fInp.value = parts[1] || "";
    if (aInp) aInp.value = parts[2] || "";
  } else {
    // Si no tiene guiones pero está en Jurídica o NT
    if (tipoContribuyenteActual === "NATURAL_NT") {
      const ntInp = document.getElementById("naturalNtRuc");
      if (ntInp) ntInp.value = limpio;
    } else {
      const tInp = document.getElementById("juridicaTomo");
      if (tInp) tInp.value = limpio;
    }
  }

  onDgiTipoChange();
}

/* ── SELECTOR DESPLEGABLE PERSONALIZADO (CUSTOM SELECT) ───── */
function toggleCustomSelect(e) {
  if (e) e.stopPropagation();
  const wrapper = document.getElementById("customTipoWrapper");
  if (!wrapper) return;
  wrapper.classList.toggle("open");
  const trigger = document.getElementById("customTipoTrigger");
  if (trigger) {
    trigger.setAttribute("aria-expanded", wrapper.classList.contains("open") ? "true" : "false");
  }
}

function closeCustomSelect() {
  const wrapper = document.getElementById("customTipoWrapper");
  if (wrapper) {
    wrapper.classList.remove("open");
    const trigger = document.getElementById("customTipoTrigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }
}

function selectCustomOption(val) {
  const tipoSelect = document.getElementById("dgiTipoSelect");
  if (tipoSelect) {
    tipoSelect.value = val;
  }
  actualizarCustomSelectUI(val);
  onDgiTipoChange();
  closeCustomSelect();
}

function actualizarCustomSelectUI(val) {
  const labelEl = document.getElementById("customTipoLabel");
  const iconEl = document.getElementById("customTipoIcon");
  const options = document.querySelectorAll("#customTipoOptions .custom-option");

  const config = {
    JURIDICA: {
      label: "JURÍDICA (Persona Jurídica / Empresa)",
      icon: "building-2"
    },
    NATURAL: {
      label: "NATURAL (Persona Natural / CÉDULA)",
      icon: "user"
    },
    NATURAL_NT: {
      label: "NATURAL NT (Persona Natural Extranjero NT)",
      icon: "globe"
    }
  };

  const selectedData = config[val] || config["JURIDICA"];
  if (labelEl) labelEl.textContent = selectedData.label;
  if (iconEl) {
    iconEl.setAttribute("data-lucide", selectedData.icon);
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  options.forEach(opt => {
    if (opt.getAttribute("data-value") === val) {
      opt.classList.add("selected");
    } else {
      opt.classList.remove("selected");
    }
  });
}

// Cerrar selector al hacer clic fuera
document.addEventListener("click", (e) => {
  const wrapper = document.getElementById("customTipoWrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    closeCustomSelect();
  }
});

function onDgiTipoChange() {
  const tipoSelect = document.getElementById("dgiTipoSelect");
  if (!tipoSelect) return;

  const tipo = tipoSelect.value;
  tipoContribuyenteActual = tipo;

  actualizarCustomSelectUI(tipo);

  const groupJuridica = document.getElementById("groupJuridica");
  const groupNatural = document.getElementById("groupNatural");
  const groupNaturalNt = document.getElementById("groupNaturalNt");

  if (groupJuridica) groupJuridica.style.display = tipo === "JURIDICA" ? "flex" : "none";
  if (groupNatural) groupNatural.style.display = tipo === "NATURAL" ? "flex" : "none";
  if (groupNaturalNt) groupNaturalNt.style.display = tipo === "NATURAL_NT" ? "flex" : "none";

  actualizarRucConstruido();
}

function actualizarRucConstruido() {
  const tipoSelect = document.getElementById("dgiTipoSelect");
  const preview = document.getElementById("constructedRucValue");
  if (!tipoSelect || !preview) return;

  const tipo = tipoSelect.value;
  let rucConstruido = "";

  if (tipo === "JURIDICA") {
    const tomo = (document.getElementById("juridicaTomo")?.value || "").trim();
    const folio = (document.getElementById("juridicaFolio")?.value || "").trim();
    const asiento = (document.getElementById("juridicaAsiento")?.value || "").trim();
    rucConstruido = tomo && folio && asiento ? `${tomo}-${folio}-${asiento}` : (tomo || folio || asiento || "");
  } else if (tipo === "NATURAL") {
    const prov = document.getElementById("naturalProvincia")?.value || "8";
    const folio = (document.getElementById("naturalFolio")?.value || "").trim();
    const asiento = (document.getElementById("naturalAsiento")?.value || "").trim();
    rucConstruido = folio && asiento ? `${prov}-${folio}-${asiento}` : (folio || asiento ? `${prov}-${folio}-${asiento}` : "");
  } else if (tipo === "NATURAL_NT") {
    rucConstruido = (document.getElementById("naturalNtRuc")?.value || "").trim();
  }

  preview.textContent = rucConstruido || "Completa los campos (*)";
}

function ejecutarBusquedaDesglosadaDgi() {
  if (isSearching) return;
  actualizarRucConstruido();
  const preview = document.getElementById("constructedRucValue");
  const ruc = preview ? preview.textContent : "";
  if (ruc && !ruc.includes("Completa")) {
    ejecutarBusqueda(ruc);
  } else {
    mostrarToast("⚠️ Por favor completa los campos del formulario DGI.");
  }
}

function buscarRapido(termino) {
  if (isSearching) return;
  sincronizarFormularioConRuc(termino);
  ejecutarBusqueda(termino);
}

// ── LÓGICA DE BÚSQUEDA EN VIVO DIRECTA ─────────────────────
async function ejecutarBusqueda(queryText) {
  const q = String(queryText || "").trim();
  const resultContainer = document.getElementById("resultContainer");
  const searchBtn = document.querySelector(".btn-search-dgi");

  if (!q || q.includes("Completa")) {
    mostrarToast("⚠️ Por favor ingresa un RUC, Cédula o Nombre.");
    return;
  }

  isSearching = true;
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.style.opacity = "0.7";
    searchBtn.style.cursor = "not-allowed";
  }

  const labelTipo = tipoContribuyenteActual === "JURIDICA" 
    ? "Persona Jurídica" 
    : (tipoContribuyenteActual === "NATURAL" ? "Persona Natural (Cédula)" : "Persona Natural");

  // Animación de Carga Dinámica Multi-Paso Premium
  if (resultContainer) {
    resultContainer.innerHTML = `
      <div class="loading-container-dynamic">
        <div class="dynamic-spinner-wrapper">
          <div class="spinner-ring-outer"></div>
          <div class="spinner-ring-inner"></div>
          <div class="spinner-center-glow"></div>
        </div>
        <h3 id="loadingStepTitle" class="loading-step-title">Conectando con los servidores del e-Tax 2.0 DGI Panamá...</h3>
        <p id="loadingStepSubtitle" class="loading-step-subtitle" style="margin-bottom:0;">Verificando RUC o Cédula (${escapeHtml(labelTipo)}) en vivo...</p>
      </div>
    `;
    resultContainer.style.display = "block";
    resultContainer.classList.add("active");
    resultContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const startTime = Date.now();

  const titleEl = document.getElementById("loadingStepTitle");
  const subEl = document.getElementById("loadingStepSubtitle");

  const stepTimer1 = setTimeout(() => {
    if (titleEl) titleEl.textContent = `Consultando registro oficial de ${labelTipo}...`;
    if (subEl) subEl.textContent = `Buscando coincidencias de RUC y Folio ante el MEF...`;
  }, 400);

  const stepTimer2 = setTimeout(() => {
    if (titleEl) titleEl.textContent = `Verificando Dígito Verificador (DV) y Razón Social...`;
    if (subEl) subEl.textContent = `Calculando algoritmo de validación fiscal...`;
  }, 850);

  const resetSearchBtn = () => {
    isSearching = false;
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.style.opacity = "1";
      searchBtn.style.cursor = "pointer";
    }
  };

  try {
    const res = await fetch(`${API_BASE}/api/consulta-ruc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        query: q, 
        tipoContribuyente: tipoContribuyenteActual 
      })
    });

    let data = null;
    if (res.ok) {
      data = await res.json();
    }

    const elapsedTime = Date.now() - startTime;
    const minDelay = Math.max(0, 800 - elapsedTime);

    setTimeout(() => {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      resetSearchBtn();

      if (data && data.success && data.found) {
        mostrarResultado(data);
        guardarEnHistorial(data);
      } else if (data) {
        mostrarErrorNoEncontrado(q, data.message);
      } else {
        mostrarErrorNoEncontrado(q, "No se pudo establecer conexión con el servidor backend. Asegúrate de que el servidor esté activo con 'npm start' en http://localhost:3000.");
      }
    }, minDelay);

  } catch (err) {
    console.error("Error conectando con el servidor backend:", err.message);
    clearTimeout(stepTimer1);
    clearTimeout(stepTimer2);
    resetSearchBtn();
    mostrarErrorNoEncontrado(q, "No se pudo conectar con el servidor local de Aizprua S.E. Verifica que el backend esté corriendo en http://localhost:3000.");
  }
}

// ── DESPLIEGUE DE RESULTADO REAL ENCONTRADO ────────────────
function mostrarResultado(data) {
  currentResult = data;
  const resultContainer = document.getElementById("resultContainer");
  if (!resultContainer) return;

  const safeName = escapeHtml(data.name);
  const safeRuc = escapeHtml(data.ruc);
  const dvDisplay = (data.dv !== undefined && data.dv !== null && data.dv !== "") ? escapeHtml(String(data.dv)) : "0";
  const rucFull = `${safeRuc} DV ${dvDisplay}`;
  const safeType = escapeHtml(data.type || "Persona Jurídica (Contribuyente)");
  const safeStatus = escapeHtml(data.status || "Activo / Inscrito en DGI");

  resultContainer.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div class="result-header-content">
          <div class="verified-badge">
            <i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i> Verificado ante la DGI
          </div>
          <h2 class="result-name">${safeName}</h2>
          <div class="result-ruc-subtitle">RUC: ${safeRuc} | DV: ${dvDisplay}</div>
        </div>

        <div class="dv-banner">
          <div class="dv-label">Dígito Verificador</div>
          <div class="dv-value">${dvDisplay}</div>
        </div>
      </div>

      <div class="result-body">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">RUC (Número Fiscal)</div>
            <div class="info-val">${safeRuc}</div>
          </div>
          <div class="info-item">
            <div class="info-label">RUC con DV</div>
            <div class="info-val">${rucFull}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Tipo de Contribuyente</div>
            <div class="info-val">${safeType}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Estado RUC en DGI</div>
            <div class="info-val" style="color: var(--success);">${safeStatus}</div>
          </div>
        </div>

        <div class="action-buttons">
          <button class="btn-action btn-copy-full" onclick="copiarRucCompleto()">
            <i data-lucide="copy"></i> Copiar RUC con DV
          </button>
          <button class="btn-action btn-copy-dv" onclick="copiarDv()">
            <i data-lucide="hash"></i> Copiar Sólo DV
          </button>
          <button class="btn-action" onclick="abrirModalPazYSalvo()" style="background: #eef2ff; color: #3849C8; border: 1px solid rgba(56, 73, 200, 0.3);">
            <i data-lucide="shield-check"></i> Verificar Certificado de Paz y Salvo
          </button>
        </div>
      </div>
    </div>
  `;

  resultContainer.style.display = "block";
  resultContainer.classList.add("active");
  resultContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// ── DESPLIEGUE DE ADVERTENCIA RUC NO ENCONTRADO ────────────
function mostrarErrorNoEncontrado(query, mensajeOriginal) {
  currentResult = null;
  const resultContainer = document.getElementById("resultContainer");
  if (!resultContainer) return;

  const safeQuery = escapeHtml(query);
  const safeMsg = mensajeOriginal ? escapeHtml(mensajeOriginal) : `No existe un registro fiscal activo o verificado en la DGI para la consulta: <strong>"${safeQuery}"</strong>.`;

  resultContainer.innerHTML = `
    <div style="background: #FFF5F5; border: 1.5px solid #FEB2B2; padding: 24px; border-radius: 16px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
      <div style="width: 48px; height: 48px; background: #FED7D7; color: #C53030; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
      <h3 style="color: #9B2C2C; font-size: 1.2rem; margin-bottom: 8px; font-weight: 700;">Contribuyente no Encontrado en la DGI</h3>
      <p style="color: #742A2A; font-size: 0.95rem; max-width: 500px; margin: 0 auto 16px auto; line-height: 1.5;">
        ${safeMsg}
      </p>
      <div style="font-size: 0.85rem; color: #9B2C2C; background: #FFF; padding: 10px 16px; border-radius: 8px; display: inline-block; border: 1px solid #FEB2B2;">
        💡 Verifica que el RUC o Cédula esté escrito correctamente (ej: 8-825-886 o 1556843-2-543210).
      </div>
    </div>
  `;
  resultContainer.style.display = "block";
  resultContainer.classList.add("active");
}

// ── VERIFICACIÓN DE PAZ Y SALVO ────────────────────────────
function abrirModalPazYSalvo() {
  const modal = document.getElementById("pazYSalvoModal");
  if (!modal) return;

  const modalRuc = document.getElementById("modalRuc");
  if (modalRuc) {
    modalRuc.value = currentResult ? (currentResult.ruc || "") : "";
  }

  const hoy = new Date();
  const fechaStr = hoy.toISOString().split("T")[0];
  const modalFecha = document.getElementById("modalFecha");
  if (modalFecha && !modalFecha.value) {
    modalFecha.value = fechaStr;
  }

  const resVal = document.getElementById("pazYSalvoResult");
  if (resVal) resVal.style.display = "none";

  modal.classList.add("active");
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function cerrarModalPazYSalvo() {
  const modal = document.getElementById("pazYSalvoModal");
  if (modal) modal.classList.remove("active");
}

async function validarCertificadoPazYSalvo(event) {
  if (event && event.preventDefault) event.preventDefault();

  const ruc = (document.getElementById("modalRuc")?.value || "").trim();
  const numDoc = (document.getElementById("modalNumDoc")?.value || "").trim();
  const fechaValidez = document.getElementById("modalFecha")?.value;
  const numControl = (document.getElementById("modalNumControl")?.value || "").trim();
  const btnSubmit = document.getElementById("btnSubmitCert");

  if (!ruc || !numDoc || !fechaValidez || !numControl) {
    mostrarToast("⚠️ Por favor completa los 4 campos del certificado.");
    return;
  }

  const resVal = document.getElementById("pazYSalvoResult");
  if (resVal) {
    resVal.innerHTML = `<div style="text-align:center; padding:15px; color:#3849C8;">⏳ Validando datos ante la DGI...</div>`;
    resVal.className = "cert-result-card";
    resVal.style.display = "block";
  }

  if (btnSubmit) btnSubmit.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/validar-pazysalvo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruc, numDoc, fechaValidez, numControl })
    });

    if (btnSubmit) btnSubmit.disabled = false;

    if (res.ok && resVal) {
      const data = await res.json();
      if (data.valid) {
        resVal.className = "cert-result-card cert-valid";
        resVal.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:1rem; margin-bottom:6px;">
            <span>✅</span> ${escapeHtml(data.message)}
          </div>
          <div style="font-size:0.85rem;">
            Documento N°: <strong>${escapeHtml(data.numDoc)}</strong> | Control: <strong>${escapeHtml(data.numControl)}</strong><br>
            Validez confirmada hasta: <strong>${escapeHtml(data.fechaValidez)}</strong>
          </div>
        `;
      } else {
        resVal.className = "cert-result-card cert-invalid";
        resVal.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:1rem; margin-bottom:6px;">
            <span>❌</span> ${escapeHtml(data.message)}
          </div>
          <div style="font-size:0.85rem;">
            No se pudo confirmar la vigencia del certificado para el RUC ${escapeHtml(ruc)}.
          </div>
        `;
      }
      return;
    }
  } catch (err) {
    console.error("Error al validar Paz y Salvo:", err);
    if (btnSubmit) btnSubmit.disabled = false;
  }

  if (resVal) {
    resVal.className = "cert-result-card cert-invalid";
    resVal.innerHTML = `
      <div>❌ Error al comunicar con el servidor de validación. Por favor intenta nuevamente.</div>
    `;
  }
}

// ── ACCIONES DE COPIADO AL PORTAPAPELES ────────────────────
function copiarRucCompleto() {
  if (!currentResult) return;
  const dv = currentResult.dv !== undefined ? currentResult.dv : "0";
  const texto = `${currentResult.ruc} DV ${dv}`;
  navigator.clipboard.writeText(texto).then(() => {
    mostrarToast(`📋 Copiado al portapapeles: ${texto}`);
  }).catch(() => {
    mostrarToast(`📋 Copiado: ${texto}`);
  });
}

function copiarDv() {
  if (!currentResult) return;
  const dv = String(currentResult.dv !== undefined ? currentResult.dv : "0");
  navigator.clipboard.writeText(dv).then(() => {
    mostrarToast(`📋 Dígito Verificador copiado: DV ${dv}`);
  }).catch(() => {
    mostrarToast(`📋 Dígito Verificador: DV ${dv}`);
  });
}

// ── TOAST NOTIFICATIONS Y HISTORIAL ────────────────────────
function mostrarToast(mensaje) {
  let toast = document.getElementById("toastNotification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toastNotification";
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: #1e293b; color: #fff; padding: 12px 24px;
      border-radius: 8px; font-size: 14px; font-weight: 500;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2); transition: all 0.3s ease;
      transform: translateY(100px); opacity: 0;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.style.transform = "translateY(0)";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.transform = "translateY(100px)";
    toast.style.opacity = "0";
  }, 3500);
}

function guardarEnHistorial(item) {
  if (!item || !item.ruc) return;
  let historial = JSON.parse(localStorage.getItem("aizprua_ruc_history") || "[]");
  historial = historial.filter(h => h.ruc !== item.ruc);
  historial.unshift({
    name: item.name,
    ruc: item.ruc,
    dv: item.dv,
    date: new Date().toLocaleDateString("es-PA")
  });
  if (historial.length > 5) historial.pop();
  localStorage.setItem("aizprua_ruc_history", JSON.stringify(historial));
  cargashistorialReciente();
}

function eliminarDelHistorial(rucTarget) {
  if (!rucTarget) return;
  let historial = JSON.parse(localStorage.getItem("aizprua_ruc_history") || "[]");
  historial = historial.filter(h => h.ruc !== rucTarget);
  localStorage.setItem("aizprua_ruc_history", JSON.stringify(historial));
  cargashistorialReciente();
  mostrarToast("🗑️ Consulta eliminada del historial.");
}

function limpiarHistorialCompleto() {
  localStorage.removeItem("aizprua_ruc_history");
  cargashistorialReciente();
  mostrarToast("🗑️ Historial de consultas borrado.");
}

function cargashistorialReciente() {
  const container = document.getElementById("recentList") || document.getElementById("historyList");
  const btnClear = document.getElementById("btnClearAllRecent");
  if (!container) return;

  const historial = JSON.parse(localStorage.getItem("aizprua_ruc_history") || "[]");
  if (historial.length === 0) {
    if (btnClear) btnClear.style.display = "none";
    container.innerHTML = `<div style="color: #94a3b8; font-size: 0.9rem; text-align: center; padding: 16px; background: white; border-radius: 12px; border: 1px dashed var(--gray-200);">Aún no tienes consultas recientes. Realiza una búsqueda arriba para ver tu historial aquí.</div>`;
    return;
  }

  if (btnClear) btnClear.style.display = "inline-flex";

  container.innerHTML = historial.map(h => {
    const safeName = escapeHtml(h.name);
    const safeRuc = escapeHtml(h.ruc);
    const safeDv = escapeHtml(String(h.dv !== undefined ? h.dv : "0"));
    return `
      <div class="recent-item" onclick="buscarRapido('${safeRuc}')" title="Clic para consultar nuevamente">
        <div style="flex: 1; min-width: 0; padding-right: 12px;">
          <div style="font-weight: 700; color: var(--gray-900); font-size: 0.95rem; word-break: break-word; line-height: 1.35;">${safeName}</div>
          <div style="font-size: 0.85rem; color: var(--brand-blue); font-weight: 600; margin-top: 3px;">RUC: ${safeRuc}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <span class="recent-dv-badge">DV ${safeDv}</span>
          <button class="btn-delete-recent" onclick="event.stopPropagation(); eliminarDelHistorial('${safeRuc}')" title="Eliminar de consultas recientes">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

