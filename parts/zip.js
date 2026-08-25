// ———————————————————————————
// ZIP WRITER
// minimal (store method, no compression), behind the editor's "download all files" action — strBytes(str) and makeZip(entries) turn { name, bytes } entries into a blob using browser globals only
// ———————————————————————————
function crc32(bytes) {
	let table = crc32.table;
	if (!table) {
		table = crc32.table = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			table[n] = c >>> 0;
		}
	}
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
	return (crc ^ 0xffffffff) >>> 0;
}
export function strBytes(s) {
	return new TextEncoder().encode(s);
}
export function makeZip(entries) {
	// entries: [{ name, bytes: Uint8Array }]
	function u16(n) {
		return [n & 255, (n >>> 8) & 255];
	}
	function u32(n) {
		return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
	}
	let parts = [],
		central = [],
		offset = 0;
	entries.forEach(function (e) {
		const nameBytes = strBytes(e.name),
			data = e.bytes,
			crc = crc32(data),
			size = data.length;
		const local = new Uint8Array(
			[].concat(
				u32(0x04034b50),
				u16(20),
				u16(0),
				u16(0),
				u16(0),
				u16(0),
				u32(crc),
				u32(size),
				u32(size),
				u16(nameBytes.length),
				u16(0)
			)
		);
		parts.push(local, nameBytes, data);
		central.push(
			new Uint8Array(
				[].concat(
					u32(0x02014b50),
					u16(20),
					u16(20),
					u16(0),
					u16(0),
					u16(0),
					u16(0),
					u32(crc),
					u32(size),
					u32(size),
					u16(nameBytes.length),
					u16(0),
					u16(0),
					u16(0),
					u16(0),
					u32(0),
					u32(offset)
				)
			),
			nameBytes
		);
		offset += local.length + nameBytes.length + size;
	});
	const centralSize = central.reduce(function (n, b) {
		return n + b.length;
	}, 0);
	const end = new Uint8Array(
		[].concat(
			u32(0x06054b50),
			u16(0),
			u16(0),
			u16(entries.length),
			u16(entries.length),
			u32(centralSize),
			u32(offset),
			u16(0)
		)
	);
	return new Blob(parts.concat(central, [end]), { type: "application/zip" });
}
