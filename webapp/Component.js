sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/model/json/JSONModel",
	"./controller/AiAssistant"
], function (UIComponent, JSONModel, AiAssistant) {
	"use strict";

	// The Component is the "app container". It reads manifest.json,
	// creates the models and starts the router.
	return UIComponent.extend("fiori.beginner.products.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			// A small model for UI state: titles, stats, filters, edit mode, the new-product form
			this.setModel(new JSONModel({
				listTitle: "",
				kpi: {},
				filterActive: false,
				filterText: "",
				orderQty: 10,
				edit: false,
				newProduct: {},
				// AI Assistant chat state
				ai: { hasKey: false, demo: false, ready: false, keyInput: "", input: "", busy: false, messages: [], writing: false }
			}), "view");

			// Start routing: the URL hash decides which page is shown
			this.getRouter().initialize();
		},

		// One shared AI Assistant for the whole app
		getAiAssistant: function () {
			if (!this._oAiAssistant) {
				this._oAiAssistant = new AiAssistant(this);
			}
			return this._oAiAssistant;
		}
	});
});
