// A minimal GTFS-realtime reader (protobuf wire format), just the fields the Transportation widgets use:
// vehicle positions and service alerts. Field numbers from gtfs-realtime.proto (google/transit).
// No library: protobuf is a list of (field number, wire type, value) records, nested by length.

function* fields(buf, start = 0, end = buf.length) {
  let i = start;
  const varint = () => {
    let x = 0, mul = 1, b;
    do { b = buf[i++]; x += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
    return x;
  };
  while (i < end) {
    const key = varint(), num = Math.floor(key / 8), wire = key & 7;
    if (wire === 0) yield { num, wire, value: varint() };
    else if (wire === 1) { yield { num, wire, at: i, len: 8 }; i += 8; }
    else if (wire === 2) { const len = varint(); yield { num, wire, at: i, len }; i += len; }
    else if (wire === 5) { yield { num, wire, at: i, len: 4 }; i += 4; }
    else throw new Error(`GTFS-rt: unsupported wire type ${wire}`);
  }
}
const sub = (buf, f) => buf.subarray(f.at, f.at + f.len);
const str = (buf, f) => new TextDecoder().decode(sub(buf, f));
const f32 = (buf, f) => new DataView(buf.buffer, buf.byteOffset + f.at, 4).getFloat32(0, true);

/** TranslatedString → its first (or English) text. */
function translated(buf) {
  let first = null;
  for (const t of fields(buf)) {
    if (t.num !== 1 || t.wire !== 2) continue;
    let text = null, lang = null;
    for (const g of fields(sub(buf, t))) {
      if (g.num === 1 && g.wire === 2) text = str(sub(buf, t), g);
      if (g.num === 2 && g.wire === 2) lang = str(sub(buf, t), g);
    }
    if (text && (!first || /^en/i.test(lang || ""))) first = text;
  }
  return first;
}

/** Decode a FeedMessage into { timestamp, vehicles: [{ id, label, routeId, tripId, lat, lon, bearing, speed, timestamp }],
 *  alerts: [{ header, description, url, routeIds, start, end }] }. */
export function decodeFeed(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = { timestamp: null, vehicles: [], alerts: [] };
  for (const f of fields(buf)) {
    if (f.num === 1 && f.wire === 2) { // header
      for (const h of fields(sub(buf, f))) if (h.num === 3 && h.wire === 0) out.timestamp = h.value;
    } else if (f.num === 2 && f.wire === 2) { // entity
      const ent = sub(buf, f);
      let id = null;
      for (const e of fields(ent)) {
        if (e.num === 1 && e.wire === 2) id = str(ent, e);
        else if (e.num === 4 && e.wire === 2) out.vehicles.push(vehicle(sub(ent, e), id));
        else if (e.num === 5 && e.wire === 2) out.alerts.push(alert(sub(ent, e)));
      }
    }
  }
  return out;
}

function vehicle(vp, id) {
  const v = { id, label: null, routeId: null, tripId: null, lat: null, lon: null, bearing: null, speed: null, timestamp: null };
  for (const f of fields(vp)) {
    if (f.num === 1 && f.wire === 2) { // trip
      for (const t of fields(sub(vp, f))) {
        if (t.num === 1 && t.wire === 2) v.tripId = str(sub(vp, f), t);
        if (t.num === 5 && t.wire === 2) v.routeId = str(sub(vp, f), t);
      }
    } else if (f.num === 2 && f.wire === 2) { // position
      const p = sub(vp, f);
      for (const g of fields(p)) {
        if (g.wire !== 5) continue;
        if (g.num === 1) v.lat = f32(p, g);
        if (g.num === 2) v.lon = f32(p, g);
        if (g.num === 3) v.bearing = f32(p, g);
        if (g.num === 5) v.speed = f32(p, g);
      }
    } else if (f.num === 5 && f.wire === 0) v.timestamp = f.value;
    else if (f.num === 8 && f.wire === 2) { // vehicle descriptor
      for (const d of fields(sub(vp, f))) {
        if (d.num === 1 && d.wire === 2) v.id = str(sub(vp, f), d) || v.id;
        if (d.num === 2 && d.wire === 2) v.label = str(sub(vp, f), d);
      }
    }
  }
  return v;
}

function alert(al) {
  const a = { header: null, description: null, url: null, routeIds: [], start: null, end: null };
  for (const f of fields(al)) {
    const b = sub(al, f);
    if (f.num === 1 && f.wire === 2) for (const t of fields(b)) { if (t.num === 1) a.start = t.value; if (t.num === 2) a.end = t.value; }
    else if (f.num === 5 && f.wire === 2) for (const s of fields(b)) { if (s.num === 2 && s.wire === 2) a.routeIds.push(str(b, s)); }
    else if (f.num === 8 && f.wire === 2) a.url = translated(b);
    else if (f.num === 10 && f.wire === 2) a.header = translated(b);
    else if (f.num === 11 && f.wire === 2) a.description = translated(b);
  }
  return a;
}

/** Fetch and decode a GTFS-realtime feed; resolves null on any failure (the widgets fall back to the schedule). */
export async function fetchFeed(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return decodeFeed(new Uint8Array(await r.arrayBuffer()));
  } catch { return null; }
}
