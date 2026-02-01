let selectedFeatures = {};  
let infoMap = {};

// ── 1) Configure the global MapOptions as per vWorld sample ───────
vw.ol3.MapOptions = {
  basemapType:       vw.ol3.BasemapType.GRAY,       // or HYBRID, ROAD, etc.
  controlDensity:    vw.ol3.DensityType.LOW,
  interactionDensity:vw.ol3.DensityType.BASIC,
  controlsAutoArrange: true,
  // camera/home positions are 3D‐only, you can omit or leave defaults
  apiKey:            VWORLD_KEY,
  center:            new vw.Coord(127.097, 36.8016),
  zoom:              9
};

// ── 2) Instantiate the map using that singleton ─────────────────────
window.addEventListener('load', function() {
    const olMap = vworldMap.map;

  // ── 3) Handle clicks via OL3 singleclick ──────────────────────────
  olMap.on('singleclick', function(evt) {
    // evt.coordinate is [lon, lat]
    const [lon, lat] = evt.coordinate;
    wfsEvent(lon, lat);
  });

  // ── 4) “모두 해제” button ───────────────────────────────────────────
  document.getElementById('unselectall').addEventListener('click', () => {
    Object.values(selectedFeatures).forEach(f => f.hide());
    selectedFeatures = {};

    const tbody = document.querySelector('#info-table tbody');
    if (tbody) tbody.innerHTML = '';
    infoMap = {};
  });

  // ── 5) “CSV 내보내기” button ─────────────────────────────────────
  document.getElementById('export-csv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    exportTableToCSV(`parcels-${ts}.csv`);
  });
});

// ── 6) Your existing WFS → highlight → table logic ─────────────────
function wfsEvent(lon, lat) {
  const [dx, dy] = getBuffer();
  const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(',');

  fetch(`/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(geojson => {
      const features = geojson.features || [];
      if (!features.length) return;

      const primaryPnu = features[0].properties.pnu;

      // Toggle off only the primary parcel if already selected
      if (selectedFeatures[primaryPnu]) {
        selectedFeatures[primaryPnu].hide();
        delete selectedFeatures[primaryPnu];
        removeInfo(primaryPnu);
        return;
      }

      // Otherwise highlight & info for all returned parcels
      features.forEach(feat => {
        const pnu = feat.properties.pnu;
        if (selectedFeatures[pnu]) return;

        // Highlight in the vWorld 2D view via GMLParser (works in 2D too)
        const parser = new vw.GMLParser();
        parser.setId(`sel-${pnu}`);
        const feature2d = parser.read(
          vw.GMLParserType.GEOJSON,
          `/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`,
          'EPSG:4326'
        );
        feature2d.setOption({
          isTerrain:     false,
          clampToGround: false,
          height:        0,
          material:      new vw.Color(0,255,0,255).olColor.withAlpha(0.5),
          outline:       true,
          outlineColor:  new vw.Color(255,0,0,255).olColor,
          outlineWidth:  2
        });
        feature2d.makeCoords();
        feature2d.show();

        selectedFeatures[pnu] = feature2d;

        // Append info row
        fetch(`/api/pnu_info/?pnu=${pnu}&year=2024`)
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
  if (tr) { tr.remove(); delete infoMap[pnu]; }
}

function getBuffer() {
  // small degree-based buffer
  return [0.00005, 0.00005];
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
