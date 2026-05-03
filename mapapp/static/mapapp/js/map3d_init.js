// map3d_init.js

// Assumes you have included SheetJS for exportTableToExcel, e.g.
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

let vworldMap;
let selectedFeatures = {};
let infoMap          = {};
let highlightedRows = new Set();
let parcelCoords = {};

const DEFAULT_STYLE = {
  material: new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
  outline: false
};

const ACTIVE_STYLE = {
  material: new vw.Color(255,165,0,255).ws3dColor.withAlpha(0.8),
  outline: true,
  outlineColor: new vw.Color(255,0,0,255).ws3dColor,
  outlineWidth: 3
};

window.addEventListener('load', function() {
  // ── 1) Map options ──────────────────────────────────────────────
  const options = {
    mapId:       'map3d',
    apiKey:      VWORLD_KEY,
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.051523362, 36.730669214, 600),
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
    highlightedRows.clear();
    parcelCoords = {};
    updateKPIs();
  });

  // ── 6) “CSV 내보내기” button ───────────────────────────────────
  document.getElementById('export-csv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    exportTableToExcel(`parcels-${ts}.xlsx`);
  });
  
  // 검색창 
  document.getElementById('address-search-btn').addEventListener('click', searchAddressAndAddParcel);

  document.getElementById('address-search-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      searchAddressAndAddParcel();
    }
  });


});

function wfsEvent(windowPosition, ecefPosition, cartographic) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;

  selectParcelByCoordinate(lon, lat, false);
}

function selectParcelByCoordinate(lon, lat, fromSearch = false) {
  const [dx, dy] = getBuffer();
  const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(',');

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

  const proxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawWfsUrl)}`;

  fetch(proxyUrl)
    .then(r => {
      if (!r.ok) throw new Error(`WFS proxy error: ${r.status}`);
      return r.json();
    })
    .then(geojson => {
      const features = geojson.features || [];

      if (!features.length) {
        if (fromSearch) {
          setSearchMessage('주소는 찾았지만 해당 위치의 토지 필지를 찾지 못했습니다.', true);
        }
        return;
      }

      const primaryPnu = features[0].properties.pnu;

      if (!fromSearch && selectedFeatures[primaryPnu]) {
        selectedFeatures[primaryPnu].hide();
        delete selectedFeatures[primaryPnu];
        removeInfo(primaryPnu);
        return;
      }

      features.forEach(feat => {
          const pnu = feat.properties.pnu;
          if (selectedFeatures[pnu]) return;

          parcelCoords[pnu] = { lon, lat };


        const parser = new vw.GMLParser();
        parser.setId(`sel-${pnu}`);

        const feature3d = parser.read(
          vw.GMLParserType.GEOJSON,
          proxyUrl,
          'EPSG:4326'
        );

        feature3d.setOption({
          isTerrain: false,
          clampToGround: true,
          material: new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
          outline: false
        });

        feature3d.makeCoords();
        feature3d.show();

        selectedFeatures[pnu] = feature3d;

        fetchParcelInfoAndAddRow(pnu);
      });

      if (fromSearch) {
        setSearchMessage('검색한 주소의 토지가 표에 추가되었습니다.');
      }
    })
    .catch(err => {
      console.error(err);
      if (fromSearch) {
        setSearchMessage('토지 정보를 불러오는 중 오류가 발생했습니다.', true);
      }
    });
}


function wfsEvent_temp(windowPosition, ecefPosition, cartographic) {
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
  tr.dataset.pnu = pnu;
  tr.addEventListener('click', () => toggleTableRowHighlight(pnu));
  tr.innerHTML = `
    <td>
      <button class="delete-row-btn" data-pnu="${pnu}">해제</button>
    </td>
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
  tr.querySelector('.delete-row-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    deleteParcelRow(pnu);
  });
  tbody.appendChild(tr);
  infoMap[pnu] = tr;
  updateKPIs();
}

function removeInfo(pnu) {
  const tr = infoMap[pnu];

  if (tr) tr.remove();

  highlightedRows.delete(pnu);
  delete infoMap[pnu];
  updateKPIs();
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

function setFeatureStyle(pnu, style) {
  const feature = selectedFeatures[pnu];
  if (!feature) return;

  feature.setOption({
    isTerrain: false,
    clampToGround: true,
    ...style
  });

  feature.makeCoords();
  feature.show();
}

function toggleTableRowHighlight(pnu) {
  moveToParcel(pnu);

  const row = infoMap[pnu];
  if (!row) return;

  const isActive = highlightedRows.has(pnu);

  if (isActive) {
    highlightedRows.delete(pnu);
    row.classList.remove('selected-row');
    setFeatureStyle(pnu, DEFAULT_STYLE);
  } else {
    highlightedRows.add(pnu);
    row.classList.add('selected-row');
    setFeatureStyle(pnu, ACTIVE_STYLE);
  }
}

function deleteParcelRow(pnu) {
  const feature = selectedFeatures[pnu];

  if (feature) {
    feature.hide();
    delete selectedFeatures[pnu];
  }

  highlightedRows.delete(pnu);
  delete parcelCoords[pnu];
  removeInfo(pnu);
}

function setSearchMessage(message, isError = false) {
  const el = document.getElementById('address-search-message');
  if (!el) return;

  el.textContent = message;
  el.classList.toggle('search-error', isError);
}

function buildGeocodeUrl(address, type) {
  return (
    `https://api.vworld.kr/req/address?` +
    `service=address` +
    `&request=getcoord` +
    `&version=2.0` +
    `&crs=epsg:4326` +
    `&address=${encodeURIComponent(address)}` +
    `&refine=true` +
    `&simple=false` +
    `&format=json` +
    `&type=${type}` +
    `&key=${VWORLD_KEY}`
  );
}

function fetchGeocode(address, type) {
  const rawUrl = buildGeocodeUrl(address, type);
  const proxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawUrl)}`;

  return fetch(proxyUrl)
    .then(r => {
      if (!r.ok) throw new Error(`Geocoder error: ${r.status}`);
      return r.json();
    });
}

function extractGeocodePoint(data) {
  const response = data.response || {};

  if (response.status !== 'OK') {
    return null;
  }

  const point = response.result && response.result.point;
  if (!point || !point.x || !point.y) {
    return null;
  }

  return {
    lon: Number(point.x),
    lat: Number(point.y)
  };
}

function searchAddressAndAddParcel() {
  const input = document.getElementById('address-search-input');
  const query = input.value.trim();

  if (!query) {
    setSearchMessage('검색할 주소를 입력하세요.', true);
    clearSearchResults();
    return;
  }

  setSearchMessage('주소 후보를 검색 중입니다...');
  clearSearchResults();

  Promise.all([
    fetchSearchCandidates(query, 'Juso'),
    fetchSearchCandidates(query, 'Jibun')
  ])
    .then(([jusoResults, jibunResults]) => {
      const results = [...jusoResults, ...jibunResults];

      if (!results.length) {
        setSearchMessage('검색 결과를 찾을 수 없습니다.', true);
        return;
      }

      setSearchMessage(`${results.length}개의 후보를 찾았습니다. 선택하세요.`);
      renderSearchResults(results);
    })
    .catch(err => {
      console.error(err);
      setSearchMessage('주소 후보 검색 중 오류가 발생했습니다.', true);
    });
}


function fetchParcelInfoAndAddRow(pnu) {
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

          addInfo(
            pnu,
            {
              지형고도코드명: rec.tpgrphHgCodeNm,
              기준연도: rec.stdrYear,
              지목명: rec.lndcgrCodeNm,
              도로접도구분명: rec.roadSideCodeNm,
              공시지가: pr.pblntfPclnd,
              용도지역1명: rec.prposArea1Nm,
              용도지역2명: rec.prposArea2Nm,
              토지이용상황명: rec.ladUseSittnNm,
              최종갱신일자: rec.lastUpdtDt,
              등록구분명: rec.regstrSeCodeNm,
              지번면적: rec.lndpclAr,
              지형형상코드명: rec.tpgrphFrmCodeNm,
              지적구역명: rec.ldCodeNm
            },
            rec.ldCodeNm + ' ' + rec.mnnmSlno + (rec.bubun || ''),
            pr.mnnmSlno
          );
        });
    })
    .catch(console.error);
}

function clearSearchResults() {
  const box = document.getElementById('address-search-results');
  if (box) box.innerHTML = '';
}

function buildSearchUrl(query, category) {
  return (
    `https://map.vworld.kr/search.do?` +
    `apiKey=${VWORLD_KEY}` +
    `&q=${encodeURIComponent(query)}` +
    `&category=${category}` +
    `&pageUnit=20` +
    `&pageIndex=1` +
    `&output=json`
  );
}

function fetchSearchCandidates(query, category) {
  const rawUrl = buildSearchUrl(query, category);
  const proxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawUrl)}`;

  return fetch(proxyUrl)
    .then(r => {
      if (!r.ok) throw new Error(`Search API error: ${r.status}`);
      return r.json();
    })
    .then(data => normalizeSearchResults(data, category));
}

function normalizeSearchResults(data, category) {
  const list =
    data?.LIST ||
    data?.list ||
    data?.result?.items ||
    data?.response?.result?.items ||
    [];

  return list.map(item => {
    const title =
      item.title ||
      item.name ||
      item.JUSO ||
      item.juso ||
      item.address ||
      item.ADDR ||
      '';

    const address =
      item.address ||
      item.ADDR ||
      item.JUSO ||
      item.juso ||
      item.roadAddr ||
      item.parcelAddr ||
      title;

    const lon =
      item.x ||
      item.X ||
      item.lon ||
      item.longitude ||
      item.point?.x;

    const lat =
      item.y ||
      item.Y ||
      item.lat ||
      item.latitude ||
      item.point?.y;

    return {
      category,
      title,
      address,
      lon: lon ? Number(lon) : null,
      lat: lat ? Number(lat) : null
    };
  }).filter(item => item.address);
}

function renderSearchResults(results) {
  const box = document.getElementById('address-search-results');
  if (!box) return;

  box.innerHTML = '';

  results.forEach(result => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'address-result-item';

    btn.innerHTML = `
      <span class="address-result-category">${result.category}</span>
      <span class="address-result-title">${result.title || result.address}</span>
      <span class="address-result-address">${result.address}</span>
    `;

    btn.addEventListener('click', () => {
      chooseSearchResult(result);
    });

    box.appendChild(btn);
  });
}

function chooseSearchResult(result) {
  clearSearchResults();
  setSearchMessage('선택한 주소의 토지 정보를 불러오는 중입니다...');

  if (result.lon && result.lat) {
    selectParcelByCoordinate(result.lon, result.lat, true);
    return;
  }

  const type = result.category === 'Juso' ? 'road' : 'parcel';

  fetchGeocode(result.address, type)
    .then(data => {
      const point = extractGeocodePoint(data);

      if (!point) {
        setSearchMessage('선택한 주소의 좌표를 찾을 수 없습니다.', true);
        return;
      }

      selectParcelByCoordinate(point.lon, point.lat, true);
    })
    .catch(err => {
      console.error(err);
      setSearchMessage('선택한 주소 처리 중 오류가 발생했습니다.', true);
    });
}

function moveToParcel(pnu) {
  const coord = parcelCoords[pnu];
  if (!coord || !vworldMap) return;

  const current = vworldMap.getCurrentPosition().position;
  const currentHeight = current?.z || 1500;

  vworldMap.moveTo(
    new vw.CameraPosition(
      new vw.CoordZ(coord.lon, coord.lat, currentHeight),
      new vw.Direction(0, -90, 0)
    )
  );
}

function updateKPIs() {

  let totalLandValue = 0;
  let totalArea = 0;

  Object.values(infoMap).forEach(row => {

    const cells = row.cells;

    const priceText = cells[7]?.textContent || '';
    const areaText  = cells[13]?.textContent || '';

    const pricePerM2 = parseFloat(priceText.replace(/,/g,'').replace(/[^\d.]/g,'')) || 0;
    const area       = parseFloat(areaText.replace(/,/g,'').replace(/[^\d.]/g,'')) || 0;

    const landValue = pricePerM2 * area;

    totalLandValue += landValue;
    totalArea += area;

  });

  const priceEl = document.getElementById('kpi-total-price');
  const areaEl  = document.getElementById('kpi-total-area');

  if (priceEl) {
    priceEl.textContent = '₩ ' + Math.round(totalLandValue).toLocaleString();
  }

  if (areaEl) {
    areaEl.textContent = totalArea.toLocaleString() + ' ㎡';
  }

}