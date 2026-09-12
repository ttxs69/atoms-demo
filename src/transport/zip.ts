import { deflateRawSync } from 'node:zlib';

/**
 * A minimal, dependency-free ZIP writer (deflate method).
 *
 * Why hand-rolled: jszip's async machinery assumes a browser worker
 * environment and hangs indefinitely under the Node runtime this app ships
 * in (verified live — an export request wedged for minutes while the same
 * SDK reads completed in seconds). Store/deflate zip is a small, stable
 * format; CRC32 + central directory is all a compliant reader needs.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  method: number;
  compressedSize: number;
  offset: number;
}

/** Build a zip archive from path → content. Directories are implied by paths. */
export function buildZip(files: Map<string, string>): Buffer {
  const entries: ZipEntry[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  const push = (buf: Uint8Array): void => {
    chunks.push(Buffer.from(buf));
    offset += buf.length;
  };

  const names = [...files.keys()].sort();
  for (const name of names) {
    const content = files.get(name) ?? '';
    const data = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const stored = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x2100, 12); // mod date (2009-01-01, arbitrary fixed)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    entries.push({
      nameBytes,
      data,
      crc,
      method,
      compressedSize: stored.length,
      offset,
    });
    push(local);
    push(nameBytes);
    push(stored);
  }

  const centralStart = offset;
  for (const entry of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // UTF-8
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2100, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressedSize, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(entry.offset, 42);
    push(central);
    push(entry.nameBytes);
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  push(end);

  return Buffer.concat(chunks);
}
