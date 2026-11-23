# The Spread of Religion, Every Year (1500 BC – 2025) · interactive map

**Open it: https://fansist.github.io/religion-map/**

The largest religion in each place, every year from 1500 BC to 2025: the interactive companion to the video
*The Spread of Religion, Every Year*. Drag the slider to any year, or press Play.

- **Speed:** "As in the film" plays at the video's own pace (slow where much happens); the others move a set number of
  years a second.
- **View:** "Follow the film" uses the video's camera, which moves to where things are happening; "Whole world" keeps
  the whole map in view.
- **Names** can be hidden, and **Detail: Sharp** draws at 2560×1440 instead of 1600×900 (slower).
- The address keeps the year and the view (`#y=1200&v=world`), so a link opens the same map.

## How to read it

- Each place is coloured by its **largest** religion, branches told apart where the sources allow (Catholic,
  Orthodox, Lutheran, Sunni schools of law and so on). Striped areas: two religions within a few points of each other.
- **Hatched shapes** are communities, not majorities (for example the Jews of Babylon, the Parsis, the Copts): a
  religion that lived in a place without being its largest.
- A change is drawn from the first date a source gives to the date it says the new religion was the majority.
- **The panel on the right:** before 1900 an estimate of how many people lived where each religion was the largest
  (not a count of believers); from 1900, estimated followers (Center for the Study of Global Christianity); between
  AD 40 and 400, Rodney Stark's estimate of Christians in the Roman Empire.

## Sources and credits

Every date and place comes from the works listed in [SOURCES.md](SOURCES.md).

- Base map and towns: [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- People before 1900: Our World in Data, population (HYDE 3.3 to 1799 and Gapminder to 1949, both CC BY 4.0; UN
  World Population Prospects 2024 after, CC BY 3.0 IGO), shared out inside each country by where its towns are today
  (Natural Earth populated places). An estimate.
- Followers: Rodney Stark's estimates of Christians in the Roman Empire (AD 40–350, as quoted in source S4); Center
  for the Study of Global Christianity (1900–2025).
- Typeface: [Inter](https://rsms.me/inter/) by The Inter Project Authors, SIL Open Font License 1.1
  (`fonts/LICENSE-Inter.txt`).

## What is here

| File | What it is |
| --- | --- |
| `index.html`, `app.js` | the page: the slider, play, the views |
| `bundle.js` | the video's own map renderer (canvas), unchanged except for the page's hooks |
| `data/film.js` | each place's religion through time, the names, the words and the people estimate |
| `data/land.js`, `data/prov.js` | the coastlines and the places (from Natural Earth) |
| `fonts/` | Inter, cut down to the letters the map uses |

The page is static: GitHub Pages serves it from the `main` branch as it is.
