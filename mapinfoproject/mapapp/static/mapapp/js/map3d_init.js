// map3d_init.js

let vworldMap;
let selectedFeatures = {};
let infoMap          = {};

window.addEventListener('load', function() {
  // ── 1) Your original map options ────────────────────────────────
  const options = {
    mapId:       'map3d',
    apiKey:      VWORLD_KEY,
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.097, 36.8016, 5000),  // back to 5000 m
      new vw.Direction(0, -90, 0)
    ),
    logo:        true,
    navigation:  true
  };

  // ── 2) Instantiate & configure map ─────────────────────────────
  vworldMap = new vw.Map();
  vworldMap.setOption(options);

  // ── 3) Inject your WMS overlay once Cesium is ready ─────────────
  vw.ws3dInitCallBack = function() {
    const wmsLayer  = new vw.Layers();
    const wmsSource = new vw.source.TileWMS();
    wmsSource.setParams("tilesize=256");
    wmsSource.setLayers("lp_pa_cbnd_bubun");
    wmsSource.setStyles("lp_pa_cbnd_bubun_webgl");
    wmsSource.setFormat("image/png");
    wmsSource.setUrl(
      `https://api.vworld.kr/req/wms?key=${VWORLD_KEY}` +
      `&domain=${location.origin}&`
    );
    const wmsTile = new vw.layer.Tile(wmsSource);
    wmsLayer.add(wmsTile);
  };

  // ── 4) Start the map & hook your click handler ─────────────────
  vworldMap.start();
  vworldMap.onClick.addEventListener(wfsEvent);

  // ── 5) “모두 해제” button ────────────────────────────────────────
  document.getElementById('unselectall').addEventListener('click', () => {
    for (const pnu in selectedFeatures) {
      selectedFeatures[pnu].hide();
    }
    selectedFeatures = {};

    const tbody = document.querySelector('#info-table tbody');
    if (tbody) tbody.innerHTML = '';
    infoMap = {};
  });

  // ── 6) “CSV 내보내기” button ───────────────────────────────────
  document.getElementById('export-csv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    exportTableToExcel(`parcels-${ts}.csv`);
  });
});

function wfsEvent(windowPosition, ecefPosition, cartographic) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;
  const [dx, dy] = getBuffer();
  const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(',');

  fetch(`/mapapp/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`)
    .then(r => { if (!r.ok) throw new Error(`WFS proxy error: ${r.status}`); return r.json(); })
    .then(geojson => {
      const features = geojson.features || [];
      if (!features.length) return;
      const primaryPnu = features[0].properties.pnu;

      // toggle-off
      if (selectedFeatures[primaryPnu]) {
        selectedFeatures[primaryPnu].hide();
        delete selectedFeatures[primaryPnu];
        removeInfo(primaryPnu);
        return;
      }

      // highlight all returned parcels
      features.forEach(feat => {
        const pnu = feat.properties.pnu;
        if (selectedFeatures[pnu]) return;

        const parser = new vw.GMLParser();
        parser.setId(`sel-${pnu}`);
        const feature3d = parser.read(
          vw.GMLParserType.GEOJSON,
          `/mapapp/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`,
          'EPSG:4326'
        );
        feature3d.setOption({
          // sit exactly on the land surface:
        isTerrain:     false,      // still not draped to terrain mesh
        clampToGround: true,       // forces coords down to ground
        // height:      0,         // no extra lift
    
        // your fill only—no outline
        material:      new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
        outline:       false
        });
        feature3d.makeCoords();
        feature3d.show();
        selectedFeatures[pnu] = feature3d;

        fetch(`/mapapp/api/pnu_info/?pnu=${pnu}&year=2024`)
          .then(r => r.json())
          .then(data => addInfo(pnu, data.characteristics, data.addr, data.jibun))
          .catch(console.error);
      });
    })
    .catch(console.error);
}

function addInfo(pnu, info, addr, jibun) {
  const tbody = document.querySelector('#info-table tbody');
  if (infoMap[pnu]) return;
  const tr = document.createElement('tr');
  tr.id = `info-${pnu}`;
  tr.innerHTML = `
    <td>${addr              || ''}</td>
    <td>${jibun             || ''}</td>
    <td>${info.지형고도코드명 || ''}</td>
    <td>${info.기준연도      || ''}</td>
    <td>${info.지목명        || ''}</td>
    <td>${info.도로접도구분명 || ''}</td>
    <td>${info.공시지가      || ''}</td>
    <td>${info.용도지역1명   || ''}</td>
    <td>${info.용도지역2명   || ''}</td>
    <td>${info.토지이용상황명 || ''}</td>
    <td>${info.최종갱신일자   || ''}</td>
    <td>${info.등록구분명     || ''}</td>
    <td>${info.지번면적      || ''}</td>
    <td>${info.지형형상코드명 || ''}</td>
  `;
  tbody.appendChild(tr);
  infoMap[pnu] = tr;
}

function removeInfo(pnu) {
  const tr = infoMap[pnu];
  if (tr) tr.remove();
  delete infoMap[pnu];
}

function getBuffer() {
  const pos = vworldMap.getCurrentPosition().position;
  const z   = pos.z;
  const baseDx = 1/(111000/z * 1.48 * 50);
  const baseDy = 1/(111000/z * 1.85 * 50);
  const scale  = 0.001;  // your original scale
  return [ baseDx * scale, baseDy * scale ];
}

function exportTableToCSV(filename) {
  const rows = Array.from(document.querySelectorAll('#info-table tr'));
  const csv = rows.map(row =>
    Array.from(row.cells)
      .map(cell => `"${cell.textContent.trim().replace(/"/g,'""')}"`)
      .join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportTableToExcel(filename) {
  // Convert the table #info-table into a SheetJS workbook:
  const table = document.getElementById('info-table');
  const workbook = XLSX.utils.table_to_book(table, { sheet: "Parcels" });

  // Ensure filename ends with .xlsx
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';

  // Write and trigger download
  XLSX.writeFile(workbook, name);
}

