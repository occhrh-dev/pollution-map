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
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('สร้างภาพไม่สำเร็จ กรุณาลองอีกครั้ง');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const name = document.getElementById('projectName').value || 'pollution-map';
    link.download = name.replace(/[\\/:*?"<>|]/g, '-') + '.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error('Map image export failed', error);
    alert(error.message || 'บันทึกภาพไม่สำเร็จ กรุณาลองอีกครั้ง');
  } finally {
    button.disabled = false;
    button.textContent = 'บันทึกเป็นรูป PNG';
  }
}

