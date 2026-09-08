# ZipRun

Aplikacja PWA z planami treningowymi dla bieżni z Bluetooth LE — alternatywa dla
płatnych planów w FitShow. Łączy się z bieżnią bezpośrednio z przeglądarki
(Web Bluetooth), prowadzi trening głosowo i — jeśli bieżnia na to pozwala —
sama ustawia prędkość i nachylenie.

Wszystko działa lokalnie na telefonie. Żadne dane nie są nigdzie wysyłane,
nie ma kont ani logowania.

## Wymagania

- **Chrome lub Edge na Androidzie.** Web Bluetooth nie istnieje na iOS ani
  w Firefoksie — to ograniczenie systemu, nie aplikacji.
- **HTTPS.** Przeglądarka udostępnia Bluetooth tylko stronom z bezpiecznego
  kontekstu. Sposoby uruchomienia opisane niżej.
- Bieżnia z BLE. **FitShow musi być całkowicie zamknięty** — Bluetooth LE
  dopuszcza tylko jedno aktywne połączenie z urządzeniem.

## Uruchomienie

### Wariant A — GitHub Pages (docelowy)

Darmowy hosting HTTPS, aplikacja instalowalna na telefonie, działa też offline.
Wymaga konta GitHub; repozytorium na darmowym planie musi być publiczne, żeby
Pages działało.

```bash
git remote add origin https://github.com/TWOJ-LOGIN/ziprun.git
git push -u origin main
```

Następnie w repozytorium: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)` → Save**. Po chwili aplikacja będzie pod
`https://TWOJ-LOGIN.github.io/ziprun/`.

Na telefonie otwórz ten adres w Chrome i wybierz **⋮ → Dodaj do ekranu
głównego** — dostaniesz ikonę i pełny ekran bez paska adresu.

### Wariant B — sieć lokalna, bez publikowania czegokolwiek

Do testów, gdy nie chcesz nic wystawiać do internetu. Komputer i telefon muszą
być w tej samej sieci Wi-Fi.

Na komputerze:

```bash
node tools/serve.js 8787
```

Na telefonie w Chrome wejdź na `chrome://flags`, znajdź
**Insecure origins treated as secure**, wpisz tam adres komputera
(np. `http://192.168.33.17:8787`), przełącz na *Enabled* i zrestartuj Chrome.
Od tej chwili ten adres jest traktowany jak bezpieczny i Bluetooth zadziała.

Minus: działa tylko przy włączonym komputerze w tej samej sieci.

### Wariant C — przeciągnij i upuść

Cloudflare Pages albo Netlify Drop przyjmują cały katalog przez stronę WWW
i od razu dają adres HTTPS. Bez repozytorium i bez publikowania kodu źródłowego.

## Pierwsze uruchomienie — kolejność

1. **Profil.** Ustaw dwie prędkości: *swobodną* (taką, przy której możesz
   rozmawiać) i *szybką* (utrzymasz ją około trzech minut). Wszystkie plany
   liczą się z tych dwóch liczb, więc zawyżone wartości dadzą plan nie do
   wykonania. Sprawdź też limity bezpieczeństwa.
2. **Bieżnia → Wybierz i połącz.** Aplikacja sama rozpozna, czy bieżnia mówi
   standardem FTMS, czy protokołem własnościowym.
3. **Diagnostyka** (opis niżej) — jednorazowo, żeby potwierdzić protokół.
4. **Test sterowania** — zanim wejdziesz na pas.
5. Dopiero potem trening.

## Diagnostyka protokołu

Bieżnie sprzedawane z FitShow używają dwóch różnych języków. Aplikacja obsługuje
oba, ale drugi wymaga jednorazowego rozpoznania.

**FTMS** (`0x1826`) to otwarty standard Bluetooth SIG. Jeśli bieżnia go
udostępnia razem z *Control Pointem*, sterowanie działa od razu — nic nie trzeba
ustawiać.

**Protokół własnościowy** (najczęściej usługa `0xFFF0`) nie jest udokumentowany.
Aplikacja potrafi go podsłuchać i wysyłać ramki, ale numery komend trzeba
odczytać z zachowania konkretnej bieżni.

Procedura:

1. Zakładka **Bieżnia** → *Uruchom diagnostykę*. Aplikacja odczyta całe drzewo
   GATT i zacznie nasłuchiwać.
2. Teraz **ręcznie**, na konsoli bieżni, zmień prędkość kilka razy (np. 3 → 6 →
   9 km/h), potem nachylenie. W logu zobaczysz ramki — bajty, które zmieniają
   się razem z prędkością, to szukane pole.
3. *Eksportuj raport* zapisuje wszystko do pliku tekstowego.
4. Jeśli protokół jest własnościowy, opcode'y wpisuje się w
   [`js/ble/proprietary.js`](js/ble/proprietary.js) w stałej `OPCODES`.
   Pole *ręczna ramka hex* pozwala testować hipotezy na żywo.

## Bezpieczeństwo

Automatyczne sterowanie oznacza, że aplikacja zmienia prędkość pasa pod Twoimi
stopami. Zabezpieczenia w kodzie:

- **Stopniowe rampowanie** — prędkość zmienia się skokami po 0,5 km/h, nigdy
  z 6 na 16 od razu.
- **Zapowiedź wyprzedzająca** — zmiana jest ogłaszana głosem zanim nastąpi,
  a rozpędzanie zaczyna się przed końcem poprzedniego odcinka, żeby na starcie
  interwału pas był już na docelowej prędkości.
- **Twardy limit prędkości i nachylenia** w profilu, dodatkowo ograniczany do
  tego, co bieżnia sama zgłasza jako swój zakres.
- **Reakcja na kluczyk bezpieczeństwa** — wyjęcie kluczyka przerywa trening.
- **Brak komend po zatrzymaniu** — żadna zakolejkowana komenda prędkości nie
  dotrze do bieżni po pauzie ani po stopie.
- **Utrata połączenia** wstrzymuje trening i uruchamia ponowne łączenie.

Mimo to: pierwszy test sterowania rób **stojąc obok pasa, nie na nim**,
z ręką przy wyłączniku.

## Zbadany sprzęt: Zipro Newlite (moduł FS-BT-C1)

Wynik sesji diagnostycznej z 8 września 2026, nazwa BLE `FS-B13AA3`,
producent modułu `FITSHOW`, firmware `V2.6.3`:

| Cecha | Wynik |
|---|---|
| Protokół | **FTMS** (`0x1826`) — standard Bluetooth SIG, nie wymaga reverse-engineeringu |
| Control Point (`0x2AD9`) | jest, `write` + `indicate` |
| Request Control (`0x00`) | potwierdzone — odpowiedź `80 00 01` |
| Stop / Pause (`0x08`) | potwierdzone — odpowiedź `80 08 01` |
| Set Target Speed (`0x02`) | **niepotwierdzone — do przetestowania** |
| Zakres prędkości | 1,0–12,0 km/h, krok 0,1 |
| Nachylenie | **brak** — pochylnia niesterowana i nieobecna fizycznie |
| Dane bieżące | prędkość, dystans, czas, kalorie, tętno (przez pas piersiowy) |

Bieżnia równolegle nadaje ten sam strumień protokołem własnościowym FitShow na
`0xFFF0`, ale jest on w tym przypadku zbędny — FTMS pokrywa wszystko.

Konsekwencje dla planów: górna granica 12 km/h oznacza, że warto ustawić
*tempo szybkie* w okolicach 11 km/h, żeby kotwice `tempo`, `próg` i `VO2max`
nie zlały się w jedną wartość. Plany oparte na pochylni (marsz 12-3-30,
podbiegi) zostały zastąpione odpowiednikami na płaskim — utrzymywanie ich
byłoby udawaniem, że sprzęt potrafi coś, czego nie potrafi.

## Plany treningowe

Czternaście planów, od marszobiegu po interwały norweskie 4×4. Prędkości nie
są zapisane na sztywno — każdy plan przelicza się z Twojego profilu, więc rośnie
razem z formą i nie trzeba go przepisywać.

Poziomy: 1 — łatwe, 2 — średnie, 3 — mocne.

## Struktura

```
index.html            interfejs (widoki jako sekcje)
app.css               ciemny motyw, duża typografia do czytania w ruchu
js/app.js             nawigacja, renderowanie, spięcie całości
js/plans.js           definicje planów i przeliczanie kotwic wysiłku
js/engine.js          maszyna stanów treningu, rampowanie, zapowiedzi
js/speech.js          synteza mowy i blokada wygaszania ekranu
js/storage.js         profil, historia, ustawienia (localStorage)
js/ble/uuids.js       identyfikatory usług i charakterystyk
js/ble/ftms.js        sterownik standardu FTMS
js/ble/proprietary.js sterownik protokołów własnościowych + sniffer
js/ble/diagnostics.js zrzut GATT i eksport raportu
js/ble/manager.js     połączenie, dobór sterownika, rampa prędkości
sw.js                 service worker (działanie offline)
tools/serve.js        lokalny serwer do testów
tools/make-icons.js   generator ikon PWA
```

## Znane ograniczenia

- Brak obsługi iOS i Firefoksa — Web Bluetooth tam nie istnieje.
- Opcode'y protokołu własnościowego wymagają potwierdzenia na konkretnym
  urządzeniu; do tego czasu przy takiej bieżni działa tylko tryb prowadzenia.
- Pasy tętna łączą się tylko przez samą bieżnię; osobne parowanie czujnika
  nie jest jeszcze zaimplementowane.
- Historia trzyma pełne próbki tylko dla dziesięciu ostatnich treningów —
  reszta zostaje w formie podsumowań, żeby nie zapchać pamięci przeglądarki.
