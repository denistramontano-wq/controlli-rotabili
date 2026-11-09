/* Controlli Rotabili - app per telefono, sola lettura.
   Legge il file "rotabili-telefono_AAAA-MM-GG.json" esportato dalla dashboard del PC
   (Impostazioni > Esporta dati per telefono) e lo conserva sul telefono finché non se ne carica un altro.
   I dati restano solo sul telefono: l'app non li manda da nessuna parte. */
'use strict';

const VERSIONE = '2.0.0';
const CHIAVE_DATI = 'controlliRotabiliTelefono_dati_v1';
const CHIAVE_CARICATO = 'controlliRotabiliTelefono_caricatoIl_v1';
const TIPO_FILE = 'dashboard-rotabili-smartphone';
const FORMATO_MAX = 1;
const GIORNI_DATI_VECCHI = 2;
const LINEE = ['1', '2', '3'];
const NOMI_STATO = { rosso: 'Scaduto', arancione: 'Urgente', giallo: 'In scadenza', verde: 'Regolare' };
const NOMI_STATO_PLURALE = { rosso: 'Scaduti', arancione: 'Urgenti', giallo: 'In scadenza', verde: 'Regolari' };
const NOMI_GIORNO = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const PAGINE = { home: 'Controlli Rotabili', rotabili: 'Rotabili', andamento: 'Andamento', messaggi: 'Messaggi' };
const FILTRO_ASSEGNATI = '__assegnati__';
const FILTRO_LIBERI = '__liberi__';
const FILTRI_VUOTI = { stato: '', linea: '', tabella: '', persona: '' };

let D = null;
let caricatoIl = null;
let filtri = { ...FILTRI_VUOTI };
let bozzaFiltri = null;          // filtri in modifica nella scheda, applicati solo con "Applica"
let testoRicerca = '';
const aperti = new Set();        // matricole con il dettaglio aperto
const testiModificati = {};      // messaggi corretti a mano: { persona: testo }
let settimana = null;            // lunedì 'AAAA-MM-GG' della settimana mostrata nell'andamento
let giornoScelto = null;         // giorno 'AAAA-MM-GG' dei rotabili chiusi elencati
let entratoDallaHome = false;    // per tornare indietro con la cronologia invece di aggiungere passi

const el = (id) => document.getElementById(id);
const tutti = (selettore) => Array.from(document.querySelectorAll(selettore));

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- date ---------- */
function oggi() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function chiave(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daChiave(k) {
    const [a, m, g] = k.split('-').map(Number);
    return new Date(a, m - 1, g);
}
function piuGiorni(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function lunediDi(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
}
function dataTesto(k) {
    return k.split('-').reverse().join('/');
}
function valida(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d : null;
}
function ora(d) {
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function dataOra(iso) {
    const d = valida(iso);
    if (!d) return 'N/D';
    return `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })} alle ${ora(d)}`;
}
// "oggi alle 10:15" / "ieri alle 18:02" / "il 30/10/2026 alle 08:39"
function quandoRelativo(iso) {
    const d = valida(iso);
    if (!d) return 'non registrato';
    const giorno = new Date(d);
    giorno.setHours(0, 0, 0, 0);
    const diff = Math.round((oggi() - giorno) / 86400000);
    if (diff === 0) return `oggi alle ${ora(d)}`;
    if (diff === 1) return `ieri alle ${ora(d)}`;
    return `il ${dataOra(iso)}`;
}
function titoloGiorno(k) {
    const t = daChiave(k).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
}
function plurale(n, uno, tanti) {
    return `${n} ${n === 1 ? uno : tanti}`;
}
function icona(nome) {
    return `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
}

/* ---------- caricamento dei dati ---------- */
function controllaFile(x) {
    if (!x || x.tipo !== TIPO_FILE || !Array.isArray(x.rotabili)) {
        throw new Error('Questo file non contiene i dati della dashboard. Scegli il file "rotabili-telefono" esportato dal PC.');
    }
    if (x.formato > FORMATO_MAX) {
        throw new Error('Il file viene da una versione più nuova della dashboard: aggiorna l\'app (ricarica la pagina con la rete attiva).');
    }
    if (!Array.isArray(x.andamento)) x.andamento = [];
    if (!x.soglie) x.soglie = { giallo: 7, arancione: 2 };
    return x;
}

function leggiDatiSalvati() {
    try {
        const testo = localStorage.getItem(CHIAVE_DATI);
        if (testo) D = controllaFile(JSON.parse(testo));
        caricatoIl = localStorage.getItem(CHIAVE_CARICATO);
    } catch (e) {
        D = null;
    }
}

function caricaFile(file) {
    if (!file) return;
    const lettore = new FileReader();
    lettore.onload = () => {
        let nuovi;
        try {
            nuovi = controllaFile(JSON.parse(lettore.result));
        } catch (e) {
            mostraToast(e instanceof SyntaxError ? 'Il file non si legge: scegli il file .json esportato dal PC.' : e.message, true);
            return;
        }
        const piuVecchio = D && D.esportatoIl && nuovi.esportatoIl && nuovi.esportatoIl < D.esportatoIl;
        caricatoIl = new Date().toISOString();
        let salvato = true;
        try {
            localStorage.setItem(CHIAVE_DATI, lettore.result);
            localStorage.setItem(CHIAVE_CARICATO, caricatoIl);
        } catch (e) {
            salvato = false;
        }
        D = nuovi;
        settimana = null;
        giornoScelto = null;
        filtri = { ...FILTRI_VUOTI };
        aperti.clear();
        Object.keys(testiModificati).forEach((k) => delete testiModificati[k]);
        render();
        let testo = `Caricati ${plurale(D.rotabili.length, 'rotabile', 'rotabili')} del ${dataOra(D.datiDel)}`;
        if (piuVecchio) testo += '. Attenzione: è più vecchio del file che avevi.';
        if (!salvato) testo += '. Non è stato possibile salvarli: alla prossima apertura vanno ricaricati.';
        mostraToast(testo, !salvato);
    };
    lettore.onerror = () => mostraToast('Il file non si legge. Riprova.', true);
    lettore.readAsText(file);
}

/* ---------- stato dei rotabili rispetto a oggi ---------- */
// Giorni e stato si ricalcolano sulla data del telefono: restano giusti anche nei giorni dopo l'esportazione
function statoDi(r, giorno) {
    if (!r.s) return { giorni: null, stato: r.st || 'verde' };
    const giorni = Math.round((daChiave(r.s) - giorno) / 86400000);
    let stato = 'verde';
    if (giorni < 0) stato = 'rosso';
    else if (giorni <= D.soglie.arancione) stato = 'arancione';
    else if (giorni <= D.soglie.giallo) stato = 'giallo';
    return { giorni, stato };
}

function rotabiliConStato() {
    const giorno = oggi();
    return D.rotabili.map((r) => Object.assign({}, r, statoDi(r, giorno)));
}

function quando(g) {
    if (g === null) return 'scadenza non indicata';
    if (g < -1) return `scaduto da ${-g} giorni`;
    if (g === -1) return 'scaduto ieri';
    if (g === 0) return 'scade oggi';
    if (g === 1) return 'scade domani';
    return `tra ${g} giorni`;
}

// Numero del treno: la composizione letta dai report (905-906) o, se manca, il numero della cassa
function nomeTreno(r) {
    return r.tr || String(parseInt(r.m.slice(2), 10));
}

/* ---------- pagina iniziale ---------- */
function renderHome() {
    el('caricamentoQuando').textContent = `Ultimo caricamento: ${quandoRelativo(caricatoIl)}`;
    el('caricamentoDettaglio').textContent =
        `Dati della dashboard del ${dataOra(D.datiDel)} · file esportato il ${dataOra(D.esportatoIl)}`;

    const conStato = rotabiliConStato();
    tutti('[data-vai-stato]').forEach((b) => {
        b.querySelector('strong').textContent = conStato.filter((r) => r.stato === b.dataset.vaiStato).length;
    });
    const assegnati = conStato.filter((r) => r.a).length;
    el('homeRotabili').textContent = `${plurale(D.rotabili.length, 'rotabile', 'rotabili')} · ${plurale(assegnati, 'assegnato', 'assegnati')}`;

    if (D.andamento.length === 0) {
        el('homeAndamento').textContent = 'Nessuna chiusura registrata';
    } else {
        const inizio = chiave(lunediDi(oggi()));
        const settimanaCorrente = D.andamento.filter((v) => v.d >= inizio).reduce((tot, v) => tot + v.n, 0);
        el('homeAndamento').textContent = `${plurale(settimanaCorrente, 'chiusura', 'chiusure')} questa settimana`;
    }

    if (!Array.isArray(D.messaggi)) el('homeMessaggi').textContent = 'Serve un file esportato dalla dashboard v4.7.0';
    else if (D.messaggi.length === 0) el('homeMessaggi').textContent = 'Nessun controllo assegnato';
    else el('homeMessaggi').textContent = `${plurale(D.messaggi.length, 'persona', 'persone')} con controlli assegnati`;
}

/* ---------- Rotabili ---------- */
function opzioniPersone() {
    const persone = [...new Set(D.rotabili.map((r) => r.a).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
    return [
        '<option value="">Tutti i rotabili</option>',
        `<option value="${FILTRO_ASSEGNATI}">Solo assegnati</option>`,
        `<option value="${FILTRO_LIBERI}">Da assegnare</option>`,
        ...persone.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)
    ].join('');
}

function quantiFiltri(f) {
    return Object.values(f).filter(Boolean).length;
}

function descriviFiltri(f) {
    const parti = [];
    if (f.stato) parti.push(NOMI_STATO_PLURALE[f.stato]);
    if (f.linea) parti.push(`Linea ${f.linea}`);
    if (f.tabella) parti.push(f.tabella === 'con' ? 'Con tabella' : 'Senza tabella');
    if (f.persona === FILTRO_ASSEGNATI) parti.push('Solo assegnati');
    else if (f.persona === FILTRO_LIBERI) parti.push('Da assegnare');
    else if (f.persona) parti.push(f.persona);
    return parti.join(' · ');
}

function renderRotabili() {
    const testo = testoRicerca.trim().toLowerCase();
    const righe = rotabiliConStato().filter((r) => {
        if (filtri.linea && r.l !== filtri.linea) return false;
        if (filtri.stato && r.stato !== filtri.stato) return false;
        if (filtri.tabella === 'con' && !r.t) return false;
        if (filtri.tabella === 'senza' && r.t) return false;
        if (filtri.persona === FILTRO_ASSEGNATI && !r.a) return false;
        if (filtri.persona === FILTRO_LIBERI && r.a) return false;
        if (filtri.persona && !filtri.persona.startsWith('__') && r.a !== filtri.persona) return false;
        if (testo) {
            const dove = [r.m, nomeTreno(r), r.t, r.a, r.n, r.c].filter(Boolean).join(' ').toLowerCase();
            if (!dove.includes(testo)) return false;
        }
        return true;
    }).sort((a, b) => {
        const ga = a.giorni === null ? Infinity : a.giorni;
        const gb = b.giorni === null ? Infinity : b.giorni;
        return ga - gb || a.m.localeCompare(b.m);
    });

    el('lista').innerHTML = righe.length === 0
        ? '<p class="vuoto">Nessun rotabile con questi filtri</p>'
        : righe.map(rigaRotabile).join('');
    el('conteggio').textContent = `${plurale(righe.length, 'rotabile', 'rotabili')} su ${D.rotabili.length}`;

    const n = quantiFiltri(filtri);
    el('badgeFiltri').hidden = n === 0;
    el('badgeFiltri').textContent = n;
    el('btnFiltri').classList.toggle('attivo', n > 0);
    el('btnFiltri').setAttribute('aria-label', n ? `Filtri, ${n} attivi` : 'Filtri');
    el('filtriAttivi').hidden = n === 0;
    el('filtriAttivi').textContent = descriviFiltri(filtri);
    el('btnAzzera').hidden = !(n || testoRicerca);
}

function rigaRotabile(r) {
    const aperto = aperti.has(r.m);
    const tabella = r.t
        ? esc(r.t) + (r.o ? ` <span class="tenue">· ${esc(r.o)}</span>` : '')
        : '<span class="tenue">nessuna</span>';
    const persona = r.a
        ? `<span class="riga-persona">${icona('utente')}${esc(r.a)}</span>`
        : '<span class="riga-persona libero">da assegnare</span>';
    return `<article class="riga s-${r.stato}">
        <button type="button" class="riga-testa" data-espandi="${esc(r.m)}" aria-expanded="${aperto}"
            aria-label="Treno ${esc(nomeTreno(r))}, ${esc(r.m)}, ${NOMI_STATO[r.stato] || ''}, ${r.a ? `assegnato a ${esc(r.a)}` : 'da assegnare'}">
            <span class="riga-treno">${esc(nomeTreno(r))}<small>Linea ${esc(r.l)}</small></span>
            <span class="riga-centro"><span class="matricola">${esc(r.m)}</span>${persona}</span>
            <svg class="ic riga-giu" aria-hidden="true"><use href="#i-giu"/></svg>
        </button>
        <div class="riga-dettaglio"${aperto ? '' : ' hidden'}>
            <p class="scheda-scadenza">
                <span class="pill p-${r.stato}">${NOMI_STATO[r.stato] || ''}</span>
                <span class="linea l${esc(r.l)}">Linea ${esc(r.l)}</span>
                <span>Scadenza ${r.s ? dataTesto(r.s) : 'N/D'} · <strong>${quando(r.giorni)}</strong></span>
            </p>
            <dl class="scheda-dati">
                <div><dt>Tabella</dt><dd>${tabella}</dd></div>
                <div><dt>Assegnato a</dt><dd>${r.a ? esc(r.a) : '<span class="tenue">da assegnare</span>'}</dd></div>
                <div><dt>Classe</dt><dd>${esc(r.c || 'N/D')}</dd></div>
            </dl>
            ${r.n ? `<p class="scheda-nota">${esc(r.n)}${r.p ? ` <span class="tenue">(${esc(r.p)})</span>` : ''}</p>` : ''}
        </div>
    </article>`;
}

function espandi(matricola, bottone) {
    const dettaglio = bottone.nextElementSibling;
    const apri = !aperti.has(matricola);
    if (apri) aperti.add(matricola);
    else aperti.delete(matricola);
    bottone.setAttribute('aria-expanded', String(apri));
    dettaglio.hidden = !apri;
}

/* ---------- scheda dei filtri ---------- */
function apriFiltri() {
    bozzaFiltri = { ...filtri };
    el('filtroPersona').innerHTML = opzioniPersone();
    aggiornaScheda();
    el('foglioFiltri').hidden = false;
    document.body.classList.add('bloccato');
}

function aggiornaScheda() {
    tutti('.chip-gruppo').forEach((gruppo) => {
        const campo = gruppo.dataset.gruppo;
        gruppo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(bozzaFiltri[campo] === b.dataset.valore)));
    });
    el('filtroPersona').value = bozzaFiltri.persona;
}

function chiudiFiltri(applica) {
    if (el('foglioFiltri').hidden) return;
    if (applica) {
        filtri = { ...bozzaFiltri, persona: el('filtroPersona').value };
        renderRotabili();
    }
    bozzaFiltri = null;
    el('foglioFiltri').hidden = true;
    document.body.classList.remove('bloccato');
    el('btnFiltri').focus();
}

/* ---------- Andamento ---------- */
function settimane() {
    if (D.andamento.length === 0) return [];
    const prima = D.andamento.reduce((min, v) => (v.d < min ? v.d : min), D.andamento[0].d);
    const elenco = [];
    for (let l = lunediDi(daChiave(prima)); l <= lunediDi(oggi()); l = piuGiorni(l, 7)) elenco.push(chiave(l));
    return elenco;
}

function nomeSettimana(k) {
    const lunedi = daChiave(k);
    const domenica = piuGiorni(lunedi, 6);
    const breve = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    return `${breve(lunedi)} – ${breve(domenica)} ${domenica.getFullYear()}`;
}

function ultimoGiornoDi(k) {
    const fine = chiave(piuGiorni(daChiave(k), 7));
    const giorni = D.andamento.filter((v) => v.d >= k && v.d < fine).map((v) => v.d).sort();
    return giorni.length ? giorni[giorni.length - 1] : null;
}

function somma(filtro) {
    const r = { '1': 0, '2': 0, '3': 0, tutte: 0 };
    D.andamento.forEach((v) => {
        if (!filtro(v.d)) return;
        r.tutte += v.n;
        if (v.pl) LINEE.forEach((l) => { r[l] += v.pl[l] || 0; });
    });
    return r;
}

function renderAndamento() {
    const elenco = settimane();
    el('andamentoVuoto').hidden = elenco.length > 0;
    el('andamentoPieno').hidden = elenco.length === 0;
    if (elenco.length === 0) return;

    if (!elenco.includes(settimana)) {
        settimana = elenco[elenco.length - 1];
        giornoScelto = ultimoGiornoDi(settimana);
    }
    const indice = elenco.indexOf(settimana);
    el('filtroSettimana').innerHTML = elenco.slice().reverse()
        .map((k) => `<option value="${k}">${nomeSettimana(k)}</option>`).join('');
    el('filtroSettimana').value = settimana;
    el('btnSettimanaPrima').disabled = indice === 0;
    el('btnSettimanaDopo').disabled = indice === elenco.length - 1;

    renderRiquadri(indice > 0);
    renderGrafico();
    renderGiorno();
}

function renderRiquadri(haPrecedente) {
    const lunedi = daChiave(settimana);
    const inizio = settimana;
    const fine = chiave(piuGiorni(lunedi, 7));
    const prima = chiave(piuGiorni(lunedi, -7));
    const anno = String(lunedi.getFullYear());
    const sett = somma((d) => d >= inizio && d < fine);
    const prec = somma((d) => d >= prima && d < inizio);
    const annuo = somma((d) => d.startsWith(anno));
    const totale = somma(() => true);
    const num = (n) => n.toLocaleString('it-IT');

    const riquadro = (k, nome) => {
        const diff = sett[k] - prec[k];
        let confronto = 'prima settimana registrata';
        let tono = '';
        if (haPrecedente) {
            confronto = diff === 0 ? 'come la settimana prima' : `${diff > 0 ? '+' : ''}${diff} sulla settimana prima`;
            tono = diff > 0 ? 'su' : (diff < 0 ? 'giu' : '');
        }
        return `<article class="riquadro${k === 'tutte' ? ' tutte' : ''}">
            <div class="riquadro-testa">${k === 'tutte' ? '' : `<span class="pallino l${k}" aria-hidden="true"></span>`}${nome}</div>
            <div class="riquadro-numero">${num(sett[k])}</div>
            <div class="riquadro-cosa">chiusure nella settimana</div>
            <div class="confronto ${tono}">${confronto}</div>
            <div class="riquadro-piede">
                <span>Anno ${anno}<strong>${num(annuo[k])}</strong></span>
                <span>Totale<strong>${num(totale[k])}</strong></span>
            </div>
        </article>`;
    };
    el('riquadri').innerHTML = LINEE.map((l) => riquadro(l, `Linea ${l}`)).join('') + riquadro('tutte', 'Tutte le linee');
}

// Sette colonne dal lunedì alla domenica, divise per linea. Grigio: giorni senza il dettaglio per linea
function renderGrafico() {
    const lunedi = daChiave(settimana);
    const oggiK = chiave(oggi());
    const giorni = [];
    for (let i = 0; i < 7; i++) {
        const k = chiave(piuGiorni(lunedi, i));
        giorni.push({ k, voce: D.andamento.find((v) => v.d === k) || null });
    }
    const massimo = Math.max(1, ...giorni.map((g) => (g.voce ? g.voce.n : 0)));
    const larghezza = 336;
    const colonna = larghezza / 7;
    const alto = 24;
    const basso = 136;
    const scala = (basso - alto) / massimo;
    const barra = 24;

    const colonne = giorni.map((g, i) => {
        const x = i * colonna;
        const cx = x + colonna / 2;
        const data = daChiave(g.k);
        const futuro = g.k > oggiK;
        let pezzi = '';
        let valore = '';
        if (g.voce) {
            let y = basso;
            const segmenti = g.voce.pl
                ? LINEE.map((l) => ({ n: g.voce.pl[l] || 0, classe: `barra-l${l}` }))
                : [{ n: g.voce.n, classe: 'barra-grigia' }];
            segmenti.forEach((s) => {
                if (!s.n) return;
                const h = s.n * scala;
                y -= h;
                pezzi += `<rect class="${s.classe}" x="${cx - barra / 2}" y="${y}" width="${barra}" height="${h}" rx="2"/>`;
            });
            valore = `<text class="valore" x="${cx}" y="${y - 6}" text-anchor="middle">${g.voce.n}</text>`;
        }
        const descrizione = g.voce
            ? `${titoloGiorno(g.k)}: ${plurale(g.voce.n, 'chiusura', 'chiusure')}`
            : `${titoloGiorno(g.k)}: ${futuro ? 'giorno non ancora arrivato' : 'nessuna importazione'}`;
        return `<g class="colonna${g.k === giornoScelto ? ' scelta' : ''}" data-giorno="${g.k}" tabindex="0" role="button" aria-label="${esc(descrizione)}">
            <rect class="fondo" x="${x + 2}" y="0" width="${colonna - 4}" height="176" rx="6"/>
            ${pezzi}${valore}
            <text class="etichetta" x="${cx}" y="156" text-anchor="middle">${NOMI_GIORNO[data.getDay()]}</text>
            <text class="etichetta" x="${cx}" y="172" text-anchor="middle">${data.getDate()}</text>
        </g>`;
    }).join('');
    el('grafico').innerHTML = `<svg viewBox="0 0 ${larghezza} 176" role="img" aria-label="Chiusure della settimana ${esc(nomeSettimana(settimana))}">
        <line class="asse" x1="0" y1="${basso + 0.5}" x2="${larghezza}" y2="${basso + 0.5}"/>
        ${colonne}
    </svg>`;
}

function renderGiorno() {
    const titolo = el('giornoTitolo');
    const lista = el('giornoLista');
    if (!giornoScelto) {
        titolo.textContent = 'Rotabili chiusi';
        lista.innerHTML = '<p class="vuoto">Nessuna importazione in questa settimana</p>';
        return;
    }
    const voce = D.andamento.find((v) => v.d === giornoScelto);
    titolo.textContent = titoloGiorno(giornoScelto);
    if (!voce) {
        lista.innerHTML = '<p class="vuoto">Nessuna importazione in questo giorno</p>';
        return;
    }
    if (!voce.chiusi) {
        lista.innerHTML = `<p class="vuoto">${plurale(voce.n, 'chiusura', 'chiusure')}. L'elenco non è nel file: per i giorni più vecchi restano solo i numeri.</p>`;
        return;
    }
    if (voce.chiusi.length === 0) {
        lista.innerHTML = '<p class="vuoto">Nessun rotabile chiuso in questo giorno</p>';
        return;
    }
    const elenco = voce.chiusi.slice().sort((a, b) => a.m.localeCompare(b.m));
    const assegnati = elenco.filter((c) => c.p).length;
    titolo.textContent = `${titoloGiorno(giornoScelto)} · ${plurale(elenco.length, 'chiuso', 'chiusi')}, ${assegnati} con assegnazione`;
    lista.innerHTML = `<ul class="chiusi">${elenco.map((c) => {
        const linea = c.m.charAt(1);
        return `<li>
            <span class="matricola">${esc(c.m)}</span>
            <span class="linea l${esc(linea)}">Linea ${esc(linea)}</span>
            <span class="tenue">classe ${esc(c.c || 'N/D')}</span>
            <span class="persona${c.p ? '' : ' tenue'}">${esc(c.p || 'non assegnato')}</span>
        </li>`;
    }).join('')}</ul>`;
}

function scegliGiorno(k) {
    giornoScelto = k;
    renderGrafico();
    renderGiorno();
}

function vaiASettimana(k) {
    settimana = k;
    giornoScelto = ultimoGiornoDi(k);
    renderAndamento();
}

/* ---------- Messaggi agli assegnati ---------- */
// I testi arrivano già pronti dal PC (modello e nomi della rubrica della dashboard) e si possono correggere
function linkWhatsapp(m, testo) {
    return `https://wa.me/${m.numero || ''}?text=${encodeURIComponent(testo)}`;
}

function renderMessaggi() {
    const lista = el('messaggiLista');
    if (!Array.isArray(D.messaggi)) {
        el('messaggiSpiegazione').textContent = '';
        lista.innerHTML = '<p class="vuoto">Questo file non ha i messaggi: esportalo di nuovo dalla dashboard (v4.7.0 o successiva) e ricaricalo.</p>';
        return;
    }
    if (D.messaggi.length === 0) {
        el('messaggiSpiegazione').textContent = '';
        lista.innerHTML = '<p class="vuoto">Nel file caricato nessun controllo è assegnato.</p>';
        return;
    }
    el('messaggiSpiegazione').textContent =
        `Messaggi preparati sul PC il ${dataOra(D.esportatoIl)} con il modello della dashboard. Puoi correggerli prima di inviarli: l'invio va sempre confermato in WhatsApp.`;
    const condividi = typeof navigator.share === 'function';
    lista.innerHTML = D.messaggi.map((m, i) => {
        const testo = testiModificati[m.persona] ?? m.testo;
        return `<article class="messaggio">
            <div class="messaggio-testa">
                <strong>${esc(m.persona)}</strong>
                <span>${plurale(m.treni, 'rotabile', 'rotabili')} · ${m.numero ? `+${esc(m.numero)}` : 'numero non in rubrica: scegli il contatto in WhatsApp'}</span>
            </div>
            <textarea data-messaggio="${i}" aria-label="Messaggio per ${esc(m.persona)}">${esc(testo)}</textarea>
            <div class="messaggio-azioni">
                <a class="whatsapp" data-whatsapp="${i}" href="${esc(linkWhatsapp(m, testo))}" target="_blank" rel="noopener">${icona('messaggio')}WhatsApp</a>
                ${condividi ? `<button type="button" data-condividi="${i}">${icona('condividi')}Condividi</button>` : ''}
                <button type="button" data-copia="${i}">${icona('copia')}Copia</button>
            </div>
        </article>`;
    }).join('');
}

function testoMessaggio(i) {
    return el('messaggiLista').querySelector(`[data-messaggio="${i}"]`).value;
}

async function copiaTesto(testo, area) {
    try {
        await navigator.clipboard.writeText(testo);
    } catch (e) {
        area.select();
        document.execCommand('copy');
    }
    mostraToast('Messaggio copiato');
}

/* ---------- insieme ---------- */
function paginaCorrente() {
    const p = location.hash.slice(1);
    return PAGINE[p] ? p : 'home';
}

function render() {
    const pagina = paginaCorrente();
    const vuoto = !D;
    el('vuoto').hidden = !vuoto;
    Object.keys(PAGINE).forEach((p) => { el(`pagina-${p}`).hidden = vuoto || p !== pagina; });
    el('btnIndietro').hidden = vuoto || pagina === 'home';
    el('titoloPagina').textContent = vuoto ? PAGINE.home : PAGINE[pagina];
    el('avviso').hidden = true;
    if (vuoto) {
        el('sottotitolo').textContent = 'Nessun dato caricato';
        return;
    }

    el('sottotitolo').textContent = `Sola lettura · dati del ${dataOra(D.datiDel)}`;
    if (D.datiDel) {
        const giorno = new Date(D.datiDel);
        giorno.setHours(0, 0, 0, 0);
        const giorni = Math.round((oggi() - giorno) / 86400000);
        if (giorni > GIORNI_DATI_VECCHI) {
            el('avvisoTesto').textContent = `Dati di ${giorni} giorni fa: esporta di nuovo dal PC e ricarica il file.`;
            el('avviso').hidden = false;
        }
    }
    if (pagina === 'home') renderHome();
    else if (pagina === 'rotabili') renderRotabili();
    else if (pagina === 'andamento') renderAndamento();
    else renderMessaggi();
}

function tornaAllaHome() {
    if (entratoDallaHome) {
        history.back();
        return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    render();
    window.scrollTo(0, 0);
}

let timerToast = null;
function mostraToast(testo, errore) {
    const t = el('toast');
    t.textContent = testo;
    t.classList.toggle('errore', Boolean(errore));
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, errore ? 7000 : 4000);
}

function inizializza() {
    el('versione').textContent = VERSIONE;

    const apriScelta = () => el('fileDati').click();
    el('btnCarica').addEventListener('click', apriScelta);
    el('btnCaricaVuoto').addEventListener('click', apriScelta);
    el('fileDati').addEventListener('change', (e) => {
        caricaFile(e.target.files[0]);
        e.target.value = '';
    });

    // Navigazione con l'indirizzo (#rotabili, #andamento, #messaggi): il tasto indietro del telefono funziona
    let paginaPrima = paginaCorrente();
    window.addEventListener('hashchange', () => {
        const pagina = paginaCorrente();
        if (paginaPrima === 'home' && pagina !== 'home') entratoDallaHome = true;
        if (pagina === 'home') entratoDallaHome = false;
        paginaPrima = pagina;
        chiudiFiltri(false);
        render();
        window.scrollTo(0, 0);
    });
    el('btnIndietro').addEventListener('click', tornaAllaHome);

    // Pagina iniziale: un contatore apre i rotabili già filtrati per quello stato
    tutti('[data-vai-stato]').forEach((b) => b.addEventListener('click', () => {
        filtri = { ...FILTRI_VUOTI, stato: b.dataset.vaiStato };
        testoRicerca = '';
        el('cerca').value = '';
        location.hash = 'rotabili';
    }));

    // Rotabili
    el('cerca').addEventListener('input', (e) => { testoRicerca = e.target.value; renderRotabili(); });
    el('btnAzzera').addEventListener('click', () => {
        filtri = { ...FILTRI_VUOTI };
        testoRicerca = '';
        el('cerca').value = '';
        renderRotabili();
    });
    el('lista').addEventListener('click', (e) => {
        const bottone = e.target.closest('[data-espandi]');
        if (bottone) espandi(bottone.dataset.espandi, bottone);
    });

    // Scheda dei filtri
    el('btnFiltri').addEventListener('click', apriFiltri);
    tutti('.chip-gruppo').forEach((gruppo) => gruppo.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        bozzaFiltri[gruppo.dataset.gruppo] = b.dataset.valore;
        aggiornaScheda();
    }));
    el('filtroPersona').addEventListener('change', (e) => { bozzaFiltri.persona = e.target.value; });
    el('btnFiltriAzzera').addEventListener('click', () => {
        bozzaFiltri = { ...FILTRI_VUOTI };
        aggiornaScheda();
    });
    el('btnFiltriAnnulla').addEventListener('click', () => chiudiFiltri(false));
    el('btnFiltriApplica').addEventListener('click', () => chiudiFiltri(true));
    el('foglioFiltri').addEventListener('click', (e) => {
        if (e.target.id === 'foglioFiltri') chiudiFiltri(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') chiudiFiltri(false);
    });

    // Andamento
    el('filtroSettimana').addEventListener('change', (e) => vaiASettimana(e.target.value));
    el('btnSettimanaPrima').addEventListener('click', () => {
        const elenco = settimane();
        const i = elenco.indexOf(settimana);
        if (i > 0) vaiASettimana(elenco[i - 1]);
    });
    el('btnSettimanaDopo').addEventListener('click', () => {
        const elenco = settimane();
        const i = elenco.indexOf(settimana);
        if (i < elenco.length - 1) vaiASettimana(elenco[i + 1]);
    });
    el('grafico').addEventListener('click', (e) => {
        const col = e.target.closest('[data-giorno]');
        if (col) scegliGiorno(col.dataset.giorno);
    });
    el('grafico').addEventListener('keydown', (e) => {
        const col = e.target.closest('[data-giorno]');
        if (col && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            scegliGiorno(col.dataset.giorno);
        }
    });

    // Messaggi: le correzioni restano finché l'app è aperta e aggiornano il link di WhatsApp
    el('messaggiLista').addEventListener('input', (e) => {
        const i = e.target.dataset.messaggio;
        if (i === undefined) return;
        const m = D.messaggi[i];
        testiModificati[m.persona] = e.target.value;
        el('messaggiLista').querySelector(`[data-whatsapp="${i}"]`).href = linkWhatsapp(m, e.target.value);
    });
    el('messaggiLista').addEventListener('click', (e) => {
        const copia = e.target.closest('[data-copia]');
        if (copia) {
            const i = copia.dataset.copia;
            copiaTesto(testoMessaggio(i), el('messaggiLista').querySelector(`[data-messaggio="${i}"]`));
            return;
        }
        const condividi = e.target.closest('[data-condividi]');
        if (condividi) {
            navigator.share({ text: testoMessaggio(condividi.dataset.condividi) }).catch(() => {});
        }
    });

    leggiDatiSalvati();
    render();

    // Se l'app resta aperta oltre la mezzanotte, giorni e stati si aggiornano
    let giornoCorrente = chiave(oggi());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && chiave(oggi()) !== giornoCorrente) {
            giornoCorrente = chiave(oggi());
            render();
        }
    });

    // Funziona anche senza rete dopo la prima apertura (solo su https, come GitHub Pages)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

inizializza();
