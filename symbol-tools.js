const SymbolTools = (() => {
  const shapes = {
    arrow: ['ลูกศรซ้าย', '<path d="M8 50 38 20v18h54v24H38v18z"/>'],
    right: ['ลูกศรขวา', '<path d="m92 50-30-30v18H8v24h54v18z"/>'],
    double: ['ลูกศรสองทิศ', '<path d="m5 50 25-25v15h40V25l25 25-25 25V60H30v15z"/>'],
    circle: ['วงกลม', '<circle cx="50" cy="50" r="40"/>'],
    square: ['สี่เหลี่ยม', '<rect x="12" y="12" width="76" height="76" rx="3"/>'],
    triangle: ['สามเหลี่ยม', '<path d="M50 8 94 88H6z"/>'],
    star: ['ดาว', '<path d="m50 5 13 29 32 4-24 23 6 33-27-16-27 16 6-33L5 38l32-4z"/>']
  };
  let selected = null;
  const number = (v,fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  function select(el) {
    document.querySelectorAll('.map-symbol.selected').forEach(item=>item.classList.remove('selected'));
    selected=el; selectedArrow=el;
    if(el){el.classList.add('selected');document.getElementById('symbolColor').value=el.dataset.color;}
    document.getElementById('symbolDelete').disabled=!el;
  }
  function paint(el){
    const kind=el.dataset.kind, color=el.dataset.color;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="${color}" stroke="#16324a" stroke-width="2">${shapes[kind][1]}</g></svg>`;
    el.querySelector('img').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    el.style.transform=`rotate(${el.dataset.angle}deg)`;
  }
  function create(state={}){
    const wrap=document.getElementById('mapwrap');
    const el=document.createElement('div');el.className='draggable map-symbol';el.tabIndex=0;
    el.dataset.kind=shapes[state.kind]?state.kind:'arrow';
    el.dataset.color=/^#[0-9a-f]{6}$/i.test(state.color||'')?state.color:'#87cefa';
    const oldAngle=/rotate\(([-\d.]+)deg\)/.exec(state.rotation||'');
    el.dataset.angle=number(state.angle,oldAngle?Number(oldAngle[1]):0);
    const size=Math.max(28,Math.min(500,number(state.size,86)));
    el.style.width=el.style.height=size+'px';
    const pos=(value,fallback)=>{const n=parseFloat(value);return Number.isFinite(n)?n:fallback;};
    el.style.left=Math.max(0,Math.min(Math.max(0,wrap.clientWidth-size),pos(state.left,wrap.clientWidth/2-size/2)))+'px';
    el.style.top=Math.max(0,Math.min(Math.max(0,wrap.clientHeight-size),pos(state.top,wrap.clientHeight/2-size/2)))+'px';
    el.setAttribute('aria-label',shapes[el.dataset.kind][0]+' ลากเพื่อย้าย ใช้จุดจับเพื่อหมุนหรือปรับขนาด');
    el.innerHTML='<img draggable="false" alt="'+shapes[el.dataset.kind][0]+'"><div class="symbol-selection" data-html2canvas-ignore="true"><button type="button" class="symbol-rotate" data-mode="rotate" aria-label="หมุนสัญลักษณ์">↻</button><output class="symbol-angle"></output>'+['nw','ne','sw','se'].map(c=>'<button type="button" class="symbol-corner '+c+'" data-mode="resize" aria-label="ปรับขนาดสัญลักษณ์ '+c+'"></button>').join('')+'</div>';
    paint(el);wrap.appendChild(el);arrows.push(el);
    el.addEventListener('click',e=>e.stopPropagation());
    el.addEventListener('focus',()=>select(el));
    el.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();select(el);el.focus({preventScroll:true});
      const mode=event.target.dataset.mode||'move';
      const rect=wrap.getBoundingClientRect();
      const left=el.offsetLeft,top=el.offsetTop,size=el.offsetWidth;
      const cx=rect.left+left+size/2,cy=rect.top+top+size/2;
      const startAngle=Math.atan2(event.clientY-cy,event.clientX-cx);
      const startDistance=Math.max(1,Math.hypot(event.clientX-cx,event.clientY-cy));
      const angle=Number(el.dataset.angle),sx=event.clientX,sy=event.clientY;
      el.setPointerCapture(event.pointerId);
      const move=e=>{
        if(mode==='rotate'){
          let degrees=angle+(Math.atan2(e.clientY-cy,e.clientX-cx)-startAngle)*180/Math.PI;
          if(e.shiftKey)degrees=Math.round(degrees/15)*15;
          degrees=Math.round((degrees%360+360)%360);el.dataset.angle=degrees;paint(el);
          el.querySelector('output').textContent=degrees+'°';
        }else if(mode==='resize'){
          const next=Math.max(28,Math.min(500,size*Math.hypot(e.clientX-cx,e.clientY-cy)/startDistance));
          el.style.width=el.style.height=next+'px';el.style.left=left+(size-next)/2+'px';el.style.top=top+(size-next)/2+'px';
        }else{
          el.style.left=Math.max(0,Math.min(Math.max(0,wrap.clientWidth-size),left+e.clientX-sx))+'px';
          el.style.top=Math.max(0,Math.min(Math.max(0,wrap.clientHeight-size),top+e.clientY-sy))+'px';
        }
      };
      const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);el.removeEventListener('lostpointercapture',end);};
      el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
    });
    return el;
  }
  function remove(){if(selected?.isConnected){selected.remove();arrows=arrows.filter(el=>el!==selected);}select(null);}
  function init(){
    const style=document.createElement('style');style.textContent=`
      .map-symbol{width:86px;height:86px;outline:none;touch-action:none}
      .map-symbol>img{width:100%;height:100%;display:block;pointer-events:none}
      .symbol-selection{display:none;position:absolute;inset:0;border:1px dashed #087bdf;pointer-events:none}
      .map-symbol.selected .symbol-selection{display:block}
      .symbol-selection button{position:absolute;padding:0;width:20px;height:20px;background:white;border:2px solid #087bdf;border-radius:4px;pointer-events:auto;touch-action:none;color:#087bdf}
      .symbol-selection button:active{transform:none}
      .symbol-selection .symbol-rotate{left:calc(50% - 13px);top:-40px;width:26px;height:26px;border-radius:50%;cursor:grab}
      .symbol-rotate:after{content:'';position:absolute;width:1px;height:14px;background:#087bdf;top:24px;left:11px}
      .symbol-corner.nw{left:-10px;top:-10px}.symbol-corner.ne{right:-10px;top:-10px}
      .symbol-corner.sw{left:-10px;bottom:-10px}.symbol-corner.se{right:-10px;bottom:-10px}
      .symbol-corner{cursor:nwse-resize}.symbol-angle{position:absolute;left:100%;top:-30px;background:white;color:#16324a;font:12px sans-serif}
    `;document.head.appendChild(style);
    document.getElementById('symbolKind').innerHTML=Object.entries(shapes).map(([id,item])=>'<option value="'+id+'">'+item[0]+'</option>').join('');
    document.getElementById('symbolColor').addEventListener('input',event=>{if(selected?.isConnected){selected.dataset.color=event.target.value;paint(selected);}});
    document.getElementById('symbolDelete').onclick=remove;
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('.map-symbol')&&!e.target.closest('#symbolControls'))select(null);});
    document.addEventListener('keydown',e=>{
      if(!selected?.isConnected||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(e.key==='Escape'){select(null);e.stopImmediatePropagation();}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
    },true);
  }
  document.addEventListener('DOMContentLoaded',init);
  return {
    add(){const el=create({kind:document.getElementById('symbolKind').value,color:document.getElementById('symbolColor').value});select(el);},
    restore:create,
    serialize(el){return {left:el.style.left,top:el.style.top,rotation:el.style.transform,kind:el.dataset.kind||'arrow',color:el.dataset.color||'#87cefa',angle:number(el.dataset.angle,0),size:el.offsetWidth};}
  };
})();

