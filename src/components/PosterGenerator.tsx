import html2canvas from 'html2canvas';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

export default function PosterGenerator() {
  const setPosterOpen = useStore((state) => state.setPosterOpen);
  const [image, setImage] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById('capture-area');
    if (!target) return;
    void html2canvas(target, { backgroundColor: null, scale: 2, useCORS: true }).then((canvas) => {
      setImage(canvas.toDataURL('image/png'));
    });
  }, []);

  const download = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = '城市足迹地图.png';
    link.click();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-wide">
        <div className="modal-head">
          <h2>生成海报</h2>
          <button className="icon-btn" onClick={() => setPosterOpen(false)}>×</button>
        </div>
        <div className="poster-preview" ref={previewRef}>
          {image ? <img src={image} alt="城市足迹海报预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="p-24">正在生成预览...</div>}
        </div>
        <div className="actions flex-center mt-16">
          <button className="btn-primary" onClick={download} disabled={!image}>下载PNG</button>
          <button className="btn-outline" onClick={() => setPosterOpen(false)}>关闭</button>
        </div>
      </section>
    </div>
  );
}
