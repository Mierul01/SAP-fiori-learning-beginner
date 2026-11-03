sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/routing/History",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"../model/formatter"
], function (Controller, History, MessageToast, MessageBox, formatter) {
	"use strict";

	return Controller.extend("fiori.beginner.products.controller.ProductDetail", {
		formatter: formatter,

		onInit: function () {
			// Every time the URL becomes #/product/HT-1000, _onRouteMatched runs
			this.getOwnerComponent().getRouter()
				.getRoute("detail")
				.attachPatternMatched(this._onRouteMatched, this);
		},

		_getText: function (sKey, aArgs) {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
		},

		_onRouteMatched: function (oEvent) {
			var sId = oEvent.getParameter("arguments").productId;
			var oModel = this.getOwnerComponent().getModel();

			// Always open in display mode
			this.getOwnerComponent().getModel("view").setProperty("/edit", false);

			// The JSON file loads asynchronously, so wait until it is ready
			oModel.dataLoaded().then(function () {
				var aProducts = oModel.getProperty("/Products");
				var iIndex = aProducts.findIndex(function (p) {
					return p.ProductID === sId;
				});

				if (iIndex < 0) {
					this.getOwnerComponent().getRouter().navTo("list", {}, true);
					return;
				}
				// "Element binding": the whole page now shows /Products/<index>
				this.getView().bindElement("/Products/" + iIndex);
			}.bind(this));
		},

		// ---------- Edit mode ----------

		onEdit: function () {
			// Keep a copy, so Cancel can undo the changes
			this._oSnapshot = Object.assign({}, this.getView().getBindingContext().getObject());
			this.byId("nameInput").setValueState("None");
			this.getOwnerComponent().getModel("view").setProperty("/edit", true);
		},

		onNameChange: function () {
			this.byId("nameInput").setValueState("None");
		},

		onSave: function () {
			var oContext = this.getView().getBindingContext();
			var sName = (oContext.getProperty("Name") || "").trim();

			// Simple validation: a name is required
			if (!sName) {
				this.byId("nameInput").setValueState("Error");
				return;
			}
			oContext.getModel().setProperty(oContext.getPath() + "/Name", sName);
			this.getOwnerComponent().getModel("view").setProperty("/edit", false);
			MessageToast.show(this._getText("saveDone"));
		},

		onCancel: function () {
			// Put the copy back: inputs were two-way bound to the model
			var oContext = this.getView().getBindingContext();
			oContext.getModel().setProperty(oContext.getPath(), this._oSnapshot);
			this.getOwnerComponent().getModel("view").setProperty("/edit", false);
		},

		// ---------- Delete ----------

		onDelete: function () {
			var oContext = this.getView().getBindingContext();
			var sName = oContext.getProperty("Name");

			MessageBox.confirm(this._getText("deleteConfirm", [sName]), {
				title: this._getText("btnDelete"),
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					var oModel = oContext.getModel();
					var sId = oContext.getProperty("ProductID");
					oModel.setProperty("/Products", oModel.getProperty("/Products").filter(function (p) {
						return p.ProductID !== sId;
					}));
					this.getView().unbindElement();
					this.getOwnerComponent().getRouter().navTo("list", {}, true);
					MessageToast.show(this._getText("deleteDone", [sName]));
				}.bind(this)
			});
		},

		// ---------- Order more stock ----------

		// Change data in the model: the UI updates automatically (two-way binding)
		onOrder: function () {
			var oContext = this.getView().getBindingContext();
			var iQty = this.getOwnerComponent().getModel("view").getProperty("/orderQty");
			var iNewStock = oContext.getProperty("Stock") + iQty;
			oContext.getModel().setProperty(oContext.getPath() + "/Stock", iNewStock);

			MessageToast.show(this._getText("orderDone", [iQty, oContext.getProperty("Name"), iNewStock]));
		},

		// ---------- AI ----------

		// Opens the AI Assistant and asks about this product straight away
		onAskAi: function () {
			var oProduct = this.getView().getBindingContext().getObject();
			this.getOwnerComponent().getAiAssistant().open(
				this._getText("aiProductQuestion", [oProduct.Name, oProduct.ProductID])
			);
		},

		// ---------- Bottom menu bar (phones) ----------

		// Go to the list, then let the list page run the action (ProductList.controller.js)
		_runOnList: function (sKey) {
			this.onTabHome();
			setTimeout(function () {
				this.getOwnerComponent().getEventBus().publish("bottomNav", "action", { key: sKey });
			}.bind(this), 450);
		},

		onTabHome: function () {
			// Leaving in the middle of an edit throws the unsaved changes away
			if (this.getOwnerComponent().getModel("view").getProperty("/edit")) {
				this.onCancel();
			}
			this.getOwnerComponent().getRouter().navTo("list");
		},

		onTabAlerts: function () {
			this._runOnList("alerts");
		},

		onAddProduct: function () {
			this._runOnList("add");
		},

		onExport: function () {
			this._runOnList("export");
		},

		onNavBack: function () {
			if (this.getOwnerComponent().getModel("view").getProperty("/edit")) {
				this.onCancel();
			}
			if (History.getInstance().getPreviousHash() !== undefined) {
				window.history.go(-1);
			} else {
				this.getOwnerComponent().getRouter().navTo("list", {}, true);
			}
		}
	});
});
