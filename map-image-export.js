async function exportMapImage() {
  const button = document.getElementById('exportImageBtn');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'กำลังสร้างภาพ…';
  try {
    if (typeof html2canvas !== 'function' || !map || !map.isStyleLoaded()) {
      throw new Error('แผนที่ยังไม่พร้อม กรุณารอให้โหลดเสร็จแล้วลองอีกครั้ง');
    }
    await document.fonts.ready;
    // Copy WebGL pixels synchronously in a render callback before the buffer clears.
    const snapshot = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { map.off('render', capture); reject(new Error('แผนที่ใช้เวลาโหลดนาน กรุณาลองอีกครั้ง')); }, 15000);
      function capture() {
        if (!map.areTilesLoaded()) return;
        map.off('render', capture);
        clearTimeout(timer);
        try { resolve(map.getCanvas().toDataURL('image/png')); } catch (error) { reject(error); }
      }
      map.on('render', capture);
      map.triggerRepaint();
    });
    const canvas = await html2canvas(document.getElementById('mapwrap'), {
      useCORS: true,
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio || 1, 2),
      logging: false,
      ignoreElements: element => element.id === 'dataPanel' || element.id === 'hint' || element.classList.contains('maplibregl-ctrl-group') || element.classList.contains('maplibregl-popup'),
      onclone: async doc => {
        const original = doc.querySelector('#map canvas.maplibregl-canvas');
        const image = doc.createElement('img');
        image.className = original.className;
        image.style.cssText = original.style.cssText;
        image.src = snapshot;
        await image.decode();
        original.replaceWith(image);
        // Keep provider credits visible even when the map uses compact attribution.
        doc.querySelectorAll('.maplibregl-ctrl-attrib-inner').forEach(el => { el.style.display = 'block'; });
        doc.querySelectorAll('.maplibregl-ctrl-attrib-button').forEach(el => { el.style.display = 'none'; });
      }
    });
    openMapLayout(canvas, map);
  } catch (error) {
    console.error('Map image export failed', error);
    alert(error.message || 'บันทึกภาพไม่สำเร็จ กรุณาลองอีกครั้ง');
  } finally {
    button.disabled = false;
    button.textContent = 'บันทึกเป็นรูป PNG';
  }
}

function openMapLayout(base, sourceMap) {
  document.getElementById('mapLayoutDialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'mapLayoutDialog';
  dialog.style.cssText = 'width:min(1200px,94vw);max-height:92vh;padding:22px;border:0;border-radius:16px;color:#16324a;background:#f4f7f9;overflow:auto';
  dialog.innerHTML = `
    <style>
      #mapLayoutDialog::backdrop{background:rgba(8,25,43,.7)}
      #mapLayoutDialog .layout-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px}
      #mapLayoutDialog label{display:block;margin:10px 0;font-size:13px}
      #mapLayoutDialog input:not([type=checkbox]),#mapLayoutDialog textarea,#mapLayoutDialog select{display:block;box-sizing:border-box;width:100%;margin-top:5px;padding:8px;border:1px solid #bac8d2;border-radius:6px;font:inherit}
      #mapLayoutDialog canvas{width:100%;height:auto;box-shadow:0 4px 16px #16324a22}
      #mapLayoutDialog .layout-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
      @media(max-width:700px){#mapLayoutDialog .layout-grid{grid-template-columns:1fr}}
    </style>
    <h2 style="margin:0 0 14px">จัดหน้าภาพแผนที่</h2>
    <div class="layout-grid"><div>
      <label>ชื่อแผนที่<input id="layoutTitle" maxlength="120"></label>
      <label>คำอธิบาย<input id="layoutSubtitle" maxlength="180"></label>
      <label>หน่วยงาน / ผู้จัดทำ<input id="layoutAuthor" maxlength="150"></label>
      <label>วันที่<input id="layoutDate" type="date"></label>
      <label>โลโก้หน่วยงาน<input id="layoutLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <label>ตำแหน่งโลโก้<select id="layoutLogoPosition"><option value="right">บนขวา</option><option value="left">บนซ้าย</option></select></label>
      <button type="button" id="layoutRemoveLogo">นำโลโก้ออก</button>
      <label><input type="checkbox" id="layoutNorth" checked> แสดงทิศเหนือ</label>
      <label><input type="checkbox" id="layoutScale" checked> แสดงแถบระยะทาง</label>
      <label>คำอธิบายสัญลักษณ์ (หนึ่งรายการต่อบรรทัด)<textarea id="layoutLegend" rows="4" maxlength="600" placeholder="วงสีแดง: รัศมีเฝ้าระวัง\nดาว: จุดเกิดเหตุ"></textarea></label>
      <p style="font-size:12px">ภาพใช้มุมมองปัจจุบัน แถบระยะทางอ้างอิงบริเวณกลางแผนที่ โลโก้ใช้จัดภาพบนเครื่องนี้</p>
      <p id="layoutError" role="status" style="color:#b42318"></p>
    </div><div><canvas id="layoutPreview" aria-label="ตัวอย่างภาพก่อนดาวน์โหลด"></canvas></div></div>
    <div class="layout-actions"><button type="button" id="layoutClose">ปิด</button><button type="button" id="layoutDownload">ดาวน์โหลด PNG</button></div>`;
  document.body.appendChild(dialog);
  const field = id => dialog.querySelector('#layout' + id);
  field('Title').value = document.getElementById('projectName').value || 'แผนที่';
  field('Author').value = document.getElementById('projectOwner').value || '';
  const today = new Date();
  field('Date').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const width = sourceMap.getCanvas().clientWidth;
  const height = sourceMap.getCanvas().clientHeight;
  const center = sourceMap.unproject([width/2, height/2]);
  const east = sourceMap.unproject([width/2 + Math.min(100,width/4), height/2]);
  const metersPerPixel = center.distanceTo(east) / Math.min(100,width/4);
  const northPoint = sourceMap.project([center.lng, Math.min(85,center.lat + .01)]);
  const angle = Math.atan2(northPoint.x-width/2, -(northPoint.y-height/2));
  const preview = field('Preview');
  let logo = null;
  let logoVersion = 0;
  function lines(ctx, text, maxWidth) {
    const result = []; let line = '';
    for (const char of text) {
      if (char === '\n' || (line && ctx.measureText(line + char).width > maxWidth)) { result.push(line); line = char === '\n' ? '' : char; }
      else line += char;
    }
    if (line) result.push(line);
    return result;
  }
  function render() {
    const w = Math.max(1000, Math.min(2000, base.width));
    const mapHeight = Math.round(base.height * w / base.width);
    const ctx = preview.getContext('2d');
    const logoSpace = logo ? 140 : 0;
    ctx.font = 'bold 32px Sarabun';
    const title = lines(ctx,field('Title').value,w-80-logoSpace);
    ctx.font = '20px Sarabun';
    const subtitle = lines(ctx,field('Subtitle').value,w-80-logoSpace);
    const legends = lines(ctx,field('Legend').value,w-80);
    const authors = lines(ctx,field('Author').value,w-360);
    const head = Math.max(logo ? 150 : 40,40+title.length*42+subtitle.length*28);
    const foot = 110 + legends.length*28 + authors.length*28;
    preview.width = w; preview.height = head + mapHeight + foot;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,preview.height);
    ctx.fillStyle = '#0e7c7b'; ctx.fillRect(0,0,w,8);
    const left = logo && field('LogoPosition').value === 'left' ? 180 : 40;
    ctx.fillStyle = '#16324a'; ctx.font = 'bold 32px Sarabun';
    title.forEach((line,i)=>ctx.fillText(line,left,48+i*42));
    ctx.font = '20px Sarabun'; ctx.fillStyle = '#526d7d';
    subtitle.forEach((line,i)=>ctx.fillText(line,left,48+title.length*42+i*28));
    if (logo) {
      const ratio = Math.min(110/logo.width,110/logo.height);
      const lw = logo.width*ratio, lh=logo.height*ratio;
      ctx.drawImage(logo,field('LogoPosition').value==='left'?40:w-40-lw,25,lw,lh);
    }
    ctx.drawImage(base,0,head,w,mapHeight);
    if (field('North').checked) {
      ctx.save(); ctx.translate(w-65,head+75);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0,0,47,0,Math.PI*2); ctx.fill();
      ctx.rotate(angle); ctx.fillStyle = '#16324a'; ctx.beginPath(); ctx.moveTo(0,-27);ctx.lineTo(-13,20);ctx.lineTo(0,10);ctx.lineTo(13,20);ctx.closePath();ctx.fill();
      ctx.font='bold 20px Sarabun';ctx.textAlign='center';ctx.fillText('N',0,-31);ctx.restore();
    }
    let y = head + mapHeight + 36;
    ctx.fillStyle='#16324a';ctx.font='20px Sarabun';
    legends.forEach(line=>{ctx.fillText(line,40,y);y+=28;});
    authors.forEach(line=>{ctx.fillText(line,40,y);y+=28;});
    if(field('Date').value){ctx.fillText('วันที่ '+new Date(field('Date').value+'T12:00:00').toLocaleDateString('th-TH'),40,y);}
    if(field('Scale').checked && Number.isFinite(metersPerPixel) && metersPerPixel>0){
      const target=metersPerPixel*width/w*200;
      const power=Math.pow(10,Math.floor(Math.log10(target)));
      const distance=[1,2,5,10].map(n=>n*power).filter(n=>n<=target).pop();
      const length=distance/metersPerPixel*w/width;
      const x=w-280, sy=preview.height-42;
      ctx.strokeStyle='#16324a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,sy-8);ctx.lineTo(x,sy);ctx.lineTo(x+length,sy);ctx.lineTo(x+length,sy-8);ctx.stroke();
      ctx.font='18px Sarabun';ctx.fillText('0',x,sy-15);ctx.textAlign='right';ctx.fillText(distance>=1000?`${distance/1000} กม.`:`${Math.round(distance)} ม.`,x+length,sy-15);ctx.textAlign='left';
    }
  }
  dialog.addEventListener('input',event=>{if(event.target!==field('Logo'))render();});
  field('Logo').addEventListener('change',async()=>{
    const version=++logoVersion;const file=field('Logo').files[0];if(!file)return;
    field('Error').textContent='';
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){field('Error').textContent='กรุณาเลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 5 MB';return;}
    const url=URL.createObjectURL(file);
    try{const img=new Image();img.src=url;await img.decode();if(version===logoVersion){logo=img;render();}}catch{field('Error').textContent='อ่านรูปไม่สำเร็จ กรุณาเลือกรูปใหม่';}finally{URL.revokeObjectURL(url);}
  });
  field('RemoveLogo').onclick=()=>{logoVersion++;logo=null;field('Logo').value='';render();};
  field('Close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{logoVersion++;dialog.remove();document.getElementById('exportImageBtn').focus();});
  field('Download').onclick=async()=>{
    const button=field('Download');button.disabled=true;
    try{
      const blob=await new Promise(resolve=>preview.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('สร้างภาพไม่สำเร็จ');
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;
      link.download=(field('Title').value||'แผนที่').replace(/[\\/:*?"<>|]/g,'-')+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch{field('Error').textContent='ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง';}finally{button.disabled=false;}
  };
  render();dialog.showModal();
}

