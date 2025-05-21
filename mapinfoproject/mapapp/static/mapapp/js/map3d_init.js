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
});

function wfsEvent(windowPosition, ecefPosition, cartographic, featureInfo, event) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;
  const [dx, dy] = getBuffer();  
  const minLon = lon - dx;
  const minLat = lat - dy;
  const maxLon = lon + dx;
  const maxLat = lat + dy;
  const bbox   = `${minLon},${minLat},${maxLon},${maxLat}`;


  // Build a proper ogc Filter string
    const url = `/api/landuse_wfs/?bbox=${encodeURIComponent(bbox)}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`WFS proxy error: ${res.status}`);
      return res.json();
    })
    .then(geojson => {
      // If nothing returned, do nothing
      if (!geojson.features.length) return;

      const props  = geojson.features[0].properties;
      const pnu = props.pnu;
      fetch(`/api/pnu_info/?pnu=${pnu}&year=2024`)
        .then(r => r.json())
        .then(data => {
            console.log('토지 특성:',    data.characteristics);
            // e.g. update your info panel with these additional fields…
        });


      if (selectedFeatures[pnu]) {
        selectedFeatures[pnu].hide();
        delete selectedFeatures[pnu];
        removeInfo(pnu);
        return;
      }

      const parser  = new vw.GMLParser();
      parser.setId(`sel-${pnu}`);
      const feature = parser.read(
        vw.GMLParserType.GEOJSON,
        url,
        'EPSG:4326'
      );

      feature.setOption({
        isTerrain:     true,
        material:      new vw.Color(0, 255, 0, 255).ws3dColor.withAlpha(0.5),
        outline:       false,
        clampToGround: true
      });
      feature.makeCoords();
      feature.show();

      selectedFeatures[pnu] = feature;
      
      fetch(`/api/pnu_info/?pnu=${pnu}&year=2024`)
        .then(r=>r.json())
        .then(data => addInfo(pnu, data.characteristics, data.addr, data.jibun))
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



