# Interaktywny Histogram D3 (Astroinformatyka)

Aplikacja webowa do interaktywnej eksploracji, filtracji i wielowymiarowej wizualizacji danych tabelarycznych oraz astrofizycznych z wykorzystaniem biblioteki **D3.js** i frameworka **React**.

---

## Wymagania systemowe

* **Node.js**: wersja `>= 18.0.0`
* **npm**: wersja `>= 9.0.0`

---

## Wykorzystane technologie i biblioteki

### Główne zależności (`dependencies`):
* **React** (`^18.3.1`) & **React-DOM** (`^18.3.1`) - warstwa interfejsu użytkownika, reaktywne zarządzanie stanem aplikacji.
* **D3.js** (`^7.9.0`) - silnik wizualizacji danych (skale liniowe i logarytmiczne, generowanie osi, dynamiczne przeliczanie przedziałów, selekcja obszarowa `d3-brush`, renderowanie wektorowe SVG).

### Narzędzia deweloperskie (`devDependencies`):
* **Vite** (`^5.4.11`) - bundler i lokalny serwer deweloperski z wbudowanym proxy HTTP.
* **@vitejs/plugin-react** (`^4.3.4`) - integracja React z mechanizmem Fast Refresh w Vite.

---

## Instalacja i uruchomienie

1. Klonowanie repozytorium lub przejście do katalogu projektu:
   ```bash
   cd ASTROINFORMATYKA
   ```

2. Instalacja zależności:
   ```bash
   npm install
   ```

3. Uruchomienie lokalnego serwera deweloperskiego:
   ```bash
   npm run dev
   ```
   Aplikacja będzie dostępna pod adresem: `http://localhost:3000` (lub wskazanym przez terminal).

4. Budowanie wersji produkcyjnej:
   ```bash
   npm run build
   ```

---

## Główne funkcjonalności

1. **Pobieranie i wczytywanie danych:**
   * **Zdalne API:** obsługa dowolnych zapytań HTTP GET zwracających dane tabelaryczne (domyślnie podpięte API NASA Exoplanet Archive).
   * **Automatyczne obejście blokad CORS:** wbudowane proxy serwera Vite (`/proxy?url=...`) umożliwia pobieranie danych z zewnętrznych endpointów bez ograniczeń przeglądarki.
   * **Obsługa plików lokalnych:** mechanizm przeciągnij i upuść (*Drag & Drop*) lub przycisk wyboru pliku.
   * **Wielkoformatowe pliki tekstowe:** asynchroniczne czytanie strumieniowe (`ReadableStream` / `TextDecoder`) w osobnym wątku (**Web Worker**). Dane numeryczne są parsowane bezpośrednio do tablic `Float64Array`, co zapobiega blokowaniu interfejsu użytkownika (UI) nawet przy plikach rzędu 150-200 MB i setkach tysięcy wierszy.
   * **Obsługiwane formaty:** JSON (płaski, zagnieżdżony, obiekt kolumnowy), NDJSON, CSV, TSV oraz pliki `.dat` (astronomiczny format kolumnowy rozdzielany białymi znakami, z komentarzami `#`).

2. **Interaktywna wizualizacja (D3.js):**
   * Wybór jednej lub wielu kolumn liczbowych jednocześnie.
   * Tryby nakładania serii danych: **nałożone**, **skumulowane**, **obok siebie** oraz **osobne panele**.
   * Wybór liczby przedziałów (*bins*): ręczny suwak lub automatyczny algorytm oparty na **regule Freedmana-Diaconisa**.
   * Przełączanie skali osi X między **liniową** a **logarytmiczną**.
   * Interaktywny pędzel (*brush*): zaznaczanie myszą zakresu bezpośrednio na wykresie.
   * Tooltipy z dokładną liczbą zliczeń po najechaniu na słupki.
   * Eksport wykresu do wektorowego formatu **SVG**.

3. **Filtracja i analiza statystyczna:**
   * Niezależne suwaki zakresu wartości dla każdej wybranej kolumny.
   * Pomijanie wartości odstających lub znaczników braku danych (np. `-100`, `-999`, wartości zmiennoprzecinkowe) z uwzględnieniem tolerancji numerycznej.
   * Tabela ze statystykami wyliczonymi w czasie rzeczywistym: liczność (*N*), średnia, mediana, odchylenie standardowe, minimum i maksimum.
   * Podgląd pierwszych 20 wierszy surowych danych.

---

## Architektura projektu

```text
├── CMC_MPOP_n100k_T0.dat   # Przykładowy duży plik danych astronomicznych (model populacji)
├── index.html              # Główny szablon HTML aplikacji
├── package.json            # Zależności i skrypty
├── vite.config.js          # Konfiguracja Vite oraz middleware proxy CORS
└── src/
    ├── main.jsx            # Punkt wejścia React
    ├── App.jsx             # Główny komponent widoku i zarządzanie stanem
    ├── App.css             # Style interfejsu użytkownika
    ├── Histogram.jsx       # Renderowanie i interakcje wykresu D3 (SVG, osie, brush)
    ├── ColumnPicker.jsx    # Komponent wyboru kolumn do analizy
    ├── RangeFilter.jsx     # Komponent suwaków zakresu danych
    ├── binning.js          # Obliczenia statystyczne i algorytmy podziału na przedziały
    ├── columns.js          # Zarządzanie strukturami danych Float64Array
    ├── data.js             # Logika pobierania, proxy oraz detekcji formatu danych
    ├── loadData.js         # Zarządzanie komunikacją z Web Workerem
    ├── textParser.js       # Strumieniowy parser tekstu i separatorów
    └── parser.worker.js    # Web Worker do parsowania w tle
```
