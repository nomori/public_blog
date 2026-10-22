// サンプルGPX生成（大倉→塔ノ岳 往復っぽいルート）。デモ用。
import fs from 'node:fs';
const start = { lat: 35.3955, lon: 139.1695, ele: 290 };
const top = { lat: 35.4505, lon: 139.1633, ele: 1491 };
const pts = [];
const N = 400;
let t = new Date('2026-10-12T06:30:00+09:00').getTime();
for (let i = 0; i <= N; i++) {
  const up = i <= N / 2;
  const f = up ? i / (N / 2) : (N - i) / (N / 2);
  const wig = Math.sin(f * 18) * 0.0018;
  const lat = start.lat + (top.lat - start.lat) * f + (up ? 0 : 0.0006);
  const lon = start.lon + (top.lon - start.lon) * f + wig;
  const ele = start.ele + (top.ele - start.ele) * Math.pow(f, 0.85) + Math.sin(i / 7) * 6;
  pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><time>${new Date(t).toISOString()}</time></trkpt>`);
  t += (up ? 38 : 26) * 1000 + (i === N / 2 ? 25 * 60 * 1000 : 0);
}
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="sample" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>大倉尾根から塔ノ岳へ</name><trkseg>
${pts.join('\n')}
</trkseg></trk></gpx>`;
fs.mkdirSync(new URL('../inbox/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../inbox/sample-tonodake.gpx', import.meta.url), gpx);
console.log('✔ inbox/sample-tonodake.gpx');
