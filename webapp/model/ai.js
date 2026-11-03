sap.ui.define([], function () {
	"use strict";

	/*
		Connects the AI Assistant to the AI provider the user picks:
		Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google) or OpenRouter.

		This app is a static website (GitHub Pages), so there is no server to hide an
		API key on. Each user pastes their own key once; it is kept only in this
		browser (localStorage) and sent only to that provider's API.
	*/

	var STORAGE_KEY = "fioriCatalog.aiConnection";
	var OLD_CLAUDE_KEY = "fioriCatalog.anthropicKey"; // from the first version of the app

	// Claude uses the official Anthropic SDK, loaded as an ES module from a CDN
	var ANTHROPIC_SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.135.0/+esm";

	var PROVIDERS = {
		claude: {
			name: "Claude",
			model: "claude-opus-5-5",
			keyHint: "sk-ant-...",
			keyUrl: "https://console.anthropic.com/settings/keys"
		},
		openai: {
			name: "ChatGPT (OpenAI)",
			model: "gpt-5-mini",
			keyHint: "sk-...",
			keyUrl: "https://platform.openai.com/api-keys",
			url: "https://api.openai.com/v1/chat/completions"
		},
		gemini: {
			name: "Gemini (Google)",
			model: "gemini-3.5-flash-lite",
			keyHint: "AIza... or AQ....",
			keyUrl: "https://aistudio.google.com/apikey"
		},
		openrouter: {
			name: "OpenRouter",
			// "openrouter/free" picks one of OpenRouter's free models
			model: "openrouter/free",
			keyHint: "sk-or-...",
			keyUrl: "https://openrouter.ai/settings/keys",
			url: "https://openrouter.ai/api/v1/chat/completions"
		}
	};

	var oMemory = null; // used when the browser blocks localStorage
	var pAnthropicSdk = null;

	function loadAnthropicSdk() {
		if (!pAnthropicSdk) {
			pAnthropicSdk = import(ANTHROPIC_SDK_URL).then(function (oModule) {
				return oModule.default;
			});
		}
		return pAnthropicSdk;
	}

	function escapeHtml(s) {
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	function aiError(sKind, sMessage) {
		var oError = new Error(sMessage || sKind);
		oError.kind = sKind;
		return oError;
	}

	// HTTP status -> the error kinds the chat knows how to explain
	function errorFromStatus(iStatus) {
		if (iStatus === 401 || iStatus === 403) {
			return aiError("auth");
		}
		if (iStatus === 404) {
			return aiError("model");
		}
		if (iStatus === 429) {
			return aiError("rate");
		}
		return aiError("other", "HTTP " + iStatus);
	}

	/**
	 * Reads a Server-Sent Events stream (used by OpenAI, OpenRouter and Gemini)
	 * and calls fnOnData(parsedJson) for every "data:" line.
	 */
	async function readSse(oResponse, fnOnData) {
		var oReader = oResponse.body.getReader();
		var oDecoder = new TextDecoder();
		var sBuffer = "";
		for (;;) {
			var oChunk = await oReader.read();
			if (oChunk.done) {
				break;
			}
			sBuffer += oDecoder.decode(oChunk.value, { stream: true });
			var aLines = sBuffer.split("\n");
			sBuffer = aLines.pop();
			aLines.forEach(function (sLine) {
				var sData = sLine.trim();
				if (sData.indexOf("data:") !== 0) {
					return;
				}
				sData = sData.slice(5).trim();
				if (!sData || sData === "[DONE]") {
					return;
				}
				try {
					fnOnData(JSON.parse(sData));
				} catch (e) {
					// ignore keep-alive or partial lines
				}
			});
		}
	}

	async function post(sUrl, oHeaders, oBody) {
		var oResponse;
		try {
			oResponse = await fetch(sUrl, {
				method: "POST",
				headers: Object.assign({ "Content-Type": "application/json" }, oHeaders),
				body: JSON.stringify(oBody)
			});
		} catch (e) {
			throw aiError("network", e.message);
		}
		if (!oResponse.ok) {
			throw errorFromStatus(oResponse.status);
		}
		return oResponse;
	}

	// ---------- One function per provider ----------

	// Claude: official Anthropic SDK, streaming
	function streamClaude(oConn, oRequest, fnOnText) {
		return loadAnthropicSdk().then(function (Anthropic) {
			var client = new Anthropic({ apiKey: oConn.key, dangerouslyAllowBrowser: true });

			var stream = client.beta.messages.stream({
				model: oConn.model,
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
					throw aiError("refusal");
				}
				return sText;
			})().catch(function (oError) {
				if (!oError.kind) {
					// Most specific first
					if (oError instanceof Anthropic.AuthenticationError) {
						oError.kind = "auth";
					} else if (oError instanceof Anthropic.NotFoundError) {
						oError.kind = "model";
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
	}

	// OpenAI and OpenRouter share the same "chat completions" format
	async function streamChatCompletions(oConn, oRequest, fnOnText) {
		var oHeaders = { Authorization: "Bearer " + oConn.key };
		if (oConn.provider === "openrouter") {
			oHeaders["X-Title"] = "SAP Fiori Product Catalog";
		}
		var oResponse = await post(PROVIDERS[oConn.provider].url, oHeaders, {
			model: oConn.model,
			stream: true,
			messages: [{ role: "system", content: oRequest.system }].concat(oRequest.messages)
		});
		var sText = "";
		await readSse(oResponse, function (oData) {
			var sDelta = oData.choices && oData.choices[0] && oData.choices[0].delta && oData.choices[0].delta.content;
			if (sDelta) {
				sText += sDelta;
				fnOnText(sText);
			}
		});
		return sText;
	}

	// Gemini: Google's generateContent API, streaming
	async function streamGemini(oConn, oRequest, fnOnText) {
		var sUrl = "https://generativelanguage.googleapis.com/v1beta/models/" +
			encodeURIComponent(oConn.model) + ":streamGenerateContent?alt=sse";
		var oResponse = await post(sUrl, { "x-goog-api-key": oConn.key }, {
			systemInstruction: { parts: [{ text: oRequest.system }] },
			contents: oRequest.messages.map(function (m) {
				return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
			})
		});
		var sText = "";
		await readSse(oResponse, function (oData) {
			var aParts = oData.candidates && oData.candidates[0] && oData.candidates[0].content &&
				oData.candidates[0].content.parts;
			(aParts || []).forEach(function (oPart) {
				if (oPart.text) {
					sText += oPart.text;
					fnOnText(sText);
				}
			});
		});
		return sText;
	}

	return {
		PROVIDERS: PROVIDERS,

		/** Guesses the provider from how the key starts. */
		detectProvider: function (sKey) {
			var k = (sKey || "").trim();
			if (k.indexOf("sk-ant-") === 0) {
				return "claude";
			}
			if (k.indexOf("sk-or-") === 0) {
				return "openrouter";
			}
			if (k.indexOf("sk-") === 0) {
				return "openai";
			}
			if (k.indexOf("AIza") === 0 || k.indexOf("AQ.") === 0) {
				return "gemini";
			}
			return null;
		},

		// ---------- Saved connection (stays in this browser) ----------

		/** { provider, key, model } or null */
		getConnection: function () {
			try {
				var sSaved = window.localStorage.getItem(STORAGE_KEY);
				if (sSaved) {
					return JSON.parse(sSaved);
				}
				var sOldKey = window.localStorage.getItem(OLD_CLAUDE_KEY);
				if (sOldKey) {
					return { provider: "claude", key: sOldKey, model: PROVIDERS.claude.model };
				}
			} catch (e) {
				// blocked storage: fall back to memory
			}
			return oMemory;
		},

		setConnection: function (sProvider, sKey, sModel) {
			oMemory = {
				provider: sProvider,
				key: sKey,
				model: sModel || PROVIDERS[sProvider].model
			};
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(oMemory));
				window.localStorage.removeItem(OLD_CLAUDE_KEY);
			} catch (e) {
				// Private mode or blocked storage: keep it for this visit only
			}
		},

		clearKey: function () {
			oMemory = null;
			try {
				window.localStorage.removeItem(STORAGE_KEY);
				window.localStorage.removeItem(OLD_CLAUDE_KEY);
			} catch (e) {
				// nothing stored
			}
		},

		hasKey: function () {
			var oConn = this.getConnection();
			return !!(oConn && oConn.key);
		},

		/** Display name of the connected provider, e.g. "Gemini (Google)" */
		providerName: function () {
			var oConn = this.getConnection();
			return oConn ? PROVIDERS[oConn.provider].name : "";
		},

		// ---------- Ask the AI (streaming) ----------

		/**
		 * Streams the answer. fnOnText(sTextSoFar) runs as words arrive.
		 * oRequest: { system: "...", messages: [{ role: "user" | "assistant", content: "..." }] }
		 * Resolves with the full text; rejects with an Error whose .kind is
		 * "auth", "model", "rate", "network", "refusal" or "other".
		 */
		stream: function (oRequest, fnOnText) {
			var oConn = this.getConnection();
			if (!oConn) {
				return Promise.reject(aiError("auth"));
			}
			if (oConn.provider === "claude") {
				return streamClaude(oConn, oRequest, fnOnText);
			}
			if (oConn.provider === "gemini") {
				return streamGemini(oConn, oRequest, fnOnText);
			}
			return streamChatCompletions(oConn, oRequest, fnOnText);
		},

		// ---------- Formatting ----------

		// Turn the AI's short replies (- bullets, **bold**) into safe HTML for FormattedText
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
