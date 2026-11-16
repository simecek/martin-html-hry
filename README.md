# Martinovy HTML hry

Jednoduché hry pro výuku HTML, CSS a JavaScriptu, bez instalace a knihoven.

- `index.html`: rozcestník her.
- `jablka.html`: chytání jablek. Drž A/D nebo tlačítka pod hřištěm. Enter začne novou hru.
- `snake.html`: had ovládaný šipkami na klávesnici.

Otevři `index.html` v prohlížeči. Po úpravě soubor ulož a stránku obnov.

Testy jablek spustíš pomocí Node.js:

```sh
node --test tests/jablka.test.cjs
```

`assets/kolizni-masky.js` obsahuje masky průhlednosti obrázků při herní velikosti 80×80 a 32×32 pixelů. Při výměně nebo změně velikosti obrázků je potřeba masky aktualizovat.

GitHub Pages zveřejňuje statické soubory z kořene větve `main`.
