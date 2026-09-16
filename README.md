# Validador de RUC & DV Panamá (Aizprua S.E. Web App)

Aplicación web interactiva, responsiva y de alta velocidad para la consulta y validación instantánea de RUC (Registro Único de Contribuyente) y Dígito Verificador (DV) en Panamá ante la DGI y The Factory HKA.

---

## 🎨 Identidad Corporativa (Aizprua S.E.)

- **Azul Primario Corporativo**: `#3849C8`
- **Naranja de Acento / CTA**: `#FF8A1E`
- **Tipografía**: Google Fonts `Inter`
- **Estética**: Glassmorphism, autocompletado en vivo, badges de verificación DGI, Smart Paste e historial con eliminación.

---

## 🚀 Despliegue en Coolify / Docker

1. Conecta este repositorio en tu panel de **Coolify**.
2. En la sección **Environment Variables**, agrega:
   ```env
   HKA_TOKEN_USUARIO=tu_token_de_usuario
   HKA_TOKEN_PASSWORD=tu_password_de_token
   PORT=3000
   ```
3. Haz clic en **Deploy**. Coolify utilizará automáticamente el `Dockerfile` optimizado.

---

## 💻 Ejecución Local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear archivo `.env` basado en `.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Iniciar el servidor:
   ```bash
   npm start
   ```
4. Abrir en el navegador: `http://localhost:3000`

---

## 📁 Estructura del Proyecto

```text
├── index.html        # Estructura principal y formulario DGI
├── index.css         # Sistema de diseño CSS Vanilla y responsive
├── script.js         # Lógica frontend, Smart Paste, validaciones e historial
├── server.js         # Backend Express, conexión SOAP HKA DGI y rate-limit
├── assets/           # Logotipos vectoriales SVG de Aizprua S.E.
├── Dockerfile        # Configuración de contenedor para producción (Coolify)
├── .env.example      # Plantilla de variables de entorno (sin credenciales)
├── .gitignore        # Exclusión de credenciales y dependencias
└── README.md         # Documentación de uso
```
