# Controlli Rotabili, app per telefono

App per smartphone, in sola lettura, che mostra i dati esportati dalla Dashboard Controlli Rotabili del PC.

- **Pagina iniziale**: ultimo caricamento, situazione per stato e tasti per le sezioni.
- **Rotabili**: elenco essenziale (treno, matricola, assegnato), dettaglio con la freccia, ricerca e filtri.
- **Andamento**: chiusure della settimana, dell'anno e totali per linea, grafico giorno per giorno e rotabili chiusi in ogni giorno.
- **Messaggi**: testi pronti per chi ha controlli assegnati, da mandare su WhatsApp, condividere o copiare.

I dati **non sono in questo repository** e non vanno su internet. Si caricano da un file sul telefono e restano salvati solo lì.

## Come si usa

1. Sul PC, nella dashboard, apri **Impostazioni** e premi **Esporta dati per telefono**. Viene scaricato `rotabili-telefono_AAAA-MM-GG.json`.
2. Allega il file a una mail e mandala a te stesso.
3. Sul telefono apri la mail e salva l'allegato: in Download su Android, in File su iPhone.
4. Apri l'app, premi **Carica dati** e scegli il file.
5. Per aggiornare, ripeti dal punto 1. Il nuovo file sostituisce il precedente.

## Pubblicazione su GitHub Pages

1. Su github.com crea un nuovo repository, per esempio `controlli-rotabili`. Deve essere pubblico per usare GitHub Pages con un account gratuito. Contiene solo l'app, non i dati.
2. Nella pagina del repository scegli **Add file > Upload files** e trascina tutti i file di questa cartella: `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icona.svg`, `icona-192.png`, `icona-512.png` e `README.md`. Poi premi **Commit changes**.
3. Vai in **Settings > Pages**. In *Source* scegli **Deploy from a branch**, poi il branch `main` e la cartella `/ (root)`, e salva.
4. Dopo un paio di minuti l'app è su `https://TUO-UTENTE.github.io/controlli-rotabili/`.
5. Sul telefono apri l'indirizzo e aggiungi l'app alla schermata Home. Su Android usa il menu di Chrome, poi **Aggiungi a schermata Home**. Su iPhone usa Safari, poi Condividi e **Aggiungi a Home**. Dopo la prima apertura funziona anche senza rete.

## Aggiornare l'app

Carica i file modificati con **Add file > Upload files**: quelli con lo stesso nome vengono sostituiti. A ogni nuova versione aumenta il numero in `VERSIONE` (`app.js`) e in `CACHE` (`sw.js`).

v2.0.0 · Creato da Denis Tramontano
