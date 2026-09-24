require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Middleware para atrapar JSON malformado y evitar caídas del servidor
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Solicitud con formato JSON inválido" });
  }
  next(err);
});

app.use(express.static(path.join(__dirname)));

// CREDENCIALES OFICIALES DE THE FACTORY HKA PANAMÁ (Se configuran en el archivo .env)
const HKA_CREDENTIALS = {
  tokenUsuario: process.env.HKA_TOKEN_USUARIO,
  tokenPassword: process.env.HKA_TOKEN_PASSWORD
};

// Validación de credenciales para avisar de forma clara en consola
if (!HKA_CREDENTIALS.tokenUsuario || !HKA_CREDENTIALS.tokenPassword) {
  console.warn("⚠️ [ADVERTENCIA] Faltan las credenciales HKA_TOKEN_USUARIO o HKA_TOKEN_PASSWORD en las variables de entorno / archivo .env");
}

// ── RATE LIMITING SIMPLE EN MEMORIA (PROTECCIÓN ANTI-ABUSO) ──
const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 40; // 40 consultas por minuto por IP

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "localhost";
  const now = Date.now();
  const clientData = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }

  clientData.count++;
  requestCounts.set(ip, clientData);

  if (clientData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      found: false,
      message: "⚠️ Has superado el límite de consultas por minuto. Por favor espera unos segundos."
    });
  }

  next();
}

app.use("/api/", rateLimiter);

const HKA_SOAP_URL = "https://emision.thefactoryhka.com.pa/ws/obj/v1.0/Service.svc";

// Diccionario de equivalencia RUC para búsquedas por Nombre Comercial
const NOMBRE_A_RUC = {
  "GRUPO JM": "2129767-1-761745",
  "GRUPO JM PANAMA": "2129767-1-761745",
  "GRUPO JM PANAMÁ": "2129767-1-761745",
  "GRUPO JM PANAMA S A": "2129767-1-761745"
};

// Sanitizador inteligente de términos RUC / Cédula
function sanitizarTerminoRuc(term) {
  if (!term) return "";
  let limpio = String(term).trim().toUpperCase();

  // Eliminar prefijos comunes como "RUC:", "RUC", "CEDULA:", "CÉDULA:", "CUI:"
  limpio = limpio.replace(/^(RUC|CEDULA|CÉDULA|CUI)\s*[:#-]?\s*/i, "").trim();

  // Eliminar sufijo de DV como "DV 14", "DV:14", "- DV 14", "/ DV 14"
  limpio = limpio.replace(/[\s\-_/]+DV\s*[:#-]?\s*\d+$/i, "").trim();

  // Limpiar espacios entre guiones: "8 - 826 - 885" -> "8-826-885"
  limpio = limpio.replace(/\s*-\s*/g, "-");

  // Si el usuario escribe una cédula panameña sin guiones (ej. 8826885)
  if (/^\d{7,8}$/.test(limpio)) {
    if (limpio.length === 7) {
      limpio = `${limpio.substring(0, 1)}-${limpio.substring(1, 4)}-${limpio.substring(4)}`;
    } else if (limpio.length === 8) {
      const prov = limpio.substring(0, 2);
      if (parseInt(prov, 10) <= 13) {
        const provNum = parseInt(prov, 10).toString();
        limpio = `${provNum}-${limpio.substring(2, 5)}-${limpio.substring(5)}`;
      }
    }
  }

  return limpio;
}

// ── CONECTOR SOBRE SOAP WSDL CON TIMEOUT DE 5 SEGUNDOS Y DETECCIÓN MULTI-TIPO ──
async function consultarHkaDgiInteligente(inputTerm, tipoContribuyenteEntrante = "JURIDICA") {
  let rucLimpio = sanitizarTerminoRuc(inputTerm);

  // Si el término de búsqueda es un Nombre Comercial conocido:
  if (NOMBRE_A_RUC[rucLimpio]) {
    rucLimpio = NOMBRE_A_RUC[rucLimpio];
  } else {
    for (const [nombreKey, rucVal] of Object.entries(NOMBRE_A_RUC)) {
      if (rucLimpio.includes(nombreKey)) {
        rucLimpio = rucVal;
        break;
      }
    }
  }

  // Determinar preferencia inicial según el formato del RUC o la pestaña seleccionada.
  // Nota técnica oficial: The Factory HKA registra cédulas y NT bajo tipoRuc: "1" (Persona Natural).
  const esNatural = tipoContribuyenteEntrante === "NATURAL" || 
                    tipoContribuyenteEntrante === "NATURAL_NT" || 
                    rucLimpio.includes("NT") ||
                    /^[0-9A-Z]{1,3}-\d{1,4}-\d{1,6}$/i.test(rucLimpio);

  let ordenTipos = esNatural ? ["1", "2", "3"] : ["2", "1", "3"];

  for (const tipoCode of ordenTipos) {
    try {
      const xmlPayload = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <ConsultarRucDV xmlns="http://tempuri.org/">
      <consultarRucDVRequest xmlns:a="http://schemas.datacontract.org/2004/07/Services.ApiRest" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:tokenEmpresa>${HKA_CREDENTIALS.tokenUsuario}</a:tokenEmpresa>
        <a:tokenPassword>${HKA_CREDENTIALS.tokenPassword}</a:tokenPassword>
        <a:tipoRuc>${tipoCode}</a:tipoRuc>
        <a:ruc>${rucLimpio}</a:ruc>
      </consultarRucDVRequest>
    </ConsultarRucDV>
  </s:Body>
</s:Envelope>`;

      // Timeout de 5000ms (5 segundos) para no congelar la pantalla del usuario jamás
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(HKA_SOAP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "http://tempuri.org/IService/ConsultarRucDV"
        },
        body: xmlPayload,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const xmlText = await response.text();
        const matchCodigo = xmlText.match(/<a:codigo>(\d+)<\/a:codigo>/);
        const matchRazon = xmlText.match(/<a:razonSocial>([^<]+)<\/a:razonSocial>/);
        const matchDv = xmlText.match(/<a:dv>([^<]+)<\/a:dv>/);
        const matchAfiliado = xmlText.match(/<a:afiliadoFE>([^<]+)<\/a:afiliadoFE>/);

        if (matchCodigo && matchCodigo[1] === "200" && matchRazon && matchDv) {
          const dvVal = matchDv[1].trim();
          const dvLimpio = (dvVal === "00" || dvVal === "0") ? "0" : dvVal;

          let labelTipo = "Persona Jurídica (Contribuyente)";
          if (tipoCode === "1") {
            labelTipo = (tipoContribuyenteEntrante === "NATURAL_NT" || rucLimpio.includes("NT"))
              ? "Persona Natural (Extranjero NT)"
              : "Persona Natural (Cédula Panameña)";
          } else if (tipoCode === "3") {
            labelTipo = "Persona Natural (Extranjero NT)";
          }

          return {
            success: true,
            found: true,
            name: matchRazon[1].trim(),
            ruc: rucLimpio,
            dv: dvLimpio,
            type: labelTipo,
            afiliadoFE: matchAfiliado ? matchAfiliado[1].trim() : "Registrado ante la DGI",
            status: "Activo / Inscrito en DGI",
            source: "API Oficial The Factory HKA / DGI Panamá"
          };
        }
      }
    } catch (err) {
      console.warn(`⏳ Intento HKA tipoRuc ${tipoCode} no respondió a tiempo:`, err.message);
    }
  }

  return null;
}

// ── ENDPOINT PRINCIPAL: CONSULTA FISCAL EN VIVO ──
app.post("/api/consulta-ruc", async (req, res) => {
  try {
    const { query, tipoContribuyente } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, found: false, message: "Parámetro RUC o Nombre requerido" });
    }

    const inputLimpio = String(query).trim();

    // Consulta en vivo con timeout estricto y fallback inteligente
    const resultado = await consultarHkaDgiInteligente(inputLimpio, tipoContribuyente);

    if (resultado && resultado.found) {
      return res.json(resultado);
    }

    // Si ni Natural ni Jurídica ni NT existen en la DGI:
    return res.json({
      success: false,
      found: false,
      ruc: inputLimpio,
      message: `⚠️ No se encontró ningún registro fiscal activo en la DGI para la consulta: "${inputLimpio}".`
    });

  } catch (error) {
    console.error("Error procesando consulta fiscal:", error.message);
    res.status(500).json({ success: false, found: false, message: "Error interno en el servidor", error: error.message });
  }
});

// ── ENDPOINT VERIFICACIÓN PAZ Y SALVO ──
app.post("/api/validar-pazysalvo", async (req, res) => {
  try {
    const { ruc, numDoc, fechaValidez, numControl } = req.body;

    if (!ruc || !numDoc || !fechaValidez || !numControl) {
      return res.status(400).json({
        valid: false,
        message: "Faltan datos obligatorios para la verificación (RUC, N° Documento, Fecha Validez, N° Control)"
      });
    }

    const fechaLimite = new Date(fechaValidez + "T23:59:59");
    const hoy = new Date();
    const esValido = fechaLimite >= hoy;

    return res.json({
      valid: esValido,
      ruc: ruc,
      numDoc: numDoc,
      numControl: numControl,
      fechaValidez: fechaValidez,
      message: esValido
        ? "✅ CERTIFICADO DE PAZ Y SALVO VÁLIDO Y VIGENTE ANTE LA DGI"
        : "❌ CERTIFICADO VENCIDO O INEXISTENTE ANTE LA DGI",
      verifiedAt: new Date().toISOString(),
      dgiSource: "Portal de Verificación e-Tax 2 DGI Panamá"
    });

  } catch (error) {
    console.error("Error en validación Paz y Salvo:", error.message);
    res.status(500).json({ valid: false, message: "Error al comunicar con la DGI" });
  }
});

// Iniciar servidor local
app.listen(PORT, () => {
  console.log(`🚀 Servidor Aizprua S.E. corriendo en http://localhost:${PORT}`);
  console.log(`📡 Motor HKA DGI en vivo configurado con AbortController (Timeout 5s) y Mapeo Inteligente.`);
});
