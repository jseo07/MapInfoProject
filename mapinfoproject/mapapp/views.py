from django.shortcuts         import render
from django.conf              import settings
from django.http              import JsonResponse, HttpResponse
from django.views.decorators.http import require_GET
import requests
import logging

# Create your views here.
def index(request):
    return render(request, 'mapapp/index.html', {
        'VWORLD_API_KEY' : settings.VWORLD_API_KEY,
    })

logger = logging.getLogger(__name__)

@require_GET
def landuse_wfs(request):
    bbox   = request.GET.get('bbox','')
    domain = request.build_absolute_uri('/')[:-1]

    wfs_url = (
        "https://api.vworld.kr/req/wfs?"
        f"key={settings.VWORLD_API_KEY}"
        f"&domain={domain}"
        "&SERVICE=WFS"
        "&VERSION=2.0.0"
        "&REQUEST=GetFeature"
        "&TYPENAME=lp_pa_cbnd_bubun"
        "&OUTPUT=application/json"
        "&SRSNAME=EPSG:4326"
        f"&BBOX={bbox}"
    )

    try:
        # use a short timeout so you don’t hang
        resp = requests.get(wfs_url, timeout=5)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.exception("vWorld WFS request failed")
        # return the error as XML so you can inspect it
        return HttpResponse(
            f"<Error>WFS request exception: {e}</Error>",
            content_type="text/plain",
            status=502
        )

    ct = resp.headers.get("Content-Type","")
    # if vWorld didn’t give us JSON (e.g. HTML error page)…
    if "application/json" not in ct:
        return HttpResponse(
            resp.text,
            content_type="text/plain",
            status=502
        )

    try:
        data = resp.json()
    except ValueError as e:
        logger.exception("Failed to parse vWorld WFS JSON")
        return HttpResponse(
            resp.text,
            content_type="text/plain",
            status=502
        )

    return JsonResponse(data, safe=False)

""""
# Fetch from vWorld
resp = requests.get(wfs_url)

# If vWorld didn't return JSON (e.g. error XML), forward it as XML
content_type = resp.headers.get('Content-Type', '')
if 'application/json' not in content_type:
    return HttpResponse(resp.text, content_type='application/xml', status=502)

# Otherwise return the GeoJSON payload
return JsonResponse(resp.json(), safe=False)

"""
@require_GET
def pnu_info(request):
    pnu    = request.GET.get('pnu')
    year   = request.GET.get('year', '2024')
    domain = request.build_absolute_uri('/')[:-1]
    key    = settings.VWORLD_API_KEY

    def call_api(endpoint, extra_params):
        url    = f'http://api.vworld.kr/ned/data/{endpoint}'
        params = {
            'key':       key,
            'domain':    domain,
            'pnu':       pnu,
            'format':    'json',
            'numOfRows': '10',
            'pageNo':    '1',
        }
        params.update(extra_params)
        r = requests.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        #print(f"[DEBUG] {endpoint} returned:", data)   # logs the full JSON
        return data

    # full raw JSON from 토지특성정보
    raw_characteristics = call_api('getLandCharacteristics', {'stdrYear': year})

    fields = raw_characteristics.get('landCharacteristicss', {}).get('field', [])

    if fields:
        rec = fields[0]  # first (and only) record

        filtered = {
            '지형고도코드명'    : rec.get('tpgrphHgCodeNm'),
            '기준연도'        : rec.get('stdrYear'),
            '지목명'          : rec.get('lndcgrCodeNm'),
            '도로접도구분명'   : rec.get('roadSideCodeNm'),
            '공시지가'        : rec.get('pblntfPclnd'),
            '용도지역1명'     : rec.get('prposArea1Nm'),
            '용도지역2명'     : rec.get('prposArea2Nm'),
            '토지이용상황명'   : rec.get('ladUseSittnNm'),
            '최종갱신일자'     : rec.get('lastUpdtDt'),
            '등록구분명'       : rec.get('regstrSeCodeNm'),
            '지번면적'        : rec.get('lndpclAr'),
            '지형형상코드명'   : rec.get('tpgrphFrmCodeNm'),
            '지적구역명'       : rec.get('ldCodeNm'),
            'pnu'             : rec.get('pnu'),
        }
    else:
            filtered = {}

    def call_cadastre():
        url = 'https://api.vworld.kr/req/data'
        params = {
            'service':   'data',
            'request':   'GetFeature',
            'data':      'LP_PA_CBND_BUBUN',
            'key':       key,
            'domain':    domain,
            'attrFilter': f'pnu:=:{pnu}',
            'format':    'json',
            'size':      '1',
            'page':      '1',
        }
        r = requests.get(url, params=params)
        r.raise_for_status()
        cad = r.json()
        return cad

    cad_json = call_cadastre()
    feats    = cad_json.get('response', {}) \
                       .get('result', {}) \
                       .get('featureCollection', {}) \
                       .get('features', [])
    
    if feats:
        cad_props = feats[0]['properties']
        addr  = cad_props.get('addr')
        jibun = cad_props.get('jibun')




    return JsonResponse({
        'characteristics':     filtered,
        'addr':       addr,
        'jibun':       jibun,
    }, safe=False)


