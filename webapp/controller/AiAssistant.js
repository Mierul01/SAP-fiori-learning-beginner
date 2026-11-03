sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/Fragment",
	"sap/ui/Device",
	"sap/m/MessageToast",
	"../model/ai",
	"../model/aiDemo"
], function (BaseObject, Fragment, Device, MessageToast, ai, aiDemo) {
	"use strict";

	/*
		The AI Assistant: a chat about the product catalog.
		- With an API key (Claude, ChatGPT, Gemini or OpenRouter), that AI answers (model/ai.js).
		- Without a key, "Try demo" answers with simple rules from the live
		  inventory (model/aiDemo.js); those answers are labelled as demo.
		One instance lives in the Component (getAiAssistant), so the list page and
		the product page share the same chat.
	*/
	return BaseObject.extend("fiori.beginner.products.controller.AiAssistant", {
		constructor: function (oComponent) {
			BaseObject.call(this);
			this._oComponent = oComponent;
		},

		_view: function () {
			return this._oComponent.getModel("view");
		},

		_getText: function (sKey, aArgs) {
			return this._oComponent.getModel("i18n").getResourceBundle().getText(sKey, aArgs);
		},

		_products: function () {
			return this._oComponent.getModel().getProperty("/Products");
		},

		// hasKey: a real AI is connected; demo: rule-based answers; ready: the chat can be used
		_setMode: function (bDemo) {
			var oVM = this._view();
			var bHasKey = ai.hasKey();
			var bDemoOn = !bHasKey && !!bDemo;
			oVM.setProperty("/ai/hasKey", bHasKey);
			oVM.setProperty("/ai/demo", bDemoOn);
			oVM.setProperty("/ai/ready", bHasKey || bDemoOn);
			oVM.setProperty("/ai/poweredBy", bHasKey ?
				this._getText("aiPoweredBy", [ai.providerName()]) : this._getText("aiNotConnected"));
			if (!oVM.getProperty("/ai/setup/provider")) {
				this._setProvider("claude");
			}
		},

		// Fills the key screen hints (key format, default model, where to get a key)
		_setProvider: function (sProvider) {
			var oProvider = ai.PROVIDERS[sProvider];
			var oVM = this._view();
			oVM.setProperty("/ai/setup/provider", sProvider);
			oVM.setProperty("/ai/setup/keyHint", oProvider.keyHint);
			oVM.setProperty("/ai/setup/defaultModel", oProvider.model);
			oVM.setProperty("/ai/setup/keyUrl", oProvider.keyUrl);
		},

		isReady: function () {
			return !!this._view().getProperty("/ai/ready");
		},

		// ---------- Open / close ----------

		/**
		 * Opens the chat. sQuestion (optional) is asked straight away.
		 * Without a key it opens straight into demo mode, unless the user chose
		 * "connect an AI" (the plug icon), which shows the key screen.
		 */
		open: function (sQuestion) {
			this._setMode(!this._bShowKeyScreen);

			if (!this._pDialog) {
				this._pDialog = Fragment.load({
					id: "aiAssistant",
					name: "fiori.beginner.products.view.AiAssistant",
					controller: this
				}).then(function (oDialog) {
					// Full screen on a phone (or any screen narrower than 600px)
					oDialog.setStretch(Device.system.phone || window.innerWidth < 600);
					// Gives the dialog the app's models (i18n, view, products)
					this._oComponent.getRootControl().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pDialog.then(function (oDialog) {
				oDialog.open();
				if (sQuestion && this.isReady()) {
					this.ask(sQuestion);
				}
			}.bind(this));
		},

		onClose: function () {
			this._pDialog.then(function (oDialog) {
				oDialog.close();
			});
		},

		// ---------- API key and demo mode ----------

		onProviderChange: function (oEvent) {
			this._setProvider(oEvent.getParameter("selectedItem").getKey());
		},

		// Pasting a key picks the matching provider (sk-ant- = Claude, AIza = Gemini, ...)
		onKeyLiveChange: function (oEvent) {
			var sProvider = ai.detectProvider(oEvent.getParameter("value"));
			if (sProvider && sProvider !== this._view().getProperty("/ai/setup/provider")) {
				this._setProvider(sProvider);
			}
		},

		onSaveKey: function () {
			var oVM = this._view();
			var sKey = (oVM.getProperty("/ai/setup/key") || "").trim();
			if (!sKey) {
				return;
			}
			var sProvider = oVM.getProperty("/ai/setup/provider");
			ai.setConnection(sProvider, sKey, (oVM.getProperty("/ai/setup/model") || "").trim());
			oVM.setProperty("/ai/setup/key", "");
			oVM.setProperty("/ai/setup/model", "");
			oVM.setProperty("/ai/messages", []);
			this._setMode(false);
			MessageToast.show(this._getText("aiKeySaved", [ai.providerName()]));
		},

		onForgetKey: function () {
			ai.clearKey();
			this._bShowKeyScreen = true;
			this._view().setProperty("/ai/messages", []);
			this._setMode(false);
			MessageToast.show(this._getText("aiKeyRemoved"));
		},

		onTryDemo: function () {
			this._bShowKeyScreen = false;
			this._view().setProperty("/ai/messages", []);
			this._setMode(true);
		},

		// Leave demo mode and show the key screen again
		onExitDemo: function () {
			this._bShowKeyScreen = true;
			this._view().setProperty("/ai/messages", []);
			this._setMode(false);
		},

		// ---------- Chat ----------

		onClear: function () {
			this._view().setProperty("/ai/messages", []);
		},

		onChip: function (oEvent) {
			this.ask(oEvent.getSource().getText());
		},

		onSend: function () {
			var sQuestion = (this._view().getProperty("/ai/input") || "").trim();
			if (sQuestion) {
				this._view().setProperty("/ai/input", "");
				this.ask(sQuestion);
			}
		},

		ask: function (sQuestion) {
			var oVM = this._view();
			if (oVM.getProperty("/ai/busy")) {
				return;
			}
			var bDemo = oVM.getProperty("/ai/demo");

			var aMessages = oVM.getProperty("/ai/messages").concat([
				{ role: "user", text: sQuestion, html: ai.toHtml(sQuestion) },
				{ role: "assistant", text: "", html: "<p class=\"aiTyping\">" + this._getText("aiThinking") + "</p>" }
			]);
			var iAnswer = aMessages.length - 1;
			oVM.setProperty("/ai/messages", aMessages);
			oVM.setProperty("/ai/busy", true);
			this._scrollDown();

			// Demo answers carry a small label so nobody mistakes them for live AI
			var sDemoTag = bDemo ? "<p class=\"aiDemoTag\">" + this._getText("aiDemoTag") + "</p>" : "";
			var fnOnText = function (sSoFar) {
				oVM.setProperty("/ai/messages/" + iAnswer + "/text", sSoFar);
				oVM.setProperty("/ai/messages/" + iAnswer + "/html", sDemoTag + ai.toHtml(sSoFar));
				this._scrollDown();
			}.bind(this);

			var pAnswer;
			if (bDemo) {
				pAnswer = aiDemo.stream(aiDemo.answer(sQuestion, this._products()), fnOnText);
			} else {
				// The conversation so far (without the empty answer we are about to fill)
				var aHistory = aMessages.slice(0, iAnswer).map(function (m) {
					return { role: m.role, content: m.text };
				});
				pAnswer = ai.stream({ system: this._systemPrompt(), messages: aHistory }, fnOnText);
			}

			pAnswer.catch(function (oError) {
				var sKey = {
					auth: "aiErrorAuth",
					rate: "aiErrorRate",
					network: "aiErrorNetwork",
					model: "aiErrorModel",
					refusal: "aiErrorRefusal"
				}[oError.kind] || "aiErrorOther";
				var sMessage = this._getText(sKey);
				oVM.setProperty("/ai/messages/" + iAnswer + "/text", sMessage);
				oVM.setProperty("/ai/messages/" + iAnswer + "/html", "<p class=\"aiError\">" + sMessage + "</p>");
				if (oError.kind === "auth") {
					// Wrong key: forget it so the user can enter a new one
					ai.clearKey();
					this._setMode(false);
				}
			}.bind(this)).finally(function () {
				oVM.setProperty("/ai/busy", false);
				this._scrollDown();
			}.bind(this));
		},

		// The AI gets the live product list with every question
		_systemPrompt: function () {
			var aProducts = this._products().map(function (p) {
				return {
					id: p.ProductID,
					name: p.Name,
					category: p.Category,
					supplier: p.Supplier,
					priceRM: p.Price,
					stock: p.Stock
				};
			});
			return [
				"You are the AI assistant inside a SAP Fiori product catalog app used by a small electronics shop in Malaysia.",
				"Answer questions about the inventory below. It is live: it already includes products the user added, edited or restocked.",
				"Stock levels: 0 units = out of stock, 1-9 = low stock, 10 or more = in stock. A full shelf holds 50 units.",
				"Prices are in Malaysian ringgit; write them like RM 1,245.00.",
				"Reply in the same language the user writes in.",
				"Latency-sensitive; begin your visible answer immediately.",
				"Keep answers short and easy to scan on a phone: at most about 120 words, \"- \" bullets for lists,",
				"**bold** for product names and key numbers, no headings and no tables.",
				"If a question is not about the catalog, answer briefly and steer back to the inventory.",
				"",
				"Inventory (JSON):",
				JSON.stringify(aProducts)
			].join("\n");
		},

		_scrollDown: function () {
			this._pDialog.then(function (oDialog) {
				setTimeout(function () {
					var oCont = oDialog.getDomRef("cont");
					if (oCont) {
						oCont.scrollTop = oCont.scrollHeight;
					}
				}, 0);
			});
		}
	});
});
