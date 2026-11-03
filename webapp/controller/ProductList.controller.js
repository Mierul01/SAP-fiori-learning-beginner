sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/format/NumberFormat",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/MessageToast",
	"../model/formatter"
], function (Controller, NumberFormat, Filter, FilterOperator, Sorter, MessageToast, formatter) {
	"use strict";

	// Which stat cell filters which stock level
	var STAT_CELLS = { statOk: "ok", statLow: "low", statOut: "out" };

	var STOCK_TESTS = {
		ok: function (iStock) { return iStock >= 10; },
		low: function (iStock) { return iStock > 0 && iStock < 10; },
		out: function (iStock) { return iStock === 0; }
	};

	var STOCK_LABELS = { ok: "stockOk", low: "stockLow", out: "stockOut" };

	var CATEGORIES = ["Laptops", "Monitors", "Accessories", "Printers"];

	var PAGE_SIZE = 10;

	// Sort key -> [field, descending?]
	var SORTERS = {
		name: ["Name", false],
		priceAsc: ["Price", false],
		priceDesc: ["Price", true],
		stockAsc: ["Stock", false]
	};

	// A Controller holds the logic for a View (what happens on click, search...)
	return Controller.extend("fiori.beginner.products.controller.ProductList", {
		formatter: formatter,

		onInit: function () {
			this._sStockKey = "";

			// Paging state: current page, filters and sort order
			this._iPage = 0;
			this._aFilters = [];
			this._oSorter = new Sorter("Name", false);
			// Keep the row template from the XML view, so we can re-bind with it
			this._oTemplate = this.byId("productTable").getBindingInfo("items").template;
			this._rebind();

			// Make each stock stat cell clickable
			Object.keys(STAT_CELLS).forEach(function (sId) {
				this.byId(sId).attachBrowserEvent("click", function () {
					this._setStockFilter(sId);
				}, this);
			}, this);

			// Recount the stats every time we come back to the list
			this.getOwnerComponent().getRouter()
				.getRoute("list")
				.attachPatternMatched(this._updateKpis, this);
		},

		_getText: function (sKey, aArgs) {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
		},

		// ---------- Stat strip ----------

		_updateKpis: function () {
			var oModel = this.getOwnerComponent().getModel();
			var oViewModel = this.getOwnerComponent().getModel("view");

			oModel.dataLoaded().then(function () {
				var aProducts = oModel.getProperty("/Products");
				var iTotal = aProducts.length || 1;
				var count = function (sKey) {
					return aProducts.filter(function (p) {
						return STOCK_TESTS[sKey](p.Stock);
					}).length;
				};
				var iUnits = 0, fValue = 0;
				aProducts.forEach(function (p) {
					iUnits += p.Stock;
					fValue += p.Price * p.Stock;
				});

				// Stock value per category, scaled to the biggest one for the mini bars
				var aCatValues = CATEGORIES.map(function (sCat) {
					return aProducts.reduce(function (sum, p) {
						return p.Category === sCat ? sum + p.Price * p.Stock : sum;
					}, 0);
				});
				var fMax = Math.max.apply(null, aCatValues) || 1;

				var oShort = NumberFormat.getFloatInstance({ style: "short", maxFractionDigits: 1 });
				var iOk = count("ok"), iLow = count("low"), iOut = count("out");

				oViewModel.setProperty("/kpi", {
					valueText: "RM " + oShort.format(fValue),
					valueSub: this._getText("unitsInStock", [iUnits]),
					catBars: aCatValues.map(function (v) {
						return Math.max(10, Math.round(v / fMax * 100));
					}),
					ok: iOk,
					low: iLow,
					out: iOut,
					okPct: Math.round(iOk / iTotal * 100),
					lowPct: Math.round(iLow / iTotal * 100),
					outPct: Math.round(iOut / iTotal * 100)
				});
			}.bind(this));
		},

		_setStockFilter: function (sCellId) {
			var sKey = STAT_CELLS[sCellId];
			// Clicking the active cell again switches the filter off
			this._sStockKey = this._sStockKey === sKey ? "" : sKey;
			this._highlightStat();
			this.onFilterChange();
		},

		_highlightStat: function () {
			Object.keys(STAT_CELLS).forEach(function (sId) {
				this.byId(sId).toggleStyleClass("statActive", STAT_CELLS[sId] === this._sStockKey);
			}, this);
		},

		// ---------- Search, filter and sort ----------

		// Runs when the search text, the category or the stock filter changes
		onFilterChange: function () {
			var sQuery = this.byId("searchField").getValue();
			var oCategory = this.byId("categorySelect");
			var sCategory = oCategory.getSelectedKey();
			var aFilters = [];
			var aLabels = [];

			if (sQuery) {
				// Match the name OR the product ID
				aFilters.push(new Filter({
					filters: [
						new Filter("Name", FilterOperator.Contains, sQuery),
						new Filter("ProductID", FilterOperator.Contains, sQuery)
					],
					and: false
				}));
				aLabels.push("“" + sQuery + "”");
			}
			if (sCategory) {
				aFilters.push(new Filter("Category", FilterOperator.EQ, sCategory));
				aLabels.push(sCategory);
			}
			if (this._sStockKey) {
				// A custom filter: "test" decides per row if it is shown
				aFilters.push(new Filter({ path: "Stock", test: STOCK_TESTS[this._sStockKey] }));
				aLabels.push(this._getText(STOCK_LABELS[this._sStockKey]));
			}

			// Apply the filters to the table rows and go back to page 1
			this._aFilters = aFilters;
			this._iPage = 0;
			this._rebind();

			var oViewModel = this.getOwnerComponent().getModel("view");
			oViewModel.setProperty("/filterActive", aLabels.length > 0);
			oViewModel.setProperty("/filterText", this._getText("filteredBy", [aLabels.join(" · ")]));
		},

		onClearFilters: function () {
			this.byId("searchField").setValue("");
			this.byId("categorySelect").setSelectedKey("");
			this._sStockKey = "";
			this._highlightStat();
			this.onFilterChange();
		},

		onSortChange: function (oEvent) {
			var aSort = SORTERS[oEvent.getParameter("selectedItem").getKey()];
			this._oSorter = new Sorter(aSort[0], aSort[1]);
			this._iPage = 0;
			this._rebind();
		},

		// ---------- Paging (10 rows per page) ----------

		// Bind the table rows again: filters + sort, then only rows startIndex .. startIndex + 10
		_rebind: function () {
			this.byId("productTable").bindItems({
				path: "/Products",
				template: this._oTemplate,
				templateShareable: true,
				filters: this._aFilters,
				sorter: this._oSorter,
				startIndex: this._iPage * PAGE_SIZE,
				length: PAGE_SIZE
			});
		},

		onPrevPage: function () {
			this._iPage--;
			this._rebind();
		},

		onNextPage: function () {
			this._iPage++;
			this._rebind();
		},

		// After every change: update the title "Products (20)" and the pager text
		onUpdateFinished: function () {
			var iTotal = this.byId("productTable").getBinding("items").getLength();
			var iPages = Math.max(1, Math.ceil(iTotal / PAGE_SIZE));

			// e.g. after deleting the last product of the last page
			if (this._iPage > iPages - 1) {
				this._iPage = iPages - 1;
				this._rebind();
				return;
			}

			var iFrom = iTotal ? this._iPage * PAGE_SIZE + 1 : 0;
			var iTo = Math.min(iTotal, (this._iPage + 1) * PAGE_SIZE);
			var oViewModel = this.getOwnerComponent().getModel("view");
			oViewModel.setProperty("/listTitle", this._getText("listTitle", [iTotal]));
			oViewModel.setProperty("/pager", {
				total: iTotal,
				page: this._iPage + 1,
				pages: iPages,
				text: this._getText("pagerText", [iFrom, iTo, iTotal]),
				pageText: this._getText("pageOf", [this._iPage + 1, iPages])
			});
		},

		// ---------- Export to CSV (Excel opens it) ----------

		onExport: function () {
			var oBinding = this.byId("productTable").getBinding("items");
			// All rows that match the current filter, not only the 10 on screen
			var aRows = oBinding.getContexts(0, oBinding.getLength()).map(function (oCtx) {
				return oCtx.getObject();
			});
			var aFields = ["ProductID", "Name", "Category", "Supplier", "Price", "Currency", "Stock"];
			var escape = function (v) {
				return "\"" + String(v).replace(/"/g, "\"\"") + "\"";
			};
			var sCsv = [aFields.join(",")].concat(aRows.map(function (r) {
				return aFields.map(function (f) { return escape(r[f]); }).join(",");
			})).join("\r\n");

			var oLink = document.createElement("a");
			oLink.href = URL.createObjectURL(new Blob([sCsv], { type: "text/csv" }));
			oLink.download = "products.csv";
			oLink.click();
			URL.revokeObjectURL(oLink.href);

			MessageToast.show(this._getText("exportDone", [aRows.length]));
		},

		// ---------- Add product dialog ----------

		onAddProduct: function () {
			this.getOwnerComponent().getModel("view").setProperty("/newProduct", {
				Name: "",
				Category: "Laptops",
				Supplier: "",
				Price: 100,
				Stock: 10,
				Description: "",
				nameState: "None"
			});

			// Load the dialog fragment only once, then reuse it
			if (!this._pDialog) {
				this._pDialog = this.loadFragment({ name: "fiori.beginner.products.view.AddProductDialog" });
			}
			this._pDialog.then(function (oDialog) {
				oDialog.open();
			});
		},

		onNewNameChange: function () {
			this.getOwnerComponent().getModel("view").setProperty("/newProduct/nameState", "None");
		},

		onSaveProduct: function () {
			var oViewModel = this.getOwnerComponent().getModel("view");
			var oModel = this.getOwnerComponent().getModel();
			var oNew = oViewModel.getProperty("/newProduct");

			// Simple validation: a name is required
			if (!oNew.Name.trim()) {
				oViewModel.setProperty("/newProduct/nameState", "Error");
				return;
			}

			// Next free ID, e.g. HT-4004
			var aProducts = oModel.getProperty("/Products");
			var iNext = aProducts.reduce(function (max, p) {
				return Math.max(max, parseInt(p.ProductID.split("-")[1], 10));
			}, 0) + 1;

			oModel.setProperty("/Products", aProducts.concat([{
				ProductID: "HT-" + iNext,
				Name: oNew.Name.trim(),
				Category: oNew.Category,
				Supplier: oNew.Supplier.trim() || "-",
				Price: Number(oNew.Price),
				Currency: "MYR",
				Stock: parseInt(oNew.Stock, 10),
				Description: oNew.Description.trim()
			}]));

			this.byId("addDialog").close();
			this._updateKpis();
			MessageToast.show(this._getText("addDone", [oNew.Name.trim()]));
		},

		onCancelAdd: function () {
			this.byId("addDialog").close();
		},

		// ---------- Navigation ----------

		// Open the detail page for the clicked product
		onItemPress: function (oEvent) {
			var oProduct = oEvent.getSource().getBindingContext().getObject();
			this.getOwnerComponent().getRouter().navTo("detail", {
				productId: oProduct.ProductID
			});
		}
	});
});
