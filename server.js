/* === onefile_ui_v6_fixed_r10.js ===

   변경 요약(이번 반영)

   1) 정보패널 '카카오 길찾기' → '길찾기' pill로 축소, 거리 포함, 아이콘(🚗/🚌) 버튼을

      카카오/네이버/복사 라인의 우측에 1줄 배치

   2) 도보 시간 UI 제거(지도 위 선과 거리만 유지). 정확한 시간은 카카오 길찾기에서 확인

   3) 공공기관/랜드마크 POI 마커는 아이콘만 표기(라벨 제거), 클릭 시 기존과 같은 호버 카드

   4) 상단에 POI 표시 토글(아이콘 pill) 추가: 🏛️/🛡️/🔥/📮/💰/⚖️/📜/🛂/🎖️/🏥/🛍️

   5) emerald 하이라이트 더 연한 톤 유지(가독성)

   6) 내부 문자열은 전부 작은따옴표 사용(백틱 삽입 금지)

*/



const express = require('express');

const axios   = require('axios');

const path    = require('path');

const fs      = require('fs');



try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}



const PORT     = process.env.PORT || 8888;

const REST_KEY = (process.env.KAKAO_REST_KEY || '0d96cf1c89e7c72de3728e28dd1a524c').trim();

const JS_KEY   = (process.env.KAKAO_JS_KEY || '2c9ce0d4d052c95ffb98b26ddc6c39ae').trim(); // public key ok



if (!REST_KEY) console.warn('[WARN] Missing KAKAO_REST_KEY in .env');



const app = express();





function safeParseJSON(raw){

  try{ return JSON.parse(raw); }catch(e){

    // try to repair: strip BOM, comments, single-quoted keys/values, trailing commas

    let t = raw.replace(/^\uFEFF/, '');

    t = t.replace(/\/\/.*$/mg, '').replace(/\/\*[\s\S]*?\*\//g,'');

    t = t.replace(/([{,]\s*)'([^']*)'\s*:/g, '$1"$2":');

    t = t.replace(/:\s*'([^']*)'/g, ':"$1"');

    t = t.replace(/,(\s*[}\]])/g, '$1');

    return JSON.parse(t);

  }

}

/* -------------------- (선택) 센터 DB 로컬/원격 캐시 -------------------- */

const DATA_DIR   = path.join(__dirname, 'data');

const LOCAL_JSON = path.join(DATA_DIR, 'centers_kr.json');

const CACHE_JSON = path.join(DATA_DIR, 'centers_kr.cache.json');

fs.mkdirSync(DATA_DIR, { recursive: true });



const CENTERS_SOURCE_URL = process.env.CENTERS_SOURCE_URL || '';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const REFRESH_INTERVAL_MINUTES = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '1440', 10);

const OFFICIAL_CENTER_COUNT = 3551;



let CENTER_DB = [];

let lastUpdated = null;



function isValidCenterRow(o){ return o && typeof o==='object' && o.sido && o.sigungu && o.name && o.addr; }

function setCenterDB(arr, src){

  const clean = Array.isArray(arr) ? arr.filter(isValidCenterRow) : [];

  CENTER_DB = clean; lastUpdated = new Date();

  console.log('[OK] Centers loaded: ' + CENTER_DB.length + ' (' + src + ') @ ' + lastUpdated.toISOString());

}

function loadCentersFromLocal(){

  try {

    if (fs.existsSync(LOCAL_JSON)) {

      setCenterDB(safeParseJSON(fs.readFileSync(LOCAL_JSON,'utf8')), 'local');

    } else if (fs.existsSync(CACHE_JSON)) {

      setCenterDB(safeParseJSON(fs.readFileSync(CACHE_JSON,'utf8')), 'cache');

    }

  } catch(e){ console.log('[!] local centers load fail:', e.message); }

}

async function fetchCentersFromRemote(){

  if(!CENTERS_SOURCE_URL) return {ok:false,error:'no_url'};

  try{

    const {data}=await axios.get(CENTERS_SOURCE_URL,{timeout:20000});

    if(!Array.isArray(data)) return {ok:false,error:'bad_format'};

    setCenterDB(data,'remote');

    try{ fs.writeFileSync(CACHE_JSON, JSON.stringify(data,null,2),'utf8'); }catch{}

    return {ok:true,count:data.length};

  }catch(e){ return {ok:false,error:e.message}; }

}



// 초기 로딩

loadCentersFromLocal();

(async()=>{ if(CENTER_DB.length===0 && CENTERS_SOURCE_URL){ await fetchCentersFromRemote(); }})();



// 핫리로드/주기동기

try{

  if(fs.existsSync(LOCAL_JSON)){

    fs.watchFile(LOCAL_JSON,{interval:1500},(cur,prev)=>{

      if(cur.mtimeMs!==prev.mtimeMs){ console.log('[i] centers_kr.json changed. Reloading...'); loadCentersFromLocal(); }

    });

  }

}catch(e){ console.log('[!] fs.watchFile fail:', e.message); }

if(CENTERS_SOURCE_URL && REFRESH_INTERVAL_MINUTES>0){

  setInterval(async()=>{ const r=await fetchCentersFromRemote(); if(!r.ok) console.log('[i] remote fetch failed:', r.error); }, REFRESH_INTERVAL_MINUTES*60*1000);

}



// admin + data

app.get('/admin/refresh-centers', async (req,res)=>{

  if(ADMIN_TOKEN && req.query.token!==ADMIN_TOKEN) return res.status(403).json({ok:false,error:'forbidden'});

  const r=await fetchCentersFromRemote();

  res.json({ok:r.ok, ...r, at:new Date().toISOString()});

});

app.get('/data/centers',(req,res)=>res.json(CENTER_DB));



/* -------------------- Kakao REST 프록시 -------------------- */

const kakao = axios.create({

  baseURL: 'https://dapi.kakao.com',

  headers: { Authorization: 'KakaoAK ' + REST_KEY },

  timeout: 8000

});



app.use(express.json());
app.get('/api/health', (req,res)=>res.json({ok:true}));
const REST_JSON = path.join(DATA_DIR, 'restaurants.json');
if(!fs.existsSync(REST_JSON)) fs.writeFileSync(REST_JSON, '[]', 'utf8');
app.get('/api/restaurants', (req,res)=>{ try{ const dong=req.query.dong; const data=JSON.parse(fs.readFileSync(REST_JSON,'utf8')); res.json(dong?data.filter(d=>d.dong===dong):data); }catch(e){ res.status(500).json({error:e.message}); }});
app.post('/api/restaurants', (req,res)=>{ try{ const {dong,name,author,password,lat,lng,address,url,rating,memo}=req.body; if(!dong||!name||!password) return res.status(400).json({error:'bad'}); const data=JSON.parse(fs.readFileSync(REST_JSON,'utf8')); const newItem={id:Date.now().toString(),dong,name,author:author||'익명',password,lat,lng,address,url,rating,memo}; data.push(newItem); fs.writeFileSync(REST_JSON,JSON.stringify(data,null,2),'utf8'); res.json(newItem); }catch(e){ res.status(500).json({error:e.message}); }});
app.delete('/api/restaurants/:id', (req,res)=>{ try{ const {password} = req.body; const data=JSON.parse(fs.readFileSync(REST_JSON,'utf8')); const idx = data.findIndex(d=>d.id===req.params.id); if(idx===-1) return res.status(404).json({error:'not_found'}); if(data[idx].password!==password) return res.status(403).json({error:'wrong_password'}); data.splice(idx,1); fs.writeFileSync(REST_JSON,JSON.stringify(data,null,2),'utf8'); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); }});
app.delete('/api/restaurants/author/:author', (req,res)=>{ try{ const {password, dong} = req.body; const author = req.params.author; let data=JSON.parse(fs.readFileSync(REST_JSON,'utf8')); const hasAuth = data.some(d=>d.author===author && d.dong===dong && d.password===password); if(!hasAuth) return res.status(403).json({error:'wrong_password'}); data = data.filter(d=>!(d.author===author && d.dong===dong)); fs.writeFileSync(REST_JSON,JSON.stringify(data,null,2),'utf8'); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); }}); const FB_JSON = path.join(DATA_DIR, 'feedback.json'); if(!fs.existsSync(FB_JSON)) fs.writeFileSync(FB_JSON, '[]', 'utf8'); app.post('/api/feedback', (req,res)=>{ try{ const {author, content}=req.body; if(!content) return res.status(400).json({error:'bad'}); const data=JSON.parse(fs.readFileSync(FB_JSON,'utf8')); data.push({id:Date.now().toString(), author:author||'익명', content, date:new Date().toISOString()}); fs.writeFileSync(FB_JSON,JSON.stringify(data,null,2),'utf8'); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); }}); app.get('/api/feedback', (req,res)=>{ const secret = ADMIN_TOKEN || '1234'; if(req.query.token!==secret) return res.status(403).json({error:'forbidden'}); try{ res.json(JSON.parse(fs.readFileSync(FB_JSON,'utf8'))); }catch(e){ res.status(500).json({error:e.message}); }});



// /api/geocode?query=...

app.get('/api/geocode', async (req,res) => {

  try {

    const q = (req.query.query || '').toString().trim();

    if (!q) return res.status(400).json({ error: 'query required' });

    const {data} = await kakao.get('/v2/local/search/address.json', { params:{ query:q, analyze_type:'similar' }});

    const doc = data.documents?.[0];

    if (!doc) return res.status(404).json({ error:'not_found' });

    res.json({

      x:parseFloat(doc.x), y:parseFloat(doc.y),

      address_type:doc.address_type,

      address_name:doc.address?.address_name || '',

      road_address_name:doc.road_address?.address_name || ''

    });

  } catch(e) {

    const code = e.response?.status || 500;

    res.status(code).json({ error:'kakao_rest_error', status:code, detail:e.message });

  }

});



// /api/geocode-list?query=...

app.get('/api/geocode-list', async (req,res) => {

  try{

    const q=(req.query.query||'').toString().trim();

    if(!q) return res.status(400).json({error:'query required'});

    const {data}=await kakao.get('/v2/local/search/address.json',{params:{query:q, analyze_type:'similar'}});

    const docs=(data.documents||[]).slice(0,12).map(d=>({

      x:parseFloat(d.x), y:parseFloat(d.y),

      address_type:d.address_type,

      road_address_name:d.road_address?.address_name||'',

      address_name:d.address?.address_name||''

    }));

    if(!docs.length) return res.status(404).json([]);

    res.json(docs);

  }catch(e){

    const code=e.response?.status||500;

    res.status(code).json({error:'kakao_rest_error', status:code, detail:e.message});

  }

});



// /api/keyword?query=... (전화/URL 포함)

// /api/keyword?query=... (전화/URL 포함, all=true 시 여러 페이지 싹쓸이)
app.get('/api/keyword', async (req,res) => {
  try{
    const q=(req.query.query||'').toString().trim();
    let size=parseInt(req.query.size||'12',10);
    if(!q) return res.status(400).json({error:'query required'});
    if(isNaN(size)||size<1) size=12; if(size>15) size=15;
    
    let out=[];
    if(req.query.all==='true'){
      for(let p=1;p<=8;p++){
        const {data}=await kakao.get('/v2/local/search/keyword.json',{params:{query:q,size:15,page:p}});
        out.push(...(data.documents||[]).map(d=>({ x:parseFloat(d.x), y:parseFloat(d.y), place_name:d.place_name, address_name:d.address_name||'', road_address_name:d.road_address_name||'', phone:d.phone||'', place_url:d.place_url||'' })));
        if(data.meta && data.meta.is_end) break;
      }
    }else{
      const {data}=await kakao.get('/v2/local/search/keyword.json',{params:{query:q,size}});
      out=(data.documents||[]).map(d=>({ x:parseFloat(d.x), y:parseFloat(d.y), place_name:d.place_name, address_name:d.address_name||'', road_address_name:d.road_address_name||'', phone:d.phone||'', place_url:d.place_url||'' }));
    }
    res.json(out);
  }catch(e){
    const code=e.response?.status||500;
    res.status(code).json({error:'kakao_rest_error', status:code, detail:e.message});
  }
});


// /api/keyword-near?query=&x=&y=&radius=&size=&category_group_code=
app.get('/api/keyword-near', async (req,res)=>{
  try{
    const q=(req.query.query||'').toString().trim();
    const x=parseFloat(req.query.x), y=parseFloat(req.query.y);
    let radius=parseInt(req.query.radius||'800',10);
    let size=parseInt(req.query.size||'5',10);
    let catCode=(req.query.category_group_code||'').toString().trim(); // 카테고리 코드 변수 추가

    if(!q || !isFinite(x) || !isFinite(y)) return res.status(400).json({error:'query,x,y required'});
    if(isNaN(radius)||radius<100) radius=800; if(radius>20000) radius=20000;
    if(isNaN(size)||size<1) size=5; if(size>15) size=15;

    let params = {query:q, x:x, y:y, radius:radius, sort:'distance', size:size};
    if(catCode) params.category_group_code = catCode; // 카카오에 카테고리 필터 지시

    const {data}=await kakao.get('/v2/local/search/keyword.json',{params:params});
    const out=(data.documents||[]).map(d=>({
      x:parseFloat(d.x), y:parseFloat(d.y),
      place_name:d.place_name,
      address_name:d.address_name||'',
      road_address_name:d.road_address_name||'',
      distance: d.distance? parseInt(d.distance,10) : null,
      place_url:d.place_url||''
    }));
    res.json(out);
  }catch(e){
    const code=e.response?.status||500;
    res.status(code).json({error:'kakao_rest_error', status:code, detail:e.message});
  }
});



// /api/coord2region?x=lng&y=lat

app.get('/api/coord2region', async (req,res) => {

  try{

    const x=req.query.x, y=req.query.y;

    if(!x || !y) return res.status(400).json({error:'x,y required'});

    const {data}=await kakao.get('/v2/local/geo/coord2regioncode.json',{params:{x,y,input_coord:'WGS84'}});

    const h=data.documents?.find(d=>d.region_type==='H') || data.documents?.[0] || null;

    if(!h) return res.status(404).json({error:'not_found'});

    res.json(h);

  }catch(e){

    const code=e.response?.status||500;

    res.status(code).json({error:'kakao_rest_error', status:code, detail:e.message});

  }

});



// /api/nearest-center?lat=&lng=

app.get('/api/nearest-center', async (req,res) => {

  try {

    const lat = parseFloat(req.query.lat);

    const lng = parseFloat(req.query.lng);

    if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'lat,lng required' });



    let sido=null,sigungu=null;

    try{

      const {data}=await kakao.get('/v2/local/geo/coord2regioncode.json',{params:{x:lng,y:lat,input_coord:'WGS84'}});

      const h=data.documents?.find(d=>d.region_type==='H')||data.documents?.[0];

      if(h){ sido=h.region_1depth_name; sigungu=h.region_2depth_name; }

    }catch{}



    let candidates=CENTER_DB;

    if(candidates.length){

      if(sigungu){ const sub=candidates.filter(c=>c.sigungu===sigungu); if(sub.length) candidates=sub; }

      else if(sido){ const sub=candidates.filter(c=>c.sido===sido); if(sub.length) candidates=sub; }

    }



    if(!candidates.length){

      const {data}=await kakao.get('/v2/local/search/keyword.json',{

        params:{ query:'행정복지센터', x:lng, y:lat, radius:20000, sort:'distance' }

      });

      const d0=(data.documents||[])[0];

      if(!d0) return res.status(404).json({error:'not_found'});

      return res.json({

        name: d0.place_name,

        addr: d0.address_name,

        road: d0.road_address_name||'',

        lat: parseFloat(d0.y),

        lng: parseFloat(d0.x),

        distance: parseInt(d0.distance||'0',10),

        kakao_url: d0.place_url || ''

      });

    }



    const client = axios.create({ baseURL:'https://dapi.kakao.com', headers:{ Authorization:'KakaoAK '+REST_KEY }, timeout:7000 });

    let best=null, bestD=Infinity;

    for(const c of candidates){

      let clat=Number(c.lat||c._lat), clng=Number(c.lng||c._lng);

      if(!isFinite(clat)||!isFinite(clng)){

        try{

          const {data}=await client.get('/v2/local/search/address.json',{params:{query:c.addr}});

          const d=data.documents?.[0];

          if(d){ clat=parseFloat(d.y); clng=parseFloat(d.x); c._lat=clat; c._lng=clng; }

        }catch{}

      }

      if(isFinite(clat)&&isFinite(clng)){

        const dkm=Math.hypot((lat-clat)*111,(lng-clng)*88);

        if(dkm<bestD){ bestD=dkm; best={...c,lat:clat,lng:clng,distance_km:Math.round(dkm*100)/100}; }

      }

    }

    if(!best) return res.status(404).json({error:'not_found'});

    res.json(best);

  } catch (e) {

    const code = e.response?.status || 500;

    res.status(code).json({ error:'nearest_failed', status:code, detail:e.message });

  }

});



/* -------------------- APP HTML -------------------- */

const HTML = '<!doctype html>\n<html lang="ko"><head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>전국 관할 행정복지센터 · ONE-FILE v6.2.8</title>\n<link rel="preconnect" href="https://dapi.kakao.com" crossorigin>\n<style>\n:root{\n  --bg:#0f172a; --fg:#e5e7eb; --line:#334155; --accent:#2563eb; --panel:#fff; --muted:#6b7280; --badge:#f8fafc;\n  --shadow:0 10px 30px rgba(2,6,23,.18);\n}\n*{box-sizing:border-box}\nhtml,body{height:100%;margin:0;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,\'Noto Sans KR\',\'Malgun Gothic\',sans-serif}\n/* 처음엔 연회색 배경, 지도 노출(revealMap) 시 다크로 전환 */\nbody{display:grid;grid-template-rows:auto 1fr;background:#f3f4f6;color:#e5e7eb;transition:background .2s ease}\n.top{padding:10px 12px; padding-left:max(12px,env(safe-area-inset-left)); padding-right:max(12px,env(safe-area-inset-right)); background:var(--bg);display:grid;gap:8px}\n.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\n.row.right{justify-content:flex-end}\ninput,button{height:40px;border-radius:12px;border:1px solid var(--line);padding:0 12px;background:#0b1224;color:#e5e7eb}\ninput::placeholder{color:#94a3b8}\nbutton{background:#111a33}\nbutton.primary{background:#2563eb;color:#fff;border:0}\n#wrap{position:relative;height:calc(100dvh - 172px);display:none}\n#map{position:absolute;inset:0;min-height:520px}\n.panel{position:absolute;right:12px;top:12px;z-index:1000;background:var(--panel);color:#0f172a;border:1px solid #eef2f7;border-radius:14px;padding:0;width:min(320px, calc(100vw - 24px));max-height:calc(100% - 24px);overflow:auto;box-shadow:var(--shadow)}\n#restModalMask{display:none;position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:4000} #restModal{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(400px,90vw);background:#fff;border-radius:16px;z-index:4001;padding:20px;color:#0f172a}\n.panel .phdr{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e5e7eb}\n.panel .pbody{padding:12px;display:block}\n.panel.collapsed .pbody{display:none}\n.hbadge{display:inline-flex;gap:6px;align-items:center;background:#0f172a;border:1px solid #334155;padding:6px 10px;border-radius:999px;font-size:12px;color:#e2e8f0}\n.muted{color:#64748b;font-size:12px}\n.metric{display:flex;gap:14px;margin-top:10px;font-size:13px;color:#374151}\n.toast{position:fixed;left:12px;bottom:12px;z-index:3000;background:#111827;color:#e5e7eb;padding:10px 12px;border-radius:12px;box-shadow:var(--shadow);display:none;max-width:72vw}\n.toast.show{display:block;animation:fadein .18s ease-out}\n@keyframes fadein{from{opacity:.001;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}\n.mini{font-size:11px;color:#cbd5e1}.mini code{background:rgba(255,255,255,.08);padding:1px 4px;border-radius:4px}\n\n/* 검색결과 패널 */\n#srchPanel{position:absolute;left:12px;top:140px;z-index:1150;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:var(--shadow);width:520px;display:none;max-height:60vh;overflow:auto;color:#0f172a}\n.sitem{display:flex;gap:10px;padding:12px;border-bottom:1px solid #f1f5f9;cursor:pointer}\n.sitem:hover{background:#f8fafc}\n.sname{font-weight:700;color:#0f172a}\n.saddr{font-size:12px;color:#475569}\n.sdist{margin-left:auto;font-size:12px;color:#334155}\n\n/* 검색한 주소 요약(검색창 아래) */\n#searchEcho{display:none;gap:10px;align-items:center;flex-wrap:wrap}\n.badge{display:inline-flex;gap:6px;align-items:center;background:#0f172a;border:1px solid #334155;padding:6px 10px;border-radius:999px;font-size:12px;color:#e2e8f0}\n.badge .cap{opacity:.7}\n\n/* 검색칸 요약 텍스트 더 크게 */\n#searchEcho .badge{font-size:16px}\n#searchEcho .badge .cap{opacity:.85}\n#echoRoad,#echoJibun{font-weight:700}\n\n/* 라벨 체크 pill — 사이즈 축소 */\n.smallpill{background:#0b1224;border:1px solid #334155;border-radius:999px;padding:1px 8px;font-size:11px;color:#e2e8f0;line-height:1.2;display:inline-flex;gap:6px;align-items:center}\n.smallpill input{vertical-align:-2px;margin:0}\n\n/* 행정동 라벨 */\n.dong-label{background:rgba(255,255,255,.58);border:1px solid rgba(226,232,240,.8);border-radius:999px;padding:4px 10px;font-size:12px;box-shadow:0 4px 12px rgba(2,6,23,.10);color:#0f172a;font-weight:700;cursor:pointer;backdrop-filter:blur(2px)}\n\n/* 아이콘 버튼 */\n.iconbtn{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px;border:1px solid #e5e7eb;background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(2,6,23,.06);font-size:12px;color:#111827;cursor:pointer}\n.iconbtn .ico{width:18px;height:18px;display:inline-block}\n.ico-kakao{background:#FEE500;border:1px solid #e5e7eb;border-radius:4px;position:relative}\n.ico-kakao::after{content:"K";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;color:#222;font-size:12px}\n.ico-naver{background:#00C73C;border-radius:4px;position:relative}\n.ico-naver::after{content:"N";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:12px}\n.ico-copy{position:relative}\n.ico-copy::before{content:"";display:block;width:14px;height:10px;border:2px solid #334155;border-radius:2px;position:absolute;left:2px;top:3px;background:#fff}\n.ico-copy::after{content:"";display:block;width:14px;height:10px;border:2px solid #64748b;border-radius:2px;position:absolute;left:4px;top:5px;background:#fff}\n\n/* 큰 아이콘버튼 변형 */\n.iconbtn.lg{height:44px;padding:0 12px;border-radius:12px}\n.iconbtn.lg .ico{width:22px;height:22px}\n\n/* POI 아이콘(공공기관) — 아이콘만 */\n.poi-dot{width:26px;height:26px;border-radius:999px;background:#fff;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(2,6,23,.15);}\n\n/* 첫 접속 안내 카드 */\n#welcome{display:block;position:relative;padding:16px;overflow-y:auto;max-height:calc(100dvh - 120px)}\n.wcard{max-width:900px;margin:10px auto 40px auto;background:#ffffff;color:#0f172a;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 60px rgba(2,6,23,.12);padding:18px 18px}\n.wcard h2{margin:.2rem 0 .6rem 0}\n.wcard ul{margin:.3rem 0 .6rem 1.1rem;line-height:1.6;color:#334155}\n.wcard .muted{color:#64748b}\n#restModalMask{display:none;position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:4000}\n#restModal{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(400px,90vw);background:#fff;border-radius:16px;box-shadow:var(--shadow);z-index:4001;padding:20px;color:#0f172a}\n\n/* 모바일 반응형 */\n@media (max-width: 768px){\n  .top { display:flex; flex-direction:column; gap:8px; padding:8px; }\n  .row { width:100%; justify-content:flex-start; }\n  input,button{height:40px}\n  #wrap{height:calc(100dvh - 220px)}\n  #srchPanel{width:92vw;left:4vw}\n  .panel{width:92vw;right:4vw;max-height:50vh;}\n}\n</style>\n<script defer src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + (JS_KEY) + '&libraries=services&autoload=false"></script>\n</head>\n<body>\n  <div class="top">\n    <div class="row">\n      <input id="addr" type="text" placeholder="예) 대구시청 / 대구광역시 중구 공평로 88" style="flex:1 1 360px">\n      <button id="voiceBtn" title="음성검색">🎤</button>\n     <button id="search" class="primary">검색</button>   <button id="btnMyLoc">현재위치</button>       <span id="gpsMenuWrap" style="position:relative">\n        <button id="gpsMenuBtn">현재위치에서 길안내 ▾</button>\n        <div id="gpsMenu" style="position:absolute;left:0;top:42px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.25);display:none;min-width:260px;z-index:2001;max-height:60vh;overflow:auto">\n          <div class="gps-act" id="actToInputAddress" style="padding:10px 12px;cursor:pointer">내 위치 → (검색주소)</div>\n          <div class="gps-act" id="actToInputCenter" style="padding:10px 12px;cursor:pointer">내 위치 → (입력주소 관할행정복지센터)</div>\n          <div class="gps-act" id="actToNearestCenter" style="padding:10px 12px;cursor:pointer">내 위치 → 가까운 행정복지센터</div>\n        </div>\n      </span>\n      <button id="btnAddrToCenter">검색→관할센터 길안내</button>\n      <button id="resetView">초기화</button>\n      <button id="feedbackBtn" title="건의하기">💬 건의</button><button id="aboutBtn" title="안내">ⓘ 안내</button>\n    </div>\n\n    <div class="row" style="justify-content:space-between">\n      <div id="searchEcho" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">\n        <span class="badge"><span class="cap">도로명</span> <span id="echoRoad">-</span></span>\n        <span class="badge"><span class="cap">지번</span> <span id="echoJibun">-</span></span>\n      </div>\n      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">\n       <label class="smallpill"><input type="checkbox" id="toggleLabels"> 행정동 라벨</label>\n        <span id="majorWrap" style="position:relative"><button id="majorBtn" class="iconbtn" style="height:34px">🏛️ 주요기관 ▾</button><div id="majorMenu" style="display:none;position:absolute;left:0;top:40px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.25);min-width:200px;z-index:2005;padding:8px 10px; max-height:45vh; overflow-y:auto;"> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="gov" data-code="PO3"> 🏛️ 시청/구청</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="police" data-code="PO3"> 🛡️ 경찰서</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="fire" data-code="PO3"> 🔥 소방서</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="post" data-code="PO3"> 📮 우체국</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="tax" data-code="PO3"> 💰 세무서</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="court" data-code="PO3"> ⚖️ 법원</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="registry" data-code="PO3"> 📜 등기소/국</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="imm" data-code="PO3"> 🛂 출입국</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="mma" data-code="PO3"> 🎖️ 병무청</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-poi="hospital" data-code="HP8"> 🏥 병원 전체</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-major="school_elem" data-code="SC4"> 🏫 초등학교</label> </div></span>\n        <span id="trafficWrap" style="position:relative;margin-left:6px"><button id="trafficBtn" class="iconbtn" style="height:34px">🚌 교통 ▾</button><div id="trafficMenu" style="display:none;position:absolute;left:0;top:40px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.25);min-width:200px;z-index:2005;padding:8px 10px"> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-traffic="bus_stop"> 🚏 버스정류장</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-traffic="subway_station" data-code="SW8"> 🚇 지하철역</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-traffic="airport"> ✈️ 공항</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-major="bus_terminal"> 🚌 버스터미널</label> <label class="smallpill" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-major="rail_station"> 🚆 기차/철도역</label> </div></span>\n      </div>\n    </div>\n  </div>\n\n  <!-- 첫 접속 안내 -->\n  <div id="welcome">\n    <div class="wcard">\n      <h2>관할 행정복지센터 찾기 · 사용 안내</h2>\n      <span style="color:#ef4444">※ 이 도구는 임시·실험 버전으로 일부 오류나 누락이 있을 수 있습니다.</span></p>\n      <ul>\n        <li>상단 검색창에 주소/건물명을 입력해 주세요. 후보 중 하나를 선택하면 지도와 관할센터 정보가 표시됩니다.</li>\n        <li>지도에서 행정동 영역이나 라벨을 클릭하면 상세 카드(닫기 버튼 포함)가 뜹니다.</li>\n         <li>데이터 출처: 카카오 로컬 API(주소/키워드/좌표), 공개 행정동 경계 GeoJSON, 공공데이터(읍면동 하부행정기관).</li>\n      </ul>\n      <div style="display:flex;gap:8px;justify-content:flex-end">\n        <button id="welcomeClose" style="background:#0f172a;color:#e5e7eb;border:0;border-radius:10px;padding:8px 12px">시작하기</button>\n      </div>\n    </div>\n  </div>\n\n  <div id="srchPanel"></div>\n\n  <div id="wrap">\n    <div id="map"></div>\n\n    <!-- 정보 패널 -->\n    <div class="panel" id="info" style="display:none">\n      <div class="phdr">\n        <div><b id="infoTitle">정보</b></div>\n        <button id="infoToggle">접기</button>\n      </div>\n      <div class="pbody" id="infoBody"></div>\n    </div>\n\n    <div class="toast" id="toast"></div>\n  </div>\n  <div id="restModalMask"></div>\n  <div id="restModal">\n    <h3 style="margin-top:0;margin-bottom:12px">🍽️ 우리동네 맛집 추천</h3>\n    <div id="restStep1"><div style="display:flex;gap:8px"><input id="restSearchInput" placeholder="식당 이름 검색 (예: 00동 맛집)" style="flex:1;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><button id="restSearchBtn" class="primary">검색</button><button id="restCloseBtn1" style="background:#e2e8f0;color:#0f172a;border:none">닫기</button></div><div id="restSearchResults" style="max-height:200px;overflow-y:auto;margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;display:none;"></div></div>\n    <div id="restStep2" style="display:none;margin-top:12px"><div id="restSelectedInfo" style="font-weight:bold;margin-bottom:8px;font-size:14px;color:#2563eb"></div><input id="restAuthor" list="authorDatalist" placeholder="등록자 이름 (직접 입력 또는 선택)" style="width:100%;margin-bottom:8px;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><datalist id="authorDatalist"></datalist><input id="restPassword" type="password" placeholder="비밀번호 (등록/삭제시 필수)" style="width:100%;margin-bottom:8px;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><select id="restRating" style="width:100%;margin-bottom:8px;background:#f8fafc;color:#000;border:1px solid #cbd5e1;height:34px"><option value="5">⭐⭐⭐⭐⭐ 아주 맛있음</option><option value="4">⭐⭐⭐⭐ 맛있음</option><option value="3">⭐⭐⭐ 보통</option><option value="2">⭐⭐ 별로</option><option value="1">⭐ 최악</option></select><input id="restMemo" placeholder="간략한 메모 (예: 가성비 좋음)" style="width:100%;margin-bottom:12px;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><div style="display:flex;gap:8px;justify-content:flex-end"><button id="restCancelBtn" style="background:#e2e8f0;color:#0f172a;border:none">다시 검색</button><button id="restSubmitBtn" class="primary">등록 완료</button></div></div>\n  </div>\n  <div id="restModal">\n    <h3 style="margin-top:0;margin-bottom:12px">🍽️ 우리동네 맛집 추천</h3>\n    <div id="restStep1"><div style="display:flex;gap:8px"><input id="restSearchInput" placeholder="식당 이름 검색 (예: 00동 맛집)" style="flex:1;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><button id="restSearchBtn" class="primary">검색</button><button id="restCloseBtn1" style="background:#e2e8f0;color:#0f172a;border:none">닫기</button></div><div id="restSearchResults" style="max-height:200px;overflow-y:auto;margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;display:none;"></div></div>\n    <div id="restStep2" style="display:none;margin-top:12px"><div id="restSelectedInfo" style="font-weight:bold;margin-bottom:8px;font-size:14px;color:#2563eb"></div><input id="restAuthor" list="authorDatalist" placeholder="등록자 이름 (직접 입력 또는 선택)" style="width:100%;margin-bottom:8px;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><datalist id="authorDatalist"></datalist><input id="restPassword" type="password" placeholder="비밀번호 (등록/삭제시 필수)" style="width:100%;margin-bottom:12px;background:#f8fafc;color:#000;border:1px solid #cbd5e1"><div style="display:flex;gap:8px;justify-content:flex-end"><button id="restCancelBtn" style="background:#e2e8f0;color:#0f172a;border:none">다시 검색</button><button id="restSubmitBtn" class="primary">등록 완료</button></div></div>\n  </div>\n\n  <!-- 안내 모달 -->\n  <div id="fbModalMask" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:4000"></div>\n  <div id="fbModal" style="display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(400px,90vw);background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:4001;padding:20px;color:#0f172a">\n    <h3 style="margin-top:0;margin-bottom:12px;display:flex;justify-content:space-between"><span>💬 건의 및 제보</span><button id="fbCloseBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">×</button></h3>\n    <div id="fbForm">\n      <input id="fbAuthor" placeholder="작성자 (선택)" style="width:100%;margin-bottom:8px;background:#f8fafc;color:#0f172a;border:1px solid #cbd5e1">\n      <textarea id="fbContent" placeholder="개선 사항이나 오류를 자유롭게 적어주세요." style="width:100%;height:100px;margin-bottom:12px;background:#f8fafc;color:#0f172a;border:1px solid #cbd5e1;padding:8px;border-radius:8px;font-family:inherit;resize:vertical"></textarea>\n      <div style="display:flex;justify-content:space-between;align-items:center">\n        <span id="fbAdminLink" style="font-size:11px;color:#cbd5e1;cursor:pointer" title="관리자 보기">관리자</span>\n        <button id="fbSubmitBtn" class="primary">보내기</button>\n      </div>\n    </div>\n    <div id="fbAdminView" style="display:none;max-height:300px;overflow-y:auto;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px;font-size:12px;"></div>\n  </div>\n\n  \n  <div id="aboutMask" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:3200"></div>\n  <div id="about" style="display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,92vw);max-height:80vh;overflow:auto;background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 30px 80px rgba(2,6,23,.35);padding:16px;z-index:3300">\n    <h3 style="margin:.2rem 0 .6rem 0">안내 · 데이터 출처</h3>\n    <ul style="line-height:1.55;margin:.2rem 0 .8rem 1.1rem">\n      <li><b>주소/좌표</b>: 카카오 로컬 API(주소검색·키워드·좌표→행정구역)</li>\n      <li><b>행정동 경계</b>: 공개 GeoJSON (전국) — GitHub mirror 사용</li>\n      <li><b>센터 목록</b>: 공공데이터(읍면동 하부행정기관) → <code>centers_kr.json</code> (로컬) 또는 <code>CENTERS_SOURCE_URL</code> (원격) 자동 반영</li>\n      <li><b>경로</b>: OSRM 공개 라우팅 API로 선과 거리만 그립니다. <b>정확한 시간</b>은 정보패널의 <b>길찾기</b> 아이콘으로 여는 카카오 길찾기에서 확인하세요.</li>\n    </ul>\n    <div style="margin-top:.8rem;display:flex;gap:8px;justify-content:flex-end">\n      <button id="aboutClose" style="background:#0f172a;color:#e5e7eb;border:0;border-radius:10px;padding:8px 12px">닫기</button>\n    </div>\n  </div>\n\n<script>\n(function(){\n  const toastEl=document.getElementById(\'toast\');\n  function toast(msg,sec=2.2){ if(!toastEl){alert(msg);return;} toastEl.textContent=msg; toastEl.className=\'toast show\'; setTimeout(function(){toastEl.className=\'toast\';},sec*1000); }\n  function normalizeRoad(s){ if(!s)return s; s=s.replace(/(로)\\s+(\\d+)(\\s*길)/g,\'$1$2$3\'); s=s.replace(/(로)\\s+(\\d+)\\s*$/g,\'$1$2\'); s=s.replace(/\\s+/g,\' \').trim(); return s; }\n  function kmDist(a,b){ return Math.hypot((a.lat-b.lat)*111,(a.lng-b.lng)*88); }\n\n  // 지도 상태\n  let map, boundsAll=null;\n  let polygons={}, polygonMeta={}, selectedDong=null, labelOverlays={}, labelsVisible=true;\n  let routeLineCar=null, routeLineWalk=null, routeOverlay=null;\n  let startOverlay=null, centerOverlay=null, myLocOverlay=null, hoverOverlay=null;\n  let lastSearch=null, lastSearchLabel=null, lastCenter=null, mapShown=false;\n\n  // 공공기관 POI\n  let poiOverlays=[];\n\n  // 경로 요청 토큰: 이전 비동기 요청 무시용\n  let routeSeq=0;\n\n  // 팔레트 확장(여러 색상군 family 부여)\n  const BASE_PALETTE = [\n    {fill:\'#93c5fd\', stroke:\'#60a5fa\', family:\'blue\'},\n    {fill:\'#a5b4fc\', stroke:\'#818cf8\', family:\'indigo\'},\n    {fill:\'#c4b5fd\', stroke:\'#a78bfa\', family:\'violet\'},\n    {fill:\'#f9a8d4\', stroke:\'#f472b6\', family:\'pink\'},\n    {fill:\'#fecaca\', stroke:\'#fda4af\', family:\'rose\'},\n    {fill:\'#fdba74\', stroke:\'#fb923c\', family:\'orange\'},\n    {fill:\'#fde68a\', stroke:\'#fbbf24\', family:\'amber\'},\n    {fill:\'#a7f3d0\', stroke:\'#34d399\', family:\'emerald\'},\n    {fill:\'#99f6e4\', stroke:\'#2dd4bf\', family:\'teal\'},\n    {fill:\'#7dd3fc\', stroke:\'#38bdf8\', family:\'sky\'},\n    {fill:\'#fca5a5\', stroke:\'#f87171\', family:\'red\'},\n    {fill:\'#86efac\', stroke:\'#22c55e\', family:\'green\'},\n    {fill:\'#bae6fd\', stroke:\'#60a5fa\', family:\'blue2\'},\n    {fill:\'#d8b4fe\', stroke:\'#a78bfa\', family:\'violet2\'},\n    {fill:\'#f5d0fe\', stroke:\'#e879f9\', family:\'fuchsia\'},\n    {fill:\'#fecdd3\', stroke:\'#fb7185\', family:\'rose2\'},\n    {fill:\'#ffedd5\', stroke:\'#fdba74\', family:\'orange2\'},\n    {fill:\'#e9d5ff\', stroke:\'#c084fc\', family:\'purple\'},\n    {fill:\'#bbf7d0\', stroke:\'#22c55e\', family:\'green2\'},\n    {fill:\'#ccfbf1\', stroke:\'#2dd4bf\', family:\'teal2\'}\n  ];\n\n  const shortCenterLabel = function(name){ return String(name||\'\').replace(/\\\\s*행정복지센터/g,\'\'); };\n\n  async function restGeocode(q){\n    try{\n      const r=await fetch(\'/api/geocode?query=\'+encodeURIComponent(q));\n      if(r.ok){ const j=await r.json(); return { lat:j.y,lng:j.x, road:j.road_address_name||\'\', jibun:j.address_name||\'\' }; }\n    }catch{}\n    return null;\n  }\n  async function restGeocodeList(q){\n    try{\n      const r=await fetch(\'/api/geocode-list?query=\'+encodeURIComponent(q));\n      if(!r.ok) return [];\n      return await r.json();\n    }catch{return [];}\n  }\n  async function restKeyword(q,size=12){\n    try{\n      const r=await fetch(\'/api/keyword?query=\'+encodeURIComponent(q)+\'&size=\'+size);\n      if(!r.ok) return [];\n      return await r.json();\n    }catch{return [];}\n  }\n  async function restKeywordNear(q, x, y, radius=800, size=5, catCode=\'\'){\n try{\n const r=await fetch(\'/api/keyword-near?query=\'+encodeURIComponent(q)+\'&x=\'+x+\'&y=\'+y+\'&radius=\'+radius+\'&size=\'+size+(catCode?\'&category_group_code=\'+catCode:\'\'));\n      if(!r.ok) return [];\n      return await r.json();\n    }catch{return [];}\n  }\n  async function restCoord2Region(lat,lng){\n    try{\n      const r=await fetch(\'/api/coord2region?x=\'+lng+\'&y=\'+lat);\n      if(!r.ok) return null; return await r.json();\n    }catch{return null;}\n  }\n  async function getMyLocation(timeoutMs=6000){\n    if(!(\'geolocation\' in navigator)) throw new Error(\'브라우저에서 위치를 지원하지 않습니다\');\n    return await new Promise(function(resolve,reject){\n      let done=false;\n      const tid=setTimeout(function(){ if(!done){ done=true; reject(new Error(\'위치 응답 지연(권한/설정 확인)\')); }}, timeoutMs);\n      navigator.geolocation.getCurrentPosition(\n        function(pos){ if(done) return; done=true; clearTimeout(tid); resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}); },\n        function(err){ if(done) return; done=true; clearTimeout(tid); reject(err); },\n        {enableHighAccuracy:false, maximumAge:45000, timeout:timeoutMs}\n      );\n    });\n  }\n\n  function hideWelcome(){ var w=document.getElementById(\'welcome\'); if(w) w.style.display=\'none\'; }\n  function showWelcome(){ var w=document.getElementById(\'welcome\'); if(w) w.style.display=\'block\'; }\n  window.__forceSearch = async function(name, lat, lng, road, addr) { document.getElementById(\'srchPanel\').style.display=\'none\'; document.getElementById(\'addr\').value=name; lastSearch = {lat: lat, lng: lng}; lastSearchLabel = name; revealMap(); document.getElementById(\'echoRoad\').textContent = road || \'-\'; document.getElementById(\'echoJibun\').textContent = addr || \'-\'; document.getElementById(\'searchEcho\').style.display=\'flex\'; await findDongAndShow({lat: lat, lng: lng}); };\n  function revealMap(){\n    if(mapShown) return;\n    document.getElementById(\'wrap\').style.display=\'block\';\n    document.body.style.background=\'#0b1224\'; // 다크로 전환\n    hideWelcome();\n    mapShown=true;\n    setTimeout(function(){ try{ map && map.relayout(); }catch{} },60);\n  }\n\n  async function loadSidoGeojson(sido){\n    const urls=[\n      \'https://raw.githubusercontent.com/raqoon886/Local_HangJeongDong/master/hangjeongdong_\'+encodeURIComponent(sido)+\'.geojson\',\n      \'https://cdn.jsdelivr.net/gh/raqoon886/Local_HangJeongDong/hangjeongdong_\'+encodeURIComponent(sido)+\'.geojson\'\n    ];\n    for(const u of urls){ try{ const r=await fetch(u,{cache:\'no-store\'}); if(r.ok)return await r.json(); }catch{} }\n    return null;\n  }\n\n  function cleanPolygons(){\n    Object.values(polygons).forEach(function(p){ p.setMap(null); }); polygons={}; polygonMeta={};\n    Object.values(labelOverlays).forEach(function(o){ o.setMap(null); }); labelOverlays={}; selectedDong=null;\n  }\n  function clearPOIs(){\n    poiOverlays.forEach(function(o){ try{o.setMap(null);}catch{} });\n    poiOverlays=[];\n  }\n\n  // bounds 교차 판단(대략적 인접성)\n  function boundsIntersect(b1, b2){\n    const sw1=b1.getSouthWest(), ne1=b1.getNorthEast();\n    const sw2=b2.getSouthWest(), ne2=b2.getNorthEast();\n    const l1=sw1.getLng(), r1=ne1.getLng(), btm1=sw1.getLat(), top1=ne1.getLat();\n    const l2=sw2.getLng(), r2=ne2.getLng(), btm2=sw2.getLat(), top2=ne2.getLat();\n    return !(l1>r2 || r1<l2 || btm1>top2 || top1<btm2);\n  }\n\n  // 인접 회피 컬러링\n  function assignColors(names){\n    const adj={};\n    names.forEach(function(n){ adj[n]=new Set(); });\n    for(let i=0;i<names.length;i++){\n      for(let j=i+1;j<names.length;j++){\n        const a=names[i], b=names[j];\n        const A=polygonMeta[a], B=polygonMeta[b];\n        if(A && B && boundsIntersect(A.bounds,B.bounds)){\n          adj[a].add(b); adj[b].add(a);\n        }\n      }\n    }\n    const chosen={};\n    for(const n of names){\n      const usedFamilies=new Set(); const usedColors=new Set();\n      adj[n].forEach(function(m){ if(chosen[m]){ usedFamilies.add(chosen[m].family); usedColors.add(chosen[m].fill); } });\n      const pick = BASE_PALETTE.find(function(c){ return !usedFamilies.has(c.family); }) || BASE_PALETTE.find(function(c){ return !usedColors.has(c.fill); }) || BASE_PALETTE[0];\n      chosen[n]=pick;\n      const poly=polygons[n];\n      if(poly){\n        poly.setOptions({ strokeColor: pick.stroke, fillColor: pick.fill, strokeWeight:3, strokeStyle:\'shortdash\', fillOpacity:.45, zIndex:2 });\n        polygonMeta[n].stroke=pick.stroke; polygonMeta[n].fill=pick.fill;\n      }\n    }\n  }\n\n  async function ensurePolygonsFor(sido,sigungu){\n    if(polygonMeta.__sido===sido && polygonMeta.__sigungu===sigungu) return true;\n    const geo=await loadSidoGeojson(sido); if(!geo){ toast(\'행정동 경계 로드 실패\'); return false; }\n    cleanPolygons();\n    const prefix=(sigungu&&sigungu!==\'\')?(sido+\' \'+sigungu+\' \'):(sido+\' \');\n    const feats=geo.features.filter(function(f){ return String(f.properties?.adm_nm||\'\').startsWith(prefix); });\n    boundsAll=new kakao.maps.LatLngBounds();\n\n    const names=[];\n    for(const feat of feats){\n      const full=String(feat.properties.adm_nm); const name=full.replace(prefix,\'\'); names.push(name);\n\n      const paths=[]; const toPath=function(ring){ return ring.map(function(c){ return new kakao.maps.LatLng(c[1],c[0]); }); };\n      if(feat.geometry.type===\'Polygon\'){ for(const ring of feat.geometry.coordinates) paths.push(toPath(ring)); }\n      else if(feat.geometry.type===\'MultiPolygon\'){ for(const poly of feat.geometry.coordinates) for(const ring of poly) paths.push(toPath(ring)); }\n\n      // 임시 중립 색으로 먼저 생성\n      const poly=new kakao.maps.Polygon({\n        map:map, path:paths,\n        strokeWeight:3, strokeColor:\'#94a3b8\', strokeOpacity:1, strokeStyle:\'shortdash\',\n        fillColor:\'#e2e8f0\', fillOpacity:.35, zIndex:2\n      });\n      polygons[name]=poly;\n\n      const b=new kakao.maps.LatLngBounds(); paths.forEach(function(r){ r.forEach(function(pt){ b.extend(pt); }); });\n      polygonMeta[name]={bounds:b,paths:paths,fill:\'#e2e8f0\',stroke:\'#94a3b8\'};\n      paths.forEach(function(r){ r.forEach(function(pt){ boundsAll.extend(pt); }); });\n\n      const center = (function(){ let la=0,ln=0,c=0; paths.forEach(function(r){ r.forEach(function(pt){ la+=pt.getLat(); ln+=pt.getLng(); c++; }); }); return c?new kakao.maps.LatLng(la/c,ln/c):b.getSouthWest(); })();\n      const labelEl = document.createElement(\'div\');\n      labelEl.className = \'dong-label\';\n      labelEl.textContent = name;\n      labelEl.addEventListener(\'click\', function(){ showHoverCard({sido: sido, sigungu: sigungu, dong:name}, center); });\n\n      const label = new kakao.maps.CustomOverlay({\n        position:center, content:labelEl, yAnchor:1, xAnchor:.5, zIndex:3\n      });\n      label.setMap(null); labelOverlays[name]=label;\n\n      kakao.maps.event.addListener(poly,\'mouseover\',function(){ if(selectedDong!==name) poly.setOptions({strokeWeight:4,fillOpacity:.52}); });\n      kakao.maps.event.addListener(poly,\'mouseout\',function(){ if(selectedDong!==name) poly.setOptions({strokeWeight:3,fillOpacity:.45}); });\n\n      kakao.maps.event.addListener(poly,\'click\',function(mouseEvent){\n        const ll = (mouseEvent && mouseEvent.latLng) ? mouseEvent.latLng : center;\n        showHoverCard({sido:sido,sigungu:sigungu,dong:name}, ll);\n      });\n    }\n\n    // 인접 고려 색상 배정\n    assignColors(names);\n\n    polygonMeta.__sido=sido; polygonMeta.__sigungu=sigungu;\n    map.setBounds(boundsAll);\n    return true;\n  }\n\n  function pointInPolygon(lat,lng,paths){\n    let inside=false;\n    for(const ring of paths){\n      for(let i=0,j=ring.length-1;i<ring.length;j=i++){\n        const xi=ring[i].getLng(), yi=ring[i].getLat();\n        const xj=ring[(i+1)%ring.length].getLng(), yj=ring[(i+1)%ring.length].getLat();\n        const intersect=((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);\n        if(intersect) inside=!inside;\n      }\n    }\n    return inside;\n  }\n\n  // ★ 관할행정동 하이라이트 — 연하게(가독성)\n  function setHighlight(dongName){\n    for(const nm in polygons){\n      const poly=polygons[nm]; const meta=polygonMeta[nm]; if(!meta) continue;\n      poly.setOptions({strokeWeight:3,strokeColor:meta.stroke,strokeStyle:\'shortdash\',fillColor:meta.fill,fillOpacity:.35, zIndex:2});\n    }\n    if(polygons[dongName]){\n      const poly=polygons[dongName];\n      poly.setOptions({\n        strokeWeight:5,\n        strokeColor:\'#059669\',   // emerald-600\n        strokeStyle:\'solid\',\n        fillColor:\'#a7f3d0\',     // emerald-200 (연함)\n        fillOpacity:.55,\n        zIndex:5\n      });\n      selectedDong=dongName; if(polygonMeta[dongName]) map.setBounds(polygonMeta[dongName].bounds);\n    }\n  }\n\n function makeBadgeOverlay(lat,lng,title,theme){var isCenter=(theme===\'center\');var html=\'<div title="\'+String(title||\'위치\').replace(/"/g,\'&quot;\')+\'" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.74);border:1px solid #e5e7eb;padding:\'+(isCenter?\'8px\':\'6px\')+\';border-radius:999px;box-shadow:0 6px 18px rgba(2,6,23,.12)"><span style="width:\'+(isCenter?\'12px\':\'10px\')+\';height:\'+(isCenter?\'12px\':\'10px\')+\';border-radius:999px;background:#34d399;box-shadow:0 0 0 4px rgba(16,185,129,.14)"></span></div>\';return new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(lat,lng),content:html,yAnchor:1,xAnchor:.5,zIndex:9});\n}\n function makePulseMarker(lat,lng,label){\nvar html=\'<div title="\'+String(label||\'위치\').replace(/"/g,\'&quot;\')+\'" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.74);border:1px solid #e5e7eb;padding:6px;border-radius:999px;box-shadow:0 6px 18px rgba(2,6,23,.12)"><div style="width:14px;height:14px;border-radius:999px;background:#10b981;position:relative;box-shadow:0 0 0 4px rgba(16,185,129,.14)"><div style="position:absolute;inset:-6px;border-radius:999px;border:2px solid rgba(16,185,129,.30)"></div></div></div>\';\nreturn new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(lat,lng),content:html,yAnchor:1,xAnchor:.5,zIndex:10});\n}\n\n // 카카오 길찾기 링크\n  function kakaoRouteURL(mode, start, dest, sLabel, dLabel){ var isMob=/Mobi|Android/i.test(navigator.userAgent); if(isMob){ return \'kakaomap://route?sp=\'+start.lat+\',\'+start.lng+\'&ep=\'+dest.lat+\',\'+dest.lng+\'&by=\'+(mode===\'transit\'?\'PUBLICTRANSIT\':\'CAR\'); } return \'https://map.kakao.com/?sName=\'+encodeURIComponent(sLabel||\'출발지\')+\'&eName=\'+encodeURIComponent(dLabel||\'도착지\')+(mode===\'transit\'?\'#transit\':\'#routes\'); }\n\n  async function showHoverCard(area, anchorLatLng){\n    try{\n      if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; }\n      const rec = await findCenterRecord(area.sido, area.sigungu, area.dong);\n      const centerName = (rec && rec.name) ? rec.name : (area.dong+\' 행정복지센터\');\n      const baseAddr = (rec && rec.addr) ? rec.addr : \'\';\n      const phone = (rec && rec.phone) ? rec.phone : \'\';\n      const homepage = (rec && rec.homepage) ? rec.homepage : \'\';\n      const kurl = (rec && rec.kakao_url) ? rec.kakao_url : (\'https://map.kakao.com/link/search/\'+encodeURIComponent(baseAddr || centerName));\n\n      let road = \'\', jibun=\'\';\n      try{\n        const g = await restGeocode(baseAddr || centerName);\n        if(g){ road=g.road||\'\'; jibun=g.jibun||\'\'; }\n      }catch{}\n\n      const html =\n        \'<div style="max-width:320px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 30px rgba(2,6,23,.20);padding:10px 12px;word-break:break-word;position:relative">\' +\n          \'<button id="hoverCloseBtn" style="position:absolute;right:8px;top:8px;border:0;background:transparent;color:#111827;font-size:18px;line-height:1;width:28px;height:28px;border-radius:8px;cursor:pointer">×</button>\' +\n          \'<div style="font-weight:800;color:#111827;margin-right:30px">\' + (area.sigungu||\'\') + \' \' + area.dong + \'</div>\' +\n          \'<div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.5">\' +\n            \'<div><b>\' + centerName + \'</b></div>\' +\n            (road?(\'<div>도로명: \'+road+\'</div>\'):\'\') +\n            (jibun?(\'<div>지번: \'+jibun+\'</div>\'):\'\') +\n            (phone?(\'<div style="margin-top:4px">☎️ \'+phone+\'</div>\'):\'\') +\n            \'<div style="margin-top:8px;display:flex;gap:10px;flex-wrap:nowrap;align-items:center">\' +\n              \'<a target="_blank" href="\' + (\'https://map.kakao.com/link/search/\'+encodeURIComponent(baseAddr||centerName)) + \'" class="iconbtn lg" title="카카오맵(검색)"><span class="ico ico-kakao"></span></a>\' +\n              \'<a target="_blank" href="\' + (\'https://map.naver.com/v5/search/\'+encodeURIComponent(baseAddr||centerName)) + \'" class="iconbtn lg" title="네이버맵(검색)"><span class="ico ico-naver"></span></a>\' +\n              \'<button class="iconbtn lg" id="hoverCopyBtn" title="주소 복사"><span class="ico ico-copy"></span></button>\' +\n            \'</div>\' +\n            \'<div style="margin-top:6px;">\' +\n              \'<a target="_blank" href="\' + kurl + \'" style="font-size:12px;color:#2563eb">카카오맵 정보</a>\' +\n              (homepage ? (\' <span style="color:#64748b;font-size:12px">·</span> <a target="_blank" href="\'+homepage+\'" style="font-size:12px;color:#2563eb">홈페이지</a>\') : \'\') +\n            \'</div>\' +\n          \'</div>\' +\n        \'</div>\';\n      hoverOverlay = new kakao.maps.CustomOverlay({ position:anchorLatLng, content:html, yAnchor:1.05, xAnchor:.5, zIndex:10000 });\n      hoverOverlay.setMap(map);\n      setTimeout(function(){\n        const btn=document.getElementById(\'hoverCloseBtn\');\n        if(btn) btn.addEventListener(\'click\',function(){ if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; } });\n        const cp=document.getElementById(\'hoverCopyBtn\');\n        if(cp) cp.addEventListener(\'click\',function(){ navigator.clipboard.writeText(road || jibun || baseAddr || centerName || \'\'); });\n      },0);\n    }catch{}\n  }\n\n  // 경로/오버레이 관리\n  function clearRoutes(cancel){\n    if(cancel===undefined) cancel=true;\n    if(cancel) routeSeq++; // 이후 응답은 모두 무시\n    if(routeLineCar){ routeLineCar.setMap(null); routeLineCar=null; }\n    if(routeLineWalk){ routeLineWalk.setMap(null); routeLineWalk=null; }\n    if(routeOverlay){ routeOverlay.setMap(null); routeOverlay=null; }\n  }\n\n  // 자동차/도보 경로 그리기(지오메트리/거리용). 시간은 카카오 길찾기로 안내.\n  async function drawRoute(start, dest){\n    const seq = ++routeSeq;\n    if(routeLineCar){ routeLineCar.setMap(null); routeLineCar=null; }\n    if(routeLineWalk){ routeLineWalk.setMap(null); routeLineWalk=null; }\n    if(routeOverlay){ routeOverlay.setMap(null); routeOverlay=null; }\n\n    const modes=[{key:\'driving\', label:\'🚗\'},{key:\'walking\', label:\'🚶\'}];\n    const results=[]; let bounds=new kakao.maps.LatLngBounds();\n\n    for(const m of modes){\n      try{\n        const url=\'https://router.project-osrm.org/route/v1/\'+m.key+\'/\'+start.lng+\',\'+start.lat+\';\'+dest.lng+\',\'+dest.lat+\'?overview=full&geometries=geojson\';\n        const resp=await fetch(url);\n        const j=await resp.json();\n        if(seq!==routeSeq) return;\n\n        if(j.code===\'Ok\' && j.routes && j.routes[0]){\n          const coords=j.routes[0].geometry.coordinates.map(function(c){ return new kakao.maps.LatLng(c[1],c[0]); });\n          const line=new kakao.maps.Polyline({map:(m.key===\'driving\'?map:null),path:coords,strokeWeight:5,strokeColor:(m.key===\'driving\'?\'#2563eb\':\'#10b981\'),strokeOpacity:0.85,strokeStyle:(m.key===\'driving\'?\'solid\':\'shortdash\'),zIndex:5});\n          if(m.key===\'driving\') routeLineCar=line; else routeLineWalk=line;\n          coords.forEach(function(pt){ bounds.extend(pt); });\n          const dist=j.routes[0].distance;\n          results.push({mode:m.key, dist:dist, label:m.label});\n        }\n      }catch(e){ console.warn(\'route fail\',m.key,e); }\n    }\n\n    if(seq!==routeSeq) return;\n\n    if(results.length){\n      const km=(results[0].dist/1000).toFixed(2);\n\n      const box=document.getElementById(\'routeMetrics\');\n      const distTxt=document.getElementById(\'distTxt\');\n      const distTxtMini=document.getElementById(\'distTxtMini\');\n      if(box&&distTxt){ box.style.display=\'flex\'; distTxt.textContent=String(km)+\' km\'; }\n      if(distTxtMini){ distTxtMini.textContent=String(km)+\' km\'; }\n\n      const midLat=(start.lat+dest.lat)/2, midLng=(start.lng+dest.lng)/2; const isEq=function(p1,p2){return p1&&p2&&Math.abs(p1.lat-p2.lat)<0.0001;}; let sNm=\'출발지\'; if(isEq(start,lastSearch)) sNm=lastSearchLabel; else if(isEq(start,lastCenter)) sNm=lastCenter.name; else sNm=\'현재위치\'; let dNm=\'도착지\'; if(isEq(dest,lastCenter)) dNm=lastCenter.name; else if(isEq(dest,lastSearch)) dNm=lastSearchLabel; else dNm=\'현재위치\'; const navUrl=kakaoRouteURL(\'car\', start, dest, sNm, dNm);\n      const html=\n        \'<div style="background:rgba(255,255,255,0.7);backdrop-filter:blur(4px);border:1px solid rgba(229,231,235,0.8);padding:6px 10px;border-radius:10px;box-shadow:0 4px 12px rgba(2,6,23,.15);font-size:12px;display:flex;gap:8px;align-items:center;color:#111827">\' +\n          \'<span>거리: <b>\'+km+\' km</b></span><button onclick="window.open(&quot;\'+navUrl+\'&quot;)" style="background:#FEE500;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="카카오맵 길찾기"><b style="color:#000;font-size:14px">K</b></button>\' +\n        \'</div>\';\n      routeOverlay=new kakao.maps.CustomOverlay({ position:new kakao.maps.LatLng(midLat,midLng), content:html, yAnchor:1.2, xAnchor:.5, zIndex:6 });\n      routeOverlay.setMap(map);\n\n      bounds.extend(new kakao.maps.LatLng(start.lat,start.lng));\n      bounds.extend(new kakao.maps.LatLng(dest.lat,dest.lng));\n      map.setBounds(bounds);\n    }\n  }\n\n  function renderInfoPanel(area, center){\n    const panel=document.getElementById(\'info\');\n    const hdrTitle=document.getElementById(\'infoTitle\');\n    const body=document.getElementById(\'infoBody\');\n    panel.style.display=\'block\'; panel.classList.add(\'collapsed\'); document.getElementById(\'infoToggle\').textContent=\'펼치기\';\n    hdrTitle.textContent = (area && area.dong ? area.dong : \'행정동\')+\' · 정보\';\n    body.innerHTML=\'\';\n\n    const h3=document.createElement(\'h3\'); h3.style.margin=\'0 0 6px 0\'; h3.textContent=center.name||\'행정복지센터\';\n    const muted=document.createElement(\'div\'); muted.className=\'muted\'; muted.textContent=(area.sido+\' \'+(area.sigungu||\'\')+\' 관할 · \'+(area.dong||\'\'));\n\n    const addrWrap=document.createElement(\'div\'); addrWrap.style.marginTop=\'6px\';\n    if(center.road || center.jibun){\n      if(center.road){ const d=document.createElement(\'div\'); d.textContent=\'도로명: \'+center.road; addrWrap.append(d); }\n      if(center.jibun){ const j=document.createElement(\'div\'); j.textContent=\'지번: \'+center.jibun; addrWrap.append(j); }\n    }else{\n      const a=document.createElement(\'div\'); a.textContent=center.addr||\'\'; addrWrap.append(a);\n    }\n\n    const links=document.createElement(\'div\');\n    links.style.display=\'flex\';\n    links.style.gap=\'10px\';\n    links.style.marginTop=\'10px\';\n    links.style.flexWrap=\'nowrap\';\n    links.style.alignItems=\'center\';\n    const aK1=document.createElement(\'a\');\n    aK1.className=\'iconbtn lg\'; aK1.target=\'_blank\'; aK1.title=\'카카오맵(검색)\';\n    aK1.href=\'https://map.kakao.com/link/search/\'+encodeURIComponent(center.addr||center.name||\'행정복지센터\');\n    aK1.innerHTML=\'<span class="ico ico-kakao"></span>\'; aK1.setAttribute(\'aria-label\',\'카카오맵\');\n    const bC=document.createElement(\'button\');\n    bC.className=\'iconbtn lg\'; bC.title=\'주소 복사\';\n    bC.innerHTML=\'<span class="ico ico-copy"></span>\';\n    bC.addEventListener(\'click\',function(){ navigator.clipboard.writeText(center.addr||center.road||center.jibun||\'\'); });\n    bC.setAttribute(\'aria-label\',\'주소 복사\');\n\n    // 오른쪽 정렬: 길찾기\n    const routeRight=document.createElement(\'div\');\n    routeRight.style.marginLeft=\'auto\';\n    routeRight.innerHTML =\n      \'<div style="display:flex;gap:6px;align-items:center">\' +\n        \'<span id="distTxtMini" class="mini" style="color:#cbd5e1;margin-right:4px;">-</span>\' +\n        \'<button id="btnShowCar" class="iconbtn lg" style="font-size:12px;font-weight:700">자동차</button>\' +\n        \'<button id="btnShowWalk" class="iconbtn lg" style="font-size:12px;font-weight:700">도보</button>\' +\n        \'<button id="openKakaoTransit" class="iconbtn lg" style="font-size:12px;font-weight:700;color:#2563eb">대중교통 안내</button>\' +\n      \'</div>\';\n\n    links.append(aK1,bC);\n\n    const links2=document.createElement(\'div\'); links2.style.display=\'block\'; links2.style.marginTop=\'6px\';\n    const kInfo=document.createElement(\'a\');\n    kInfo.target=\'_blank\';\n    kInfo.href=(center.kakao_url || (\'https://map.kakao.com/link/search/\'+encodeURIComponent(center.addr||center.name||\'행정복지센터\')));\n    kInfo.textContent=\'카카오맵 정보\'; kInfo.style.fontSize=\'12px\'; kInfo.style.color=\'#2563eb\';\n    const linkWrap=document.createElement(\'div\'); linkWrap.append(kInfo);\n    if(center.homepage){\n      const sep=document.createTextNode(\' · \');\n      const home=document.createElement(\'a\'); home.target=\'_blank\'; home.href=center.homepage; home.textContent=\'홈페이지\';\n      home.style.fontSize=\'12px\'; home.style.color=\'#2563eb\';\n      linkWrap.append(sep,home);\n    }\n    links2.append(linkWrap);\n\n    if(center.phone){\n      const p=document.createElement(\'div\'); p.style.marginTop=\'6px\'; p.textContent=\'☎️ \'+center.phone; \n      body.append(h3,muted,addrWrap,p,links,links2);\n    }else{\n      body.append(h3,muted,addrWrap,links,links2);\n    }\n\n    // // 경로 요약(거리만)\n    const metric=document.createElement(\'div\'); metric.className=\'metric\'; metric.id=\'routeMetrics\'; metric.style.display=\'none\';\n    metric.innerHTML = \'<div><b>거리</b> <span id="distTxt">-</span></div>\';\n    body.append(metric);\n    const restWrap=document.createElement(\'div\'); restWrap.style.marginTop=\'16px\'; restWrap.style.paddingTop=\'12px\'; restWrap.style.borderTop=\'1px solid #e2e8f0\'; restWrap.innerHTML=\'<div style="font-weight:800;font-size:13px;color:#0f172a;margin-bottom:8px;">🍽️ 우리동네 맛집</div><div style="display:flex;gap:8px"><button onclick="window.__openRestModal(&quot;\'+area.dong+\'&quot;)" style="flex:1;background:#2563eb;color:#fff;border:0;height:32px;font-size:12px;border-radius:8px;cursor:pointer;font-weight:700">+ 등록하기</button><button onclick="window.__viewRestList(&quot;\'+area.dong+\'&quot;)" style="flex:1;background:#f8fafc;color:#0f172a;border:1px solid #cbd5e1;height:32px;font-size:12px;border-radius:8px;cursor:pointer;font-weight:700">리스트 확인</button></div><div id="restList" style="display:none"></div>\'; body.append(restWrap); window.__loadRest(area.dong);\n    let aptPanel=document.getElementById(\'aptPanel\'); if(!aptPanel){ aptPanel=document.createElement(\'div\'); aptPanel.id=\'aptPanel\'; aptPanel.className=\'panel\'; aptPanel.style.right=\'auto\'; aptPanel.style.left=\'12px\'; aptPanel.style.top=\'12px\'; aptPanel.innerHTML=\'<div class="phdr"><b style="margin-right:auto">🏢 관할 아파트 <span id="aptCountTxt" style="color:#2563eb;font-size:13px"></span></b><button id="aptExcelBtn" style="display:none;margin-right:8px;padding:0;background:transparent;border:none;color:#1e3a8a;font-size:13px;font-weight:bold;cursor:pointer;box-shadow:none;">다운로드</button><button id="aptToggle">접기</button></div><div class="pbody" id="aptBody" style="max-height:60vh;overflow-y:auto;font-size:13px;line-height:1.6;"></div>\'; document.getElementById(\'wrap\').appendChild(aptPanel); document.getElementById(\'aptToggle\').onclick=function(){aptPanel.classList.toggle(\'collapsed\'); this.textContent=aptPanel.classList.contains(\'collapsed\')?\'펼치기\':\'접기\';}; document.getElementById(\'aptExcelBtn\').onclick=function(){ if(!window.__aptData) return; let csv=\'\\uFEFF아파트명,도로명주소,지번주소,단지규모(동/세대)\\n\'; window.__aptData.forEach(function(a){ csv+=String(a.place_name||\'\').replace(/,/g,\'\')+\',\'+String(a.road_address_name||\'\').replace(/,/g,\'\')+\',\'+String(a.address_name||\'\').replace(/,/g,\'\')+\',\\n\'; }); let blob=new Blob([csv],{type:\'text/csv;charset=utf-8;\'}); let link=document.createElement(\'a\'); link.href=URL.createObjectURL(blob); link.download=(window.__aptDong||\'관할\')+\'_아파트리스트.csv\'; link.click(); }; }\n    aptPanel.style.display=\'block\'; aptPanel.classList.add(\'collapsed\'); document.getElementById(\'aptToggle\').textContent=\'펼치기\'; document.getElementById(\'aptBody\').innerHTML=\'목록 불러오는 중...\';\n    setTimeout(async function(){\n      try{\n        const q=(area.sigungu||area.sido)+\' \'+area.dong+\' 아파트\';\n        const r=await fetch(\'/api/keyword?query=\'+encodeURIComponent(q)+\'&size=15&all=true\');\n        const list=await r.json();\n        const aptC=document.getElementById(\'aptBody\');\n        if(!aptC) return;\n        let vApts=list;\n        if(polygonMeta[area.dong] && polygonMeta[area.dong].paths){\n          vApts=list.filter(function(a){ return pointInPolygon(parseFloat(a.y), parseFloat(a.x), polygonMeta[area.dong].paths); });\n        }\n        const cntTxt=document.getElementById(\'aptCountTxt\'); if(vApts.length===0){ aptC.innerHTML=\'조회된 관내 아파트가 없습니다.\'; document.getElementById(\'aptExcelBtn\').style.display=\'none\'; if(cntTxt) cntTxt.textContent=\'(0)\'; }else{ window.__aptData=vApts; window.__aptDong=area.dong; document.getElementById(\'aptExcelBtn\').style.display=\'block\'; if(cntTxt) cntTxt.textContent=\'(\'+vApts.length+\')\'; aptC.innerHTML=vApts.map(function(a){ return \'<div style="cursor:pointer;color:#2563eb;font-weight:600;padding:4px 0;border-bottom:1px solid #f1f5f9;" onclick="window.__openApt(&quot;\'+a.place_name+\'&quot;,\'+a.y+\',\'+a.x+\',&quot;\'+(a.road_address_name||\'\')+\'&quot;,&quot;\'+(a.address_name||\'\')+\'&quot;,&quot;\'+(a.place_url||\'\')+\'&quot;); return false;">• \'+a.place_name+\'</div>\'; }).join(\'\'); }\n      }catch(e){ const aptC=document.getElementById(\'aptBody\'); if(aptC) aptC.innerHTML=\'불러오기 실패\'; }\n    }, 400);\n  }\n\n\n  // === 주요기관/교통 메뉴 + 단색 SVG 아이콘 ===\n  function svgIcon(letter){\n    return \'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#111" stroke-width="2" fill="none"/><text x="12" y="16" font-size="10" text-anchor="middle" fill="#111">\'+letter+\'</text></svg>\';\n  }\n  var MAJOR_CATS=[\n    {key:\'school_elem\',label:\'초등학교\',symbol:\'E\',query:\'초등학교\'},\n    {key:\'bus_terminal\',label:\'시외버스터미널\',symbol:\'B\',query:\'시외버스터미널\'},\n    {key:\'rail_station\',label:\'철도역\',symbol:\'R\',query:\'철도역\'}\n  ];\n  var TRAFFIC_CATS=[\n  {key:\'bus_stop\',label:\'버스정류장\',symbol:\'S\',query:\'버스정류장\'},\n  {key:\'subway_station\',label:\'지하철역\',symbol:\'M\',query:\'지하철역\'},\n  {key:\'airport\',label:\'공항\',symbol:\'A\',query:\'공항\'}\n];\n\n  function svgForKey(k){\n    var all=MAJOR_CATS.concat(TRAFFIC_CATS);\n    var it=all.find(function(x){return x.key===k;});\n    return it?svgIcon(it.symbol):svgIcon(\'?\');\n  }\n\n function getDynamicRadius(){\ntry{\n if(!map) return 3000;\n var b=map.getBounds();\n if(!b) return 3000;\n var sw=b.getSouthWest(), ne=b.getNorthEast();\n var latKm=Math.abs(ne.getLat()-sw.getLat())*111;\n var lngKm=Math.abs(ne.getLng()-sw.getLng())*88;\n var km=Math.max(latKm,lngKm);\n var r=Math.round((km*1000)*0.72);\n if(r<1200) r=1200;\n if(r>20000) r=20000;\n return r;\n}catch(e){\n return 3000;\n}\n}\n\n function buildTextOverlay(lat,lng,label,url,addr,road){\n  var el=document.createElement(\'div\');\n  el.innerHTML=\'<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.18);flex:0 0 auto;"></span><div style="background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:4px 8px;box-shadow:0 6px 18px rgba(2,6,23,.15);font-size:12px;font-weight:700;color:#111827;white-space:nowrap;">\'+label+\'</div></div>\';\n  var ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(lat,lng),content:el,yAnchor:1,xAnchor:.5,zIndex:7});\n  el.addEventListener(\'click\',function(){ showPOICard({name:label,url:url,lat:lat,lng:lng,addr:addr||\'\',road:road||\'\'}); });\n  ov.__url=url; ov.__label=label; ov.__lat=lat; ov.__lng=lng; ov.__addr=addr||\'\'; ov.__road=road||\'\';\n  return ov;\n}\n async function refreshCats(cats,lat,lng,menuSelector,dataAttr){\n  poiOverlays = poiOverlays.filter(function(ov){\n    if(ov.__group === \'cat\'){\n      try{ ov.setMap(null); }catch(e){}\n      return false;\n    }\n    return true;\n  });\n  for(var i=0;i<cats.length;i++){\n    var key=cats[i].key;\n    var checkbox=document.querySelector(menuSelector+\' input[\'+dataAttr+\'="\'+key+\'"]\');\n    if(!checkbox || !checkbox.checked) continue;\n    var items=await restKeywordNear(cats[i].query, lng, lat, 1200, (key===\'bus_stop\'||key===\'subway_station\')?12:8);\n    for(var j=0;j<items.length;j++){\n      var it=items[j];\n      var ov=buildTextOverlay(parseFloat(it.y),parseFloat(it.x),(it.place_name||cats[i].label),(it.place_url||\'#\'),(it.address_name||\'\'),(it.road_address_name||\'\'));\n      ov.__group=\'cat\';\n      ov.__catKey=key;\n      ov.setMap(map);\n      poiOverlays.push(ov);\n    }\n  }\n}\n function bindDropMenus(){\n  var mb=document.getElementById(\'majorBtn\'); var mm=document.getElementById(\'majorMenu\');\n  var tb=document.getElementById(\'trafficBtn\'); var tm=document.getElementById(\'trafficMenu\');\n  if(mb&&mm){ mb.addEventListener(\'click\',function(){ mm.style.display = (mm.style.display===\'block\'?\'none\':\'block\'); }); }\n  if(tb&&tm){ tb.addEventListener(\'click\',function(){ tm.style.display = (tm.style.display===\'block\'?\'none\':\'block\'); }); }\n  document.addEventListener(\'click\',function(ev){ try{\n    if(mm && !mm.contains(ev.target) && ev.target!==mb) mm.style.display=\'none\';\n    if(tm && !tm.contains(ev.target) && ev.target!==tb) tm.style.display=\'none\';\n  }catch(e){} });\n  var hook=function(menuSel, cats, dataAttr){\n    var m=document.querySelector(menuSel);\n    if(!m) return;\n    m.addEventListener(\'change\',function(){\n      if(lastCenter){\n        refreshCats(cats,lastCenter.lat,lastCenter.lng,menuSel,dataAttr);\n      }else if(lastSearch){\n        refreshCats(cats,lastSearch.lat,lastSearch.lng,menuSel,dataAttr);\n      }\n    });\n  };\n  hook(\'#majorMenu\', MAJOR_CATS, \'data-major\');\n  hook(\'#trafficMenu\', TRAFFIC_CATS, \'data-traffic\');\n}\n function refreshAllPOIs(){\n  if(lastCenter){\n    refreshCats(MAJOR_CATS,lastCenter.lat,lastCenter.lng,\'#majorMenu\',\'data-major\');\n    refreshCats(TRAFFIC_CATS,lastCenter.lat,lastCenter.lng,\'#trafficMenu\',\'data-traffic\');\n  }else if(lastSearch){\n    refreshCats(MAJOR_CATS,lastSearch.lat,lastSearch.lng,\'#majorMenu\',\'data-major\');\n    refreshCats(TRAFFIC_CATS,lastSearch.lat,lastSearch.lng,\'#trafficMenu\',\'data-traffic\');\n  }\n}\n function poiEmojiFor(code){ const m={gov:\'🏛️\',police:\'🛡️\',fire:\'🔥\',post:\'📮\',tax:\'💰\',court:\'⚖️\',registry:\'📜\',imm:\'🛂\',mma:\'🎖️\',hospital:\'🏥\',school_elem:\'🏫\',bus_terminal:\'🚌\',rail_station:\'🚆\',bus_stop:\'🚏\',subway_station:\'🚇\',airport:\'✈️\'}; return m[code]||\'📍\'; }\n  function buildPoiOverlay(lat,lng,emoji,label,url,addr,road){\n  var id=\'poi_\'+Math.random().toString(36).slice(2);\n  var html=\'<div id="\'+id+\'" class="poi-dot"><span style="font-size:13px;line-height:1">\'+emoji+\'</span></div>\';\n  var ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(lat,lng),content:html,yAnchor:1,xAnchor:.5,zIndex:7});\n  ov.__id=id; ov.__url=url; ov.__label=label; ov.__lat=lat; ov.__lng=lng; ov.__addr=addr||\'\'; ov.__road=road||\'\';\n  setTimeout(function(){\n    var el=document.getElementById(id);\n    if(el){\n      el.addEventListener(\'mouseenter\',function(){\n        showPOIHover({name:label,url:url,lat:lat,lng:lng,addr:ov.__addr,road:ov.__road});\n      });\n      el.addEventListener(\'mouseleave\',function(){\n        hidePOIHover();\n      });\n      el.addEventListener(\'click\',function(){\n        showPOICard({name:label,url:url,lat:lat,lng:lng,addr:ov.__addr,road:ov.__road});\n      });\n    }\n  },0);\n  return ov;\n}\n function showPOIHover(poi){\n  if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; }\n  var infoRows=\'\';\n  if(poi.road) infoRows+=\'<div>도로명: \'+poi.road+\'</div>\';\n  if(poi.addr) infoRows+=\'<div>지번: \'+poi.addr+\'</div>\';\n  var html=\'<div style="max-width:320px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 30px rgba(2,6,23,.20);padding:10px 12px;position:relative"><div style="font-weight:800;color:#111827;margin-bottom:6px">\'+(poi.name||\'기관\')+\'</div><div style="font-size:13px;color:#334155;line-height:1.5">\'+infoRows+\'</div></div>\';\n  hoverOverlay=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(poi.lat,poi.lng),content:html,yAnchor:1.15,xAnchor:.5,zIndex:10000});\n  hoverOverlay.setMap(map);\n}\nfunction hidePOIHover(){\n  if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; }\n}\n window.__openApt=function(n,la,lo,r,a,u){ showPOICard({name:n,lat:la,lng:lo,road:r,addr:a,url:u}); map.setCenter(new kakao.maps.LatLng(la,lo)); map.setLevel(3); };\n window.__viewRestList=function(dong){ let m=document.getElementById(\'restViewModal\'); if(!m){ m=document.createElement(\'div\'); m.id=\'restViewModal\'; m.style.cssText=\'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(400px,90vw);background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:4002;padding:20px;color:#0f172a;max-height:80vh;display:flex;flex-direction:column;\'; document.body.appendChild(m); let mask=document.createElement(\'div\'); mask.id=\'restViewMask\'; mask.style.cssText=\'position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:4001;\'; document.body.appendChild(mask); mask.onclick=function(){m.style.display=\'none\';mask.style.display=\'none\';}; } document.getElementById(\'restViewMask\').style.display=\'block\'; m.style.display=\'flex\'; m.innerHTML=\'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">🍽️ \'+dong+\' 맛집</h3><button onclick="document.getElementById(\\\'restViewModal\\\').style.display=\\\'none\\\';document.getElementById(\\\'restViewMask\\\').style.display=\\\'none\\\';" style="background:none;border:none;font-size:24px;cursor:pointer;color:#333">×</button></div><div id="restViewContent" style="overflow-y:auto;flex:1">\'+document.getElementById(\'restList\').innerHTML+\'</div>\'; }; window.__authAuthor=function(author,dong,skipPw){ const items=window.__dongRestGrouped[author]; if(!items||!items.length){ window.__viewRestList(dong); return; } let pw=skipPw; if(!pw){ pw=prompt(author+\'님의 비밀번호를 입력하세요.\'); if(!pw) return; if(items[0].password!==pw){ alert(\'비밀번호가 틀렸습니다.\'); return; } } let html=\'<div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;"><button onclick="window.__viewRestList(&quot;\'+dong+\'&quot;)" style="background:#e2e8f0;color:#0f172a;border:none;padding:6px 10px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;">← 목록으로</button><button onclick="window.__delAllRest(&quot;\'+author+\'&quot;,&quot;\'+dong+\'&quot;,&quot;\'+pw+\'&quot;)" style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;">전체 삭제</button></div><h4 style="margin:0 0 12px 0;color:#0f172a;">👤 \'+author+\'님의 맛집 리스트</h4>\'; items.forEach(function(item){ let stars=\'\'; for(let i=0;i<parseInt(item.rating||5);i++) stars+=\'⭐\'; html+=\'<div style="background:#f8fafc;padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid #e2e8f0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-weight:700;color:#2563eb;cursor:pointer;font-size:15px;" onclick="window.__openApt(&quot;\'+item.name+\'&quot;,\'+item.lat+\',\'+item.lng+\',&quot;\'+(item.address||\'\')+\'&quot;,&quot;&quot;,&quot;\'+item.url+\'&quot;); document.getElementById(&quot;restViewModal&quot;).style.display=&quot;none&quot;; document.getElementById(&quot;restViewMask&quot;).style.display=&quot;none&quot;;">🍽️ \'+item.name+\'</span><button onclick="window.__delRest(&quot;\'+item.id+\'&quot;,&quot;\'+dong+\'&quot;,&quot;\'+pw+\'&quot;,&quot;\'+author+\'&quot;)" style="background:transparent;border:0;color:#ef4444;cursor:pointer;font-size:12px;font-weight:bold;">삭제</button></div><div style="font-size:12px;color:#475569;margin-bottom:4px;"><b>별점:</b> \'+stars+\'</div>\'; if(item.memo) html+=\'<div style="font-size:12px;color:#475569;"><b>메모:</b> \'+item.memo+\'</div>\'; html+=\'</div>\'; }); const vc=document.getElementById(\'restViewContent\'); if(vc) vc.innerHTML=html; };window.__delRest=async function(id,dong,pw,author){ if(!confirm(\'삭제하시겠습니까?\')) return; try{ const r=await fetch(\'/api/restaurants/\'+id,{method:\'DELETE\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({password:pw})}); const res=await r.json(); if(res.error===\'wrong_password\'){ alert(\'비밀번호가 틀렸습니다.\'); }else{ await window.__loadRest(dong); if(window.__dongRestGrouped[author] && window.__dongRestGrouped[author].length>0) window.__authAuthor(author,dong,pw); else window.__viewRestList(dong); } }catch(e){} };window.__delAllRest=async function(author,dong,pw){ if(!confirm(author+\'님의 모든 추천 맛집을 삭제하시겠습니까?\')) return; try{ const r=await fetch(\'/api/restaurants/author/\'+encodeURIComponent(author),{method:\'DELETE\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({password:pw,dong:dong})}); const res=await r.json(); if(res.error===\'wrong_password\'){ alert(\'비밀번호가 틀렸습니다.\'); }else{ await window.__loadRest(dong); window.__viewRestList(dong); } }catch(e){} };window.__loadRest=async function(dong){ try{ const r=await fetch(\'/api/restaurants?dong=\'+encodeURIComponent(dong)); const list=await r.json(); const c=document.getElementById(\'restList\'); if(!c)return; window.__dongRestData=list; let grouped={}; list.forEach(function(i){ if(!grouped[i.author]) grouped[i.author]=[]; grouped[i.author].push(i); }); window.__dongRestGrouped=grouped; if(!list.length) { c.innerHTML=\'<div style="text-align:center;padding:20px;color:#64748b">등록된 맛집이 없습니다.</div>\'; }else{ let html=\'\'; for(const author in grouped){ html+=\'<div style="margin-top:12px;background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="window.__authAuthor(&quot;\'+author+\'&quot;,&quot;\'+dong+\'&quot;)"><span style="font-weight:800;font-size:14px;color:#334155;">👤 \'+author+\'님의 추천 (\'+grouped[author].length+\'개)</span><span>🔒</span></div>\'; } c.innerHTML=html; } const vc=document.getElementById(\'restViewContent\'); if(vc) vc.innerHTML=c.innerHTML; }catch(e){} };window.__openRestModal=function(dong){ window.__currentDong=dong; document.getElementById(\'restModalMask\').style.display=\'block\'; document.getElementById(\'restModal\').style.display=\'block\'; document.getElementById(\'restStep1\').style.display=\'block\'; document.getElementById(\'restStep2\').style.display=\'none\'; document.getElementById(\'restSearchInput\').value=\'\'; document.getElementById(\'restSearchResults\').innerHTML=\'\'; document.getElementById(\'restSearchResults\').style.display=\'none\'; let dl=document.getElementById(\'authorDatalist\'); if(dl){ dl.innerHTML=\'\'; if(window.__dongRestGrouped){ Object.keys(window.__dongRestGrouped).forEach(function(a){ dl.innerHTML+=\'<option value="\'+a+\'"></option>\'; }); } } };document.addEventListener(\'DOMContentLoaded\', function(){ document.getElementById(\'restCloseBtn1\').onclick=function(){ document.getElementById(\'restModalMask\').style.display=\'none\'; document.getElementById(\'restModal\').style.display=\'none\'; }; document.getElementById(\'restSearchBtn\').onclick=async function(){ const q=document.getElementById(\'restSearchInput\').value.trim(); if(!q) return; try{ const r=await fetch(\'/api/keyword?query=\'+encodeURIComponent(window.__currentDong+\' \'+q)+\'&size=5\'); const list=await r.json(); const resDiv=document.getElementById(\'restSearchResults\'); resDiv.style.display=\'block\'; if(!list.length){ resDiv.innerHTML=\'<div style="padding:10px;text-align:center">검색 결과가 없습니다.</div>\'; return; } resDiv.innerHTML=list.map(function(item){ return \'<div style="padding:10px;border-bottom:1px solid #e2e8f0;cursor:pointer" onclick="window.__selectRest(&quot;\'+item.place_name+\'&quot;,\'+item.y+\',\'+item.x+\',&quot;\'+(item.road_address_name||item.address_name)+\'&quot;,&quot;\'+item.place_url+\'&quot;)"><b>\'+item.place_name+\'</b><div style="font-size:11px;color:#64748b">\'+(item.road_address_name||item.address_name)+\'</div></div>\'; }).join(\'\'); }catch(e){} }; document.getElementById(\'restCancelBtn\').onclick=function(){ document.getElementById(\'restStep1\').style.display=\'block\'; document.getElementById(\'restStep2\').style.display=\'none\'; }; document.getElementById(\'restSubmitBtn\').onclick=async function(){ const author=document.getElementById(\'restAuthor\').value.trim(); const pw=document.getElementById(\'restPassword\').value.trim(); const rating=document.getElementById(\'restRating\').value; const memo=document.getElementById(\'restMemo\').value.trim(); if(!pw){ alert(\'비밀번호를 입력해주세요.\'); return; } try{ await fetch(\'/api/restaurants\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({dong:window.__currentDong, name:window.__selRest.name, lat:window.__selRest.lat, lng:window.__selRest.lng, address:window.__selRest.addr, url:window.__selRest.url, author:author, password:pw, rating:rating, memo:memo})}); document.getElementById(\'restModalMask\').style.display=\'none\'; document.getElementById(\'restModal\').style.display=\'none\'; window.__loadRest(window.__currentDong); }catch(e){} }; }); window.__selectRest=function(name,lat,lng,addr,url){ window.__selRest={name,lat,lng,addr,url}; document.getElementById(\'restStep1\').style.display=\'none\'; document.getElementById(\'restStep2\').style.display=\'block\'; document.getElementById(\'restSelectedInfo\').textContent=\'선택됨: \'+name; document.getElementById(\'restAuthor\').value=\'\'; document.getElementById(\'restPassword\').value=\'\'; document.getElementById(\'restRating\').value=\'5\'; document.getElementById(\'restMemo\').value=\'\'; };\n function showPOICard(poi){\n    var infoRows=\'\';\n    if(poi.road) infoRows+=\'<div>도로명: \'+poi.road+\'</div>\';\n    if(poi.addr) infoRows+=\'<div>지번: \'+poi.addr+\'</div>\';\n    var html =\n      \'<div style="max-width:320px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 30px rgba(2,6,23,.20);padding:10px 12px;position:relative">\' +\n        \'<button id="poiCloseBtn" style="position:absolute;right:8px;top:8px;border:0;background:transparent;color:#111827;font-size:18px;line-height:1;width:28px;height:28px;border-radius:8px;cursor:pointer">×</button>\' +\n        \'<div style="font-weight:800;color:#111827;margin-right:30px">\'+(poi.name||\'기관\')+\'</div>\' +\n        \'<div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.5">\'+ infoRows +\'</div>\' +\n        \'<div style="margin-top:8px;display:flex;gap:10px;flex-wrap:nowrap;align-items:center">\' +\n          \'<a target="_blank" href="\'+(poi.url||\'#\')+\'" class="iconbtn lg" title="카카오맵 정보"><span class="ico ico-kakao"></span></a>\' +\n          \'<button class="iconbtn lg" onclick="window.__forceSearch(&quot;\'+poi.name+\'&quot;,\'+poi.lat+\',\'+poi.lng+\',&quot;\'+(poi.road||\'\')+\'&quot;,&quot;\'+(poi.addr||\'\')+\'&quot;)" style="font-weight:700;margin-left:auto;color:#2563eb">바로 검색 🔍</button>\' +\n        \'</div>\' +\n      \'</div>\';\n    if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; }\n    hoverOverlay=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(poi.lat,poi.lng),content:html,yAnchor:1.05,xAnchor:.5,zIndex:10000});\n    hoverOverlay.setMap(map);\n    setTimeout(function(){\n      var btn=document.getElementById(\'poiCloseBtn\');\n      if(btn) btn.addEventListener(\'click\',function(){ if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; } });\n    },0);\n  }\n\n  function getEnabledPOICats(){ var out=[]; document.querySelectorAll(\'#majorMenu input:checked, #trafficMenu input:checked\').forEach(function(chk){ var c=chk.dataset.poi||chk.dataset.major||chk.dataset.traffic; if(c && out.indexOf(c)===-1) out.push(c); }); return out; }\n const POI_QUERIES={ gov:[\'시청\',\'구청\',\'행정복지센터\'], police:[\'경찰서\', \'파출소\', \'지구대\'], fire:[\'소방서\', \'119안전센터\'], post:[\'우체국\'], tax:[\'세무서\'], court:[\'법원\'], registry:[\'등기소\',\'등기국\'], imm:[\'출입국외국인청\',\'출입국사무소\'], mma:[\'병무청\'], hospital:[\'병원\',\'의원\',\'보건소\'], school_elem:[\'초등학교\'], bus_terminal:[\'버스터미널\'], rail_station:[\'기차역\',\'철도역\',\'KTX\',\'SRT\'], bus_stop:[\'버스정류장\'], subway_station:[\'지하철역\'], airport:[\'공항\'] };\n function isGoodPOIResult(code,d){ var nm=String((d&&d.place_name)||\'\'); var cat=String((d&&d.category_name)||\'\'); if(code===\'airport\' && (nm.indexOf(\'점\')>-1 || nm.indexOf(\'주차\')>-1 || cat.indexOf(\'주차\')>-1)) return false; if(code===\'hospital\' && (nm.indexOf(\'동물\')>-1 || cat.indexOf(\'동물\')>-1 || nm.indexOf(\'요양\')>-1)) return false; if(code===\'court\' && (nm.indexOf(\'법무사\')>-1 || nm.indexOf(\'변호사\')>-1)) return false; return true; }\n function scorePOIResult(d){ return parseInt(d.distance,10)||0; }\n async function showPOIsAround(){ try{ poiOverlays = poiOverlays.filter(function(o){ if(o.__group===\'poi\'){ try{o.setMap(null);}catch(e){} return false; } return true; }); var cats=[]; document.querySelectorAll(\'#majorMenu input:checked, #trafficMenu input:checked\').forEach(function(chk){ var c=chk.dataset.poi||chk.dataset.major||chk.dataset.traffic; if(c&&cats.indexOf(c)===-1) cats.push(c); }); if(!cats.length) return; var bnds=map.getBounds(); var sw=bnds.getSouthWest(), ne=bnds.getNorthEast(); var lat=(sw.getLat()+ne.getLat())/2, lng=(sw.getLng()+ne.getLng())/2; var latKm=Math.abs(ne.getLat()-sw.getLat())*111; var lngKm=Math.abs(ne.getLng()-sw.getLng())*88; var rds=Math.round(Math.max(latKm,lngKm)*1000*0.6); if(rds>20000) rds=20000; var tasks=[]; cats.forEach(function(code){ var chk=document.querySelector(\'input[data-poi="\'+code+\'"], input[data-major="\'+code+\'"], input[data-traffic="\'+code+\'"]\'); var kCd=chk?(chk.dataset.code||\'\'):\'\'; var qs=POI_QUERIES[code]||(chk?[chk.parentElement.textContent.trim()]:[]); qs.forEach(function(q){ tasks.push(restKeywordNear(q, lng, lat, rds, 15, kCd).then(function(arr){ return {code:code, list:(arr||[]).filter(function(it){ return bnds.contain(new kakao.maps.LatLng(it.y, it.x)); })}; })); }); }); var all=await Promise.all(tasks); var grouped={}; all.forEach(function(b){ if(!grouped[b.code]) grouped[b.code]=[]; b.list.forEach(function(d){ if(isGoodPOIResult(b.code,d)) grouped[b.code].push(d); }); }); Object.keys(grouped).forEach(function(code){ var seen={}; grouped[code]=grouped[code].filter(function(d){ var key=(String(d.place_name||\'\')+\'|\'+String(d.road_address_name||d.address_name||\'\')).trim(); if(seen[key]) return false; seen[key]=true; return true; }); grouped[code].sort(function(a,b){ return scorePOIResult(a)-scorePOIResult(b); }); grouped[code]=grouped[code].slice(0, 15); }); Object.keys(grouped).forEach(function(code){ grouped[code].forEach(function(d){ var emoji=poiEmojiFor(code); var label=d.place_name||code; var url=d.place_url||(\'https://map.kakao.com/link/to/\'+encodeURIComponent(label)+\',\'+d.y+\',\'+d.x); var ov=buildPoiOverlay(parseFloat(d.y),parseFloat(d.x),emoji,label,url,d.address_name||\'\',d.road_address_name||\'\'); ov.__group=\'poi\'; ov.__poiCode=code; poiOverlays.push(ov); ov.setMap(map); }); }); }catch(e){ console.warn(\'POI error\',e); } }\n  async function findCenterRecord(sido,sigungu,dongName){\n    try{\n      const r=await fetch(\'/data/centers\'); if(r.ok){\n        const db=await r.json(); const sub=db.filter(function(x){ return x.sido===sido && x.sigungu===sigungu; });\n        let hit=sub.find(function(x){ return x.name.includes(dongName); });\n        if(!hit){ const d=dongName.replace(/제\\\\?(\\\\d+)동/,\'$1동\'); hit=sub.find(function(x){ return x.name.includes(d); }); }\n        if(hit){\n          const phone = hit.tel || hit.phone || hit.contact || \'\';\n          const homepage = hit.homepage || hit.url || \'\';\n          const kakao_url = hit.kakao_url || \'\';\n          return {sido:sido,sigungu:sigungu,name:hit.name,addr:hit.addr,phone:phone,homepage:homepage,kakao_url:kakao_url};\n        }\n      }\n    }catch{}\n    try{\n      const q=[sigungu||sido,dongName,\'행정복지센터\'].filter(Boolean).join(\' \');\n      const rr=await restKeyword(q,1);\n      if(rr[0]){\n        const j=rr[0];\n        return {sido:sido,sigungu:sigungu,name:j.place_name||(dongName+\' 행정복지센터\'),addr:j.road_address_name||j.address_name||\'\',phone:j.phone||\'\',homepage:\'\',kakao_url:j.place_url||\'\'};\n      }\n    }catch{}\n    return null;\n  }\n\n  async function showInfoByDong(area,start){\n    setHighlight(area.dong);\n    if(start&&start.lat&&start.lng){\n      if(startOverlay) startOverlay.setMap(null);\n      startOverlay=makePulseMarker(start.lat,start.lng,(lastSearchLabel||\'검색위치\')); startOverlay.setMap(map);\n    }\n\n    const centerRec=await findCenterRecord(area.sido,area.sigungu,area.dong);\n    if(!centerRec){ toast(\'관할 행정복지센터 정보를 찾지 못했습니다\'); return; }\n\n    let g = await restGeocode(centerRec.addr || centerRec.name);\n    if(!g){\n      const alt = await restKeyword(centerRec.name+\' \'+(area.sigungu||\'\')+\' 행정복지센터\',1);\n      if(alt[0]) g={lat:parseFloat(alt[0].y),lng:parseFloat(alt[0].x), road:alt[0].road_address_name||\'\', jibun:alt[0].address_name||\'\'};\n    }\n    const enriched = Object.assign({}, centerRec, { road: (g && g.road ? g.road : \'\'), jibun: (g && g.jibun ? g.jibun : \'\') });\n\n    renderInfoPanel(area, enriched);\n\n    if(centerOverlay) centerOverlay.setMap(null);\n    if(g && g.lat && g.lng){\n      const label = shortCenterLabel(centerRec.name);\n      centerOverlay=makeBadgeOverlay(g.lat,g.lng,label,\'center\');\n      centerOverlay.setMap(map);\n      lastCenter={lat:g.lat,lng:g.lng,name:centerRec.name,addr:centerRec.addr};\n\n      var btnCar=document.getElementById(\'btnShowCar\');\n      var btnWalk=document.getElementById(\'btnShowWalk\');\n      var trBtn=document.getElementById(\'openKakaoTransit\');\n      var sLabel = (lastSearchLabel||\'출발지\');\n      var dLabel = (label||\'도착지\');\n      if(btnCar) btnCar.onclick=function(){ if(routeLineCar) routeLineCar.setMap(map); if(routeLineWalk) routeLineWalk.setMap(null); };\n      if(btnWalk) btnWalk.onclick=function(){ if(routeLineCar) routeLineCar.setMap(null); if(routeLineWalk) routeLineWalk.setMap(map); };\n      if(trBtn) trBtn.onclick=async function(){ \n        var startPt=lastSearch;\n        if(!startPt){ try{ startPt=await getMyLocation(2000); sLabel=\'현재위치\'; }catch{} }\n        if(!startPt){ toast(\'출발지를 확인할 수 없습니다\'); return; }\n        var url=kakaoRouteURL(\'transit\',{lat:startPt.lat,lng:startPt.lng},{lat:g.lat,lng:g.lng},sLabel,dLabel);\n        window.open(url,\'_blank\');\n      };\n\n      // 공공기관/랜드마크 POI\n      showPOIsAround(g.lat,g.lng);\n      refreshAllPOIs();  }\n\n    if(start && g && g.lat && g.lng){ await drawRoute(start,{lat:g.lat,lng:g.lng}); }\n  }\n\n  async function findDongAndShow(start){\n    let dong=null,sido=null,sigungu=null;\n    const r=await restCoord2Region(start.lat,start.lng);\n    if(r){ if(r.region_type===\'H\'&&r.region_3depth_name) dong=r.region_3depth_name; sido=r.region_1depth_name||null; sigungu=r.region_2depth_name||null; }\n    if(!sido){ toast(\'행정구역 판정 실패\'); return; }\n    await ensurePolygonsFor(sido,sigungu||\'\');\n    if(!dong){\n      for(const name in polygonMeta){\n        if(name===\'__sido\'||name===\'__sigungu\') continue;\n        const meta=polygonMeta[name];\n        if(meta && pointInPolygon(start.lat,start.lng,meta.paths)){ dong=name; break; }\n      }\n    }\n    if(!dong){ toast(\'행정동 판정 실패\'); return; }\n    await showInfoByDong({sido:sido,sigungu:sigungu,dong:dong},start);\n  }\n\n  // 후보 목록 패널\n  const panel=document.getElementById(\'srchPanel\');\n  function showCandidates(items, userLoc){\n    if(!items || !items.length){ panel.style.display=\'none\'; return; }\n    const normalized = items.map(function(x){\n      const lat=parseFloat(x.y), lng=parseFloat(x.x);\n      const name = x.place_name || (x.road_address_name||x.address_name||\'(주소 후보)\');\n      const road = x.road_address_name || \'\';\n      const addr = x.address_name || \'\';\n      let dkm=null; if(userLoc) dkm = kmDist({lat:lat,lng:lng}, userLoc);\n      return {lat:lat,lng:lng, name:name, road:road, addr:addr, dkm:dkm};\n    }).sort(function(a,b){\n      if(a.dkm==null && b.dkm==null) return 0;\n      if(a.dkm==null) return 1;\n      if(b.dkm==null) return -1;\n      return a.dkm - b.dkm;\n    });\n\n    panel.innerHTML=\'\';\n    normalized.forEach(function(obj){\n      const row=document.createElement(\'div\'); row.className=\'sitem\';\n      const left=document.createElement(\'div\');\n      const nm=document.createElement(\'div\'); nm.className=\'sname\'; nm.textContent=obj.name;\n      const ad=document.createElement(\'div\'); ad.className=\'saddr\'; ad.textContent=(obj.road||obj.addr||\'\');\n      left.append(nm,ad);\n      const dist=document.createElement(\'div\'); dist.className=\'sdist\'; dist.textContent=(obj.dkm!=null? (obj.dkm.toFixed(2)+\' km\') : \'\');\n      row.append(left,dist);\n      row.addEventListener(\'click\', async function(){\n        panel.style.display=\'none\';\n        lastSearch = {lat:obj.lat, lng:obj.lng};\n        lastSearchLabel = (obj.road || obj.addr || obj.name || \'검색위치\');\n        revealMap();\n        document.getElementById(\'echoRoad\').textContent = obj.road || \'-\';\n        document.getElementById(\'echoJibun\').textContent = obj.addr || \'-\';\n        document.getElementById(\'searchEcho\').style.display=\'flex\';\n        await findDongAndShow({lat:obj.lat,lng:obj.lng});\n      });\n      panel.append(row);\n    });\n    panel.style.display=\'block\';\n  }\n\n  async function startSearch(keyword){\n    if(!keyword){ toast(\'주소(예: 대구광역시 중구 공평로 88) 또는 건물명(예: 대구시청)을 입력하세요\'); return; }\n    clearRoutes(true);\n    clearPOIs();\n\n    const q = normalizeRoad(keyword);\n\n    const addrCandidates = await restGeocodeList(q);\n    if(addrCandidates && addrCandidates.length>1){\n      let me=null; try{ me=await getMyLocation(1200); }catch{}\n      showCandidates(addrCandidates, me);\n      return;\n    }\n    if(addrCandidates && addrCandidates.length===1){\n      const c=addrCandidates[0];\n      lastSearch = {lat:c.y, lng:c.x};\n      lastSearchLabel = (c.road_address_name || c.address_name || \'검색위치\');\n      revealMap();\n      document.getElementById(\'echoRoad\').textContent = c.road_address_name || \'-\';\n      document.getElementById(\'echoJibun\').textContent = c.address_name || \'-\';\n      document.getElementById(\'searchEcho\').style.display=\'flex\';\n      await findDongAndShow({lat:c.y,lng:c.x});\n      return;\n    }\n\n    const items = await restKeyword(q, 12);\n    let me=null; try{ me=await getMyLocation(1200); }catch{}\n    if(items && items.length){ showCandidates(items, me); return; }\n\n    toast(\'검색 결과가 없습니다\');\n  }\n\n  function wireUI(){\n    const input=document.getElementById(\'addr\');\n    document.getElementById(\'search\')?.addEventListener(\'click\',function(){ return startSearch((input && input.value && input.value.trim()) || \'\'); }); \n    input?.addEventListener(\'keydown\',function(e){ if(e.key===\'Enter\') startSearch(input.value.trim()); });\n\n    // 첫 접속 안내 닫기\n    document.getElementById(\'welcomeClose\')?.addEventListener(\'click\',function(){ document.getElementById(\'btnMyLoc\').click(); });\n\n\n    bindDropMenus();\n    // 정보 패널 토글\n    const info=document.getElementById(\'info\');\n    const infoToggle=document.getElementById(\'infoToggle\');\n    infoToggle.addEventListener(\'click\',function(){ const isCollapsed=info.classList.toggle(\'collapsed\'); infoToggle.textContent = isCollapsed ? \'펼치기\' : \'접기\'; });\n\n    // 라벨 토글\n    document.getElementById(\'toggleLabels\')?.addEventListener(\'change\',function(e){\n      const v=!!e.target.checked; Object.values(labelOverlays).forEach(function(o){ o.setMap(v?map:null); });\n    });\n\n    // POI 토글\n    document.getElementById(\'majorMenu\')?.addEventListener(\'change\',showPOIsAround);\n    document.getElementById(\'trafficMenu\')?.addEventListener(\'change\',showPOIsAround);\n\n    // 현재위치\n    document.getElementById(\'btnMyLoc\')?.addEventListener(\'click\', async function(){\n try{\n clearRoutes(true); clearPOIs();\n const me=await getMyLocation();\n revealMap();\n lastSearch={lat:me.lat,lng:me.lng};\n lastSearchLabel=\'현재위치\';\n document.getElementById(\'echoRoad\').textContent=\'현재위치\';\n document.getElementById(\'echoJibun\').textContent=\'현재위치\';\n document.getElementById(\'searchEcho\').style.display=\'flex\';\n if(myLocOverlay) myLocOverlay.setMap(null);\n myLocOverlay=makePulseMarker(me.lat, me.lng, \'현재위치\');\n myLocOverlay.setMap(map);\n map.setCenter(new kakao.maps.LatLng(me.lat, me.lng));\n map.setLevel(4);\n await findDongAndShow({lat:me.lat,lng:me.lng});\n}catch(err){\n toast(\'현재 위치 실패: \'+(err.message||\'권한/브라우저 설정 확인\'));\n}\n});\n\n   // 현재위치에서 길안내 메뉴\n    const gpsMenu=document.getElementById(\'gpsMenu\');\n    document.getElementById(\'gpsMenuBtn\')?.addEventListener(\'click\',function(){ gpsMenu.style.display = (gpsMenu.style.display===\'block\'?\'none\':\'block\'); });\n    document.addEventListener(\'click\',function(e){ const wrap=document.getElementById(\'gpsMenuWrap\'); if(!wrap.contains(e.target)) gpsMenu.style.display=\'none\'; });\n\n    document.getElementById(\'actToInputCenter\')?.addEventListener(\'click\', async function(){\n      gpsMenu.style.display=\'none\';\n      if(!lastCenter){ toast(\'먼저 주소/장소를 검색해 관할센터를 확인하세요.\'); return; }\n      try{\n        const me=await getMyLocation();\n        revealMap();\n        clearRoutes(false);\n        await drawRoute(me,{lat:lastCenter.lat,lng:lastCenter.lng});\n      }catch(err){ toast(\'현재 위치 실패: \'+(err.message||\'권한/브라우저 설정 확인\')); }\n    });\n\n    document.getElementById(\'actToInputAddress\')?.addEventListener(\'click\', async function(){\n      gpsMenu.style.display=\'none\';\n      try{\n        if(!lastSearch){ toast(\'먼저 주소를 검색하세요.\'); return; }\n        const me=await getMyLocation();\n        revealMap();\n        clearRoutes(false);\n        await drawRoute(me,{lat:lastSearch.lat,lng:lastSearch.lng});\n      }catch(err){ toast(\'현재 위치 실패: \'+(err.message||\'권한/브라우저 설정 확인\')); }\n    });\n\n    document.getElementById(\'actToNearestCenter\')?.addEventListener(\'click\', async function(){\n      gpsMenu.style.display=\'none\';\n      try{\n        const me=await getMyLocation();\n        revealMap();\n        clearRoutes(false);\n        const r=await fetch(\'/api/nearest-center?lat=\'+me.lat+\'&lng=\'+me.lng);\n        if(!r.ok){ toast(\'가까운 센터 탐색 실패\'); return; }\n        const best=await r.json();\n        if(centerOverlay) centerOverlay.setMap(null);\n        centerOverlay=makeBadgeOverlay(best.lat,best.lng,(String(best.name||\'센터\').replace(/\\\\s*행정복지센터/g,\'\')),\'center\');\n        centerOverlay.setMap(map);\n        lastCenter={lat:best.lat,lng:best.lng,name:best.name,addr:best.addr};\n        await drawRoute(me,{lat:best.lat,lng:best.lng});\n        showPOIsAround(best.lat,best.lng);\n      }catch(err){ toast(\'현재 위치 실패: \'+(err.message||\'권한/브라우저 설정 확인\')); }\n    });\n\n    // 음성검색\n    const voiceBtn=document.getElementById(\'voiceBtn\');\n    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;\n    if(!SR){ voiceBtn.disabled=true; voiceBtn.title=\'이 브라우저는 음성인식을 지원하지 않습니다\'; }\n    else{\n      const recog=new SR();\n      recog.lang=\'ko-KR\'; recog.interimResults=false; recog.continuous=false;\n      let recording=false; const setRec=function(v){recording=v; voiceBtn.classList.toggle(\'recording\',v);};\n      voiceBtn.addEventListener(\'click\',function(){ if(recording){ try{recog.stop();}catch{}; setRec(false); return; } try{recog.start(); setRec(true); toast(\'🎤 말씀하세요…\',1.3);}catch(e){ setRec(false); toast(\'음성인식 시작 실패: \'+(e.message||\'\')); }});\n      recog.onresult=function(ev){ setRec(false); const text=Array.from(ev.results).map(function(r){return r[0].transcript;}).join(\' \'); if(text){ input.value=text; startSearch(text); } };\n      recog.onerror=function(ev){ setRec(false); toast(\'음성인식 오류: \'+(ev.error||\'알 수 없음\')); };\n      recog.onend=function(){ setRec(false); };\n    }\n\n    // 검색→관할센터 길안내\n    document.getElementById(\'btnAddrToCenter\')?.addEventListener(\'click\', async function(){\n      if(!lastSearch||!lastCenter){ toast(\'먼저 주소 검색 후 관할센터를 확인하세요.\'); return; }\n      revealMap();\n      clearRoutes(false);\n      await drawRoute({lat:lastSearch.lat,lng:lastSearch.lng},{lat:lastCenter.lat,lng:lastCenter.lng});\n    });\n\n    // ★ 초기화 → 지도 숨기고 웰컴 카드 복귀\n    document.getElementById(\'resetView\')?.addEventListener(\'click\',function(){\n      clearRoutes(true);\n      clearPOIs();\n      if(startOverlay){ startOverlay.setMap(null); startOverlay=null; }\n      if(centerOverlay){ centerOverlay.setMap(null); centerOverlay=null; }\n      if(myLocOverlay){ myLocOverlay.setMap(null); myLocOverlay=null; }\n      if(hoverOverlay){ hoverOverlay.setMap(null); hoverOverlay=null; }\n      cleanPolygons();\n      const info=document.getElementById(\'info\'); info.style.display=\'none\'; info.classList.remove(\'collapsed\'); document.getElementById(\'infoBody\').innerHTML=\'\'; document.getElementById(\'infoTitle\').textContent=\'정보\'; document.getElementById(\'infoToggle\').textContent=\'접기\';\n      const echo=document.getElementById(\'searchEcho\'); if(echo){ echo.style.display=\'none\'; }\n      document.getElementById(\'wrap\').style.display=\'none\';\n      document.body.style.background=\'#f3f4f6\';\n      showWelcome();\n      mapShown=false;\n      lastSearch=null; lastCenter=null; lastSearchLabel=null; selectedDong=null;\n    });\n\n    // 안내 모달\n    const fbBtn=document.getElementById(\'feedbackBtn\'); const fbMask=document.getElementById(\'fbModalMask\'); const fbModal=document.getElementById(\'fbModal\'); const fbClose=document.getElementById(\'fbCloseBtn\'); const openFb=function(){ fbMask.style.display=\'block\'; fbModal.style.display=\'block\'; document.getElementById(\'fbAdminView\').style.display=\'none\'; }; const closeFb=function(){ fbMask.style.display=\'none\'; fbModal.style.display=\'none\'; }; if(fbBtn) fbBtn.addEventListener(\'click\',openFb); if(fbClose) fbClose.addEventListener(\'click\',closeFb); if(fbMask) fbMask.addEventListener(\'click\',closeFb); document.getElementById(\'fbSubmitBtn\')?.addEventListener(\'click\',async function(){ const a=document.getElementById(\'fbAuthor\').value.trim(); const c=document.getElementById(\'fbContent\').value.trim(); if(!c){ alert(\'내용을 입력해주세요.\'); return; } try{ await fetch(\'/api/feedback\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({author:a,content:c})}); alert(\'소중한 의견 감사합니다!\'); document.getElementById(\'fbContent\').value=\'\'; closeFb(); }catch(e){} }); document.getElementById(\'fbAdminLink\')?.addEventListener(\'click\',async function(){ const pw=prompt(\'관리자 비밀번호를 입력하세요.\'); if(!pw) return; try{ const r=await fetch(\'/api/feedback?token=\'+encodeURIComponent(pw)); if(!r.ok){ alert(\'비밀번호가 틀렸습니다.\'); return; } const list=await r.json(); const v=document.getElementById(\'fbAdminView\'); v.style.display=\'block\'; if(!list.length) v.innerHTML=\'건의사항이 없습니다.\'; else v.innerHTML=list.slice().reverse().map(function(i){ return \'<div style="margin-bottom:8px;padding:8px;background:#f1f5f9;border-radius:6px;border:1px solid #e2e8f0"><b>\'+i.author+\'</b> <span style="color:#64748b;font-size:10px">\'+new Date(i.date).toLocaleString()+\'</span><div style="margin-top:4px">\'+i.content+\'</div></div>\'; }).join(\'\'); }catch(e){} });\n\n    const aboutBtn=document.getElementById(\'aboutBtn\');\n    const about=document.getElementById(\'about\');\n    const mask=document.getElementById(\'aboutMask\');\n    const close=document.getElementById(\'aboutClose\');\n    const openAbout=function(){ mask.style.display=\'block\'; about.style.display=\'block\'; };\n    const closeAbout=function(){ mask.style.display=\'none\'; about.style.display=\'none\'; };\n    aboutBtn.addEventListener(\'click\',openAbout); close.addEventListener(\'click\',closeAbout); mask.addEventListener(\'click\',closeAbout);\n  kakao.maps.event.addListener(map,\'idle\',function(){\n  showPOIsAround();\n});\n\n }\n\n  function boot(){\n    map=new kakao.maps.Map(document.getElementById(\'map\'),{center:new kakao.maps.LatLng(36.5,127.8),level:13});\n    // 스카이뷰/일반지도 스위치를 오른쪽 하단으로\n    const typeCtrl=new kakao.maps.MapTypeControl(); map.addControl(typeCtrl,kakao.maps.ControlPosition.BOTTOMRIGHT);\n    const zoomCtrl=new kakao.maps.ZoomControl(); map.addControl(zoomCtrl,kakao.maps.ControlPosition.RIGHT);\n    wireUI();\n  }\n  window.addEventListener(\'DOMContentLoaded\',function(){\n    if(typeof kakao===\'undefined\' || !kakao.maps){ toast(\'카카오 SDK 로드 실패(도메인/차단 확인)\'); return; }\n    kakao.maps.load(function(){ boot(); });\n  });\n})();\n</script>\n</body></html>';



app.get('/', (req,res)=>res.set('content-type','text/html; charset=utf-8').send(HTML));

app.get('/version', (req,res)=>res.json({version:'v6.2.8', lastUpdated, centers: CENTER_DB.length, official: OFFICIAL_CENTER_COUNT}));



app.listen(PORT, ()=>{

  console.log('[OK] ONE-FILE v6.2.8 on http://localhost:'+PORT);

  console.log('[*] REST KEY:', (REST_KEY?'OK(loaded)':'MISSING'),

              '| centers:', CENTER_DB.length);

});