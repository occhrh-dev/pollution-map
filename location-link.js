function parseLocationLink(text) {
  const pair = value => {
    const match = String(value || '').trim().match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*\([^)]*\))?$/);
    if (!match) return null;
    const lat=Number(match[1]),lng=Number(match[2]);
    return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
  };
  const raw=String(text||'').trim();
  if(raw.length>12000)throw new Error('ลิงก์ยาวเกินไป กรุณาวางเฉพาะลิงก์ตำแหน่ง');
  const direct=pair(raw);if(direct)return {...direct,note:'พิกัดจากข้อความ'};
  const links=raw.match(/https?:\/\/[^\s<>"]+/gi)||[];
  if(links.length!==1)throw new Error('กรุณาวางลิงก์ตำแหน่งครั้งละหนึ่งลิงก์ หรือพิกัด latitude, longitude');
  let url;
  try{url=new URL(links[0]);}catch{throw new Error('รูปแบบลิงก์ไม่ถูกต้อง');}
  const host=url.hostname.toLowerCase();
  if(url.username||url.password||url.port)throw new Error('ไม่รองรับลิงก์นี้');
  if(['maps.app.goo.gl','goo.gl'].includes(host)){
    if(host==='goo.gl'&&!url.pathname.startsWith('/maps/'))throw new Error('กรุณาใช้ลิงก์ Google Maps');
    return {shortUrl:url.href};
  }
  // Restrict parsing to known map hosts; a link sent in LINE can contain a Google Maps URL.
  const google=/^(?:www\.|maps\.)?google\.(?:com|co\.th|co\.jp|co\.uk|com\.au|co\.in|de|fr|ca)$/.test(host);
  const line=host==='line.me'||host==='maps.line.me';
  if(!google&&!line)throw new Error('รองรับลิงก์ Google Maps และลิงก์ตำแหน่ง LINE ที่มีพิกัด');
  if(google&&!url.pathname.startsWith('/maps')&&!host.startsWith('maps.'))throw new Error('ลิงก์นี้ไม่ใช่หน้า Google Maps');
  if(/\/dir(?:\/|$)/.test(url.pathname)||url.searchParams.has('destination')||url.searchParams.has('daddr'))throw new Error('ลิงก์นี้เป็นเส้นทางหลายจุด กรุณาแชร์ตำแหน่งสถานที่หรือหมุดที่ต้องการแทน');
  if(url.searchParams.has('query_place_id'))throw new Error('ลิงก์นี้อ้างอิงสถานที่ด้วยรหัส กรุณาเปิดลิงก์แล้วคัดลอกลิงก์เต็มที่มีพิกัดของสถานที่');
  let decoded;
  try{decoded=decodeURIComponent(url.pathname+url.search);}catch{throw new Error('ลิงก์มีอักขระเข้ารหัสไม่ถูกต้อง');}
  const places=[...decoded.matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/g)].map(m=>pair(m[1]+','+m[2])).filter(Boolean);
  const distinct=[...new Map(places.map(p=>[p.lat+','+p.lng,p])).values()];
  if(distinct.length>1)throw new Error('พบหลายตำแหน่งในลิงก์ กรุณาแชร์หมุดเดียวที่ต้องการ');
  if(distinct.length===1)return {...distinct[0],note:'พิกัดสถานที่ในลิงก์'};
  for(const key of ['query','q']){const p=pair(url.searchParams.get(key));if(p)return {...p,note:'พิกัดหมุดที่แชร์'};}
  if(line){const p=pair((url.searchParams.get('lat')||url.searchParams.get('latitude'))+','+(url.searchParams.get('lng')||url.searchParams.get('longitude')));if(p)return {...p,note:'พิกัดที่ระบุในลิงก์ LINE'};}
  const at=decoded.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
  const center=at?pair(at[1]+','+at[2]):pair(url.searchParams.get('ll')||url.searchParams.get('center'));
  if(center)return {...center,note:'เป็นจุดกึ่งกลางมุมมองแผนที่ อาจไม่ตรงกับหมุดสถานที่ กรุณาตรวจสอบก่อนยืนยัน'};
  throw new Error('ลิงก์นี้ไม่มีพิกัดที่อ่านได้ กรุณาเปิดสถานที่แล้วคัดลอกพิกัด หรือคัดลอกลิงก์เต็มจากแถบที่อยู่');
}

function openLocationLink() {
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(520px,92vw);max-height:90vh;overflow:auto;border:0;border-radius:16px;padding:24px;color:#16324a';
  dialog.innerHTML=`<h2 style="margin-top:0">ลงจุดจากลิงก์ตำแหน่ง</h2>
    <label>ลิงก์ที่แชร์หรือพิกัด<textarea id="locationLinkInput" rows="4" style="display:block;width:100%;margin:10px 0" placeholder="วางลิงก์ Google Maps ที่ได้รับจาก LINE หรือพิกัด 12.738, 101.185"></textarea></label>
    <button type="button" id="locationLinkFind">ค้นหาตำแหน่ง</button>
    <p id="locationLinkStatus" role="status"></p>
    <a id="locationLinkOpen" target="_blank" rel="noopener noreferrer" hidden>เปิดลิงก์ต้นฉบับ</a>
    <div id="locationLinkPreview" style="width:100%;height:220px;margin:12px 0" hidden></div>
    <p>ตรวจตำแหน่งให้ตรงกับสถานที่ที่ต้องการก่อนยืนยัน ระบบจะลงจุดและวงรัศมีตามค่าที่ตั้งไว้</p>
    <button type="button" id="locationLinkConfirm" disabled>ยืนยันลงจุด</button>
    <button type="button" id="locationLinkClose">ยกเลิก</button>`;
  document.body.appendChild(dialog);
  const find=id=>dialog.querySelector('#locationLink'+id);
  let pending=null,preview=null;
  const reset=()=>{pending=null;find('Confirm').disabled=true;find('Open').hidden=true;if(preview){preview.remove();preview=null;}find('Preview').hidden=true;};
  find('Input').addEventListener('input',()=>{reset();find('Status').textContent='';});
  find('Find').onclick=()=>{
    reset();
    try{
      const point=parseLocationLink(find('Input').value);
      if(point.shortUrl){
        find('Status').textContent='ลิงก์นี้เป็นลิงก์ย่อ กรุณากดเปิดลิงก์ แล้วคัดลอกลิงก์เต็มจากแถบที่อยู่กลับมาวาง หรือคัดลอกพิกัดของหมุด ระบบยังคลี่ลิงก์ย่ออัตโนมัติไม่ได้';
        find('Open').href=point.shortUrl;find('Open').hidden=false;return;
      }
      if(typeof maplibregl==='undefined')throw new Error('แผนที่ยังไม่พร้อม กรุณารอสักครู่แล้วลองอีกครั้ง');
      find('Preview').hidden=false;
      preview=new maplibregl.Map({container:find('Preview'),style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:[point.lng,point.lat],zoom:14,interactive:false});
      new maplibregl.Marker({color:'#e8503b'}).setLngLat([point.lng,point.lat]).addTo(preview);
      pending=point;find('Status').textContent=`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} — ${point.note}`;
      find('Confirm').disabled=false;
    }catch(error){find('Status').textContent=error.message;}
  };
  find('Confirm').onclick=()=>{
    if(!pending)return;
    if(!map||!map.isStyleLoaded()){find('Status').textContent='แผนที่หลักยังไม่พร้อม กรุณารอโหลดเสร็จแล้วลองอีกครั้ง';return;}
    document.getElementById('latInput').value=pending.lat;
    document.getElementById('lngInput').value=pending.lng;
    addPointFromInput();dialog.close();
  };
  find('Close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{reset();dialog.remove();document.getElementById('locationLinkBtn').focus();});
  dialog.showModal();
}
if(typeof module!=='undefined')module.exports={parseLocationLink};

