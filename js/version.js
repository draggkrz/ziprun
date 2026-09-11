// Jedno źródło prawdy o wersji aplikacji.
//
// Stąd bierze ją nagłówek, historia zmian, nazwa pamięci podręcznej service
// workera oraz nagłówki raportów diagnostycznych i zapisów treningu. Dzięki
// temu przy analizie logu zawsze wiadomo, która wersja go wyprodukowała.
//
// Podnosząc wersję, dopisz wpis na początku CHANGELOG — kolejność malejąca.
//
// ZASADA: każda zmiana widoczna dla użytkownika podnosi numer. Bez wyjątków
// typu "to jeszcze nie jest wypchnięte, więc dopiszę do poprzedniej wersji" —
// taki wyjątek raz już doprowadził do sześciu commitów pod jednym numerem.

export const VERSION = '1.7.2';

export const CHANGELOG = [
  {
    version: '1.7.2',
    date: '2026-09-11',
    title: 'Aktualizacje docierają na telefon',
    changes: [
      'Podniesienie wersji nie wyzwalało wymiany plików w telefonie. Sam sw.js nie zmieniał się między wydaniami — zmieniał się tylko importowany numer wersji — a przeglądarka porównuje bajty sw.js i uznawała, że nie ma czego aktualizować.',
      'Numer wersji trafia teraz do adresu skryptu, więc każde wydanie jest wykrywane. Importy nie są już brane z pamięci HTTP przy sprawdzaniu aktualizacji.',
      'W Profilu, w sekcji „O aplikacji”, przybył przycisk „Pobierz aplikację od nowa” — czyści pamięć podręczną bez naruszania profilu, historii i zapisów technicznych.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-09-11',
    title: 'Kosmetyka ekranu treningu w poziomie',
    changes: [
      'Zniknął stały napis „Tryb prowadzenia — prędkość ustawiasz ręcznie”. Informacja pojawia się teraz raz, na starcie, jako powiadomienie.',
      'Dystans i kalorie wyraźnie powiększone — to liczby, na które zerka się w biegu.',
      'Prawa kolumna w orientacji poziomej scalona w jeden blok wyśrodkowany w pionie. Wcześniej jej wiersze rozciągała wysokość pierścienia obok i odstępy między nimi robiły się ogromne.',
      'Obie kolumny centrują się względem tego samego pasa, więc układ nie jest już przekrzywiony. Pierścienie powiększone.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-11',
    title: 'Tryb kompaktowy ekranu treningu',
    changes: [
      'Nowy domyślny wygląd treningu: duże odliczanie odcinka i duża prędkość, jeden wiersz z dystansem, kaloriami i czasem do końca. Bez przycisków sterowania — prędkość i zatrzymanie obsługujesz z panelu bieżni.',
      'Pierścień ma teraz dwa obwody: pomarańczowy odlicza bieżący odcinek, zielony wypełnia się postępem całego treningu. Zastępuje to osobny pasek postępu.',
      'Pełny panel z korektami ±0,5 km/h, pauzą i przeskokiem odcinka jest nadal dostępny: mała ikona w prawym górnym rogu ekranu treningu przełącza w obie strony, to samo ustawienie jest w Profilu.',
      'Nagłówek pokazuje numer odcinka, na przykład „odcinek 3 z 28”.',
      'Przycisk „Zakończ trening” zostaje w obu trybach — gdy zatrzymasz pas z konsoli, aplikacja wchodzi w pauzę i trzeba jej powiedzieć, że to koniec.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-11',
    title: 'Orientacja pozioma w trakcie treningu',
    changes: [
      'Aplikacja obraca się razem z telefonem — nie jest już zablokowana w pionie. Orientacja nie jest wymuszana: decydujesz, jak trzymasz telefon.',
      'Ekran treningu w poziomie przestawia się na dwie kolumny: pierścień odliczania po lewej, prędkość, liczby i sterowanie po prawej. Wszystko mieści się bez przewijania.',
      'W poziomie pasek górny i zakładki chowają się na czas treningu, żeby oddać miejsce — wracają po jego zakończeniu.',
      'Pozostałe widoki w poziomie działają jak dotąd.',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-09-11',
    title: 'Poprawiony wykres w podsumowaniu',
    changes: [
      'Przebieg prędkości wychodził poza kartę i uciekał za krawędź ekranu. Półgodzinny trening dawał ponad tysiąc słupków, a mieści się ich około stu dwudziestu.',
      'Przy okazji wyszło, że silnik zbierał czterokrotnie za dużo próbek — po cztery na każdy pięciosekundowy odcinek, z powtórzonymi znacznikami czasu. Teraz jedna próbka co pięć sekund, zgodnie z zamysłem.',
      'Wykres uśrednia próbki do liczby słupków, która zmieści się w karcie, zachowując kształt przebiegu.',
    ],
  },
  {
    version: '1.5.3',
    date: '2026-09-11',
    title: 'Ekran nadąża za bieżnią',
    changes: [
      'Pas zmienia prędkość kilka sekund przed końcem odcinka, żeby interwał zaczynał się już na docelowym tempie — ale ekran o tym milczał i przez te sekundy pokazywał poprzedni etap.',
      'W trakcie zmiany pojawia się teraz wyraźny pasek „Rozpędzam do…” albo „Zwalniam do…” z odliczaniem do nowego odcinka.',
      'Prędkość docelowa pokazuje w tym czasie wartość, do której pas zmierza, zamiast celu kończącego się odcinka.',
      'Samo zachowanie bieżni bez zmian — wyprzedzenie jest celowe i korzystne dla treningu.',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-09-11',
    title: 'Zapis obejmuje zatrzymanie pasa',
    changes: [
      'Zapis techniczny kończył się, zanim aplikacja zdążyła wysłać bieżni komendę zatrzymania — w logu z prawdziwego treningu ostatni pomiar pokazywał jadący pas, a potwierdzenia zatrzymania w ogóle nie było.',
      'Rejestrator jest teraz zamykany dopiero po wysłaniu komendy i czeka, aż pas faktycznie zwolni do zera — w zapisie widać całe hamowanie i potwierdzenie z bieżni.',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-09-09',
    title: 'Sprzątanie profilu',
    changes: [
      'Usunięte pola „Wiek" i „Masa ciała". Wiek nie był używany do niczego, a masa tylko awaryjnie, gdy bieżnia nie raportuje kalorii — Twoja raportuje je sama. Formularz sugerował wpływ na trening, którego nie miał.',
      'Prędkości nigdy nie zależały od wieku ani wagi, tylko od trzech temp w profilu. Tak samo działa FitShow.',
      'Usunięte dwie nieużywane wartości w ustawieniach wewnętrznych.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-09',
    title: 'Plan spalania tłuszczu z FitShow',
    changes: [
      'Nowy plan „Spalanie tłuszczu 30 min" — odtworzony co do sekundy z aplikacji FitShow: pięć bloków biegowych 8–9 km/h przeplatanych marszem.',
      'To jedyny plan z prędkościami wpisanymi wprost, a nie przeliczanymi z profilu. Korekta ±0,5 km/h w trakcie treningu działa na nim tak samo jak na pozostałych.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-09',
    title: 'Wersjonowanie i historia zmian',
    changes: [
      'Numer wersji widoczny obok nazwy aplikacji — dotknięcie otwiera historię zmian.',
      'Nazwa pamięci podręcznej bierze się z numeru wersji, więc nowa wersja sama zastępuje starą.',
      'Powiadomienie po aktualizacji, z odnośnikiem do listy zmian.',
      'Numer wersji trafia do nagłówków raportu diagnostycznego i zapisu treningu.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-09',
    title: 'Zapis techniczny treningu',
    changes: [
      'Każdy trening jest rejestrowany: komendy wysłane do bieżni, jej odpowiedzi, statusy, przejścia odcinków, ostrzeżenia i rozłączenia.',
      'Pomiary raz na sekundę: prędkość faktyczna i docelowa, dystans, kalorie, tętno, nazwa odcinka.',
      'Eksport do pliku tekstowego z podsumowania treningu albo z zakładki Historia. Tabela pomiarów w formacie CSV.',
      'Dwie osie czasu w pomiarach: od naciśnięcia Start i od chwili, gdy pas ruszył. Różnica między nimi to odliczanie konsoli bieżni.',
      'Przechowywane są trzy ostatnie treningi.',
      'Poprawka: komunikat o korekcie prędkości używał kropki dziesiętnej zamiast przecinka.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-08',
    title: 'Zgodność z odliczaniem bieżni',
    changes: [
      'Po komendzie Start bieżnia odlicza kilka sekund na własnej konsoli. Zegar treningu rusza teraz dopiero, gdy pas faktycznie jedzie — wcześniej pierwszy odcinek tracił te sekundy, a zapowiedzi leciały do stojącego biegacza.',
      'Czas rozmowy z bieżnią i rozpędzania pasa nie jest już naliczany jako czas treningu.',
      'Bieżnia zeruje własny licznik dystansu po zatrzymaniu pasa. Dystans jest teraz sumą przyrostów, więc zatrzymanie pasa z konsoli w środku treningu nie kasuje całego przebiegu.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-08',
    title: 'Dostosowanie do bieżni Zipro Newlite',
    changes: [
      'Diagnostyka wykazała brak sterowanej pochylni i zakres prędkości 1–12 km/h.',
      'Plany oparte na pochylni zastąpione odpowiednikami na płaskim: Marszobieg 40 min i Interwały progowe 5 × 5.',
      'Domyślny profil dopasowany do zakresu 1–12 km/h, żeby górne kotwice intensywności nie zlewały się w jedną wartość.',
      'Ekran treningu ukrywa kafelek nachylenia i przyciski ±1%, gdy bieżnia nie ma pochylni. W ich miejsce średnia prędkość.',
      'Poprawka: ostrzeżenie o braku pochylni nigdy się nie pokazywało, bo sprawdzało segmenty już przycięte do zera.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-08',
    title: 'Pierwsza wersja',
    changes: [
      'Czternaście planów treningowych skalowanych z profilu użytkownika.',
      'Automatyczne sterowanie prędkością przez standard FTMS, ze stopniowym rampowaniem i zapowiedzią wyprzedzającą.',
      'Sterownik protokołów własnościowych ze snifferem ramek, dla bieżni bez FTMS.',
      'Diagnostyka GATT z eksportem raportu.',
      'Zapowiedzi głosowe po polsku, blokada wygaszania ekranu.',
      'Historia treningów, profil i ustawienia w pamięci telefonu.',
      'Działanie offline i instalacja na ekranie głównym.',
    ],
  },
];

export const currentEntry = () => CHANGELOG.find((e) => e.version === VERSION) ?? CHANGELOG[0];
