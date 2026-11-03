// Draws the app icon (blue square + white product box) and saves it as PNG files.
// No packages needed. Run from the project folder:  node tools/make-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "webapp", "icons");

// Icon design in a 512 x 512 space
const C1 = [0, 112, 242];  // #0070f2 (top left)
const C2 = [10, 63, 143];  // #0a3f8f (bottom right)
const HALF_STROKE = 15;
const P = {
	top: [256, 128], right: [372, 192], mid: [256, 256], left: [140, 192],
	rightLow: [372, 320], bottom: [256, 384], leftLow: [140, 320]
};
const LINES = [
	[P.top, P.right], [P.right, P.mid], [P.mid, P.left], [P.left, P.top],
	[P.left, P.leftLow], [P.leftLow, P.bottom], [P.bottom, P.rightLow], [P.rightLow, P.right],
	[P.mid, P.bottom]
];
const TOP_FACE = [P.top, P.right, P.mid, P.left];

function distToSegment(x, y, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1];
	const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function inPolygon(x, y, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function draw(size) {
	const px = Buffer.alloc(size * size * 4);
	const scale = 512 / size;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const u = (x + 0.5) * scale, v = (y + 0.5) * scale;
			const t = (u + v) / 1024;
			let rgb = C1.map((c, i) => c + (C2[i] - c) * t);

			// Light top face, then the white outline (anti-aliased)
			if (inPolygon(u, v, TOP_FACE)) rgb = rgb.map(c => c + (255 - c) * 0.22);
			const d = Math.min(...LINES.map(l => distToSegment(u, v, l[0], l[1])));
			const a = Math.max(0, Math.min(1, (HALF_STROKE - d) / scale + 0.5));
			rgb = rgb.map(c => c + (255 - c) * a);

			const o = (y * size + x) * 4;
			px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
		}
	}
	return px;
}

// ---- Minimal PNG writer ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0))
	]);
}

fs.mkdirSync(OUT, { recursive: true });
[["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180], ["favicon-32.png", 32]]
	.forEach(([name, size]) => {
		fs.writeFileSync(path.join(OUT, name), png(size, draw(size)));
		console.log("saved", name);
	});
