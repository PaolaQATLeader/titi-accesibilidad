// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const AppState = {
    vocesDisponibles: [],
    utteranceActual: null,
    keepAliveTimer: null,
    pdfWorkerCargado: false
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    configurarPDFJS();
    inicializarVoces();
    configurarEventListeners();
});

function configurarPDFJS() {
    // Es buena práctica usar el worker de PDF.js para no bloquear la UI
    if (typeof window['pdfjs-dist/build/pdf'] !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        AppState.pdfWorkerCargado = true;
    } else {
        console.warn("PDF.js no se cargó correctamente.");
    }
}

function inicializarVoces() {
    const cargarVoces = () => {
        AppState.vocesDisponibles = window.speechSynthesis.getVoices();
        const select = document.getElementById('selectVoces');
        
        if (AppState.vocesDisponibles.length > 0) {
            select.innerHTML = ''; // Limpiar select
            AppState.vocesDisponibles.forEach((voz, index) => {
                const option = document.createElement('option');
                option.value = index;
                // Mostrar nombre y si es la voz por defecto
                option.textContent = `${voz.name} (${voz.lang})${voz.default ? ' [Default]' : ''}`;
                select.appendChild(option);
            });
        }
    };

    // Google Chrome carga las voces de forma asíncrona
    cargarVoces();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = cargarVoces;
    }
}

// ==========================================
// GESTIÓN DE EVENTOS (LISTENERS)
// ==========================================
function configurarEventListeners() {
    // Controles de Lectura
    document.getElementById('btnPlay').addEventListener('click', manejarPlayReanudar);
    document.getElementById('btnPause').addEventListener('click', manejarPausa);
    document.getElementById('btnStop').addEventListener('click', manejarStop);

    // Archivos
    document.getElementById('subirArchivo').addEventListener('change', procesarArchivo);

    // Sliders (Rango visual)
    document.getElementById('rangeVelocidad').addEventListener('input', (e) => {
        document.getElementById('valVelocidad').textContent = parseFloat(e.target.value).toFixed(1);
    });
    document.getElementById('rangeTono').addEventListener('input', (e) => {
        document.getElementById('valTono').textContent = parseFloat(e.target.value).toFixed(1);
    });

    // Modos de Accesibilidad (Alternar clases en el body)
    document.getElementById('btnDislexia').addEventListener('click', () => {
        document.body.classList.toggle('modo-dislexia');
    });
    document.getElementById('btnContraste').addEventListener('click', () => {
        document.body.classList.toggle('modo-alto-contraste');
    });

    // Prevenir pérdida de estado: si el usuario recarga la página, limpiar la síntesis
    window.addEventListener('beforeunload', () => {
        window.speechSynthesis.cancel();
    });
}

// ==========================================
// LÓGICA DE PROCESAMIENTO DE ARCHIVOS
// ==========================================
async function procesarArchivo(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const textoEntrada = document.getElementById('textoEntrada');
    document.getElementById('nombreArchivo').textContent = archivo.name;
    
    // Detener cualquier lectura activa al cargar nuevo archivo
    manejarStop();
    textoEntrada.value = "Procesando archivo, por favor espera...";
    textoEntrada.disabled = true;

    try {
        if (archivo.type === 'text/plain') {
            const texto = await archivo.text();
            textoEntrada.value = texto;
        }
        else if (archivo.type === 'application/pdf' && AppState.pdfWorkerCargado) {
            const arrayBuffer = await archivo.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let textoCompleto = '';
            // Bucle controlado para evitar cuelgues. En PDFs masivos (>100 págs),
            // en un entorno real se extraería a medida que se lee.
            for (let i = 1; i <= pdf.numPages; i++) {
                const pagina = await pdf.getPage(i);
                const contenido = await pagina.getTextContent();
                const textoPagina = contenido.items.map(item => item.str).join(' ');
                textoCompleto += textoPagina + '\n\n';
            }
            textoEntrada.value = textoCompleto;
        }
        else {
            throw new Error("Formato no soportado o motor PDF fallido.");
        }
    } catch (error) {
        console.error("Error en lectura QA:", error);
        textoEntrada.value = "";
        alert("Ocurrió un error al intentar leer el archivo. Revisa el formato.");
    } finally {
        textoEntrada.disabled = false;
        // Limpiar el input file para permitir subir el mismo archivo dos veces si se borra
        evento.target.value = '';
    }
}

// ==========================================
// LÓGICA DE SÍNTESIS DE VOZ (LECTURA)
// ==========================================
function manejarPlayReanudar() {
    const synth = window.speechSynthesis;
    const textArea = document.getElementById('textoEntrada');

    // 1. Si está pausado, reanudamos
    if (synth.paused) {
        synth.resume();
        iniciarKeepAlive(); // Retomamos el control anti-timeout
        textArea.disabled = true; // Bloqueamos edición durante lectura
        return;
    }

    // 2. Si ya está hablando, ignoramos el click
    if (synth.speaking) {
        return;
    }

    // 3. Iniciar lectura desde cero
    const texto = textArea.value.trim();
    if (!texto) {
        alert("Por favor, ingresa o sube un texto para leer.");
        return;
    }

    // Crear nueva instancia de locución
    AppState.utteranceActual = new SpeechSynthesisUtterance(texto);
    
    // Configurar parámetros
    const indiceVoz = document.getElementById('selectVoces').value;
    if (AppState.vocesDisponibles[indiceVoz]) {
        AppState.utteranceActual.voice = AppState.vocesDisponibles[indiceVoz];
    }
    AppState.utteranceActual.rate = parseFloat(document.getElementById('rangeVelocidad').value);
    AppState.utteranceActual.pitch = parseFloat(document.getElementById('rangeTono').value);

    // Eventos del ciclo de vida de la lectura
    AppState.utteranceActual.onstart = () => {
        textArea.disabled = true; // Proteger el texto para no desincronizar
        iniciarKeepAlive();
    };

    AppState.utteranceActual.onend = () => {
        limpiarEstadoLectura();
    };

    AppState.utteranceActual.onerror = (e) => {
        // Ignorar error de "interrupción" (cuando el usuario presiona stop a propósito)
        if (e.error !== 'interrupted') {
            console.error("QA Error de Síntesis:", e);
        }
        limpiarEstadoLectura();
    };

    // Lanzar lectura
    synth.speak(AppState.utteranceActual);
}

function manejarPausa() {
    const synth = window.speechSynthesis;
    if (synth.speaking && !synth.paused) {
        synth.pause();
        detenerKeepAlive(); // Pausamos el hack de Google Chrome
    }
}

function manejarStop() {
    window.speechSynthesis.cancel();
    limpiarEstadoLectura();
}

// ==========================================
// UTILIDADES Y FIXES DE INGENIERÍA
// ==========================================

// Limpieza de estados para evitar fugas de memoria y bloqueos de UI
function limpiarEstadoLectura() {
    detenerKeepAlive();
    document.getElementById('textoEntrada').disabled = false;
    AppState.utteranceActual = null;
}

// HACK OFICIAL para el bug de Google Chrome (Timeout de 15 segundos)
// Hace un pause() y resume() imperceptible cada 14 segundos para mantener la voz viva.
function iniciarKeepAlive() {
    detenerKeepAlive(); // Asegurar que no hay bucles dobles
    AppState.keepAliveTimer = setInterval(() => {
        const synth = window.speechSynthesis;
        if (synth.speaking && !synth.paused) {
            synth.pause();
            synth.resume();
        }
    }, 14000);
}

function detenerKeepAlive() {
    if (AppState.keepAliveTimer) {
        clearInterval(AppState.keepAliveTimer);
        AppState.keepAliveTimer = null;
    }
}
