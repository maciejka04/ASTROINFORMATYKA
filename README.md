# Astroinformatyka – interaktywny histogram (React + D3)

## Uruchomienie

```bash
npm install
npm run dev
```

Otwórz adres wypisany przez Vite (domyślnie http://localhost:3000).

## Funkcje

- **Źródła danych** – aplikacja działa na dowolnych linkach podanych przez użytkownika (na start lista
  zawiera jeden przykładowy link do API NASA Exoplanet Archive); kolejne źródła dodaje się,
  wklejając URL do API w polu „Dodaj źródło” (brak `https://` jest uzupełniany). Dodane źródła są
  zapamiętywane w przeglądarce i można je usuwać przyciskiem ✕. Format jest wykrywany automatycznie:
  - JSON – tablica obiektów, tablica tablic (pierwszy wiersz = nagłówek), tablica liczb,
    obiekt kolumnowy `{ kol: [...], kol2: [...] }` (np. Open-Meteo, jednostki z `*_units`),
    tabela zagnieżdżona głębiej (np. `products`, `data.items`), GeoJSON (`features[].properties`);
    zagnieżdżone pola są spłaszczane (`properties.mag`). Gdy w odpowiedzi jest kilka tabel – wybór z listy.
  - NDJSON (jeden obiekt JSON na linię)
  - CSV, TSV, separator `;` lub `|` (wykrywany automatycznie); linie zaczynające się od `#` są pomijane
  - tekst/`.dat` z kolumnami rozdzielonymi spacjami lub tabulatorami (typowe pliki astronomiczne):
    linie `#` to komentarze, ostatnia linia `#` jest nagłówkiem, jeśli ma tyle nazw co kolumn
    (albo pierwsza linia danych z samymi nazwami); w przeciwnym razie kolumny to `col_1…col_n`
  - API bez nagłówków CORS są pobierane automatycznie przez proxy serwera dev (`/proxy?url=…`)
    – takie linki działają tylko w `npm run dev`.
- **Pliki lokalne** – przycisk „Wybierz plik…” albo przeciągnięcie pliku na stronę
  (`.csv`, `.tsv`, `.txt`, `.json`, `.geojson`, `.ndjson`, `.dat`). Plik pojawia się na liście źródeł
  jako „Plik: nazwa”, jest czytany w przeglądarce (działa też po `npm run build`, bez proxy)
  i nie jest zapamiętywany po odświeżeniu strony. Pliki tekstowe są czytane strumieniowo, więc
  działają także pliki > 1 GB (> 1 mln wierszy); postęp widać na pasku pod listą źródeł.
  Pliki JSON są wczytywane w całości (limit 400 MB) – duże dane najlepiej podawać jako CSV/tekst.
- **Wiele kolumn** – na liście „Kolumny” można zaznaczyć dowolnie wiele kolumn liczbowych (pole
  „Szukaj kolumny…” filtruje długą listę). Każda kolumna ma własny kolor i pozycję w legendzie.
  Domyślnie wybierana jest pierwsza kolumna, która nie wygląda na identyfikator (`id`, `source_id`,
  `designation`…) i nie jest stała.
- **Sposób rysowania** – nałożone (półprzezroczyste słupki), skumulowane (jeden na drugim),
  obok siebie (słupki kolumn w każdym przedziale) albo osobne panele ze wspólną osią X.
  Wszystkie kolumny mają te same granice przedziałów, więc tryby można porównywać.
- **Zakresy** – osobny suwak „od/do” dla każdej rysowanej kolumny (do obcinania wartości odstających);
  oś X obejmuje sumę zakresów. Zaznaczenie myszą na wykresie (brush) ustawia ten sam zakres
  dla wszystkich rysowanych kolumn. Pole „Pomijaj wartości” (np. `-100, -999`) usuwa znaczniki
  braku danych ze wszystkich kolumn; puste pola i `nan`/`NA`/`null` są zawsze pomijane.
- Liczba przedziałów (suwak lub automatycznie – reguła Freedmana–Diaconisa), skala lin/log osi X.
- **Eksport wykresu** – pobranie histogramu (z legendą) jako plik SVG.
- Statystyki dla każdej kolumny (N, średnia, mediana, odch. std., min, max) i podgląd
  pierwszych 20 wierszy tabeli.

## Duże pliki – jak to działa

Plik jest czytany w Web Workerze (`file.stream()` + `TextDecoder`, linia po linii), więc strona się
nie zawiesza, a limit długości napisu w JS nie ma znaczenia. Kolumny liczbowe są przechowywane jako
`Float64Array` (brak danych = `NaN`), kolumny tekstowe tylko w podglądzie. Przedziały są liczone
prostą pętlą po tablicach typowanych, bez ponownego parsowania – zmiana kolumn, trybu, zakresów czy
liczby przedziałów przelicza tylko histogram. Pamięć: ok. 8 bajtów × wiersze × kolumny liczbowe
(np. 1,3 mln wierszy × 65 kolumn ≈ 650 MB).

Duże pliki danych `CMC_MPOP_*.dat` są w `.gitignore`, żeby nie trafiły przypadkiem do repozytorium.

## Struktura

- `src/data.js` – źródła i pobieranie (proxy CORS), wykrywanie formatu, tabele z JSON-a
- `src/textParser.js` – strumieniowy parser CSV/TSV/tekstu kolumnowego (`#` komentarze/nagłówek)
- `src/columns.js` – budowanie kolumn `Float64Array`
- `src/parser.worker.js`, `src/loadData.js` – parsowanie w Web Workerze (postęp, przerwanie)
- `src/binning.js` – zakresy, przedziały, statystyki, reguła F-D na tablicach typowanych
- `src/Histogram.jsx` – histogram w D3 (tryby, legenda, osie, tooltip, brush)
- `src/ColumnPicker.jsx` – wybór wielu kolumn
- `src/RangeFilter.jsx` – suwak zakresu „od/do”
- `src/App.jsx` – stan aplikacji i panel sterowania
