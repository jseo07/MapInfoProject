let vworldMap;               // will hold your vw.Map instance
let selectedFeatures = {};  
let infoMap = {};


window.addEventListener('load', function() {
  const options = {
    mapId: 'map3d',
    apiKey: VWORLD_KEY,   // Already properly injected by Django
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.097, 36.8016, 5000),
      new vw.Direction(0, -90, 0)
    ),
    logo: true,
    navigation: true
  };

  vworldMap = new vw.Map();
  vworldMap.setOption(options);
  vworldMap.start();

  vworldMap.onClick.addEventListener(wfsEvent);

  document.getElementById('unselectall').addEventListener('click', () => {
    // Hide every selected polygon
    for (const pnu in selectedFeatures) {
        selectedFeatures[pnu].hide();
    }
    // Clear the map
    selectedFeatures = {};
    
    // (Optional) Clear info panel
    const tbody = document.querySelector('#info-table tbody');
    if (tbody) {
        tbody.innerHTML = '';
    }
    // reset our infoMap
    infoMap = {};

    });
    // wire up the button
    document.getElementById('export-csv').addEventListener('click', () => {
        const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
        exportTableToCSV(`parcels-${ts}.csv`);
    });
});

function wfsEvent(windowPosition, ecefPosition, cartographic) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;
  const [dx, dy] = getBuffer();
  const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(',');

  const url = `/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`;
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`WFS proxy error: ${r.status}`);
      return r.json();
    })
    .then(geojson => {
      const features = geojson.features || [];
      if (!features.length) return;

      // 1) Build an array of all returned PNUs
      const returnedPNUs = features.map(f => f.properties.pnu);

      // 2) If any returned PNU is already selected, toggle *that* one OFF
      for (const rPnu of returnedPNUs) {
        if (selectedFeatures[rPnu]) {
          // hide its highlight
          selectedFeatures[rPnu].hide();
          delete selectedFeatures[rPnu];
          // remove its info row from the table
          const tr = infoMap[rPnu];
          if (tr) {
            tr.parentNode.removeChild(tr);
            delete infoMap[rPnu];
          }
          return;
        }
      }

      // 3) Otherwise, pick the first feature and highlight it
      const feat     = features[0];
      const newPnu   = feat.properties.pnu;
      const parser   = new vw.GMLParser();
      parser.setId(`sel-${newPnu}`);
      const feature3d = parser.read(
        vw.GMLParserType.GEOJSON,
        url,
        'EPSG:4326'
      );
      feature3d.setOption({
        isTerrain: true,
        material:  new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
        outline:       false,
        clampToGround: true
      });
      feature3d.makeCoords();
      feature3d.show();

      selectedFeatures[newPnu] = feature3d;

      // 4) Fetch and append its info row
      fetch(`/api/pnu_info/?pnu=${newPnu}&year=2024`)
        .then(r=>r.json())
        .then(data => addInfo(newPnu, data.characteristics, data.addr, data.jibun))
        .catch(console.error);
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
  if (!tr) return;
  tr.parentNode.removeChild(tr);
  delete infoMap[pnu];
}


function getBuffer() {
  const pos = vworldMap.getCurrentPosition().position;
  const z   = pos.z;
  const baseDx = 1/(111000/z * 1.48 * 50);
  const baseDy = 1/(111000/z * 1.85 * 50);
  const scale  = 5;  
  return [ baseDx * scale, baseDy * scale ];
}




function exportTableToCSV(filename) {
  const rows = Array.from(document.querySelectorAll('#info-table tr'));
  const csv = rows.map(row => {
    // grab text from each cell (th or td)
    const cells = Array.from(row.querySelectorAll('th,td'))
      .map(cell => `"${cell.textContent.trim().replace(/"/g,'""')}"`);
    return cells.join(',');
  }).join('\n');

  // create a Blob, make a URL, and simulate a click
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}