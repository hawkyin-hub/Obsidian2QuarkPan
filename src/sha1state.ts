// SHA-1 incremental state, for Quark multipart uploads.
// OSS requires part 2+ to carry an `X-Oss-Hash-Ctx` header describing the
// SHA-1 state after all previous bytes (QuarkPan's
// _calculate_incremental_hash_context). This is the true SHA-1 compression
// state over complete 64-byte blocks only — no padding, no finalisation.
// Our chunk size (4 MiB) is a multiple of 64, so previous parts are always
// whole blocks and the "ignore trailing partial block" case never arises.

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

export function sha1IncrementalContext(previousData: Uint8Array, processedBytes: number = previousData.length): string {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const view = new DataView(previousData.buffer, previousData.byteOffset, previousData.byteLength);
  const fullBlocks = Math.floor(previousData.length / 64);
  for (let b = 0; b < fullBlocks; b++) {
    const off = b * 64;
    const w: number[] = [];
    for (let j = 0; j < 16; j++) w.push(view.getUint32(off + j * 4, false));
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w.push(rotl(x, 1));
    }
    let a = h0;
    let bb = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (bb & c) | (~bb & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = bb ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (bb & c) | (bb & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = bb ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = rotl(bb, 30);
      bb = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + bb) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const ctx = {
    hash_type: "sha1",
    h0: String(h0 >>> 0),
    h1: String(h1 >>> 0),
    h2: String(h2 >>> 0),
    h3: String(h3 >>> 0),
    h4: String(h4 >>> 0),
    Nl: String(processedBytes * 8),
    Nh: "0",
    data: "",
    num: "0",
  };
  const json = JSON.stringify(ctx);
  let s = "";
  for (const byte of new TextEncoder().encode(json)) s += String.fromCharCode(byte);
  return btoa(s);
}
