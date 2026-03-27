// ==========================================
// 1. MANEJO SEGURO DE LIBRERÍAS EXTERNAS
// ==========================================
try {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
        console.warn("PDF.js no está disponible. Revisa la conexión a internet.");
    }
} catch (error) {
    console.error("Error aislando PDF.js:", error);
}

// ==========================================
// 2. VARIABLES GLOBALES
// ==========================================
let vocesDisponibles = [];
let voiceSynth = window.speechSynthesis;
let currentUtterance = null;
let spanElements = [];

function getUI() {
    return {
        texto: document.getElementById('textoEntrada'),
        vista: document.getElementById('vistaLectura'),
        voces: document.getElementById('selectVoces'),
        velocidad: document.getElementById('rangeVelocidad'),
        tono: document.getElementById('rangeTono'),
        nombreFile: document.getElementById('nombreArchivo')
    };
}

// ==========================================
// 3. MOTOR DE VOCES ANTI-BUGS
// ==========================================
let reintentosCarga = 0;

function poblarSelectorVoces() {
    const ui = getUI();
    if (!ui.voces) return;

    ui.voces.innerHTML = '';
    let vozLocalSeleccionada = false;

    vocesDisponibles.forEach((voz, indice) => {
        if (voz.lang.includes('es') || voz.lang.includes('en')) {
            const option = document.createElement('option');
            option.value = indice;
            
            const estadoSincronizacion = voz.localService ? '⚡ Sincronizada' : '☁️ Solo Audio';
            option.textContent = `${voz.name} (${estadoSincronizacion})`;
            
            if (voz.lang.includes('es') && voz.localService && !vozLocalSeleccionada) {
                option.selected = true;
                vozLocalSeleccionada = true;
            }
            ui.voces.appendChild(option);
        }
    });
}

function inicializarVoces() {
    vocesDisponibles = voiceSynth.getVoices();
    if (vocesDisponibles.length === 0 && reintentosCarga < 20) {
        reintentosCarga++;
        setTimeout(inicializarVoces, 100);
    } else {
        poblarSelectorVoces();
    }
}

setTimeout(() => {
    inicializarVoces();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = inicializarVoces;
    }
    
    const ui = getUI();
    if (ui.velocidad) ui.velocidad.addEventListener('input', (e) => document.getElementById('valVelocidad').textContent = e.target.value);
    if (ui.tono) ui.tono.addEventListener('input', (e) => document.getElementById('valTono').textContent = e.target.value);
}, 200);

// ==========================================
// 4. MOTOR DE LECTURA Y RESALTADO
// ==========================================
function iniciarLecturaSincronizada() {
    const ui = getUI();
    const textoPuro = ui.texto.value;
    
    if (!textoPuro || !textoPuro.trim()) {
        alert("No hay texto para leer.");
        return;
    }

    detenerLectura();

    const palabras = textoPuro.split(/(\s+)/);
    ui.vista.innerHTML = '';
    spanElements = [];

    palabras.forEach(palabra => {
        const span = document.createElement('span');
        span.textContent = palabra;
        if (palabra.trim().length > 0) {
            spanElements.push(span);
        }
        ui.vista.appendChild(span);
    });

    ui.texto.classList.add('hidden');
    ui.vista.classList.remove('hidden');

    currentUtterance = new SpeechSynthesisUtterance(textoPuro);
    
    if (vocesDisponibles.length > 0 && ui.voces && ui.voces.value !== "") {
        currentUtterance.voice = vocesDisponibles[ui.voces.value];
    }

    currentUtterance.rate = ui.velocidad ? parseFloat(ui.velocidad.value) : 0.9;
    currentUtterance.pitch = ui.tono ? parseFloat(ui.tono.value) : 1;

    let indicePalabraActual = 0;

    currentUtterance.onboundary = function(event) {
        if (event.name !== 'word') return;

        const palabraAnterior = ui.vista.querySelector('.word-highlight');
        if (palabraAnterior) palabraAnterior.classList.remove('word-highlight');

        if (indicePalabraActual < spanElements.length) {
            const spanActual = spanElements[indicePalabraActual];
            spanActual.classList.add('word-highlight');
            spanActual.scrollIntoView({ behavior: 'smooth', block: 'center' });
            indicePalabraActual++;
        }
    };

    currentUtterance.onend = detenerLectura;
    voiceSynth.speak(currentUtterance);
}

function detenerLectura() {
    voiceSynth.cancel();
    const ui = getUI();
    if (ui.texto) ui.texto.classList.remove('hidden');
    if (ui.vista) ui.vista.classList.add('hidden');
    
    if (ui.vista) {
        const palabraAnterior = ui.vista.querySelector('.word-highlight');
        if (palabraAnterior) palabraAnterior.classList.remove('word-highlight');
    }
}

// ==========================================
// 5. CARGA DE ARCHIVOS Y MODOS VISUALES
// ==========================================
const inputArchivo = document.getElementById('subirArchivo');
if (inputArchivo) {
    inputArchivo.addEventListener('change', async function(e) {
        const ui = getUI();
        const archivo = e.target.files[0];
        if (!archivo) return;
        
        ui.nombreFile.textContent = archivo.name;
        ui.texto.value = "Procesando documento...";

        if (archivo.type === 'application/pdf' || archivo.name.toLowerCase().endsWith('.pdf')) {
            if (typeof pdfjsLib === 'undefined') {
                ui.texto.value = "Error: El procesador de PDF no se pudo cargar. Revisa tu internet.";
                return;
            }
            const reader = new FileReader();
            reader.onload = async function(ev) {
                try {
                    const doc = await pdfjsLib.getDocument(new Uint8Array(ev.target.result)).promise;
                    let text = '';
                    for (let i = 1; i <= doc.numPages; i++) {
                        const page = await doc.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(item => item.str).join(' ') + '\n\n';
                    }
                    ui.texto.value = text;
                } catch (error) {
                    ui.texto.value = "Error al leer el PDF. Asegúrate de que contiene texto válido.";
                }
            };
            reader.readAsArrayBuffer(archivo);
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => ui.texto.value = ev.target.result;
            reader.readAsText(archivo);
        }
    });
}

function alternarModoDislexia() {
    document.body.classList.toggle('modo-dislexia');
    const btn = document.querySelector('button[onclick="alternarModoDislexia()"]');
    if(btn) btn.classList.toggle('active');
}

function alternarAltoContraste() {
    document.body.classList.toggle('alto-contraste');
    const btn = document.querySelector('button[onclick="alternarAltoContraste()"]');
    if(btn) btn.classList.toggle('active');
}
