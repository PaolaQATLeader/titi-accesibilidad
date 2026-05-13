// ==========================================
// ESTADO GLOBAL
// ==========================================
const AppState = {
    voces: [],
    keepAlive: null,
    utterance: null
};

document.addEventListener('DOMContentLoaded', () => {
    inicializarVoces();
    setupListeners();
    // Configuración PDF.js
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
});

function inicializarVoces() {
    const load = () => {
        AppState.voces = window.speechSynthesis.getVoices();
        const select = document.getElementById('selectVoces');
        if (AppState.voces.length > 0) {
            select.innerHTML = AppState.voces.map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`).join('');
        }
    };
    load();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = load;
    }
}

function setupListeners() {
    document.getElementById('btnPlay').onclick = leerTexto;
    document.getElementById('btnPause').onclick = () => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            stopKeepAlive();
        }
    };
    document.getElementById('btnStop').onclick = () => {
        window.speechSynthesis.cancel();
        limpiarUI();
    };
    
    document.getElementById('subirArchivo').onchange = manejarArchivo;

    document.getElementById('rangeVelocidad').oninput = (e) => document.getElementById('valVelocidad').innerText = e.target.value;
    document.getElementById('rangeTono').oninput = (e) => document.getElementById('valTono').innerText = e.target.value;

    document.getElementById('btnDislexia').onclick = () => document.body.classList.toggle('modo-dislexia');
    document.getElementById('btnContraste').onclick = () => document.body.classList.toggle('modo-alto-contraste');
}

function leerTexto() {
    const synth = window.speechSynthesis;
    const txtArea = document.getElementById('textoEntrada');

    if (synth.paused) {
        synth.resume();
        startKeepAlive();
        return;
    }

    if (synth.speaking) return;

    const texto = txtArea.value.trim();
    if (!texto) return alert("Por favor, ingresa algún texto.");

    AppState.utterance = new SpeechSynthesisUtterance(texto);
    AppState.utterance.voice = AppState.voces[document.getElementById('selectVoces').value];
    AppState.utterance.rate = document.getElementById('rangeVelocidad').value;
    AppState.utterance.pitch = document.getElementById('rangeTono').value;

    AppState.utterance.onstart = () => { startKeepAlive(); txtArea.disabled = true; };
    AppState.utterance.onend = () => { limpiarUI(); };
    AppState.utterance.onerror = () => { limpiarUI(); };

    synth.speak(AppState.utterance);
}

async function manejarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('nombreArchivo').innerText = file.name;
    const txtArea = document.getElementById('textoEntrada');
    txtArea.value = "Cargando documento...";

    if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const pdf = await pdfjsLib.getDocument({data: new Uint8Array(this.result)}).promise;
                let fullText = "";
                for(let i=1; i<=pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += content.items.map(item => item.str).join(" ") + "\n";
                }
                txtArea.value = fullText;
            } catch (err) {
                alert("Error al procesar el PDF.");
                txtArea.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        txtArea.value = await file.text();
    }
}

function limpiarUI() {
    stopKeepAlive();
    document.getElementById('textoEntrada').disabled = false;
}

function startKeepAlive() {
    stopKeepAlive();
    AppState.keepAlive = setInterval(() => {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
    }, 10000);
}

function stopKeepAlive() {
    if (AppState.keepAlive) clearInterval(AppState.keepAlive);
}

// ==========================================
// REGISTRO DE SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('PWA lista!', reg.scope))
            .catch(err => console.log('Fallo PWA', err));
    });
}
