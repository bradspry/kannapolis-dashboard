# Kannapolis Civic Dashboard

An open-data dashboard for **Kannapolis, North Carolina**, built by a resident for residents: who lives here, how the city is growing, how land is zoned, how the budget and debt work, what's happening, and who to contact.

**▶ Open the dashboard: https://bradspry.github.io/kannapolis-dashboard/**

It's **one self-contained HTML file** built by a small Python script. No Node, no venv, nothing to install.

[![The Kannapolis Civic Dashboard home screen on a dark woven background: widget tiles for the Gem and Swanee theatres, waste collection with missed-pickup contacts and holiday delays, current drought conditions with the City's water-use level gauge, Parks & Recreation (Celebration of Lights and Winterland Express train reservations), weather with a 5-day forecast over live radar, paying a utility bill, police and fire with their chiefs and 911 buttons, Editions bookstore's new books, Made in Kannapolis (Old Armor Beer), What-A-Burger, the Cannon Ballers, events, meetings, City Council with upcoming meetings, Council meeting videos, residents, City staff, budget, debt, gauges, a land use zoning map and data sources](docs/dashboard.jpg)](https://bradspry.github.io/kannapolis-dashboard/)

## Quick start

```bash
python3 etl/run_all.py          # fetch all data and build dist/index.html
open dist/index.html            # or double-click it
./serve.sh                      # view it on your phone too (same Wi-Fi)
```

- `python3 etl/run_all.py site`: rebuild the page only (instant, no downloads)
- `python3 etl/run_all.py meetings videos news events weather gem swanee editions drought site`: refresh the time-sensitive widgets, then rebuild
- Steps: `budget census council meetings videos events gem swanee made editions whataburger weather news org police fire baseball utility waste drought parks zoning property site` (`property` takes 5–30 min; the county GIS server is slow)

**Requirements:** Python 3.10+ for the data steps (standard library only). Building and serving also work on macOS's built-in Python 3.9. The one exception is the weekly jobs harvest (`etl/build_jobs.py`), which needs `requests`, Playwright with Chromium, and a checkout of [kannapolis-jobs](https://github.com/bradspry/kannapolis-jobs) in `.kannapolis-jobs/`.

**Settings:** copy `.env.example` to `.env` (git-ignored).

| Setting | Purpose |
|---|---|
| `KDASH_CONTACT` | Your name and email, sent in the User-Agent of every data request so publishers know who is harvesting |
| `CENSUS_API_KEY` | Optional, [free](https://api.census.gov/data/key_signup.html); adds an income-over-time chart |

## Using the dashboard

The home screen is a grid of widget tiles. **Tap a tile to open the full widget in a window.** Links like `#budget` open a window directly.

**Edit** lets you:
- **Resize** tiles: S, M, L, XL. Bigger sizes show more detail; XL shows as L on phones.
- **Rearrange** tiles by dragging. On a phone, drag the ⠿ handle; with a keyboard, focus the handle and use the arrow keys.
- **Add or remove** tiles: any widget can go on any tab (Home, City, Entertainment, Jobs, Transportation); “–” takes it off the current tab, and **Add a widget** lists everything not on it, by subject.
- **Add blank space**: an invisible tile, resizable and draggable like the others, for leaving gaps in the layout. Its “–” deletes it.
- **Pin**: the pin button holds a widget in the top-right corner of the tab; the others flow around it. One pin per tab; press it again to unpin. The Jobs tab starts with School Bus Drivers pinned.

The dashboard is a set of color-coded folder tabs, each with its own layout (`?tab=city` links straight to one). Home shows every widget unless it's removed, so new widgets appear there by themselves; the other tabs show only the widgets put on them. Your layouts are saved in your browser, one per tab. While `./serve.sh` is running, **Save as default (all tabs)** writes every tab to `data/manual/home_layout.json`, the default for every visitor once committed. **Reset** returns the current tab to its default.

## Testing on your phone

```bash
./serve.sh
```

It prints the address to open on your phone (for example `http://192.168.1.20:5180`). Each page load rebuilds first if anything in `site/` or `data/` changed, so **just reload the phone to see edits**.

`serve.sh` uses macOS's built-in, Apple-signed Python because the macOS firewall silently blocks phone connections to unsigned programs (Homebrew Python or Node). You can also AirDrop `dist/index.html` to the phone.

## Widgets and sources

| Widget | Source | Updated |
|---|---|---|
| Kannapolis Police | [KPD web page](https://www.kannapolisnc.gov/KPD): 911 and non-emergency numbers, online services, notices; serious-crime counts from KPD's quarterly crime reports (PDFs); the chief's photo from the City org chart | **Machine-parsed**: `data/manual/kpd.json`, `kpd_part1_crimes.csv`, `kpd_quarterly.csv` (checked against each report's total) |
| Kannapolis Fire Department | [KFD web pages](https://www.kannapolisnc.gov/kfd): 911 and KFD numbers, free resident programs, after-a-fire forms, the five stations (mapped with the Census geocoder; nearest-station finder runs on the device); the chief's photo from the City org chart | **Machine-parsed**: `data/manual/kfd.json` |
| Kannapolis Cannon Ballers | Team's [2027 schedule](https://img.mlbstatic.com/milb-images/image/upload/milb/kljjd0xd8n8fto71x49u.pdf) (image PDF): next home game, home stands, month calendars, add-to-calendar | **Machine-parsed**: `data/manual/cannonballers_2027.csv` (checked: 132 games, 66 home) |
| Pay Utility Bill | City [Customer Service & Utility Billing](https://www.kannapolisnc.gov/customer-service): every way to pay, card-fee and due-date calculators (on device), help | **Machine-parsed**: `data/manual/utility_billing.json` |
| Parks & Recreation | City [Parks & Recreation](https://www.kannapolisnc.gov/parksandrec) pages: park finder by amenity with map and on-device nearest park, shelters, sports sign-up, greenways, seasonal attractions, rules; during the holidays, [A Kannapolis Christmas](https://www.kannapolisnc.gov/christmas) and [Winterland Express](https://www.kannapolisnc.gov/winterland-express) train reservations (tonight's reserve or walk-up status, on device) | **Machine-parsed**: `data/manual/parks.json` (map locations: Census geocoder, Cabarrus County GIS) |
| The Gem Theatre | [gem-theatre.com](https://gem-theatre.com/Tickets) ticket page (scraped; adapted from kannapolis-movies): now showing, coming soon, special screenings, prices, policies | Automatic, daily |
| The Swanee Theatre | Swanee's public [events feed](https://swaneetheatre.com/events/) (WordPress Events Calendar API), [weekly happenings](https://swaneetheatre.com/weekly-happenings/), [rental info](https://swaneetheatre.com/rent-the-swanee/) | Shows: automatic, daily. Weekly/rental: **machine-parsed** (`data/manual/swanee.json`) |
| Made in Kannapolis | Featured maker: [Old Armor Beer Company](https://www.oldarmorbeer.net) (veteran-owned brewery, 211 West Ave): beers, taproom hours with open-now (on device), Pay It Forward board, contact; upcoming live music from the [calendar on its Weekly Schedule page](https://www.oldarmorbeer.net/events-1) | Live music: automatic, daily. Everything else: **machine-parsed** (`data/manual/made.json`) |
| K-Town Connection | The Kannapolis podcast's newest episodes: its [YouTube channel](https://www.youtube.com/@KTownConnection/videos) feed matched by episode number to its [podcast feed](https://feed.podbean.com/ktownconnection/feed.xml) (Podbean, the one [Apple Podcasts](https://podcasts.apple.com/us/podcast/k-town-connection/id6819690593) lists); watch in place, listen, or open either app | Episodes: automatic, daily. Show details: **machine-parsed** (`data/manual/ktown.json`) |
| Kannapolis Reads and Yarns | [Editions Coffee Shop & Bookstore](https://www.editionsbookstore.com): [new arrivals](https://www.editionsbookstore.com/page/NewArrivals), [events](https://www.editionsbookstore.com/page/events), [coffee](https://www.editionsbookstore.com/page/CoffeeShop), [yarn](https://www.editionsbookstore.com/page/yarn); store and drive-thru open-now (on device) | Books, events: automatic, daily (10 s between requests, per the site's robots.txt). Coffee, yarn, hours: **machine-parsed** (`data/manual/editions.json`) |
| What-A-Burger #1 | [what-a-burger1.com](https://www.what-a-burger1.com) and its [online menu](https://www.What-A-Burger1.com/order): open-now (on device), local favorites, searchable menu with prices | **Machine-parsed**: `data/manual/whataburger.json` (menu is drawn by JavaScript; recheck prices when updating) |
| City Council Meeting Videos | City of Kannapolis [YouTube playlist](https://www.youtube.com/playlist?list=PLVO_mqWw3g38u7X_oE4-9k0F2BN05dEaX) (public RSS feed) and [live streams](https://www.youtube.com/@CityofKannapolis/streams); agendas from the City's meeting portal | Automatic, daily |
| Waste Collection | City [Garbage, Recycling & Yard Waste](https://www.kannapolisnc.gov/Garbage) and [What's My Day?](https://www.kannapolisnc.gov/Government-Departments/Garbage-Recycling-Yard-Waste/Whats-My-Day) pages: report a missed pickup, holiday delays and loose-leaf season (on device), what goes where, set-out rules, carts; links to the City's [CARTology](https://apps.apple.com/us/app/cartology/id1368037662) pickup-day lookup and app | **Machine-parsed**: `data/manual/waste.json` |
| Current Drought Conditions | City [Drought Guidance](https://www.kannapolisnc.gov/drought) page (current water-conservation level and news) and the [U.S. Drought Monitor](https://droughtmonitor.unl.edu/) for Cabarrus and Rowan counties (weekly, two years of history) | City level and Drought Monitor: automatic, daily. Tips and level descriptions: **machine-parsed** (`data/manual/drought.json`) |
| Cabarrus County Public Library | Library [events calendar](https://cabarrus-cep.bc.sirsidynix.net/events/list/) (public API: programs and closures at every branch, Kannapolis Library and Afton Ridge first) and a search box that opens the [library catalog](https://cabarrus.ent.sirsi.net/client/en_US/default/) (the catalog itself isn't scraped) | Events: automatic, daily. Branches: **machine-parsed** (`data/manual/library.json`) |
| NC By Train | NC By Train (N.C. Department of Transportation) [Piedmont](https://www.ncbytrain.org/schedules/piedmont) and [Carolinian](https://www.ncbytrain.org/schedules/carolinian) schedules (every departure from Kannapolis, with the next train and countdowns worked out on the device) and the [Kannapolis station page](https://www.ncbytrain.org/stations/kannapolis-kan) (station hours, tickets, services and connections) | Schedule: automatic, daily. Links and train descriptions: **machine-parsed** (`data/manual/train.json`) |
| Rider Transit | Concord Kannapolis Area Transit's official [GTFS feed](https://passio3.com/concordKat/passioTransit/gtfs/google_transit.zip) (routes, stops, schedules, route shapes) drawn as a system map, with live bus positions and service alerts from its GTFS-realtime feeds (read in the browser every 30 seconds), the next scheduled buses at your nearest stop, hours, holidays and fares from [ckrider.com](https://ckrider.com/) | Schedule: automatic, weekly. Buses and alerts: **live**. Hours and fares: **machine-parsed** (`data/manual/transit.json`) |
| Rider ADA Paratransit | Rider's [accessibility page](https://ckrider.com/accessibility/): who qualifies, booking, fares and phones, with the ¾-mile service area drawn around every bus route and an "am I in the service area?" check | **Machine-parsed** (`data/manual/transit.json`); service area from the GTFS routes, weekly |
| West Avenue Express Shuttle | The City's [announcement](https://www.kannapolisnc.gov/news/ID/348/Free-West-Avenue-Express-Shuttles-Return-to-Downtown-Kannapolis) and [parking page](https://www.kannapolisnc.gov/Community/Parking): the free downtown loop's stops (placed from the City's parking map, streets from OpenStreetMap), days, hours and season, with "running now / next run" worked out on the device | **Machine-parsed** (`data/manual/transit.json`) |
| Flights | Every nonstop from Concord-Padgett Regional Airport, gathered by [kannapolis-travel](https://github.com/bradspry/kannapolis-travel) (`fetch_routes.py --flights-only`) from the airport's [Airlines page](https://concordairportnc.com/Airline-Information/Airlines), with [OurAirports](https://ourairports.com/data/) locations; a great-circle route map; [parking](https://concordairportnc.com/Airline-Information/Parking) and [terminal directions](https://concordairportnc.com/Airline-Information/Directions) | Routes: automatic, weekly. Airport facts: **machine-parsed** (`data/manual/flights.json`) |
| Jobs (one widget per employer) | Current openings at 31 employers in and around Kannapolis (governments, school districts, colleges, health care, distribution, manufacturing, grocery and retail), harvested from each employer's own careers site with the [kannapolis-jobs](https://github.com/bradspry/kannapolis-jobs) scrapers; every listing links to the posting | Automatic, **weekly** (Mondays), in its own workflow because the scrapers need `requests` and Playwright. Employers: **machine-parsed** (`data/manual/jobs.json`) |
| School Bus Drivers | Openings to drive school buses and vans for Kannapolis City, Cabarrus County and Rowan-Salisbury Schools, picked from those districts' weekly openings with kannapolis-jobs' `--school-bus` rules (read from its `run.py`, so the two stay in step); pinned to the Jobs tab's top-right corner | Automatic, **weekly**, with the Jobs harvest |
| Weather | [National Weather Service](https://www.weather.gov/) API: forecast, hourly, alerts, and observations from Concord Regional Airport; [NOAA's national radar mosaic](https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&request=GetCapabilities) behind the tile and as an animated past-hour radar map in the window | **Live** in the browser every 15 min (daily backup copy of the forecast) |
| Gauges | Derived from the budget, audit and Census data below | Automatic |
| Residents | U.S. Census ACS 5-year via [Census Reporter](https://censusreporter.org/profiles/16000US3735200-kannapolis-nc/): population trend, income, home value, age vs. North Carolina | Automatic |
| Growth & Property | [Cabarrus County GIS open data](https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData) (current and yearly snapshots) | Automatic |
| Land Use & Zoning | Cabarrus County GIS, *Kannapolis Zoning*: acres by category and district; zoning map (drawn on the XL tile, interactive in the window) | Automatic |
| Budget & Debt | City budget ordinances, budget books and audited financial reports (PDFs) | **Machine-parsed**: [`data/manual/README.md`](data/manual/README.md) |
| City Debt | Total owed from the latest audit (ACFR); FY 2026–27 payments loan by loan, checked against the ordinance totals | **Machine-parsed**: `data/manual/debt_service_fy2027.csv` |
| City News | The City's [news page](https://www.kannapolisnc.gov/news) | Automatic, daily |
| Upcoming Events | The City's [events calendar](https://www.kannapolisnc.gov/Community/Calendar) RSS feed; repeating events merged (meetings never are) | Automatic, daily |
| Public Meetings | The City's [CivicClerk portal](https://kannapolisnc.portal.civicclerk.com) API, with agendas | Automatic, daily |
| City Council | [City Council page](https://www.kannapolisnc.gov/citycouncil); upcoming Council meetings and agendas from the CivicClerk portal | Members: **machine-parsed** (`data/manual/council.csv`, photos in `site/photos/council/`). Meetings: automatic, daily |
| Who Runs the City | The City's 2026 org chart and staff directory | **Machine-parsed**: `data/manual/org_chart.json`, photos in `site/photos/staff/` |

### Official sources

Every machine-parsed number in `data/manual/*.csv` has a `source` citation and a `source_url` that opens the official PDF at the cited page (for example `…FY%2027%20Adopted%20Budget.pdf#page=114`). The build fails if a row's citation is missing. The full registry is [`data/manual/sources.csv`](data/manual/sources.csv); its `widgets` column ties each source to the widgets it feeds, and every widget window ends with an automatic **Sources** line built from it. The table below is generated from the same registry on every build, so the README always cites every source:

<!-- sources:start -->
177 sources, generated from `data/manual/sources.csv`.

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
| [The Swanee Theatre events (public Events Calendar feed)](https://swaneetheatre.com/events/) | The Swanee Theatre (City of Kannapolis) | JSON API | Upcoming shows, times, tickets |
| [The Swanee Theatre: Weekly Happenings](https://swaneetheatre.com/weekly-happenings/) | The Swanee Theatre (City of Kannapolis) | Web page | Weekly dance nights |
| [Rent The Swanee (capacity and rates)](https://swaneetheatre.com/rent-the-swanee/) | The Swanee Theatre (City of Kannapolis) | Web page | Rentals |
| [The Swanee Theatre website (contact, address)](https://swaneetheatre.com) | The Swanee Theatre (City of Kannapolis) | Web page | Contact info |
| [Old Armor Beer Company website (about, beers, can images)](https://www.oldarmorbeer.net) | Old Armor Beer Company | Web page | Story, featured beers, ABV (from can art) |
| [Old Armor Beer Company: Contact (address, phone, hours, booking)](https://www.oldarmorbeer.net/contact) | Old Armor Beer Company | Web page | Hours, address, phone, email, good to know |
| [Old Armor Beer Company: Pay It Forward Board](https://www.oldarmorbeer.net/pay-it-forward) | Old Armor Beer Company | Web page | Pay It Forward prices and how it works |
| [Old Armor Beer Company: Weekly Schedule (events)](https://www.oldarmorbeer.net/events-1) | Old Armor Beer Company | Web page | Where the live music calendar is published |
| [Old Armor Beer Company venue calendar (BeatGig / Dusk)](https://dusk.fm/embed/venue-calendar/oldarmorbeercompany) | BeatGig (Dusk), for Old Armor Beer Company | Web page | Upcoming live music: performer, date, start and end time, genre, free to attend (read daily) |
| [K-Town Connection YouTube channel feed](https://www.youtube.com/feeds/videos.xml?channel_id=UCjEpFdSMuKGpRPNHLaL-Xow) | K-Town Connection | RSS | Newest episodes: titles, dates, view counts, thumbnails, descriptions (read daily) |
| [K-Town Connection on YouTube](https://www.youtube.com/@KTownConnection/videos) | K-Town Connection | Web page | Show description and hosts; watch and subscribe links |
| [K-Town Connection podcast feed (Podbean)](https://feed.podbean.com/ktownconnection/feed.xml) | K-Town Connection | RSS | Episode audio, lengths and pages (read daily); podcast cover art, used as the logo |
| [K-Town Connection on Apple Podcasts](https://itunes.apple.com/search?term=K-Town+Connection&media=podcast) | Apple (iTunes Search API) | JSON API | The show's Apple Podcasts listing (same feed as Podbean) |
| [K-Town Connection website](https://ktownconnection.com) | K-Town Connection | Web page | Links: Facebook, Instagram, merch shop; confirms the Podbean player |
| [Editions Coffee Shop & Bookstore: New Arrivals](https://www.editionsbookstore.com/page/NewArrivals) | Editions Coffee Shop & Bookstore | Web page | New books: titles, authors, prices, covers (daily) |
| [Editions Coffee Shop & Bookstore: Events](https://www.editionsbookstore.com/page/events) | Editions Coffee Shop & Bookstore | Web page | Events, closures, monthly calendar (daily) |
| [Editions Coffee Shop & Bookstore: Coffee Shop](https://www.editionsbookstore.com/page/CoffeeShop) | Editions Coffee Shop & Bookstore | Web page | Drinks, add-on prices, ordering, store and drive-thru hours |
| [Editions Coffee Shop & Bookstore: Yarn](https://www.editionsbookstore.com/page/yarn) | Editions Coffee Shop & Bookstore | Web page | Yarn brands, tools, return policy, Cannon Mills history |
| [Editions Coffee Shop & Bookstore website (contact, monthly drink specials)](https://www.editionsbookstore.com) | Editions Coffee Shop & Bookstore | Web page | Address, phone, email, monthly specials menu |
| [What-A-Burger #1: Menu & Order Online](https://www.What-A-Burger1.com/order) | What-A-Burger #1 | Web page | Full menu and prices, hours |
| [What-A-Burger #1 website (address, phone, hours, reviews, logo)](https://www.what-a-burger1.com) | What-A-Burger #1 | Web page | Address, phone, hours, customer quotes, logo |
| [City Council Meetings (YouTube playlist RSS feed)](https://www.youtube.com/playlist?list=PLVO_mqWw3g38u7X_oE4-9k0F2BN05dEaX) | City of Kannapolis | RSS | Upcoming live stream and recent meeting recordings, views (daily) |
| [City of Kannapolis YouTube channel: live streams](https://www.youtube.com/@CityofKannapolis/streams) | City of Kannapolis | Web page | Live stream page |
| [City meeting portal (CivicClerk): agendas for each Council meeting](https://kannapolisnc.portal.civicclerk.com) | City of Kannapolis | JSON API | Agenda links matched to each video |
| [NOAA/NWS national radar mosaic, base reflectivity (MRMS QC composite)](https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&request=GetCapabilities) | NOAA National Centers for Environmental Prediction | WMS image | Live radar: weather tile background and the animated past-hour radar map in the Weather window |
| [Winterland Express train reservations (how reservations and walk-up tickets work)](https://www.kannapolisnc.gov/winterland-express) | City of Kannapolis | Web page | Train runs every 10 minutes; mobile tickets; walk-up; rainout rule |
| [Kannapolis Cannon Ballers website (team contact and tickets)](https://www.kcballers.com) | Kannapolis Cannon Ballers (Minor League Baseball) | Web page | Team website and ticket email |
| [Garbage, Recycling & Yard Waste (services, set-out rules, holidays, carts, leaf season)](https://www.kannapolisnc.gov/Garbage) | City of Kannapolis | Web page | Services, schedules, holiday delays, cart fees, loose-leaf season, hazardous waste |
| [What's My Day? (CARTology and missed-pickup reporting)](https://www.kannapolisnc.gov/Government-Departments/Garbage-Recycling-Yard-Waste/Whats-My-Day) | City of Kannapolis | Web page | Missed-pickup phone and email, CARTology |
| [CARTology app (App Store and Google Play)](https://apps.apple.com/us/app/cartology/id1368037662) | ReCollect / Cabarrus County | Web page | Links to the collection-calendar app |
| [Drought Guidance: Current Drought Conditions (water-conservation level)](https://www.kannapolisnc.gov/drought) | City of Kannapolis | Web page | Current level and date (read daily), drought news, levels explained, earlier rules, permits |
| [Concord, Harrisburg, Kannapolis, and Landis Move to Voluntary Water Conservation Effective November 3, 2026](https://www.kannapolisnc.gov/news/ID/461/Concord,-Harrisburg,-Kannapolis,-and-Landis-Move-to-Voluntary-Water-Conservation-Effective-November-3,-2026) | City of Kannapolis | Web page | Voluntary water-saving steps; Catawba-Wateree Low Inflow Protocol |
| [U.S. Drought Monitor county statistics (Cabarrus 37025, Rowan 37159)](https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent) | National Drought Mitigation Center (USDA / NOAA) | JSON API | Weekly drought categories D0–D4 by county, two years |
| [North Carolina Drought Management Advisory Council](https://www.ncdrought.org/) | NC Department of Environmental Quality | Web page | Statewide drought conditions (linked) |
| [Kannapolis Cannon Ballers team logo](https://www.mlbstatic.com/team-logos/487.svg) | MLB (mlbstatic.com team logos) | SVG | Team logo |
| [Cabarrus County Public Library events calendar (REST API)](https://cabarrus-cep.bc.sirsidynix.net/events/list/) | Cabarrus County Public Library | JSON API | Upcoming programs and closures at all branches, venue addresses and phones |
| [Cabarrus County Public Library catalog (search only; not scraped)](https://cabarrus.ent.sirsi.net/client/en_US/default/) | Cabarrus County Public Library | Web page | Catalog search box |
| [Cabarrus County Public Library: Locations (branch addresses, phones and hours)](https://cabarrus.ent.sirsi.net/client/en_US/default/?rm=LOCATIONS0%7C%7C%7C1%7C%7C%7C0%7C%7C%7Ctrue) | Cabarrus County Public Library | Web page | Branch phones and hours (copied once, not scraped) |
| [Cabarrus County Public Library System logo](https://cabarrus-cep.bc.sirsidynix.net/wp-content/uploads/2022/09/CABARRUS_newlogo.png) | Cabarrus County Public Library | PNG | Library logo |
| [NC By Train: Piedmont schedule](https://www.ncbytrain.org/schedules/piedmont) | N.C. Department of Transportation Rail Division | Web page | Piedmont departure times at Kannapolis (daily); which trains stop here; service description |
| [NC By Train: Carolinian schedule](https://www.ncbytrain.org/schedules/carolinian) | N.C. Department of Transportation Rail Division | Web page | Carolinian departure times at Kannapolis; service description |
| [NC By Train: Kannapolis (KAN) station page](https://www.ncbytrain.org/stations/kannapolis-kan) | N.C. Department of Transportation Rail Division | Web page | Station address, phone, hours, ticketing, services (incl. baggage policy link), transit, taxi and rental car; its schedule table is checked against the route schedules |
| [NC By Train: Kids Under 12 Ride for Half Off Every Day](https://www.ncbytrain.org/deals/kids-under-12-ride-half-every-day) | N.C. Department of Transportation Rail Division | Web page | Child and infant fares |
| [NC By Train logo](https://files.nc.gov/ncbytrain/NCByTrain_Logo.png) | N.C. Department of Transportation Rail Division | PNG | Logo |
| [Kannapolis Station photo (NC By Train)](https://files.nc.gov/ncbytrain/styles/_inline_extra_large_/public/sp_migrate/media/ren-RAIL62_1.jpg) | N.C. Department of Transportation Rail Division | JPEG | Station photo |
| [Amtrak: Track Your Train](https://www.amtrak.com/track-your-train.html) | Amtrak | Web page | Linked for live train status (not read by the dashboard) |
| [kannapolis-jobs (job scrapers for the Kannapolis area)](https://github.com/bradspry/kannapolis-jobs) | Brad Spry | Python (GitHub) | Harvests each employer's openings weekly, filtered to the Kannapolis area; its --school-bus rules pick the school bus driving jobs |
| [City of Kannapolis careers site](https://www.governmentjobs.com/careers/kannapolis) | City of Kannapolis | Web page | Job openings (Kannapolis), read weekly |
| [Kannapolis City Schools careers site](https://www.applitrack.com/kannapolis/onlineapp/default.aspx?all=1) | Kannapolis City Schools | Web page | Job openings (Kannapolis), read weekly |
| [Cabarrus County Government careers site](https://www.governmentjobs.com/careers/Cabarruscounty) | Cabarrus County Government | Web page | Job openings (Cabarrus County), read weekly |
| [Cabarrus County Schools careers site](https://cabarrus.schoolspring.com/) | Cabarrus County Schools | Web page | Job openings (Cabarrus County), read weekly |
| [Rowan County Government careers site](https://rowancountync.tylerportico.com/tess/citizen/jobs/job-list) | Rowan County Government | Web page | Job openings (Rowan County), read weekly |
| [Rowan-Salisbury Schools careers site](https://rssk12.schoolspring.com/) | Rowan-Salisbury Schools | Web page | Job openings (Rowan County), read weekly |
| [Atrium Health careers site](https://careers.advocatehealth.org/) | Atrium Health | Web page | Job openings (Kannapolis), read weekly |
| [Cabarrus Health Alliance careers site](https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=c25f2dd9-f40c-43eb-98d8-7e82e7033050&ccId=19000101_000001) | Cabarrus Health Alliance | Web page | Job openings (Cabarrus County), read weekly |
| [Monarch careers site](https://monarch.wd5.myworkdayjobs.com/en-US/Monarch) | Monarch | Web page | Job openings (Concord & Kannapolis), read weekly |
| [Rowan-Cabarrus Community College careers site](https://rcccjobs.com/postings/search) | Rowan-Cabarrus Community College | Web page | Job openings (Rowan & Cabarrus counties), read weekly |
| [UNC Charlotte careers site](https://jobs.charlotte.edu/postings/search) | UNC Charlotte | Web page | Job openings (Charlotte), read weekly |
| [UNC Chapel Hill careers site](https://unc.peopleadmin.com/postings/search) | UNC Chapel Hill | Web page | Job openings (N.C. Research Campus, Kannapolis), read weekly |
| [NC State careers site](https://jobs.ncsu.edu/postings/search) | NC State | Web page | Job openings (N.C. Research Campus, Kannapolis), read weekly |
| [App State careers site](https://appstate.peopleadmin.com/postings/search) | App State | Web page | Job openings (N.C. Research Campus, Kannapolis), read weekly |
| [UNC Greensboro careers site](https://spartantalent.uncg.edu/postings/search) | UNC Greensboro | Web page | Job openings (N.C. Research Campus, Kannapolis), read weekly |
| [DHL careers site](https://careers.dhl.com/global/en/search-results?keywords=&p=ChIJPW97u5QIVIgRHdxKah_1bak&location=Kannapolis,%20NC,%20USA) | DHL | Web page | Job openings (Kannapolis, Landis & China Grove), read weekly |
| [Chewy careers site](https://careers.chewy.com/us/en/salisbury-nc-warehouse-and-fulfillment-center-jobs) | Chewy | Web page | Job openings (Salisbury fulfillment center), read weekly |
| [Sysco careers site](https://careers.sysco.com/en/search-jobs/Concord%2C%20Cabarrus%20County%2C%20NC) | Sysco | Web page | Job openings (Concord), read weekly |
| [Gordon Food Service careers site](https://gfs.wd5.myworkdayjobs.com/en-US/usjobs-gen-gfs/jobs) | Gordon Food Service | Web page | Job openings (Kannapolis), read weekly |
| [Chick-fil-A Supply careers site](https://careers.chick-fil-a.com/supply/jobs/) | Chick-fil-A Supply | Web page | Job openings (Kannapolis), read weekly |
| [Macy's careers site](https://ebwh.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001) | Macy's | Web page | Job openings (China Grove), read weekly |
| [Corning careers site](https://corningjobs.corning.com/search/) | Corning | Web page | Job openings (Concord), read weekly |
| [Lilly careers site](https://jobsearch.lilly.com/) | Lilly | Web page | Job openings (Concord), read weekly |
| [Standard Process careers site](https://recruiting.ultipro.com/STA1020/JobBoard/1df7fbd1-d8cf-85ff-efe2-77bf30267012) | Standard Process | Web page | Job openings (Kannapolis), read weekly |
| [Momentec careers site](https://www.paycomonline.net/v4/ats/web.php/portal/666553572663EC7F7F3472C2CF94B117/career-page) | Momentec | Web page | Job openings (Kannapolis), read weekly |
| [Westrock Coffee careers site](https://myjobs.adp.com/westrockcoffeeexternaljobs/cx) | Westrock Coffee | Web page | Job openings (Concord), read weekly |
| [Food Lion careers site](https://foodlion.careerswithus.com/) | Food Lion | Web page | Job openings (Kannapolis), read weekly |
| [Lowes Foods careers site](https://apply.appcast.io/l/lowes-foods-careers) | Lowes Foods | Web page | Job openings (Kannapolis), read weekly |
| [Shoe Show careers site](https://careers.shoeshow.com/careers) | Shoe Show | Web page | Job openings (Kannapolis area), read weekly |
| [Speedway Motorsports careers site](https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=d180c324-e784-463d-a355-61b3275338b9&ccId=19000101_000001) | Speedway Motorsports | Web page | Job openings (Concord & Harrisburg), read weekly |
| [REBEL careers site](https://rebel.bamboohr.com/careers) | REBEL | Web page | Job openings (Kannapolis & remote), read weekly |
| [City of Kannapolis logo](https://www.kannapolisnc.gov/Portals/_default/skins/kannapolis/images/logo.png) | City of Kannapolis | PNG | Logo; widget color measured from it |
| [Kannapolis City Schools logo](https://resources.finalsite.net/images/v1707768219/kcsk12ncus/nkeb6sv2kfs3ay9h0wzn/ALB_Logo.png) | Kannapolis City Schools | PNG | Logo; widget color measured from it |
| [Cabarrus County Government logo](https://www.governmentjobs.com/AgencyPages/cabarruscounty/agencyImages/download/CabCountyLogoFinal1.png) | Cabarrus County Government | PNG | Logo; widget color measured from it |
| [Cabarrus County Schools logo](https://files.smartsites.parentsquare.com/3048/social_media_preview_img_fxieqm.png) | Cabarrus County Schools | PNG | Logo; widget color measured from it |
| [Rowan County Government logo](https://www.rowancountync.gov/ImageRepository/Document?documentID=40676) | Rowan County Government | PNG | Logo; widget color measured from it |
| [Rowan-Salisbury Schools logo](https://files.smartsites.parentsquare.com/7521/_variants/contain-1440w/header_logo_img_effpko.png) | Rowan-Salisbury Schools | PNG | Logo; widget color measured from it |
| [Atrium Health logo](https://cdn.atriumhealth.org/-/media/chs/images/logo/atrium-health-logo-teal-1200x630.png?rev=1a52d83bcb6748448abcd65deaa88f1e&hash=F13EB0F27AE8BD026F5F94661FE24F99) | Atrium Health | PNG | Logo; widget color measured from it |
| [Cabarrus Health Alliance logo](https://www.cabarrushealth.org/ImageRepository/Document?documentID=2961) | Cabarrus Health Alliance | PNG | Logo; widget color measured from it |
| [Monarch logo](https://monarchnc.org/wp-content/themes/monarch-refresh/dist/images/monarch-logo.png?ver=1781798351) | Monarch | PNG | Logo; widget color measured from it |
| [Rowan-Cabarrus Community College logo](https://www.rccc.edu/wp-content/uploads/2019/01/rccc_550_logo-1.png) | Rowan-Cabarrus Community College | PNG | Logo; widget color measured from it |
| [UNC Charlotte logo](https://www.charlotte.edu/wp-content/uploads/2024/12/cropped-All-in-C-1-192x192.png) | UNC Charlotte | PNG | Logo; widget color measured from it |
| [UNC Chapel Hill logo](https://www.unc.edu/wp-content/themes/unc/assets/images/favicon/apple-touch-icon.png?v=jwLzlQrBRl) | UNC Chapel Hill | PNG | Logo; widget color measured from it |
| [NC State logo](https://cdn.ncsu.edu/brand-assets/favicons/favicon.svg) | NC State | SVG | Logo; widget color measured from it |
| [App State logo](https://www.appstate.edu/_images/apple-touch-icon-60x60.png) | App State | PNG | Logo; widget color measured from it |
| [UNC Greensboro logo](https://static.uncg.edu/web-assets/theme/assets/images/favicon/icon.svg?v=2) | UNC Greensboro | SVG | Logo; widget color measured from it |
| [DHL logo](https://commons.wikimedia.org/wiki/File:DHL_Logo.svg) | DHL | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Chewy logo](https://cdn.phenompeople.com/CareerConnectResources/CHINUS/images/Chewy_Logo_RGB_Blue3-1713543901058.png) | Chewy | PNG | Logo; widget color measured from it |
| [Sysco logo](https://commons.wikimedia.org/wiki/File:Sysco-Logo.svg) | Sysco | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Gordon Food Service logo](https://gfs.com/wp-content/uploads/2023/01/logo.svg) | Gordon Food Service | SVG | Logo; widget color measured from it |
| [Chick-fil-A Supply logo](https://cms.jibecdn.com/prod/chickfila/assets/HEADER-SUPPLY_NAV_LOGO-en-us-1774288846749.png) | Chick-fil-A Supply | PNG | Logo; widget color measured from it |
| [Macy's logo](https://commons.wikimedia.org/wiki/File:Macy's_logo.svg) | Macy's | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Corning logo](https://commons.wikimedia.org/wiki/File:Corning_Incorporated_Logo.svg) | Corning | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Lilly logo](https://commons.wikimedia.org/wiki/File:Eli_Lilly_and_Company.svg) | Lilly | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Standard Process logo](https://www.standardprocess.com/media/cache/attachment/filter/wysiwyg_original/87ce74c18aefc3f765aae166bfe23016/50000/6a7c7ffd67e00475097068-SP-Logo-155.png) | Standard Process | PNG | Logo; widget color measured from it |
| [Momentec logo](https://static.momentecbrands.com/marketing/00_WEB_ASSETS/momentec-brands/09162025/m_favicon_48x48_v2.png) | Momentec | PNG | Logo; widget color measured from it |
| [Westrock Coffee logo](https://www.westrockcoffee.com/wp-content/uploads/2024/10/westrock-logo-150x150.png) | Westrock Coffee | PNG | Logo; widget color measured from it |
| [Food Lion logo](https://commons.wikimedia.org/wiki/File:Food_lion.png) | Food Lion | PNG (Wikimedia Commons) | Logo; widget color measured from it |
| [Lowes Foods logo](https://commons.wikimedia.org/wiki/File:Lowesfoods.svg) | Lowes Foods | SVG (Wikimedia Commons) | Logo; widget color measured from it |
| [Shoe Show logo](https://www.shoeshow.com/on/demandware.static/Sites-shoe-show-Site/-/default/dw3b767baf/images/favicons/shoeshow-favicon-196x196.png) | Shoe Show | PNG | Logo; widget color measured from it |
| [Speedway Motorsports logo](https://www.speedwaymotorsports.com/images/speedwaymotorsports-llc.png) | Speedway Motorsports | PNG | Logo; widget color measured from it |
| [REBEL logo](https://images7.bamboohr.com/733550/logos/cropped.jpg?v=30) | REBEL | JPEG | Logo; widget color measured from it |
| [Rider Transit GTFS schedule feed (routes, stops, schedules, route shapes)](https://passio3.com/concordKat/passioTransit/gtfs/google_transit.zip) | Concord Kannapolis Area Transit (published by Passio) | GTFS | Routes, colors, stops, next departures, hours and frequency; route maps; the paratransit service area is drawn from these routes |
| [Rider Transit GTFS-realtime feeds (vehicle positions, service alerts)](https://passio3.com/concordk/passioTransit/gtfs/realtime/vehiclePositions) | Concord Kannapolis Area Transit (published by Passio) | GTFS-realtime | Live bus positions every 30 seconds and service alerts (alerts: https://passio3.com/concordk/passioTransit/gtfs/realtime/serviceAlerts) |
| [Rider Transit: Links (official GTFS and GTFS-realtime feed addresses)](https://ckrider.com/resources/links/) | Rider Transit | Web page | Where the feeds are published |
| [Rider Transit live bus tracker (CK Rider)](https://trackingckrider.com/map) | Concord Kannapolis Area Transit (Syncromatics) | Web page | Linked when the public real-time feed reports no buses; Rider's current live map |
| [Rider Transit: About (hours, holidays, Transit Center, buses)](https://ckrider.com/about/) | Rider Transit | Web page | Service hours, no-service holidays, Transit Center address and customer service hours, bike racks |
| [Rider Transit: Accessibility and ADA Paratransit](https://ckrider.com/accessibility/) | Rider Transit | Web page | Paratransit eligibility, service area (3/4 mile), hours, fares ($2.00; bus fare $1.25), phones, booking rules, applications; bus accessibility |
| [Rider Transit: Fares & Passes (Rider Pass, Umo app, smartcard)](https://ckrider.com/fares-and-passes/) | Rider Transit | Web page | Ways to pay, free transfers, smartcard cost |
| [Rider Transit: System Map (PDF) and route pages](https://ckrider.com/maps-and-schedules/system-map/) | Rider Transit | Web page | Links to the official system map and each route's map and schedule |
| [Rider Transit logo](https://ckrider.com/wp-content/uploads/2021/06/rider-transit-logo-on-light.png) | Rider Transit | PNG | Logo; widget colors measured from it |
| [Free West Avenue Express Shuttles Return to Downtown Kannapolis (April 3, 2026)](https://www.kannapolisnc.gov/news/ID/348/Free-West-Avenue-Express-Shuttles-Return-to-Downtown-Kannapolis) | City of Kannapolis | Web page | Shuttle stops, days, hours, season, frequency, accessibility |
| [Downtown Kannapolis Public Parking](https://www.kannapolisnc.gov/Community/Parking) | City of Kannapolis | Web page | Shuttle stops, parking lots |
| [Downtown Parking map (shows the West Avenue Express stops)](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Parking/FINAL%20-%20Parking%20%20(8).png) | City of Kannapolis | PNG | Positions of the four shuttle stops |
| [OpenStreetMap: downtown Kannapolis streets (Overpass API) and place search (Nominatim)](https://www.openstreetmap.org/#map=17/35.4993/-80.6245) | OpenStreetMap contributors | GeoJSON (Overpass) | Shuttle street path and nearby streets; First Baptist Church location; Rider Transit Center location |
| [kannapolis-travel: fetch_routes.py (--flights-only)](https://github.com/bradspry/kannapolis-travel) | Brad Spry (GitHub) | Python (GitHub) | Gathers every nonstop route from Concord-Padgett, with airport names and coordinates |
| [Concord-Padgett Regional Airport: Airlines](https://concordairportnc.com/Airline-Information/Airlines) | City of Concord (Concord-Padgett Regional Airport) | Web page | Nonstop routes by airline (current and new), airline phones and sites, terminal address, Sun Country / Caesars Rewards Air charters, area names for destinations |
| [Concord-Padgett Regional Airport: Airline Parking](https://concordairportnc.com/Airline-Information/Parking) | City of Concord (Concord-Padgett Regional Airport) | Web page | Parking rate, free first hour, payment, overflow lot, arrive two hours early |
| [Concord-Padgett Regional Airport: Directions](https://concordairportnc.com/Airline-Information/Directions) | City of Concord (Concord-Padgett Regional Airport) | Web page | Terminal address and the warning that navigation apps may use the wrong one |
| [OurAirports: airports.csv](https://davidmegginson.github.io/ourairports-data/airports.csv) | OurAirports (public domain) | CSV | Airport names, cities and coordinates for each destination |
| [world-atlas land-50m (Natural Earth 1:50m land)](https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json) | Natural Earth (public domain), packaged by world-atlas | TopoJSON | Coastline outline on the Flights route map |
| [us-atlas states-10m (U.S. Census Bureau cartographic boundaries)](https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json) | U.S. Census Bureau, packaged by us-atlas | TopoJSON | State lines on the Flights route map |
<!-- sources:end -->

The news and meetings harvesters are adapted from [kspider](https://github.com/bradspry/kannapolis-news-wire).

**Coverage:** Kannapolis spans Cabarrus *and* Rowan counties. Property, growth and zoning cover the Cabarrus part only; Census and budget figures cover the whole city. Parcel data is published only as aggregates, with no owner names or individual parcels.

## Project layout

```
etl/               Python pipeline (standard library only)
  run_all.py       runs the steps; one failing source doesn't block the rest
  build_*.py       one per data source → data/generated/*.json
  build_site.py    inlines CSS, JS, data and photos → dist/index.html (and refreshes the README's sources table)
  readme_sources.py  writes that table from data/manual/sources.csv
  serve.py         Wi-Fi server with rebuild-on-reload (run via ./serve.sh)
data/manual/       machine-parsed inputs (snapshots of PDFs and web pages), each citing its source
data/generated/    pipeline output (committed, so the site rebuilds offline)
site/              index.html, style.css, js/ (os.js shell, tiles.js home screen, sections/ windows), photos/
dist/index.html    the finished dashboard (git-ignored; rebuild any time)
```

Everything else is built into the page. From the internet it loads only: the chart and map libraries (Observable Plot and MapLibre, pinned versions from jsDelivr), map tiles (OpenFreeMap), live weather (api.weather.gov) and radar (NOAA), and pictures hosted by their publishers (movie posters, show images, book covers, video thumbnails). Council meeting videos play from YouTube's privacy-enhanced player only after you press play.

## Deploying (GitHub Pages)

In the repository, open **Settings → Pages** and set **Source: GitHub Actions**. Then:
- **Deploy site** builds and publishes on every push to `main`.
- **Refresh data** runs weekly for everything, and daily for the time-sensitive widgets (meetings, Council videos, news, events, weather, the Gem, the Swanee, Editions and drought); it commits new data and triggers a redeploy.

Add `KDASH_CONTACT` (and `CENSUS_API_KEY`, if used) under **Settings → Secrets and variables → Actions**.

## License

[GNU General Public License v3.0](LICENSE). You may use, change and share this code; if you distribute a modified version, it must also be GPL-3.0.

The data belongs to its publishers (the City of Kannapolis, Cabarrus County, the U.S. Census Bureau, NOAA and the National Weather Service, and the local businesses featured), and photos are courtesy of the City of Kannapolis and those businesses. **This is an independent community project, not an official City of Kannapolis product.**
