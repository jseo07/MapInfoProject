// map3d_init.js

let vworldMap;
let selectedFeatures = {};
let infoMap = {};
let highlightedRows = new Set();
let parcelCoords = {};
const MAX_GROUPS = 5;

const GROUP_COLORS = [
  { name: '기본', rgba: [0, 255, 0, 255], alpha: 0.5 },
  { name: '그룹 1', rgba: [255, 99, 132, 255], alpha: 0.5 },
  { name: '그룹 2', rgba: [54, 162, 235, 255], alpha: 0.5 },
  { name: '그룹 3', rgba: [255, 206, 86, 255], alpha: 0.5 },
  { name: '그룹 4', rgba: [153, 102, 255, 255], alpha: 0.5 },
  { name: '그룹 5', rgba: [255, 159, 64, 255], alpha: 0.5 }
];

let groups = [
  {
    id: 'default',
    name: '기본',
    color: GROUP_COLORS[0]
  }
];

let activeGroupId = 'default';
let parcelGroups = {};

let dragCornerStart = null;
let dragSelectMode = false;

const MAX_DRAG_SELECT_PARCELS = 300;

const DEFAULT_STYLE = {
  material: new vw.Color(0,255,0,255).ws3dColor.withAlpha(0.5),
  outline: true,
  outlineColor: new vw.Color(0,0,0,255).ws3dColor,
  outlineWidth: 1
};

const ACTIVE_STYLE = {
  material: new vw.Color(255,165,0,255).ws3dColor.withAlpha(0.8),
  outline: true,
  outlineColor: new vw.Color(255,0,0,255).ws3dColor,
  outlineWidth: 3
};

window.addEventListener('load', function() {

  document.getElementById('import-excel-btn').addEventListener('click', () => {
    document.getElementById('import-excel-input').click();
  });

  document.getElementById('import-excel-input').addEventListener('change', importExcelFile);

  const dragBtn = document.getElementById('toggle-drag-select');

  setupGroupControls();

  if (dragBtn) {
    dragBtn.addEventListener('click', () => {
      dragSelectMode = !dragSelectMode;

      dragBtn.textContent = dragSelectMode
        ? '드래그 선택 끄기'
        : '드래그 선택 켜기';

      dragBtn.classList.toggle('active', dragSelectMode);

      const dragStatus = document.getElementById('drag-mode-status');
      if (dragStatus) {
        dragStatus.textContent = dragSelectMode
          ? '드래그 선택: ON'
          : '드래그 선택: OFF';

        dragStatus.classList.toggle('status-on', dragSelectMode);
      }

      const overlay = document.getElementById('drag-select-overlay');
      if (overlay) {
        overlay.style.display = dragSelectMode ? 'block' : 'none';
      }
    });
  }

  const options = {
    mapId: 'map3d',
    apiKey: VWORLD_KEY,
    initPosition: new vw.CameraPosition(
      new vw.CoordZ(127.051523362, 36.730669214, 600),
      new vw.Direction(0, -90, 0)
    ),
    logo: true,
    navigation: true
  };

  vworldMap = new vw.Map();
  vworldMap.setOption(options);

  vw.ws3dInitCallBack = function() {
    const wmsLayer = new vw.Layers();
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

  vworldMap.start();

  vworldMap.onClick.addEventListener(function(windowPosition, ecefPosition, cartographic) {
    if (dragSelectMode) {
      handleTwoClickBoxSelect(cartographic);
      return;
    }

    wfsEvent(windowPosition, ecefPosition, cartographic);
  });

  document.getElementById('unselectall').addEventListener('click', () => {
    // 1. Remove all map overlays
    Object.values(selectedFeatures).forEach(f => f.hide());
    selectedFeatures = {};

    // 2. Clear table
    const tbody = document.querySelector('#info-table tbody');
    if (tbody) tbody.innerHTML = '';

    // 3. Reset data stores
    infoMap = {};
    highlightedRows.clear();
    parcelCoords = {};
    parcelGroups = {};

    // 4. 🔥 Reset groups (IMPORTANT PART)
    groups = [
      {
        id: 'default',
        name: '기본',
        color: GROUP_COLORS[0]
      }
    ];

    activeGroupId = 'default';

    // 5. Re-render group buttons
    renderGroupList();

    // 6. Update KPIs
    updateKPIs();
  });
  document.getElementById('export-csv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    exportTableToExcel(`parcels-${ts}.xlsx`);
  });

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

        addParcelFeatureToMap(pnu, feat);
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

function selectParcelsByBbox(bbox) {
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
      if (!features.length) return;

      const newFeatures = features.filter(feat => {
        const pnu = feat?.properties?.pnu;

        // Ignore if invalid PNU
        if (!pnu) return false;

        // Ignore if already highlighted on the map
        if (selectedFeatures[pnu]) return false;

        // Ignore if already exists in the table/data
        if (infoMap[pnu]) return false;

        // Ignore if row already exists in DOM
        if (document.getElementById(`info-${pnu}`)) return false;

        return true;
      });
      if (newFeatures.length > MAX_DRAG_SELECT_PARCELS) {
        alert(`선택된 필지가 너무 많습니다. 최대 ${MAX_DRAG_SELECT_PARCELS}개까지 선택할 수 있습니다. 더 작은 영역을 선택해주세요.`);
        return;
      }

      newFeatures.forEach(feat => {
        const pnu = feat?.properties?.pnu;

        if (!pnu || selectedFeatures[pnu] || infoMap[pnu] || document.getElementById(`info-${pnu}`)) {
          return;
        }

        const coords = getFeatureCenter(feat);
        if (coords) {
          parcelCoords[pnu] = coords;
        }

        addParcelFeatureToMap(pnu, feat);
        fetchParcelInfoAndAddRow(pnu);
      });
    })
    .catch(console.error);
}

function addParcelFeatureToMap(pnu, feat) {
  if (selectedFeatures[pnu]) return;

  const group = getActiveGroup();
  parcelGroups[pnu] = group.id;

  const singleFeatureGeojson = {
    type: "FeatureCollection",
    features: [feat]
  };

  const blob = new Blob(
    [JSON.stringify(singleFeatureGeojson)],
    { type: "application/json" }
  );

  const objectUrl = URL.createObjectURL(blob);

  const parser = new vw.GMLParser();
  parser.setId(`sel-${pnu}`);

  const feature3d = parser.read(
    vw.GMLParserType.GEOJSON,
    objectUrl,
    'EPSG:4326'
  );

  feature3d.setOption({
    isTerrain: false,
    clampToGround: true,
    material: getGroupMaterial(group.id),
    outline: true, 
    outlineColor: new vw.Color(0,0,0,255).ws3dColor,
    outlineWidth: 1
  });

  feature3d.makeCoords();
  feature3d.show();

  selectedFeatures[pnu] = feature3d;

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function getFeatureCenter(feat) {
  try {
    const geom = feat.geometry;
    if (!geom || !geom.coordinates) return null;

    const points = [];

    function collectCoords(coords) {
      if (!Array.isArray(coords)) return;

      if (
        coords.length >= 2 &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number'
      ) {
        points.push(coords);
        return;
      }

      coords.forEach(collectCoords);
    }

    collectCoords(geom.coordinates);

    if (!points.length) return null;

    const total = points.reduce(
      (acc, point) => {
        acc.lon += point[0];
        acc.lat += point[1];
        return acc;
      },
      { lon: 0, lat: 0 }
    );

    return {
      lon: total.lon / points.length,
      lat: total.lat / points.length
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

function addInfo(pnu, info, addr, jibun) {
  const tbody = document.querySelector('#info-table tbody');
  if (infoMap[pnu]) return;

  const group = getGroupById(parcelGroups[pnu]);

  const tr = document.createElement('tr');
  tr.id = `info-${pnu}`;
  tr.dataset.pnu = pnu;

  tr.addEventListener('click', () => toggleTableRowHighlight(pnu));

  tr.innerHTML = `
    <td>
      <button class="delete-row-btn" data-pnu="${pnu}">해제</button>
    </td>
    <td>${group.name}</td>
    <td data-t="s">${pnu}</td>
    <td>${addr || ''}</td>
    <td>${jibun || ''}</td>
    <td>${info.지형고도코드명 || ''}</td>
    <td>${info.기준연도 || ''}</td>
    <td>${info.지목명 || ''}</td>
    <td>${info.도로접도구분명 || ''}</td>
    <td>${info.공시지가 || ''}</td>
    <td>${info.용도지역1명 || ''}</td>
    <td>${info.용도지역2명 || ''}</td>
    <td>${info.토지이용상황명 || ''}</td>
    <td>${info.최종갱신일자 || ''}</td>
    <td>${info.등록구분명 || ''}</td>
    <td>${info.지번면적 || ''}</td>
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
  const z = pos.z;

  const baseDx = 1 / (111000 / z * 1.48 * 50);
  const baseDy = 1 / (111000 / z * 1.85 * 50);
  const scale = 0.001;

  return [baseDx * scale, baseDy * scale];
}

function exportTableToCSV(filename) {
  const rows = Array.from(document.querySelectorAll('#info-table tr'));

  const csv = rows.map(row =>
    Array.from(row.cells)
      .map(cell => `"${cell.textContent.trim().replace(/"/g,'""')}"`)
      .join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function exportTableToExcel(filename) {
  const table = document.getElementById('info-table');
  const workbook = XLSX.utils.table_to_book(table, { sheet: "Parcels" });
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';

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
    setFeatureStyle(pnu, getDefaultStyleForParcel(pnu));
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
      const rec = (charData?.landCharacteristicss?.field || [])[0] || {};

      return fetch(priceProxy)
        .then(r => r.json())
        .then(priceData => {
          const pr = (priceData?.indvdLandPrices?.field || [])[0] || {};

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

    const priceText = cells[9]?.textContent || '';
    const areaText = cells[15]?.textContent || '';

    const pricePerM2 = parseFloat(priceText.replace(/,/g,'').replace(/[^\d.]/g,'')) || 0;
    const area = parseFloat(areaText.replace(/,/g,'').replace(/[^\d.]/g,'')) || 0;

    const landValue = pricePerM2 * area;

    totalLandValue += landValue;
    totalArea += area;
  });

  const priceEl = document.getElementById('kpi-total-price');
  const areaEl = document.getElementById('kpi-total-area');

  if (priceEl) {
    priceEl.textContent = '₩ ' + Math.round(totalLandValue).toLocaleString();
  }

  if (areaEl) {
    areaEl.textContent = totalArea.toLocaleString() + ' ㎡';
  }
}

function setMapInteractionEnabled(enabled) {
  const viewer =
    vworldMap?.getCesiumViewer?.() ||
    vworldMap?.viewer ||
    vworldMap?._viewer ||
    window.viewer;

  if (!viewer || !viewer.scene || !viewer.scene.screenSpaceCameraController) {
    console.warn('Could not access Cesium camera controller.');
    return;
  }

  const controller = viewer.scene.screenSpaceCameraController;

  controller.enableRotate = enabled;
  controller.enableTranslate = enabled;
  controller.enableZoom = enabled;
  controller.enableTilt = enabled;
  controller.enableLook = enabled;
}

function handleTwoClickBoxSelect(cartographic) {
  const lon = cartographic.longitudeDD;
  const lat = cartographic.latitudeDD;

  if (!dragCornerStart) {
    dragCornerStart = { lon, lat };
    alert('첫 번째 지점이 선택되었습니다. 반대쪽 모서리를 클릭하세요.');
    return;
  }

  const minLon = Math.min(dragCornerStart.lon, lon);
  const maxLon = Math.max(dragCornerStart.lon, lon);
  const minLat = Math.min(dragCornerStart.lat, lat);
  const maxLat = Math.max(dragCornerStart.lat, lat);

  dragCornerStart = null;

  const bbox = [minLon, minLat, maxLon, maxLat].join(',');
  selectParcelsByBbox(bbox);
}

function setupGroupControls() {
  const addBtn = document.getElementById('add-group-btn');
  const input = document.getElementById('group-name-input');

  if (!addBtn || !input) return;

  addBtn.addEventListener('click', () => {
    const name = input.value.trim();

    if (!name) {
      alert('그룹명을 입력하세요.');
      return;
    }

    if (groups.length >= MAX_GROUPS) {
      alert(`그룹은 최대 ${MAX_GROUPS}개까지 만들 수 있습니다.`);
      return;
    }

    const groupId = `group-${Date.now()}`;
    const color = GROUP_COLORS[groups.length];

    groups.push({
      id: groupId,
      name,
      color
    });

    activeGroupId = groupId;
    input.value = '';

    renderGroupList();
  });

  renderGroupList();
}

function renderGroupList() {
  const groupList = document.getElementById('group-list');
  if (!groupList) return;

  groupList.innerHTML = '';

  const activeGroup = getActiveGroup();
  const activeGroupStatus = document.getElementById('active-group-status');

  if (activeGroupStatus) {
    activeGroupStatus.textContent = `현재 그룹: ${activeGroup.name}`;
  }

  groups.forEach(group => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'group-select-btn';

    if (group.id === activeGroupId) {
      btn.classList.add('active');
    }

    const [r, g, b] = group.color.rgba;

    btn.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
    btn.textContent = group.name;

    btn.addEventListener('click', () => {
      activeGroupId = group.id;
      renderGroupList();
    });

    groupList.appendChild(btn);
  });
}

function getActiveGroup() {
  return groups.find(group => group.id === activeGroupId) || groups[0];
}

function getGroupById(groupId) {
  return groups.find(group => group.id === groupId) || groups[0];
}

function getGroupMaterial(groupId) {
  const group = getGroupById(groupId);
  const [r, g, b, a] = group.color.rgba;

  return new vw.Color(r, g, b, a).ws3dColor.withAlpha(group.color.alpha);
}


function getDefaultStyleForParcel(pnu) {
  const groupId = parcelGroups[pnu] || 'default';

  return {
    material: getGroupMaterial(groupId),
    outline: true,
    outlineColor: new vw.Color(0,0,0,255).ws3dColor,
    outlineWidth: 1
  };
}

function importExcelFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(evt) {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      defval: ''
    });

    rows.forEach(row => {
      const pnu = String(row['PNU'] || '').trim().replace(/\.0$/, '');
      const groupName = row['그룹'];

      if (!pnu) return;

      const groupId = ensureImportedGroup(groupName || '기본');

      selectParcelByPnu(String(pnu), groupId);
    });

    e.target.value = '';
  };

  reader.readAsArrayBuffer(file);
}

function ensureImportedGroup(groupName) {
  const existing = groups.find(g => g.name === groupName);

  if (existing) {
    return existing.id;
  }

  if (groups.length >= MAX_GROUPS) {
    return 'default';
  }

  const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const color = GROUP_COLORS[groups.length];

  groups.push({
    id: groupId,
    name: groupName,
    color
  });

  renderGroupList();

  return groupId;
}

function selectParcelByPnu(pnu, groupId = 'default') {
  if (!pnu) return;

  pnu = String(pnu).trim().replace(/^'/, '').replace(/\.0$/, '');

  if (selectedFeatures[pnu] || infoMap[pnu]) {
    return;
  }

  parcelGroups[pnu] = groupId;

  const params = new URLSearchParams({
    service: 'data',
    request: 'GetFeature',
    data: 'LP_PA_CBND_BUBUN',
    key: VWORLD_KEY,
    domain: location.origin,
    attrFilter: `pnu:=:${pnu}`,
    format: 'json',
    crs: 'EPSG:4326',
    size: '1',
    page: '1'
  });

  const rawUrl = `https://api.vworld.kr/req/data?${params.toString()}`;
  const proxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawUrl)}`;

  fetch(proxyUrl)
    .then(r => r.json())
    .then(data => {
      const featureCollection = data?.response?.result?.featureCollection;
      const features = featureCollection?.features || [];

      if (!features.length) {
        console.warn(`No parcel found for PNU: ${pnu}`);
        return;
      }

      const dataApiFeature = features[0];
      const center = getFeatureCenter(dataApiFeature);

      if (!center) {
        console.warn(`Could not calculate center for PNU: ${pnu}`);
        return;
      }

      parcelCoords[pnu] = center;

      // Use WFS around the center because your WFS overlay drawing already works.
      drawImportedParcelFromWfs(pnu, center.lon, center.lat, groupId);

      // Table data can still be added by PNU.
      fetchParcelInfoAndAddRow(pnu);
    })
    .catch(console.error);
}

function addParcelFeatureToMapWithGroup(pnu, feat, groupId) {
  if (selectedFeatures[pnu]) return;

  parcelGroups[pnu] = groupId;

  const singleFeatureGeojson = {
    type: "FeatureCollection",
    features: [feat]
  };

  const blob = new Blob(
    [JSON.stringify(singleFeatureGeojson)],
    { type: "application/json" }
  );

  const objectUrl = URL.createObjectURL(blob);

  const parser = new vw.GMLParser();
  parser.setId(`sel-${pnu}`);

  const feature3d = parser.read(
    vw.GMLParserType.GEOJSON,
    objectUrl,
    'EPSG:4326'
  );

  feature3d.setOption({
    isTerrain: false,
    clampToGround: true,
    material: getGroupMaterial(groupId),
    outline: true,
    outlineColor: new vw.Color(0,0,0,255).ws3dColor,
    outlineWidth: 1
  });

  feature3d.makeCoords();
  feature3d.show();

  selectedFeatures[pnu] = feature3d;

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function drawImportedParcelFromWfs(pnu, lon, lat, groupId) {
  const dx = 0.00008;
  const dy = 0.00008;
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

  const wfsProxyUrl = `https://map.vworld.kr/proxy.do?url=${encodeURIComponent(rawWfsUrl)}`;

  fetch(wfsProxyUrl)
    .then(r => r.json())
    .then(geojson => {
      const features = geojson.features || [];

      if (!features.length) {
        console.warn(`No WFS geometry found near imported PNU: ${pnu}`);
        return;
      }

      const matchingFeat =
        features.find(f => String(f?.properties?.pnu) === String(pnu)) ||
        features[0];

      console.log('Drawing imported parcel:', pnu, matchingFeat?.properties?.pnu, matchingFeat);
      addParcelFeatureToMapWithGroup(pnu, matchingFeat, groupId);
    })
    .catch(console.error);
}