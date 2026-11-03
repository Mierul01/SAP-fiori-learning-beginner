# SAP Fiori Beginner Project: Product Catalog

A small SAP Fiori app built with **SAPUI5** (OpenUI5), the same technology covered in
*Learning the Basics of SAP Fiori (UX100)*.

**What the app does**

- **Stat strip**: inventory value (with a mini bar chart per category) and In stock / Low stock / Out of stock counts (with mini donut charts). Click a stock stat to filter the table, and click it again to clear the filter.
- **Product table**: search, category filter, sort (name, price, stock), a "Filtered by" bar with a Clear button, and paging (10 rows per page)
- **Add product**: a dialog with a form and validation (the name is required)
- **AI Assistant (Claude)**: an "Ask AI" chat that knows the live inventory (restock advice, summaries, promotion ideas), "Ask AI about this product" on each product page, and "Write with AI" for product descriptions. See [AI features](#ai-features-claude)
- **Export**: downloads the filtered rows as `products.csv`, which Excel opens
- **Detail page**: Edit / Save / Cancel (display and edit mode), Delete with a confirmation, and Order more stock
- Uses the **SAP Horizon** light theme on a white background

> Changes are kept in memory only. Refresh the page to get the original 20 products back.

## How to run it

You need [Node.js](https://nodejs.org). Nothing else to install.

```bash
cd sap-fiori-beginner
node server.js
```

Then open <http://localhost:8080>.

> Opening `index.html` by double-clicking does not work. UI5 loads its views over HTTP, so it needs a web server.

## AI features (Claude)

The app uses **Claude** (`claude-opus-5-5`) through the official Anthropic JavaScript SDK, loaded in the browser.

| Feature | Where | What happens |
|---|---|---|
| **AI Assistant** | "Ask AI" button (bottom right) | A chat. Each question is sent with the current product list, so Claude can answer "What should I restock?" or "Which category holds the most value?". Answers stream in word by word. |
| **Ask AI about this product** | Product page, Stock card | Opens the assistant and asks for a quick review of that product: stock level, how many to reorder and a sales idea. |
| **Write with AI** | Add product dialog | Claude writes a one-sentence description from the name, category and price. |

**API key:** the site is static (GitHub Pages), so there is no server to keep a key secret. The first time you open the assistant, it asks for your own [Anthropic API key](https://console.anthropic.com/settings/keys). The key is saved only in that browser (`localStorage`) and sent only to Anthropic. The key button in the assistant header removes it. Don't use your key on a shared device.

**Demo mode (free, no key):** on the key screen, **Try demo** lets anyone with the link try the assistant. These answers are **not** written by AI: simple rules in `webapp/model/aiDemo.js` read the live inventory (restock list, summary, value by category, promotion ideas, product review). Each one is labelled "Demo answer · not live AI". In demo mode, **Write with AI** fills in a template sentence.

The code to look at: `webapp/model/ai.js` (SDK, streaming, errors), `webapp/controller/AiAssistant.js` (chat logic and the system prompt) and `webapp/view/AiAssistant.fragment.xml` (the chat UI).

## Put it on your phone's home screen

1. Push the project to GitHub. `.github/workflows/deploy-pages.yml` publishes the `webapp/` folder to GitHub Pages on every push to `main`.
2. On GitHub, open **Settings > Pages** and set **Source** to **GitHub Actions** (only once).
3. On your phone, open `https://<your-username>.github.io/<repo-name>/`
   - **Android (Chrome):** menu ⋮ > **Add to Home screen**
   - **iPhone (Safari):** Share > **Add to Home Screen**

The icon comes from `webapp/icons/` and `webapp/manifest.webmanifest`. To change the icon design, edit `tools/make-icons.js` and run `node tools/make-icons.js`.

## Project structure

```
webapp/
├── index.html                       Starts UI5 and the app (bootstrap)
├── Component.js                     The app container: models + router
├── manifest.json                    App "ID card": data sources, models, routes
├── i18n/i18n.properties             All texts (easy to translate)
├── css/style.css                    Custom look: hero header, stat strip, sheets
├── model/
│   ├── products.json                Sample data (instead of a real SAP backend)
│   └── formatter.js                 Turns raw values into colours, text and mini charts
├── view/                            WHAT you see (XML)
│   ├── App.view.xml
│   ├── ProductList.view.xml
│   ├── ProductDetail.view.xml
│   └── AddProductDialog.fragment.xml
└── controller/                      WHAT HAPPENS when you click (JavaScript)
    ├── ProductList.controller.js
    └── ProductDetail.controller.js
```

## Fiori concepts you can see in this project

| Concept | Where to look | In one sentence |
|---|---|---|
| **MVC** | `view/` + `controller/` + `model/` | The screen (View), the logic (Controller) and the data (Model) are kept apart. |
| **manifest.json** | `webapp/manifest.json` | Describes the app: its ID, data, models and pages. |
| **Data binding** | `items="{/Products}"`, `text="{Name}"` | The UI reads from the model by itself. Change the data and the screen follows. |
| **Two-way binding** | Inputs on the detail page in edit mode | Typing in an Input changes the model straight away; Cancel puts the saved copy back. |
| **Expression binding** | `visible="{= !${view>/edit} }"` | Small logic inside the view, e.g. show Edit only when not editing. |
| **Routing** | `routes` in manifest, `navTo()` in controller | The URL (`#/product/HT-1000`) decides which page shows, so Back and bookmarks work. |
| **Filters and sorters** | `onFilterChange`, `onSortChange` | Search, category, stock and sort change the table without reloading data. |
| **Custom filter** | `STOCK_TESTS` in `ProductList.controller.js` | A `test` function decides which rows match "Low stock". |
| **Fragments and dialogs** | `AddProductDialog.fragment.xml`, `loadFragment()` | Reusable UI pieces, loaded only when needed. |
| **Messages** | `MessageToast`, `MessageBox.confirm` | Short feedback after an action, and a confirmation before deleting. |
| **Formatters** | `model/formatter.js` | Small functions that turn raw values into display values (Stock 0 becomes red "Out of stock"). |
| **i18n** | `i18n/i18n.properties` | Texts live in one file, so the app can be translated. |
| **Responsive design** | `demandPopin="true"` on columns | On a phone, extra columns move under the row instead of squeezing. |
| **Fiori controls** | `ObjectIdentifier`, `ObjectStatus`, `Avatar`, `StepInput`, `SimpleForm` | Ready-made SAP building blocks that follow the Fiori design guidelines. |

## Exercises to try next

1. **Add a product**: add a new entry to `products.json` and refresh.
2. **Add a language**: copy `i18n.properties` to `i18n_ms.properties` and translate the texts into Malay.
3. **New sort option**: add "Sort: Supplier" to the sort Select and to `SORTERS` in the controller.
4. **Validation**: in the Add dialog, show an error when the price is 0.
5. **Keep changes**: save `/Products` to `localStorage` after every change and load it again at start.
6. **Next level**: connect to a real OData service instead of `products.json`. The [SAP UI5 Walkthrough](https://sdk.openui5.org/topic/3da5f4be63264db99f2e5b04c5e853db) shows how.
