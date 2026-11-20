# Kannapolis Citizen-built Dashboard

An open-data dashboard for **Kannapolis, North Carolina**, built by a resident for residents: who lives here, how the city is growing, how land is zoned, how the budget and debt work, what's happening, and who to contact.

**▶ Open the dashboard: https://bradspry.github.io/kannapolis-dashboard/**

It's **one self-contained HTML file** built by a small Python script. No Node, no venv, nothing to install.

[![The dashboard's home screen: widget tiles for paying a utility bill, the Cannon Ballers schedule, police and fire (with 911 buttons), news, meetings, weather, City Council, events, City staff, residents, budget, debt, gauges and land use, with a dock of widget icons along the bottom](docs/dashboard.jpg)](https://bradspry.github.io/kannapolis-dashboard/)

## Quick start

```bash
python3 etl/run_all.py          # fetch all data and build dist/index.html
open dist/index.html            # or double-click it
./serve.sh                      # view it on your phone too (same Wi-Fi)
```

- `python3 etl/run_all.py site`: rebuild the page only (instant, no downloads)
- `python3 etl/run_all.py meetings news events weather site`: refresh the time-sensitive widgets, then rebuild
- Steps: `budget census council meetings events weather news org zoning property site` (`property` takes 5–30 min; the county GIS server is slow)

**Requirements:** Python 3.10+ for the data steps (standard library only). Building and serving also work on macOS's built-in Python 3.9.

**Settings:** copy `.env.example` to `.env` (git-ignored).

| Setting | Purpose |
|---|---|
| `KDASH_CONTACT` | Your name and email, sent in the User-Agent of every data request so publishers know who is harvesting |
| `CENSUS_API_KEY` | Optional, [free](https://api.census.gov/data/key_signup.html); adds an income-over-time chart |

## Using the dashboard

The home screen is a grid of widget tiles. **Tap a tile, or an icon in the dock, to open the full widget in a window.** Links like `#budget` open a window directly.

**Edit** lets you:
- **Resize** tiles: S, M, L, XL. Bigger sizes show more detail; XL shows as L on phones.
- **Rearrange** tiles by dragging. On a phone, drag the ⠿ handle; with a keyboard, focus the handle and use the arrow keys.
- **Hide or restore** tiles.
- **Add blank space**: an invisible tile, resizable and draggable like the others, for leaving gaps in the layout. Its “–” deletes it.

Your layout is saved in your browser. While `./serve.sh` is running, **Save as default home page** writes it to `data/manual/home_layout.json`, the home page for every visitor once committed. **Reset layout** returns to the default.

## Testing on your phone

```bash
./serve.sh
```

It prints the address to open on your phone (for example `http://192.168.1.20:5180`). Each page load rebuilds first if anything in `site/` or `data/` changed, so **just reload the phone to see edits**.

`serve.sh` uses macOS's built-in, Apple-signed Python because the macOS firewall silently blocks phone connections to unsigned programs (Homebrew Python or Node). You can also AirDrop `dist/index.html` to the phone.

## Widgets and sources

| Widget | Source | Updated |
|---|---|---|
| Kannapolis Police | [KPD web page](https://www.kannapolisnc.gov/KPD): 911 and non-emergency numbers, online services, notices; serious-crime counts from KPD's quarterly crime reports (PDFs) | **By hand**: `data/manual/kpd.json`, `kpd_part1_crimes.csv`, `kpd_quarterly.csv` (checked against each report's total) |
| Kannapolis Fire Department | [KFD web pages](https://www.kannapolisnc.gov/kfd): 911 and KFD numbers, free resident programs, after-a-fire forms, the five stations (mapped with the Census geocoder; nearest-station finder runs on the device) | **By hand**: `data/manual/kfd.json` |
| Kannapolis Cannon Ballers | Team's [2027 schedule](https://img.mlbstatic.com/milb-images/image/upload/milb/kljjd0xd8n8fto71x49u.pdf) (image PDF): next home game, home stands, month calendars, add-to-calendar | **By hand**: `data/manual/cannonballers_2027.csv` (checked: 132 games, 66 home) |
| Pay Utility Bill | City [Customer Service & Utility Billing](https://www.kannapolisnc.gov/customer-service): every way to pay, card-fee and due-date calculators (on device), help | **By hand**: `data/manual/utility_billing.json` |
| Parks & Recreation | City [Parks & Recreation](https://www.kannapolisnc.gov/parksandrec) pages: park finder by amenity with map and on-device nearest park, shelters, sports sign-up, greenways, seasonal attractions, rules | **By hand**: `data/manual/parks.json` (map locations: Census geocoder, Cabarrus County GIS) |
| The Gem Theatre | [gem-theatre.com](https://gem-theatre.com/Tickets) ticket page (scraped; adapted from kannapolis-movies): now showing, coming soon, special screenings, prices, policies | Automatic, daily |
| The Swanee Theatre | Swanee's public [events feed](https://swaneetheatre.com/events/) (WordPress Events Calendar API), [weekly happenings](https://swaneetheatre.com/weekly-happenings/), [rental info](https://swaneetheatre.com/rent-the-swanee/) | Shows: automatic, daily. Weekly/rental: **by hand** (`data/manual/swanee.json`) |
| Made in Kannapolis | Featured maker: [Old Armor Beer Company](https://www.oldarmorbeer.net) (veteran-owned brewery, 211 West Ave): beers, taproom hours with open-now (on device), Pay It Forward board, contact | **By hand**: `data/manual/made.json` |
| Kannapolis Reads and Weaves | [Editions Coffee Shop & Bookstore](https://www.editionsbookstore.com): [new arrivals](https://www.editionsbookstore.com/page/NewArrivals), [events](https://www.editionsbookstore.com/page/events), [coffee](https://www.editionsbookstore.com/page/CoffeeShop), [yarn](https://www.editionsbookstore.com/page/yarn); store and drive-thru open-now (on device) | Books, events: automatic, daily (10 s between requests, per the site's robots.txt). Coffee, yarn, hours: **by hand** (`data/manual/editions.json`) |
| Weather | [National Weather Service](https://www.weather.gov/) API: forecast, hourly, alerts, and observations from Concord Regional Airport | **Live** in the browser every 15 min (daily backup copy) |
| Gauges | Derived from the budget, audit and Census data below | Automatic |
| People | U.S. Census ACS 5-year via [Census Reporter](https://censusreporter.org/profiles/16000US3735200-kannapolis-nc/) | Automatic |
| Growth & property | [Cabarrus County GIS open data](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData) (current and yearly snapshots) | Automatic |
| Land use & zoning | Cabarrus County GIS, *Kannapolis Zoning* | Automatic |
| Budget & debt | City budget ordinances, budget books and audited financial reports (PDFs) | **By hand**: [`data/manual/README.md`](data/manual/README.md) |
| Debt service | FY 2026–27 adopted budget, loan by loan, checked against the ordinance totals | **By hand**: `data/manual/debt_service_fy2027.csv` |
| City news | The City's [news page](https://www.kannapolisnc.gov/news) | Automatic, daily |
| Upcoming events | The City's [events calendar](https://www.kannapolisnc.gov/Community/Calendar) RSS feed; repeating events merged (meetings never are) | Automatic, daily |
| Public meetings | The City's [CivicClerk portal](https://kannapolisnc.portal.civicclerk.com) API, with agendas | Automatic, daily |
| City Council | [City Council page](https://www.kannapolisnc.gov/citycouncil) | **By hand**: `data/manual/council.csv`, photos in `site/photos/council/` |
| Who runs the City | The City's 2026 org chart and staff directory | **By hand**: `data/manual/org_chart.json`, photos in `site/photos/staff/` |

### Official sources

Every hand-entered number in `data/manual/*.csv` has a `source` citation and a `source_url` that opens the official PDF at the cited page (for example `…FY%2027%20Adopted%20Budget.pdf#page=114`). The build fails if a row's citation is missing. The full registry is [`data/manual/sources.csv`](data/manual/sources.csv); its `widgets` column ties each source to the widgets it feeds, and every widget window ends with an automatic **Sources** line built from it:

| Source | Publisher | Format | Used for |
|---|---|---|---|
| [FY 2026-27 Budget Ordinance (adopted June 22, 2026)](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Budget%20Ordinance%20FY%202027.pdf) | City of Kannapolis | PDF | Budget & debt; fund totals; tax rate; debt service totals |
| [FY 2026-27 Adopted Budget Document](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Finance/Documents/FY%2027%20Adopted%20Budget.pdf) | City of Kannapolis | PDF | Debt service schedule (PDF pp. 114, 157, 163); debt policy (p. 48) |
| [FY 2025-26 Adopted Budget Document](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Finance/Documents/Budget/FY%2026%20-%20FINAL%20Budget%20Document.pdf) | City of Kannapolis | PDF | General Fund history (p. 110); tax rate and assessed value history (pp. 255-256) |
| [Annual Comprehensive Financial Report, fiscal year ended June 30, 2025](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Finance/Documents/Annual%20Financial%20Report/City%20of%20Kannapolis%20-%202025%20Audit%20Report.pdf) | City of Kannapolis | PDF | Outstanding debt (Table 10, p. 217), legal debt margin (Table 12, p. 219), population (Table 14, p. 221) |
| [City of Kannapolis 2026 Organizational Chart](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Administration/Documents/Kannapolis%202026%20Organizational%20Restructuring_pdf%20(Real%20Estate%20Flyer)%20(3).png?ver=KPxbJgZQ_avWU5oc4CTq3Q%3d%3d) | City of Kannapolis | PNG | Who runs the City |
| [Administration Staff Directory](https://www.kannapolisnc.gov/Government-Departments/Administration/Staff-Directory) | City of Kannapolis | Web page | Staff emails and phones |
| [City Council](https://www.kannapolisnc.gov/citycouncil) | City of Kannapolis | Web page | City Council names, emails, phones, photos |
| [City News](https://www.kannapolisnc.gov/news) | City of Kannapolis | Web page | City news |
| [Upcoming Events (RSS)](https://www.kannapolisnc.gov/DesktopModules/Events/EventRSS.aspx?mid=650&tabid=56) | City of Kannapolis | RSS | Upcoming events |
| [Public meetings portal (CivicClerk) and its API](https://kannapolisnc.portal.civicclerk.com) | City of Kannapolis | JSON API | Public meetings, agendas and minutes |
| [American Community Survey 2020-2024 5-year estimates: Kannapolis city, NC](https://data.census.gov/profile/Kannapolis_city,_North_Carolina?g=160XX00US3735200) | U.S. Census Bureau | CSV | People; homeowners gauge |
| [Census Reporter profile and API (ACS tables B01001, B01002, B01003, B03002, B08301, B15003, B17001, B19013, B25003, B25064, B25077)](https://censusreporter.org/profiles/16000US3735200-kannapolis-nc/) | Census Reporter (U.S. Census Bureau data) | CSV | People (the API this dashboard calls) |
| [Tax Parcels (current)](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Tax_Parcels/MapServer/1) | Cabarrus County GIS | ArcGIS REST | Growth & property |
| [Historical parcel and boundary snapshots (Historical_YYYY services)](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData) | Cabarrus County GIS | ArcGIS REST | Growth & property history |
| [Municipal Districts (city limits)](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/MunicipalDistrict/MapServer/0) | Cabarrus County GIS | ArcGIS REST | City boundary and area |
| [Zoning by Municipalities: Kannapolis Zoning](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/3) | Cabarrus County GIS | ArcGIS REST | Land use & zoning |
| [Election results: City of Kannapolis Parks and Recreation Bonds Referendum, Nov 3, 2026 (No 10,134 / Yes 7,534; 17 of 17 precincts)](https://er.ncsbe.gov/contest_details.html?election_dt=11/03/2026&county_id=0&contest_id=800012) | NC State Board of Elections | Web page | Debt service note on the parks bond |
| [National Weather Service forecast, hourly forecast, alerts and observations for Kannapolis (api.weather.gov)](https://forecast.weather.gov/MapClick.php?lat=35.4874&lon=-80.6217) | National Weather Service | JSON API | Weather (live in the browser) |
| [Kannapolis Police Department web page](https://www.kannapolisnc.gov/KPD) | City of Kannapolis | Web page | Police contacts, services, accreditation notice |
| [2026 First Quarter Crime Report (Kannapolis Police)](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Police/Documents/Quarterly%20Reports/2026%20First%20Quarter%20Report.pdf) | City of Kannapolis | PDF | Police crime statistics, Jan–Mar 2026 (p. 4) |
| [2026 Second Quarter Crime Report (Kannapolis Police)](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Police/Documents/2026%20Second%20Quarter%20Crime%20Report.pdf) | City of Kannapolis | PDF | Police crime statistics, Apr–Jun 2026 (p. 4) |
| [Kannapolis Fire Department web pages (overview, operations, community risk reduction, staff directory)](https://www.kannapolisnc.gov/kfd) | City of Kannapolis | Web page | Fire contacts, free programs, stations, forms |
| [U.S. Census Bureau Geocoder](https://geocoding.geo.census.gov/) | U.S. Census Bureau | JSON API | Map locations of the five fire stations |
| [2027 Kannapolis Cannon Ballers Schedule](https://img.mlbstatic.com/milb-images/image/upload/milb/kljjd0xd8n8fto71x49u.pdf) | Kannapolis Cannon Ballers (Minor League Baseball) | PDF | Cannon Ballers 2027 schedule |
| [Customer Service & Utility Billing (how to pay, fees, payment terms)](https://www.kannapolisnc.gov/customer-service) | City of Kannapolis | Web page | Pay Utility Bill |
| [Census Data API: ACS 5-year detailed tables (used for income trends when a key is configured)](https://www.census.gov/data/developers/data-sets/acs-5year.html) | U.S. Census Bureau | JSON API | People (income over time) |
| [Executive Team](https://www.kannapolisnc.gov/Government-Departments/Administration/Executive-Team) | City of Kannapolis | Web page | Who runs the City (emails) |
| [Police Department Staff Directory](https://www.kannapolisnc.gov/Government-Departments/Police/Staff-Directory) | City of Kannapolis | Web page | Who runs the City (police emails) |
| [Kannapolis Police to Citizen portal (online reports, event map, calls for service, commendations)](https://kannapolisnc.policetocitizen.com/Home) | Kannapolis Police Department | Web page | Kannapolis Police (online services) |
| [Fire Operations and Support Services (station addresses)](https://www.kannapolisnc.gov/Government-Departments/Fire/Operations-and-Support-Services) | City of Kannapolis | Web page | Fire stations |
| [Fire Community Risk Reduction Services (programs, Fire Marshal)](https://www.kannapolisnc.gov/Government-Departments/Fire/Community-Risk-Reduction-Services) | City of Kannapolis | Web page | Fire free programs, fire code concerns |
| [Fire CPR Initiative (free classes)](https://www.kannapolisnc.gov/cpr) | City of Kannapolis | Web page | Free CPR classes |
| [Fire Educational Program Request](https://www.kannapolisnc.gov/Government-Departments/Fire/Educational-Program-Request) | City of Kannapolis | Web page | Smoke alarms, visits, safety programs |
| [Fire Department Staff Directory](https://www.kannapolisnc.gov/Government-Departments/Fire/Staff-Directory) | City of Kannapolis | Web page | Fire Marshal and department contacts |
| [OpenFreeMap basemap tiles (map data © OpenStreetMap contributors)](https://openfreemap.org/) | OpenFreeMap / OpenStreetMap | Map tiles | Background maps |
| [Parks & Recreation (parks, shelters, volunteering, accreditation)](https://www.kannapolisnc.gov/parksandrec) | City of Kannapolis | Web page | Parks & Recreation |
| [Parks: every park's address, hours and amenities](https://www.kannapolisnc.gov/Government-Departments/Parks-Recreation/Parks) | City of Kannapolis | Web page | Park finder |
| [Greenways](https://www.kannapolisnc.gov/Government-Departments/Parks-Recreation/Greenways) | City of Kannapolis | Web page | Greenways and parking |
| [Athletics and Youth Soccer (fees, scholarships, weather hotline)](https://www.kannapolisnc.gov/Government-Departments/Parks-Recreation/Athletics) | City of Kannapolis | Web page | Youth sports |
| [Athletic Fields](https://www.kannapolisnc.gov/Government-Departments/Parks-Recreation/Athletic-Fields) | City of Kannapolis | Web page | Field rentals, school fields |
| [Parks Rules & Ordinances](https://www.kannapolisnc.gov/Government-Departments/Parks-Recreation/Rules-and-Ordinances) | City of Kannapolis | Web page | Park rules |
| [County Facilities (location of Vietnam Veterans Park)](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/County_Facilities/MapServer/0) | Cabarrus County GIS | ArcGIS REST | Park map location |
| [A Kannapolis Christmas (Celebration of Lights, parade, holiday events)](https://www.kannapolisnc.gov/christmas) | City of Kannapolis | Web page | Holiday events, carousel & train holiday season |
| [The Gem Theatre: Tickets (now showing and coming soon)](https://gem-theatre.com/Tickets) | The Gem Theatre (City of Kannapolis) | Web page | What's showing, dates, posters |
| [The Gem Theatre: Ticket Information (prices, policies, accessibility)](https://gem-theatre.com/Movies/Ticket-Information) | The Gem Theatre (City of Kannapolis) | Web page | Prices and policies |
| [The Gem Theatre: Public Parking](https://gem-theatre.com/Parking) | The Gem Theatre (City of Kannapolis) | Web page | Parking and shuttle |
| [The Gem Theatre: Now Playing (fallback listing source)](https://gem-theatre.com/Movies/Now-Playing) | The Gem Theatre (City of Kannapolis) | Web page | Gem listings if the Tickets page changes |
| [The Gem Theatre: Coming Soon (fallback listing source)](https://gem-theatre.com/Movies/Coming-Soon) | The Gem Theatre (City of Kannapolis) | Web page | Gem listings if the Tickets page changes |

The news and meetings harvesters are adapted from [kspider](https://github.com/bradspry/kannapolis-news-wire).

**Coverage:** Kannapolis spans Cabarrus *and* Rowan counties. Property, growth and zoning cover the Cabarrus part only; Census and budget figures cover the whole city. Parcel data is published only as aggregates, with no owner names or individual parcels.

## Project layout

```
etl/               Python pipeline (standard library only)
  run_all.py       runs the steps; one failing source doesn't block the rest
  build_*.py       one per data source → data/generated/*.json
  build_site.py    inlines CSS, JS, data and photos → dist/index.html
  serve.py         Wi-Fi server with rebuild-on-reload (run via ./serve.sh)
data/manual/       hand-curated inputs, each row citing its source
data/generated/    pipeline output (committed, so the site rebuilds offline)
site/              index.html, style.css, js/ (os.js shell, tiles.js home screen, sections/ windows), photos/
dist/index.html    the finished dashboard (git-ignored; rebuild any time)
```

Only the chart and map libraries (Observable Plot and MapLibre, pinned versions from jsDelivr) and the map tiles (OpenFreeMap) load from the internet.

## Deploying (GitHub Pages)

In the repository, open **Settings → Pages** and set **Source: GitHub Actions**. Then:
- **Deploy site** builds and publishes on every push to `main`.
- **Refresh data** runs weekly (meetings, news and events daily), commits new data, and triggers a redeploy.

Add `KDASH_CONTACT` (and `CENSUS_API_KEY`, if used) under **Settings → Secrets and variables → Actions**.

## License

[GNU General Public License v3.0](LICENSE). You may use, change and share this code; if you distribute a modified version, it must also be GPL-3.0.

The data belongs to its publishers (the City of Kannapolis, Cabarrus County, the U.S. Census Bureau and others), and photos are courtesy of the City of Kannapolis. **This is an independent community project, not an official City of Kannapolis product.**
