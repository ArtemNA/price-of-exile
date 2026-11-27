# Changelog

Each release takes its "What's new" from the section of its tag.

## v0.1.31

Replaces v0.1.29 and v0.1.30: their map rolling regex let some deadly maps through and dimmed some clean ones.

- Map check settings: two buttons make a stash search regex that skips maps with the current profile's deadly mods, or deadly and warning mods. It goes into the "Map rolling" group as "Non-deadly 1" / "Non warn-deadly 1" (one pair per profile): added the first time, updated after that, named once in the interface language. The result under the buttons shows the regex, its length out of 250 and whether the entry was added or updated; a regex longer than 250 characters is not written.
- Each mod gets the shortest piece of its text that nothing else on a map can match. The stash search reads a map's full (advanced) text, so the regex steers clear of base, rare, magic and unique map names, affix names and tags, reminder texts, roll ranges ("35(35-45)%"), signs ("+50%") and " — Unscalable Value", all taken from the game files. Works with the game in English or Russian.
- Fix: with the game in Russian, the map check settings listed English mods.
- Fix: in Russian and Ukrainian, the update banner in the settings, the version row in "About" and the map check settings ran out of their space (text out of buttons, column titles run together, profile III cut off).

## v0.1.28

- Inscribed Ultimatum: the price check searches by its reward and its sacrifice (each can be switched off), not just by the name. Beside it, the sacrifice and the reward are shown with their poe.ninja prices for their counts. The trade site cannot filter by the sacrifice count, so listings with x1 and x8 show too; a "Sacrifice" column shows each listing's count, and those with the item's count stand out. A note above the listings says so.
- Fix: listing cards showed "{0} {1}" instead of the values on some lines (the ultimatum's sacrifice and reward).

## v0.1.27

- Number fields: the first click selects the whole number, so typing replaces it. After that, clicks place the caret, the mouse selects part or all of the text, and Ctrl+A selects all.

## v0.1.26

- Fix: in the Awakened PoE Trade look, a click left of a centred price check (with related items on its right) did not close it.

## v0.1.25

- Fix: the price check in the Awakened PoE Trade look could still open squeezed (seen on Nightmare Maps): the window sometimes kept its default size instead of growing to the game's height.

## v0.1.24

- Fix: the price check could open squeezed in height, its parts over each other, right after a map or item check. The window now ignores a size meant for another check.
- Fix: a scrollbar flashed for a moment when a map check, item check or the stash panel opened.
- Scrollbars are thin and in the theme's colours in every window; the Awakened PoE Trade look keeps its own in the listings.
- Fix: a click into a number field (stat range, item level and others) blanked it, and Backspace erased nothing until you typed something first. The field now keeps its number, so you can erase digits right away, or the whole bound, and search without it.

## v0.1.23

- Facetor's Lens is priced, with a Stored Experience filter: minimum and maximum start at the lens's own value and can be changed.

## v0.1.22

- Fix: rare and normal items on Vestigial bases (for example a rare "Vestigial Golden Mask") were not recognised. They are priced by their base, mods and the vestigial implicit.

## v0.1.21

- The default look is now **Graphite**: neutral graphite with ice-blue tiers, so red, orange and green (map check, price drops, warnings) stand out. It replaces Vaal, whose crimson base swallowed them: if you picked Vaal, you get Graphite; any other choice stays.
- Settings → Overlay → Theme lists Graphite and Awakened PoE Trade first, the earlier two-column look last.
- Fix: with related items shown beside the price check (for example with "Opposite the cursor"), the listing card stood beyond them, away from its row. It now stands right next to the listings.

## v0.1.20

- New default look, **Vaal**: Awakened PoE Trade's price check layout in near-black, crimson and gold, with the game's font. The APT colours and the earlier two-column look stay in Settings → Overlay → Theme.
- New app icon: a golden eye with a crimson diamond pupil.
- After this update everyone starts on the new look once; a theme you pick later stays. Other settings carry over.
- **Import from Awakened PoE Trade** for stash search groups and map check marks (Settings → Stash search / Map check).

## v0.1.19

- Point at the **eye** next to a listing's price to see the listed item as a game tooltip beside the price check: mods with tiers, sockets, properties (Settings → Price check: the eye, with Shift held, always or never).

## v0.1.18

- **Originator's Exalted Orb** and **Primordial Exalted Orb** (new in 3.30) are priced.

## v0.1.17

- Fix: the price check hotkey sometimes did nothing until the next alt-tab. The app now checks 4 times a second that it knows the game is in front, and retries a hotkey another app held (for example Awakened PoE Trade with the same key).
- **Shift+Space** opens the settings from the game, as in Awakened PoE Trade (Settings → Hotkeys → Open settings).

## v0.1.16

Game data and price check updates from Awakened PoE Trade 3.30.102.

- **Not Catalysed** filter for rings, amulets and belts without quality.
- Chronicle of Atzoatl: the 3.30 rooms (Cradle of Creation, renamed rooms) and what each room does, under its line.
- Twice Corrupted items: the corrupted switch says so, and a once corrupted item is searched without twice corrupted ones.
- Rare-only mods are recognized as prefixes or suffixes and tagged.
- Maps: Atlas Drops and More Threads are read, Atlas Drops can be searched, and maps with 9 mods get the mod count filter.
- **Viscera** are priced: the price check searches the trade category of the body part (head, torso, upper or lower limb).
- Game data 3.30.0.3.

## v0.1.15

- Game data for 3.30 (Covens), taken from Awakened PoE Trade 3.30.101: new items and mods, and the price check reads rolls whose range the game now writes as "(...)". Threads get poe.ninja prices. Items removed from the game in 3.30 (Scarabs, Sacrifice and Mortal fragments, …) are no longer recognized.

## v0.1.14

- Mercenary Warrants are priced the way Awakened PoE Trade shows them: each skill of the mercenary is a group with its icon and its linked supports, opened with the arrow; supports show their tier and Req / N-1; the 6-Link filter and the "None of" group have their proper texts. Fix: opening a skill showed only the 6-Link line and none of its supports.

## v0.1.13

- **Themes**: Settings → Overlay → Theme. Besides ours there is **Awakened PoE Trade**: APT's colours and fonts in every window and APT's price check, laid out as APT does it (one column as tall as the game, next to the inventory or the stash, related items beside it), over Price of Exile's own price check. "Centre of the game" and "Opposite the cursor" apply to both themes.
- [THEMING.md](THEMING.md): how to make your own theme.

## v0.1.12

0.1.11 was built but GitHub refused to publish it, so its changes come in this version.

- Releases are published only once all their files are up, so "Check for updates" no longer fails with "Could not fetch a valid release JSON" while a new version is being published.
- Settings: General had grown long, so it is now three sections. General keeps the languages, the game window title, the league and the account; **Overlay** has the popup position and the start message; **About** has the version, "What's new", the update check, automatic updates and the source code link.

## v0.1.10

- A new version is announced in the corner of the screen (the settings window lives hidden in the tray, so its banner alone went unseen). A click opens the settings with "What's new" and the install button.
- "Install new versions automatically" (on by default, Settings → General → Version): a new version found when the overlay starts is installed right away, with a message in the corner, and the overlay restarts by itself. Found later, while the overlay runs (it looks every 6 hours), it is only announced: the restart never comes in the middle of a game. The portable version only announces it.

## v0.1.9

- Requests to pathofexile.com and poe.ninja name the app as it is now: `PriceOfExile/<version> (+https://github.com/ArtemNA/price-of-exile)`, with the version taken from the release itself (it said `PoeTradeOverlay/0.1.0` until now).

## v0.1.8

- Settings: "What's new" next to the version opens its release page with the list of changes; the update banner links the new version's.
- The Russian version of the game: Settings → General → Game language → Русский. Items copied in Russian are read with APT's Russian game data, and the price check, bulk exchange, leagues, "Open on trade site" and the built-in browser use ru.pathofexile.com (or www.pathofexile.com with "Search on the international site"). The game language is apart from the interface language; with English it is always www.pathofexile.com.
- An item copied in another language than the settings say: the popup says which game language to choose.
- Interface languages: English, Ukrainian and Russian (Settings → General → Interface language). Only the overlay's own texts change; item names and mods stay as the game copies them.
- "Opposite the cursor" puts the popup right next to the game's inventory or stash panel the item is in, as APT does, instead of at the far edge of the game.

## v0.1.7

- Fix: the start message in the screen corner did not show in installed builds.
- Installs updated from "PoE Trade Overlay" (before 0.1.2): the Start menu and desktop shortcuts that still started the old version now start Price of Exile.
- Fix: Corrupted / Not corrupted, the base switch, the iLvl and links chips, "Not unique", the stat count and the trade options summary change at once on a click, not only after switching between Pseudo and Mods.

## v0.1.6

- Related items of an item with mods (uniques such as Farrul's Fur) can be folded into one line, "Related · 4", by a click on their heading.
- Related items are found for linked uniques too: poe.ninja names those by links ("6L"), the sets by base.

## v0.1.5

- A new price check layout. A full-width header holds the item's name and base and a switch between the whole category and this base. It also holds item level and links as chips, corrupted as Any / Not corrupted / Corrupted, and the poe.ninja price with its 7 day trend.
- Currencies, fragments, divination cards, gems and maps show their picture next to the name.
- Stat filters are grouped (Properties, Totals, Implicit, Eldritch implicits, Explicit, Crafted) and show mod tiers (T1, T2, …).
- "Σ Mods behind totals" shows which mods a pseudo total adds up.
- Rarely useful filters sit under "Hidden", each with the reason it is hidden.
- An empty modifier can be searched as Any, Prefix or Suffix. The F button is now a "Fractured" switch.
- Prices, bulk offers and the divine rate show currency icons instead of "c" and "div".
- Related items (the set a fragment, splinter or card belongs to and what it turns into) are shown next to the price whenever there are any, as in APT, instead of only on the poe.ninja tab.

## v0.1.4

- Price check: a **Mods** tab next to Pseudo, with every mod on its own ("+70 to maximum Life", "+18 to Strength") instead of pseudo totals ("+79 total maximum Life").
- Price check: an **F** button on mods that also exist as fractured: search the mod as fractured, or as a regular one.
- The price check window is wider (960 px, so mod texts fit) and as tall as its filters need, up to 900 px: items with many mods no longer scroll.
- After pathofexile.com answers "too many requests", the overlay sends it nothing until the time it named is over, instead of making the restriction longer.
- The popup takes the scale of the game's monitor (matters with monitors at different scales) and hides when the game window moves or changes size under it.
- A warning in the settings when the game runs in exclusive fullscreen, where no overlay can show: switch the game to Windowed Fullscreen.
- The league list is reloaded every few hours, so an ended league is replaced without a restart.

## v0.1.3

- The repository is now [ArtemNA/price-of-exile](https://github.com/ArtemNA/price-of-exile): updates and release links use the new address (the old one still redirects).
- The program file is now `price-of-exile.exe`.

## v0.1.2

- New name: **Price of Exile**. After the update, Windows may still list the old "PoE Trade Overlay" in installed apps: uninstall that entry and leave "Delete the application data" unchecked, so the settings stay.
- A short message in the corner of the screen when the overlay starts: it runs, its hotkeys, where the settings are. Can be turned off in Settings → General.
- The settings window opens on the very first start again (it stayed in the tray).
- Portable version: a single exe that runs without installing; it shows when a new version is out instead of updating itself.
- MIT license, an installer with the app's own icon, and release notes like this one.

## v0.1.1

The first release.

- Price check (Ctrl+D): trade listings with stat filters, bulk exchange, poe.ninja price with a 7-day trend and related items.
- Item check (Alt+D): wiki, PoEDB and Craft of Exile links, Find in Stash, weapon DPS; on maps, contracts and logbooks the map check with your marked mods.
- Stash search presets (Alt+F) and chat commands (F5 `/hideout`, F9 `/exit`, `@last` commands).
- Built-in browser for logging in to pathofexile.com and the Cloudflare check.
- Settings window with hotkey recording; the app lives in the tray and updates itself.
