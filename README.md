# Astroinformatyka – interaktywny histogram (React + D3)

## Uruchomienie

```bash
npm install
npm run dev
```

Otwórz adres wypisany przez Vite (domyślnie http://localhost:3000).

## Funkcje

- **Źródła danych** – na start jest przykładowe API NASA Exoplanet Archive; kolejne źródła dodaje się,
  wklejając URL do API w polu „Dodaj źródło” (brak `https://` jest uzupełniany). Dodane źródła są
  zapamiętywane w przeglądarce i można je usuwać przyciskiem ✕. Format jest wykrywany automatycznie:
  - JSON – tablica obiektów, tablica tablic (pierwszy wiersz = nagłówek), tablica liczb,
    obiekt kolumnowy `{ kol: [...], kol2: [...] }` (np. Open-Meteo, jednostki z `*_units`),
    tabela zagnieżdżona głębiej (np. `products`, `data.items`), GeoJSON (`features[].properties`);
    zagnieżdżone pola są spłaszczane (`properties.mag`). Gdy w odpowiedzi jest kilka tabel – wybór z listy.
  - NDJSON (jeden obiekt JSON na linię)
  - CSV, TSV, separator `;` lub `|` (wykrywany automatycznie)
  - API bez nagłówków CORS są pobierane automatycznie przez proxy serwera dev (`/proxy?url=…`).
- **Wybór kolumny** – lista kolumn liczbowych wykrywanych automatycznie; zmiana kolumny,
  liczby przedziałów, skali (lin/log) lub przełączenie na automatyczny dobór przedziałów (reguła Freedmana–Diaconisa) od razu przerysowuje wykres.
- **Filtr zakresu** – suwaki i pola „od/do” albo zaznaczenie zakresu myszą na wykresie (brush).
- **Eksport wykresu** – możliwość pobrania wygenerowanego histogramu do pliku wektorowego SVG jednym kliknięciem.
- Statystyki (N, średnia, mediana, odch. std., min, max) i podgląd tabeli danych.

## Struktura

- `src/data.js` – pobieranie i parsowanie danych (JSON/CSV), wykrywanie kolumn liczbowych
- `src/Histogram.jsx` – histogram w D3 (osie, przedziały, tooltip, brush)
- `src/RangeFilter.jsx` – filtr zakresu
- `src/App.jsx` – stan aplikacji i panel sterowania
