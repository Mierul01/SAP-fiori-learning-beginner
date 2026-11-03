sap.ui.define([], function () {
	"use strict";

	/*
		Small helper around the official Anthropic SDK (Claude).

		This app is a static website (GitHub Pages), so there is no server to hide an
		API key on. Instead each user pastes their own Anthropic API key once; it is
		kept only in this browser (localStorage) and sent only to api.anthropic.com.
	*/

	// The official TypeScript/JavaScript SDK, loaded as an ES module from a CDN
	var SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.135.0/+esm";
	var MODEL = "claude-opus-5-5";
	var STORAGE_KEY = "fioriCatalog.anthropicKey";

	var sMemoryKey = ""; // used when the browser blocks localStorage
	var pSdk = null;

	function loadSdk() {
		if (!pSdk) {
			pSdk = import(SDK_URL).then(function (oModule) {
				return oModule.default;
			});
		}
		return pSdk;
	}

	function escapeHtml(s) {
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	return {
		// ---------- API key (stays in this browser) ----------

		getKey: function () {
			try {
				return window.localStorage.getItem(STORAGE_KEY) || sMemoryKey;
			} catch (e) {
				return sMemoryKey;
			}
		},

		setKey: function (sKey) {
			sMemoryKey = sKey;
			try {
				window.localStorage.setItem(STORAGE_KEY, sKey);
			} catch (e) {
				// Private mode or blocked storage: keep it for this visit only
			}
		},

		clearKey: function () {
			sMemoryKey = "";
			try {
				window.localStorage.removeItem(STORAGE_KEY);
			} catch (e) {
				// nothing stored
			}
		},

		hasKey: function () {
			return !!this.getKey();
		},

		// ---------- Ask Claude (streaming) ----------

		/**
		 * Streams Claude's answer. fnOnText(sTextSoFar) runs as words arrive.
		 * Resolves with the full text; rejects with an Error whose .kind is
		 * "auth", "rate", "network", "refusal" or "other".
		 */
		stream: function (oRequest, fnOnText) {
			var sKey = this.getKey();
			return loadSdk().then(function (Anthropic) {
				var client = new Anthropic({ apiKey: sKey, dangerouslyAllowBrowser: true });

				var stream = client.beta.messages.stream({
					model: MODEL,
					max_tokens: 4000,
					// Chat answers: low effort keeps replies quick
					output_config: { effort: "low" },
					// If a safety check declines, Anthropic re-runs it on a suitable fallback model
					betas: ["server-side-fallback-2026-07-01"],
					fallbacks: "default",
					system: oRequest.system,
					messages: oRequest.messages
				});

				var sText = "";
				return (async function () {
					for await (var event of stream) {
						if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
							sText += event.delta.text;
							fnOnText(sText);
						}
					}
					var oFinal = await stream.finalMessage();
					if (oFinal.stop_reason === "refusal") {
						var oRefusal = new Error("Claude declined this request.");
						oRefusal.kind = "refusal";
						throw oRefusal;
					}
					return sText;
				})().catch(function (oError) {
					if (!oError.kind) {
						// Most specific first
						if (oError instanceof Anthropic.AuthenticationError) {
							oError.kind = "auth";
						} else if (oError instanceof Anthropic.RateLimitError) {
							oError.kind = "rate";
						} else if (oError instanceof Anthropic.APIConnectionError) {
							oError.kind = "network";
						} else {
							oError.kind = "other";
						}
					}
					throw oError;
				});
			});
		},

		// ---------- Formatting ----------

		// Turn Claude's short replies (- bullets, **bold**) into safe HTML for FormattedText
		toHtml: function (sText) {
			var aHtml = [];
			var bList = false;
			escapeHtml(sText || "").split("\n").forEach(function (sLine) {
				var sTrim = sLine.trim().replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
				var bItem = /^[-•*]\s+/.test(sTrim);
				if (bItem && !bList) {
					aHtml.push("<ul>");
					bList = true;
				}
				if (!bItem && bList) {
					aHtml.push("</ul>");
					bList = false;
				}
				if (bItem) {
					aHtml.push("<li>" + sTrim.replace(/^[-•*]\s+/, "") + "</li>");
				} else if (sTrim) {
					aHtml.push("<p>" + sTrim + "</p>");
				}
			});
			if (bList) {
				aHtml.push("</ul>");
			}
			return aHtml.join("");
		}
	};
});
