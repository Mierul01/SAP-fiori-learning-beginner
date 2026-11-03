sap.ui.define([], function () {
	"use strict";

	/*
		Demo mode for the AI Assistant: works without an API key.

		These answers are NOT written by an AI model. Simple rules read the live
		product list (the same data Claude would get) and build the reply, so
		anyone with the link can try the assistant for free. Every answer is
		labelled "Demo answer" in the chat.
	*/

	var TARGET_STOCK = 30; // reorder up to this many units

	function rm(n) {
		return "RM " + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function level(iStock) {
		if (iStock === 0) {
			return "out of stock";
		}
		return iStock < 10 ? "low stock" : "in stock";
	}

	function categoryTotals(aProducts) {
		var oTotals = {};
		aProducts.forEach(function (p) {
			oTotals[p.Category] = (oTotals[p.Category] || 0) + p.Price * p.Stock;
		});
		return Object.keys(oTotals).map(function (sCat) {
			return { name: sCat, value: oTotals[sCat] };
		}).sort(function (a, b) {
			return b.value - a.value;
		});
	}

	// ---------- One builder per kind of question ----------

	function restock(aProducts) {
		var aNeed = aProducts.filter(function (p) {
			return p.Stock < 10;
		}).sort(function (a, b) {
			return a.Stock - b.Stock;
		});
		if (!aNeed.length) {
			return "Good news: every product has **10 or more** units, so nothing needs restocking this week.";
		}
		var fCost = 0;
		var aLines = aNeed.slice(0, 6).map(function (p) {
			var iOrder = TARGET_STOCK - p.Stock;
			fCost += iOrder * p.Price;
			return "- **" + p.Name + "**: " + level(p.Stock) + " (" + p.Stock + " left), order **" + iOrder + "** units";
		});
		return ["Restock these first (lowest stock first):"].concat(aLines, [
			"",
			"That brings each one to about " + TARGET_STOCK + " units, worth **" + rm(fCost) + "** at selling price."
		]).join("\n");
	}

	function summary(aProducts) {
		var iUnits = 0, fValue = 0;
		aProducts.forEach(function (p) {
			iUnits += p.Stock;
			fValue += p.Price * p.Stock;
		});
		var iOut = aProducts.filter(function (p) { return p.Stock === 0; }).length;
		var iLow = aProducts.filter(function (p) { return p.Stock > 0 && p.Stock < 10; }).length;
		var oTop = categoryTotals(aProducts)[0];
		return [
			"- **" + aProducts.length + " products** and **" + iUnits + " units** on the shelves, worth **" + rm(fValue) + "**",
			"- **" + oTop.name + "** hold the most value (" + rm(oTop.value) + ")",
			"- **" + iOut + "** out of stock and **" + iLow + "** running low, so restocking is the main job this week"
		].join("\n");
	}

	function categories(aProducts) {
		var aTotals = categoryTotals(aProducts);
		var fAll = aTotals.reduce(function (s, c) { return s + c.value; }, 0) || 1;
		var aLines = aTotals.map(function (c) {
			return "- **" + c.name + "**: " + rm(c.value) + " (" + Math.round(c.value / fAll * 100) + "%)";
		});
		return ["Stock value by category:"].concat(aLines, [
			"",
			"**" + aTotals[0].name + "** is the biggest, so stock-outs there cost the most."
		]).join("\n");
	}

	function promotion(aProducts) {
		var aSlow = aProducts.filter(function (p) {
			return p.Stock >= 30;
		}).sort(function (a, b) {
			return b.Stock - a.Stock;
		}).slice(0, 3);
		if (!aSlow.length) {
			return "No product has a big pile of stock right now, so there is no need for a clearance promotion.";
		}
		var aLines = aSlow.map(function (p) {
			return "- **" + p.Name + "** (" + p.Stock + " units): 10% off, or a bundle with a laptop";
		});
		return ["These have the most stock, so they are good for a promotion:"].concat(aLines, [
			"",
			"Run it for **2 weeks** and check the stock again after."
		]).join("\n");
	}

	function productReview(p) {
		var aLines = ["**" + p.Name + "** (" + p.ProductID + ") has **" + p.Stock + "** units: " + level(p.Stock) + "."];
		if (p.Stock < 10) {
			aLines.push("- Reorder **" + (TARGET_STOCK - p.Stock) + "** units to get back to " + TARGET_STOCK);
		} else if (p.Stock > 40) {
			aLines.push("- No reorder needed; you have more than a full shelf");
		} else {
			aLines.push("- Stock is healthy; check again next week");
		}
		var oIdeas = {
			Laptops: "Bundle it with a mouse or a laptop bag",
			Monitors: "Show it next to the laptops as a second screen",
			Accessories: "Place it at the counter as an add-on buy",
			Printers: "Offer free set-up or a starter ink pack"
		};
		aLines.push("- Sales idea: " + (oIdeas[p.Category] || "Feature it on the shop's social media this week"));
		return aLines.join("\n");
	}

	function help() {
		return [
			"In demo mode I can answer these questions from your live inventory:",
			"- What should I restock this week?",
			"- Summarise my inventory",
			"- Which category holds the most value?",
			"- Suggest a promotion for slow stock",
			"",
			"Tap the connect icon at the top to use real Claude AI and ask anything."
		].join("\n");
	}

	return {
		/** Builds a demo reply for the question, from the live products. */
		answer: function (sQuestion, aProducts) {
			var q = (sQuestion || "").toLowerCase();
			var oProduct = aProducts.find(function (p) {
				return q.indexOf(p.ProductID.toLowerCase()) >= 0 || q.indexOf(p.Name.toLowerCase()) >= 0;
			});
			if (oProduct) {
				return productReview(oProduct);
			}
			if (/restock|reorder|order|habis|stok/.test(q)) {
				return restock(aProducts);
			}
			if (/summar|overview|ringkas/.test(q)) {
				return summary(aProducts);
			}
			if (/categor|value|kategori|nilai/.test(q)) {
				return categories(aProducts);
			}
			if (/promo|slow|discount|sale|jualan/.test(q)) {
				return promotion(aProducts);
			}
			return help();
		},

		/** A one-line description from a template (Write with AI in demo mode). */
		description: function (oProduct) {
			var oTemplates = {
				Laptops: "{0}: a dependable laptop for work and study, ready for everyday tasks out of the box.",
				Monitors: "{0}: a sharp, comfortable screen for office work, study and entertainment.",
				Accessories: "{0}: a handy everyday accessory that makes working at your desk easier.",
				Printers: "{0}: a reliable printer for home and small office documents."
			};
			return (oTemplates[oProduct.Category] || "{0}: a quality product for everyday use.").replace("{0}", oProduct.Name);
		},

		/** Shows the text a few words at a time, like a live answer. */
		stream: function (sText, fnOnText) {
			var aWords = sText.split(/(\s+)/);
			var i = 0;
			return new Promise(function (resolve) {
				var iTimer = setInterval(function () {
					i = Math.min(aWords.length, i + 4);
					fnOnText(aWords.slice(0, i).join(""));
					if (i >= aWords.length) {
						clearInterval(iTimer);
						resolve(sText);
					}
				}, 35);
			});
		}
	};
});
