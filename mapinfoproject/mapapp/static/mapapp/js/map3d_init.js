// map3d_init.js

// Assumes you have included SheetJS for exportTableToExcel, e.g.
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

let vworldMap;
let selectedFeatures = {};
let infoMap          = {};

window.addEventListener('load', function() {
  // ── 1) Map options ──────────────────────────────────────────────
  const options = {
    mapId:       'map3d',
    apiKey:      VWORLD_KEY,
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.097, 36.8016, 5000),
      new vw.Direction(0, -90, 0)
    ),
    logo:        true,
    navigation:  true
  };

  // ── 2) Instantiate map ───────────────────────────────────────────
  vworldMap = new vw.Map();
  vworldMap.setOption(options);

  // ── 3) Add your WMS overlay once Cesium is ready ─────────────────
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

  // ── 4) Start map & hook click ────────────────────────────────────
  vworldMap.start();
  vworldMap.onClick.addEventListener(wfsEvent);

  // ── 5) “모두 해제” button ────────────────────────────────────────
  document.getElementById('unselectall').addEventListener('click', () => {
    Object.values(selectedFeatures).forEach(f => f.hide());
    selectedFeatures = {};

    const tbody = document.querySelector('#info-table tbody');
    if (tbody) tbody.innerHTML = '';
    infoMap = {};
  });

  // ── 6) “CSV 내보내기” button ───────────────────────────────────
  document.getElementById('export-csv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    exportTableToExcel(`parcels-${ts}.xlsx`);
  });
});

function wfsEvent(windowPosition, ecefPosition, cartographic) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;
  const [dx, dy] = getBuffer();
  const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(',');

  // Build raw WFS URL
  const rawWfsUrl = [
    "https://api.vworld.kr/req/wfs?",
    `key=${VWORLD_KEY}`,
    "&SERVICE=WFS",
    "&VERSION=2.0.0",
    "&REQUEST=GetFeature",
    "&TYPENAME=lp_pa_cbnd_bubun",
    "&OUTPUT=application/json",
    "&SRSNAME=EPSG:4326",
    `&BBOX=${bbox}`
  ].join("");

  // Wrap in vWorld proxy
  const proxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawWfsUrl)}`;

  fetch(proxyUrl)
    .then(r => {
      if (!r.ok) throw new Error(`WFS proxy error: ${r.status}`);
      return r.json();
    })
    .then(geojson => {
      const features = geojson.features || [];
      if (!features.length) return;

      // Primary parcel toggle
      const primaryPnu = features[0].properties.pnu;
      if (selectedFeatures[primaryPnu]) {
        selectedFeatures[primaryPnu].hide();
        delete selectedFeatures[primaryPnu];
        removeInfo(primaryPnu);
        return;
      }

      // Highlight all returned parcels
      features.forEach(feat => {
        const pnu = feat.properties.pnu;
        if (selectedFeatures[pnu]) return;

        const parser = new vw.GMLParser();
        parser.setId(`sel-${pnu}`);
        const feature3d = parser.read(
          vw.GMLParserType.GEOJSON,
          proxyUrl,
          'EPSG:4326'
        );
        feature3d.setOption({
          isTerrain:     false,
          clampToGround: true,
          material:      new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
          outline:       false
        });
        feature3d.makeCoords();
        feature3d.show();
        selectedFeatures[pnu] = feature3d;

        //fetch(`/mapapp/api/pnu_info/?pnu=${pnu}&year=2024`)
          //.then(r => r.json())
          //.then(data => addInfo(pnu, data.characteristics, data.addr, data.jibun))
          //.catch(console.error);

        const charUrl = 
        `https://api.vworld.kr/ned/data/getLandCharacteristics?` +
        `key=${VWORLD_KEY}` +
        `&domain=${encodeURIComponent(location.origin)}` +
        `&pnu=${pnu}` +
        `&stdrYear=2024` +
        `&format=json`;
        const charProxy = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(charUrl)}`;
        const priceUrl =
        `https://api.vworld.kr/ned/data/getIndvdLandPriceAttr?` +
        `key=${VWORLD_KEY}` +
        `&domain=${encodeURIComponent(location.origin)}` +
        `&pnu=${pnu}` +
        `&stdrYear=2024` +
        `&format=json`;
      const priceProxy = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(priceUrl)}`;

       fetch(charProxy)
        .then(r => r.json())
        .then(charData => {
          const rec = (charData.landCharacteristicss.field || [])[0] || {};
          return fetch(priceProxy)
            .then(r => r.json())
            .then(priceData => {
              const pr = (priceData.indvdLandPrices.field || [])[0] || {};
              // now call addInfo with both datasets:
              addInfo(pnu,
                {
                  지형고도코드명:    rec.tpgrphHgCodeNm,
                  기준연도:        rec.stdrYear,
                  지목명:          rec.lndcgrCodeNm,
                  도로접도구분명:   rec.roadSideCodeNm,
                  공시지가:        pr.pblntfPclnd,
                  용도지역1명:     rec.prposArea1Nm,
                  용도지역2명:     rec.prposArea2Nm,
                  토지이용상황명:   rec.ladUseSittnNm,
                  최종갱신일자:     rec.lastUpdtDt,
                  등록구분명:       rec.regstrSeCodeNm,
                  지번면적:        rec.lndpclAr,
                  지형형상코드명:   rec.tpgrphFrmCodeNm,
                  지적구역명:       rec.ldCodeNm
                },
                rec.ldCodeNm + ' ' + rec.mnnmSlno + (rec.bubun || ''), // or however you compose the jibun
                pr.mnnmSlno
              );
            });
        })
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
  const scale  = 0.001;
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
  const table    = document.getElementById('info-table');
  const workbook = XLSX.utils.table_to_book(table, { sheet: "Parcels" });
  const name     = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  XLSX.writeFile(workbook, name);
}
