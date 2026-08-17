# congressus-app

`congressus-app` is een lokale webapp voor het beheren en scannen van ANVT-evenementen, tickets en deelnemers op basis van de Congressus API. De applicatie bestaat uit een FastAPI-backend, een SQLite-cache en een HTML/JavaScript-frontend.

De app ondersteunt twee hoofdrollen:

- **Admin**: beheert de cache, genereert toegangstokens en deelt links.
- **Gebruiker met token**: kan via een geldige toegangslink evenementen bekijken en QR-codes scannen.

## Overzicht

Belangrijkste functies:

- evenementen, tickets en deelnemers ophalen en lokaal cachen;
- QR-codes scannen en tickets direct controleren;
- toegang beveiligen met deelbare tokens;
- tokens genereren, bekijken en intrekken via `admin.html`;
- kentekens uitlezen uit ticketdata en APK-status tonen;
- lokale cachetabellen beheren vanuit de adminpagina.

## Projectstructuur

```txt
source/
  main.py                  FastAPI-backend en API-logica
  requirements.txt         Python dependencies
  api-key-2.txt            Congressus API key (niet in git)
  html/
    admin.html             Beheerpagina voor tokens en cache
    admin.js
    auth.js                Tokenvalidatie voor afgeschermde pagina's
    index.html             Homepage voor gebruikers met token
    index.js
    event_heading.js
    events_cache.js
    participations_overview.html
    participations_overview.js
    scan.html              QR-scanner
    scan.js
    scanned_ticket.html    Resultaatpagina na het scannen
    scanned_ticket.js
    ticket.html
    ticket.js
    token.html             Lokale tokeninformatie op het apparaat
    token.js
    tailwind.input.css     Bron voor Tailwind, gebouwd naar app.css
    app.css                Gegenereerd (zie 'Frontend-assets bouwen'), wel in git
    vendor/                Gegenereerde vendor-JS (html5-qrcode, lucide), wel in git
scripts/
  build-assets.mjs         Bouwt vendor-assets naar source/html/vendor/
testing/
  ...                      Test- en voorbeelddata
```

## Frontend-assets bouwen

De frontend gebruikt Tailwind CSS en een paar vendor-libraries
(`html5-qrcode`, `lucide`). De gegenereerde bestanden (`source/html/app.css`
en `source/html/vendor/*`) staan in git, dus een verse checkout werkt zonder
build-stap. Bouw ze opnieuw na het aanpassen van `tailwind.input.css`,
`tailwind.config.js` of de vendor-dependencies:

```bash
npm install
npm run build:assets   # build:css (Tailwind) + build:vendor (scripts/build-assets.mjs)
```

Commit de gegenereerde bestanden mee met je wijziging.

## Installatie en starten

1. **Installeer dependencies**

   ```bash
   pip install -r source/requirements.txt
   ```

2. **Plaats de Congressus API key**

   Zet de API key in:

   ```txt
   source/api-key-2.txt
   ```

3. **Configureer optioneel via environment variables**

   ```bash
   export CONGRESSUS_CACHE_DB=congressus_cache.db
   export MAX_SCAN_DAYS=7
   export STALE_EVENT_REFRESH_DAYS=2
   export APK_CHECK_MAX_WORKERS=4
   ```

   | Variabele                  | Standaard                 | Betekenis                                                                            |
   | -------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
   | `CONGRESSUS_CACHE_DB`      | `/db/congressus_cache.db` | Pad naar de lokale SQLite-cache                                                      |
   | `MAX_SCAN_DAYS`            | `7`                       | Max. aantal dagen dat scannen voor een evenement toegestaan is                       |
   | `STALE_EVENT_REFRESH_DAYS` | `2`                       | Na hoeveel dagen een evenement als verouderd wordt beschouwd en automatisch ververst |
   | `APK_CHECK_MAX_WORKERS`    | `4`                       | Max. aantal parallelle workers voor APK-status-opvraging bij de RDW                  |

4. **Start de backend**

   ```bash
   cd source
   uvicorn main:app --reload
   ```

5. **Open de app**
   - Admin: [http://localhost:8000/html/admin.html](http://localhost:8000/html/admin.html)
   - Gebruikershomepage: [http://localhost:8000/html/index.html](http://localhost:8000/html/index.html)

   Let op: de applicatie zelf implementeert geen inlogscherm voor `admin.html`.
   Beveiliging wordt geregeld op infrastructuurniveau en verschilt per
   omgeving — zie [Authenticatie op admin.html per omgeving](#authenticatie-op-adminhtml-per-omgeving).

## Authenticatie op admin.html per omgeving

`admin.html` bevat zelf geen login-logica; de toegang wordt buiten de
applicatie (op infrastructuurniveau) beveiligd, en dat verschilt per
omgeving:

| Omgeving                     | Beveiliging van `admin.html`                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Test (`anvt-dev.gemert.net`) | **Basic authentication** (gebruikersnaam/wachtwoord), ingesteld op de server/ingress, niet in deze repo.                             |
| Productie (`scan.anvt.nl`)   | **Google OAuth via `oauth2-proxy`** (zie `k8s-manifests/prod/oauth2-proxy-deployment.yaml`), beperkt tot het `anvt.nl`-e-maildomein. |
| Lokaal (`uvicorn --reload`)  | **Geen** authenticatie — `admin.html` is direct en zonder login bereikbaar.                                                          |

Zonder geldige inloggegevens (test) of een geautoriseerd Google-account
(productie) krijg je geen toegang tot de adminpagina, ook niet als je de URL
rechtstreeks opent.

## Gebruik als admin

De adminpagina is het startpunt voor beheer. Hier beheer je zowel toegang als cachedata.

### 0. Inloggen op de adminpagina

Afhankelijk van de omgeving moet je eerst inloggen voordat je `admin.html`
kunt gebruiken — zie [Authenticatie op admin.html per omgeving](#authenticatie-op-adminhtml-per-omgeving).

1. Open `admin.html`.
2. Log in met basic authentication (test) of je Google-account (productie).
3. Pas daarna krijg je toegang tot tokenbeheer en cachebeheer.

### 1. Toegangstoken genereren

Open `admin.html` en gebruik het blok **Toegangstoken**:

1. Kies bij **Geldig tot en met** de einddatum van het token.
2. Klik op **Genereer token**.
3. De app maakt een deelbare URL aan voor `scan.html` met een `access_token`.
4. Gebruik **Kopieer** om de link te delen.
5. Gebruik **Homepage** als je zelf wilt testen met dat token op `index.html`.

Belangrijk:

- standaard staat de datumkiezer op **vandaag + 5 dagen**;
- een token is geldig **tot het einde van de gekozen dag**;
- een verlopen of ingetrokken token werkt direct niet meer.

### 2. Actieve tokens beheren

Onder **Actieve tokens** zie je:

- het token;
- aanmaakdatum;
- verloopdatum.

Acties:

- klik op een token om die URL weer in het bovenste veld te laden;
- klik op **Revoke** om een token direct ongeldig te maken;
- klik op **Vernieuwen** om de lijst opnieuw op te halen.

### 3. Cachetabellen beheren

Onderaan `admin.html` kun je lokale tabellen leegmaken.

Gebruik dit alleen als je weet wat je doet:

- het leegmaken verwijdert lokale cachedata;
- gegevens worden later opnieuw opgehaald uit Congressus;
- dit is vooral nuttig bij foutieve of verouderde cachedata.

## Gebruik voor iemand met alleen een token

Een gebruiker zonder adminrechten heeft alleen een gedeelde link nodig.

### 1. Eerste keer openen

De beheerder deelt een URL zoals:

```txt
http://localhost:8000/html/scan.html?access_token=...
```

of indirect via een homepage-link met hetzelfde token.

Bij het openen gebeurt het volgende:

1. de app valideert het token via `/auth/validate`;
2. als het token geldig is, wordt het lokaal opgeslagen in de browser;
3. daarna wordt het token uit de URL verwijderd;
4. de gebruiker kan vervolgens tussen afgeschermde pagina’s navigeren zonder het token telkens opnieuw in de URL te hebben.

### 2. Welke pagina’s zijn met token toegankelijk

Deze pagina’s gebruiken tokenvalidatie via `auth.js`:

- `index.html`
- `participations_overview.html`
- `ticket.html`
- `scan.html`
- `scanned_ticket.html`

### 3. Als het token ongeldig is

Bij een ontbrekend, verlopen of ingetrokken token toont de app een **Geen toegang**-scherm. De gebruiker moet dan een nieuwe geldige link aan een beheerder vragen.

### 4. Lokale tokeninformatie bekijken of verwijderen

Via `token.html` kan een gebruiker:

- zien welk token lokaal op het apparaat staat;
- zien tot wanneer het token geldig is;
- het lokaal opgeslagen token verwijderen.

Dat verwijderen trekt het token **niet** in op de server; het verwijdert alleen de lokale opslag op dat apparaat.

## Scanflow

De scanner werkt via `scan.html`.

Verloop:

1. gebruiker opent `scan.html`;
2. camera scant een QR-code;
3. bij het uitlezen van de QR-code klinkt een **beep**;
4. de app zoekt het ticket op en opent `scanned_ticket.html`;
5. resultaat:
   - **Victory** als de scanstatus `OK` is;
   - **Buzz Deep Drop** als de gescande QR-code niet akkoord is.

## Evenementen en deelnemers

Via de homepage en deelnemerspagina’s kun je:

- evenementen bekijken;
- synchroniseren met Congressus;
- deelnemers en tickets per evenement bekijken;
- aanwezigheidstatus raadplegen;
- vanuit de deelnemerspagina direct naar de scanner gaan.

## Kenteken- en APK-gegevens

De applicatie leest kentekens uit ticketdata en kan daarbij APK-informatie tonen.

Globaal proces:

1. ticketdata wordt opgehaald uit Congressus;
2. het kenteken wordt uit de geconfigureerde velden gehaald;
3. het kenteken wordt genormaliseerd;
4. RDW-data wordt opgehaald en lokaal gecachet;
5. kenteken, merk, model en APK-status worden getoond op ticketdetailpagina’s.

## Belangrijke endpoints

### Frontend / toegang

- `GET /` — health-/rootcheck
- `GET /html` / `GET /html/` — redirect/index van de HTML-frontend
- `GET /html/{page_name}` — serveert een pagina uit `source/html/` (bv. `index.html`, `admin.html`, `scan.html`)
- `GET /auth/validate?token=...`

### Tokens

- `POST /admin/access-token` — genereert een token
- `GET /admin/access-tokens` — lijst met actieve tokens
- `DELETE /admin/access-token/{token}` — trekt token in

### Data

- `GET /events`
- `GET /events/refresh`
- `GET /event/{event_id}`
- `GET /event/{event_id}/collect-tickets`
- `GET /participations/{event_id}`
- `GET /participations/{event_id}/refresh`
- `GET /ticket/{event_id}/{obj_id}`
- `GET /ticket/{event_id}/{obj_id}/{new_status}`
- `GET /ticket/by-access-key/{access_key}`
- `GET /scan-ticket/{event_id}/{obj_id}`
- `GET /members`
- `GET /kentekens`
- `POST /check-apk/{event_id}` — start APK-controle voor kentekens van een evenement
- `GET /apk-status/{event_id}` — huidige APK-status per kenteken voor een evenement

### Admin cachebeheer

- `GET /admin/tables`
- `POST /admin/clear-table/{table_name}`

## SQLite-tabellen

De app gebruikt SQLite als lokale cache. Belangrijke tabellen:

- `events`
- `participations`
- `tickets`
- `kentekens`
- `apk_status`
- `members`
- `access_tokens`

De tabel `access_tokens` bevat:

- `token`
- `created_at`
- `expires_at`

Verlopen tokens worden automatisch opgeschoond.

## Ontwikkelnotities

- frontendcode staat in `source/html/`;
- backendcode staat in `source/main.py`;
- de tokenlogica voor afgeschermde pagina’s staat in `source/html/auth.js`;
- de adminpagina is bedoeld voor beheerders op een vertrouwde omgeving;
- tokengebruikers horen via een gedeelde URL binnen te komen, niet via `admin.html`;
- na wijzigingen aan `tailwind.input.css`, `tailwind.config.js` of vendor-dependencies:
  `npm install && npm run build:assets` uitvoeren en de gegenereerde bestanden
  (`source/html/app.css`, `source/html/vendor/*`) meecommitten;
- `admin.html` is zelf niet beveiligd met authenticatie; dit gebeurt op
  infrastructuurniveau en verschilt per omgeving (basic auth op test,
  Google OAuth via `oauth2-proxy` op productie) — zie
  [Authenticatie op admin.html per omgeving](#authenticatie-op-adminhtml-per-omgeving);
- deploy-manifests: `k8s-manifests/prod/` (productie) en `k8s-manifests/dev/`
  (test); ingress/routing voor beide omgevingen wordt buiten deze repo op de
  server beheerd. De losse manifests in `k8s-manifests/prod/` zijn de enige
  bron van waarheid (Namespace, PersistentVolume(Claim), Deployment/Service
  `congressus-app`, Deployment/Service `oauth2-proxy`); er wordt geen
  samengevoegd manifest in de repo bijgehouden om te voorkomen dat dit uit de
  pas gaat lopen. Om productie in één keer toe te passen kun je alle
  productie-manifests los meegeven aan `kubectl` of ze on-the-fly
  samenvoegen met `./scripts/generate-prod-manifest.sh`, bijvoorbeeld:
  `kubectl -n anvt apply -f k8s-manifests/prod/namespace.yaml -f k8s-manifests/prod/persistent-volume.yaml -f k8s-manifests/prod/persistent-volume-claim.yaml -f k8s-manifests/prod/deployment.yaml -f k8s-manifests/prod/service.yaml -f k8s-manifests/prod/oauth2-proxy-deployment.yaml -f k8s-manifests/prod/oauth2-proxy-service.yaml`
  of `./scripts/generate-prod-manifest.sh | kubectl -n anvt apply -f -`.
  `oauth2-proxy` is uitsluitend voor productie (namespace `anvt`) en wordt
  bewust **niet** geïnstalleerd op test (namespace `anvt-dev`), waar
  `admin.html` basic auth gebruikt. Het bijbehorende `oauth2-proxy`-secret
  (`client-id`/`client-secret`/`cookie-secret`) staat om gevoeligheidsredenen
  niet in de repo — zie `k8s-manifests/prod/oauth2-proxy-secret.yaml`;
- draai `./scripts/run-ci-checks.sh` (vereist Docker) om lokaal dezelfde
  linting- en build-checks als de `PR Checks`-workflow uit te voeren
  vóórdat je een PR opent — zie [Lokaal CI-checks draaien](#lokaal-ci-checks-draaien).

## Lokaal CI-checks draaien

Om te voorkomen dat een PR onnodig faalt op checks die je ook lokaal kunt
draaien, bevat `scripts/run-ci-checks.sh` een lokale spiegel van de
belangrijkste jobs uit `.github/workflows/pr_checks.yml` (Hadolint,
Super-linter met dezelfde configuratie, de Docker-build, Dockle en de
integratietest). Vereist alleen Docker:

```bash
./scripts/run-ci-checks.sh         # alle checks
./scripts/run-ci-checks.sh lint    # alleen Hadolint + Super-linter
./scripts/run-ci-checks.sh build   # alleen Docker build + Dockle + integratietest
```

De ClamAV-scan en de `pr_summary`-job worden bewust niet lokaal gedraaid
(ClamAV vereist een systeemdaemon/database-update; `pr_summary` post enkel
een PR-comment).
