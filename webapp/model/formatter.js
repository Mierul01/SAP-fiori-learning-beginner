sap.ui.define([
	"sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
	"use strict";

	var MAX_STOCK = 50; // a "full shelf", used for the stock bars

	// 1234.5 -> "1,234.50"
	var oMoney = NumberFormat.getFloatInstance({
		minFractionDigits: 2,
		maxFractionDigits: 2,
		groupingEnabled: true
	});

	var STOCK_CLASSES = { Success: "ok", Warning: "low", Error: "out" };

	var CATEGORY_ICONS = {
		Laptops: "sap-icon://laptop",
		Monitors: "sap-icon://sys-monitor",
		Accessories: "sap-icon://headset",
		Printers: "sap-icon://print"
	};

	var CATEGORY_COLORS = {
		Laptops: "Accent6",
		Monitors: "Accent8",
		Accessories: "Accent3",
		Printers: "Accent1"
	};

	// Formatters turn raw data into something nicer to show on screen.
	// They are used in the XML views, e.g. formatter: '.formatter.stockState'
	return {
		// Colour of the stock status: Success = green, Warning = orange, Error = red
		stockState: function (iStock) {
			if (iStock === 0) {
				return "Error";
			}
			return iStock < 10 ? "Warning" : "Success";
		},

		stockText: function (iStock) {
			var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
			if (iStock === 0) {
				return oBundle.getText("stockOut");
			}
			return oBundle.getText(iStock < 10 ? "stockLow" : "stockOk");
		},

		// 0..50 units becomes 0..100 % for the progress bar
		stockPercent: function (iStock) {
			return Math.min(100, Math.round((iStock || 0) / MAX_STOCK * 100));
		},

		// Price in Malaysian ringgit, e.g. "RM 4,780.00"
		price: function (fPrice) {
			return "RM " + oMoney.format(fPrice || 0);
		},

		// Stock cell: coloured status + count, and a thin bar showing how full the shelf is
		stockMeter: function (iStock) {
			var iUnits = iStock || 0;
			var sKind = STOCK_CLASSES[this.formatter.stockState(iUnits)];
			var sLabel = this.formatter.stockText.call(this, iUnits);
			var iPct = this.formatter.stockPercent(iUnits);
			return "<div class=\"stockMeter " + sKind + "\">" +
				"<div class=\"stockTop\"><span class=\"stockLabel\"><i></i>" + sLabel + "</span>" +
				"<b>" + iUnits + "</b></div>" +
				"<div class=\"stockTrack\"><span style=\"width:" + Math.max(iPct, iUnits ? 4 : 0) + "%\"></span></div>" +
				"</div>";
		},

		// Just the coloured dot + status, e.g. "● Low stock"
		stockTag: function (iStock) {
			var iUnits = iStock || 0;
			var sKind = STOCK_CLASSES[this.formatter.stockState(iUnits)];
			return "<div class=\"stockMeter " + sKind + "\"><span class=\"stockLabel\"><i></i>" +
				this.formatter.stockText.call(this, iUnits) + "</span></div>";
		},

		categoryIcon: function (sCategory) {
			return CATEGORY_ICONS[sCategory] || "sap-icon://product";
		},

		categoryColor: function (sCategory) {
			return CATEGORY_COLORS[sCategory] || "Accent10";
		},

		// Small HTML charts for the stat strip (shown with <core:HTML>)
		ring: function (iPct) {
			var p = iPct || 0;
			return "<div class=\"ring\" style=\"--p:" + p + "\"><span>" + p + "%</span></div>";
		},

		miniBars: function (aHeights) {
			var sBars = (aHeights || []).map(function (h) {
				return "<i style=\"height:" + h + "%\"></i>";
			}).join("");
			return "<div class=\"miniBars\">" + sBars + "</div>";
		}
	};
});
