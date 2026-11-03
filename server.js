// Tiny static web server so you can run the app with just: node server.js
// (UI5 loads views and JSON with HTTP requests, so opening index.html as a file does not work.)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "webapp");
const PORT = process.env.PORT || 8080;
const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".json": "application/json",
	".xml": "application/xml",
	".properties": "text/plain; charset=utf-8",
	".css": "text/css",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webmanifest": "application/manifest+json"
};

http.createServer((req, res) => {
	let url = decodeURIComponent(req.url.split("?")[0]);
	if (url === "/") url = "/index.html";
	const file = path.join(ROOT, url);
	if (!file.startsWith(ROOT)) {
		res.writeHead(403);
		return res.end();
	}
	fs.readFile(file, (err, data) => {
		if (err) {
			res.writeHead(404);
			return res.end("Not found");
		}
		res.writeHead(200, {
			"Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
			// Always load the latest file while you are learning and editing
			"Cache-Control": "no-store"
		});
		res.end(data);
	});
}).listen(PORT, () => console.log("Fiori app running at http://localhost:" + PORT));
