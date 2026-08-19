import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, RotateCw, Maximize, Square, Layout, ZoomIn, ZoomOut, RefreshCw, Layers } from 'lucide-react';

const ImageCropper = ({ image, onCrop, onCancel }) => {
  const [crop, setCrop] = useState({ x: 2, y: 2, width: 96, height: 96 }); // percentages, relative to container
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('free'); // 'free', 1, 4/3, 16/9

  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const touchStartDist = useRef(0);

  // ---- Layout helpers ---------------------------------------------------
  // Returns the size/position of the image's rendered ("object-contain")
  // box within the container, BEFORE the rotate()/scale() transform is
  // applied. Because the img is centered by flex, this box's center always
  // coincides with the container's center — which is also the transform
  // origin for rotate/scale — so we only need this once per layout.
  const getBaseImageBox = () => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return null;

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) return null;

    const imageRatio = naturalWidth / naturalHeight;
    const containerRatio = containerWidth / containerHeight;

    let renderedWidth, renderedHeight;
    if (imageRatio > containerRatio) {
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imageRatio;
    } else {
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imageRatio;
    }

    return {
      containerWidth,
      containerHeight,
      naturalWidth,
      naturalHeight,
      renderedWidth,
      renderedHeight,
      cx: containerWidth / 2,
      cy: containerHeight / 2,
    };
  };

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    // Auto-cover: default crop box hugs the whole visible image, with a
    // small margin so the selection border is visible around it.
    const initializeCropBox = () => {
      setCrop({ x: 2, y: 2, width: 96, height: 96 });
      setRotation(0);
      setZoom(1);
      setAspectRatio('free');
    };

    if (img.complete) {
      setTimeout(initializeCropBox, 100);
    } else {
      img.addEventListener('load', initializeCropBox);
      return () => img.removeEventListener('load', initializeCropBox);
    }
  }, [image]);

  const handleStart = (e, action) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation(); // Stop bubbling to prevent 'move' from overriding resize

    if (e.touches && e.touches.length === 2) {
      touchStartDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      return;
    }

    if (action === 'move') setIsDragging(true);
    else setIsResizing(action);
  };

  const handleMove = (e) => {
    if (e.touches && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - touchStartDist.current) / 100;
      setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
      touchStartDist.current = dist;
      return;
    }

    if (!isDragging && !isResizing) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    if (isDragging) {
      setCrop(prev => ({
        ...prev,
        x: Math.max(0, Math.min(100 - prev.width, x - prev.width / 2)),
        y: Math.max(0, Math.min(100 - prev.height, y - prev.height / 2))
      }));
    } else if (isResizing) {
      setCrop(prev => {
        let newCrop = { ...prev };
        if (isResizing.includes('e')) newCrop.width = Math.max(10, Math.min(100 - prev.x, x - prev.x));
        if (isResizing.includes('s')) newCrop.height = Math.max(10, Math.min(100 - prev.y, y - prev.y));
        if (isResizing.includes('w')) {
          const deltaX = prev.x - x;
          newCrop.x = Math.max(0, x);
          newCrop.width = Math.max(10, prev.width + deltaX);
        }
        if (isResizing.includes('n')) {
          const deltaY = prev.y - y;
          newCrop.y = Math.max(0, y);
          newCrop.height = Math.max(10, prev.height + deltaY);
        }

        if (aspectRatio !== 'free') {
          const container = containerRef.current;
          if (container) {
            const containerRatio = container.offsetWidth / container.offsetHeight;
            const ratioPct = aspectRatio / containerRatio;

            if (isResizing.includes('e') || isResizing.includes('w')) {
              newCrop.height = newCrop.width / ratioPct;
            } else {
              newCrop.width = newCrop.height * ratioPct;
            }

            // Adjust both if either exceeds the boundaries to maintain the ratio
            if (newCrop.x + newCrop.width > 100) {
              newCrop.width = 100 - newCrop.x;
              newCrop.height = newCrop.width / ratioPct;
            }
            if (newCrop.y + newCrop.height > 100) {
              newCrop.height = 100 - newCrop.y;
              newCrop.width = newCrop.height * ratioPct;
            }
          }
        }

        return newCrop;
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(null);
  };

  const handleReset = () => {
    setCrop({ x: 2, y: 2, width: 96, height: 96 });
    setZoom(1);
    setRotation(0);
    setAspectRatio('free');
  };

  const handleAspectRatioChange = (newRatio) => {
    setAspectRatio(newRatio);
    if (newRatio === 'free') return;

    const container = containerRef.current;
    if (!container) return;
    const containerRatio = container.offsetWidth / container.offsetHeight;
    const ratioPct = newRatio / containerRatio;

    setCrop(() => {
      let newWidth, newHeight;
      if (ratioPct > 1) {
        newWidth = 90;
        newHeight = 90 / ratioPct;
        if (newHeight > 90) {
          newHeight = 90;
          newWidth = 90 * ratioPct;
        }
      } else {
        newHeight = 90;
        newWidth = 90 * ratioPct;
        if (newWidth > 90) {
          newWidth = 90;
          newHeight = 90 / ratioPct;
        }
      }

      return {
        x: (100 - newWidth) / 2,
        y: (100 - newHeight) / 2,
        width: newWidth,
        height: newHeight
      };
    });
  };

  // Maps a point in container/screen pixel space to a point in the
  // original, unrotated, unscaled natural-image pixel space. Because
  // rotation only ever changes in 90° steps here, an axis-aligned screen
  // rectangle always maps back to an axis-aligned natural rectangle.
  const screenToNatural = (px, py, box) => {
    const dx = px - box.cx;
    const dy = py - box.cy;

    const rad = (-rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    const ux = rx / zoom;
    const uy = ry / zoom;

    const localX = ux + box.renderedWidth / 2;
    const localY = uy + box.renderedHeight / 2;

    const scaleX = box.naturalWidth / box.renderedWidth;
    const scaleY = box.naturalHeight / box.renderedHeight;

    return { x: localX * scaleX, y: localY * scaleY };
  };

  const handleCrop = () => {
    const img = imageRef.current;
    const box = getBaseImageBox();
    if (!img || !box) return;

    const cropXPixels = (crop.x / 100) * box.containerWidth;
    const cropYPixels = (crop.y / 100) * box.containerHeight;
    const cropWPixels = (crop.width / 100) * box.containerWidth;
    const cropHPixels = (crop.height / 100) * box.containerHeight;

    const corners = [
      [cropXPixels, cropYPixels],
      [cropXPixels + cropWPixels, cropYPixels],
      [cropXPixels, cropYPixels + cropHPixels],
      [cropXPixels + cropWPixels, cropYPixels + cropHPixels],
    ].map(([px, py]) => screenToNatural(px, py, box));

    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);

    // Bounding box in natural (unrotated) image pixel space, clamped to
    // the actual image bounds so an out-of-frame drag can't crop garbage.
    const srcX = Math.max(0, Math.min(box.naturalWidth, Math.min(...xs)));
    const srcY = Math.max(0, Math.min(box.naturalHeight, Math.min(...ys)));
    const srcX2 = Math.max(0, Math.min(box.naturalWidth, Math.max(...xs)));
    const srcY2 = Math.max(0, Math.min(box.naturalHeight, Math.max(...ys)));
    const srcW = Math.max(1, Math.round(srcX2 - srcX));
    const srcH = Math.max(1, Math.round(srcY2 - srcY));

    // 1. Pull the source rectangle out in the image's original orientation.
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = srcW;
    sourceCanvas.height = srcH;
    sourceCanvas.getContext('2d').drawImage(
      img,
      Math.round(srcX), Math.round(srcY), srcW, srcH,
      0, 0, srcW, srcH
    );

    // 2. Re-apply the rotation the user chose so the output matches what
    //    they saw on screen (90°/270° swap the final width/height).
    const swapped = rotation % 180 !== 0;
    const rotatedW = swapped ? srcH : srcW;
    const rotatedH = swapped ? srcW : srcH;

    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = rotatedW;
    rotatedCanvas.height = rotatedH;
    const rctx = rotatedCanvas.getContext('2d');
    rctx.translate(rotatedW / 2, rotatedH / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    rctx.drawImage(sourceCanvas, -srcW / 2, -srcH / 2);

    // 3. Downscale to the max output dimension.
    const maxDimension = 1024;
    let targetWidth = rotatedW;
    let targetHeight = rotatedH;
    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    finalCanvas.getContext('2d').drawImage(rotatedCanvas, 0, 0, targetWidth, targetHeight);

    const croppedImage = finalCanvas.toDataURL('image/jpeg', 0.85);
    onCrop(croppedImage);
  };

  const aspectRatios = [
    { label: 'Free', val: 'free', icon: Layers },
    { label: '1:1', val: 1, icon: Square },
    { label: '4:3', val: 4 / 3, icon: Layout },
    { label: '16:9', val: 16 / 9, icon: Maximize }
  ];

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[#050802]/95 backdrop-blur-2xl flex flex-col items-center justify-center sm:p-4 animate-fade-in select-none touch-none"
      onMouseMove={handleMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="w-full h-full sm:h-[90vh] sm:max-w-5xl bg-[#0D1505]/40 backdrop-blur-md sm:rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col relative">

        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-white/5 flex items-center justify-between bg-white/5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#84A63C] to-[#5C7A1F] rounded-lg flex items-center justify-center shadow-lg shadow-[#84A63C]/30">
              <Maximize className="text-[#0D1505]" size={16} strokeWidth={3} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white tracking-tighter">Precision Crop</h3>
              <p className="text-[8px] text-[#84A63C] font-black tracking-wide uppercase">Zoom &amp; rotation aware</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all border border-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Cropping Arena */}
        <div className="flex-1 relative bg-black/40 flex items-center justify-center p-4 sm:p-12 overflow-hidden min-h-0">
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center"
          >
            <img
              ref={imageRef}
              src={image}
              alt="To crop"
              className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-300 ease-out"
              style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
            />

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`absolute border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] pointer-events-auto cursor-move transition-shadow ${isDragging || isResizing ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] border-[#84A63C] ring-8 ring-[#84A63C]/20' : ''}`}
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                }}
                onMouseDown={(e) => handleStart(e, 'move')}
                onTouchStart={(e) => handleStart(e, 'move')}
              >
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="border border-white/20"></div>
                  ))}
                </div>

                <div className="absolute -top-3 -left-3 w-12 h-12 flex items-center justify-center cursor-nw-resize z-50 group" onMouseDown={(e) => handleStart(e, 'nw')} onTouchStart={(e) => handleStart(e, 'nw')}>
                  <div className="w-6 h-6 border-t-[6px] border-l-[6px] border-[#84A63C] rounded-tl-sm transition-transform group-active:scale-125"></div>
                </div>
                <div className="absolute -top-3 -right-3 w-12 h-12 flex items-center justify-center cursor-ne-resize z-50 group" onMouseDown={(e) => handleStart(e, 'ne')} onTouchStart={(e) => handleStart(e, 'ne')}>
                  <div className="w-6 h-6 border-t-[6px] border-r-[6px] border-[#84A63C] rounded-tr-sm transition-transform group-active:scale-125"></div>
                </div>
                <div className="absolute -bottom-3 -left-3 w-12 h-12 flex items-center justify-center cursor-sw-resize z-50 group" onMouseDown={(e) => handleStart(e, 'sw')} onTouchStart={(e) => handleStart(e, 'sw')}>
                  <div className="w-6 h-6 border-b-[6px] border-l-[6px] border-[#84A63C] rounded-bl-sm transition-transform group-active:scale-125"></div>
                </div>
                <div className="absolute -bottom-3 -right-3 w-12 h-12 flex items-center justify-center cursor-se-resize z-50 group" onMouseDown={(e) => handleStart(e, 'se')} onTouchStart={(e) => handleStart(e, 'se')}>
                  <div className="w-6 h-6 border-b-[6px] border-r-[6px] border-[#84A63C] rounded-br-sm transition-transform group-active:scale-125"></div>
                </div>

                <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-14 flex items-center justify-center cursor-w-resize z-50 group" onMouseDown={(e) => handleStart(e, 'w')} onTouchStart={(e) => handleStart(e, 'w')}>
                  <div className="w-2.5 h-10 bg-[#84A63C] rounded-full transition-transform group-active:scale-x-150"></div>
                </div>
                <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-14 flex items-center justify-center cursor-e-resize z-50 group" onMouseDown={(e) => handleStart(e, 'e')} onTouchStart={(e) => handleStart(e, 'e')}>
                  <div className="w-2.5 h-10 bg-[#84A63C] rounded-full transition-transform group-active:scale-x-150"></div>
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 h-6 w-14 flex items-center justify-center cursor-n-resize z-50 group" onMouseDown={(e) => handleStart(e, 'n')} onTouchStart={(e) => handleStart(e, 'n')}>
                  <div className="h-2.5 w-10 bg-[#84A63C] rounded-full transition-transform group-active:scale-y-150"></div>
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-6 w-14 flex items-center justify-center cursor-s-resize z-50 group" onMouseDown={(e) => handleStart(e, 's')} onTouchStart={(e) => handleStart(e, 's')}>
                  <div className="h-2.5 w-10 bg-[#84A63C] rounded-full transition-transform group-active:scale-y-150"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar Footer */}
        <div className="p-3.5 sm:p-4 bg-[#0D1505]/90 backdrop-blur-2xl border-t border-white/5 space-y-3.5 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            {/* Aspect Ratios */}
            <div className="grid grid-cols-4 sm:flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              {aspectRatios.map(ratio => (
                <button
                  key={ratio.label}
                  onClick={() => handleAspectRatioChange(ratio.val)}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 min-h-[34px] rounded-lg text-[9px] font-black whitespace-nowrap transition-all ${aspectRatio === ratio.val ? 'bg-[#84A63C] text-[#0D1505]' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  <ratio.icon size={12} />
                  <span>{ratio.label}</span>
                </button>
              ))}
            </div>

            {/* View Controls */}
            <div className="grid grid-cols-4 sm:flex gap-1">
              <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(2)))} className="p-2 min-h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-white/60 transition-all" title="Zoom out"><ZoomOut size={14} /></button>
              <button onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(2)))} className="p-2 min-h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-white/60 transition-all" title="Zoom in"><ZoomIn size={14} /></button>
              <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 min-h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-white/60 transition-all" title="Rotate 90°"><RotateCw size={14} /></button>
              <button onClick={handleReset} className="p-2 min-h-[34px] flex items-center justify-center bg-white/5 hover:bg-red-500/10 rounded-xl text-white/40 hover:text-red-400 transition-all" title="Reset all"><RefreshCw size={14} /></button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 max-w-4xl mx-auto">
            <button onClick={onCancel} className="flex-1 py-2 sm:py-2.5 text-[10px] font-black text-white/30 hover:text-white transition-all active:scale-95">Discard</button>
            <button
              onClick={handleCrop}
              className="flex-[2.5] py-2 sm:py-2.5 bg-gradient-to-r from-[#84A63C] to-[#5C7A1F] text-[#0D1505] rounded-xl text-[11px] font-black hover:shadow-[0_0_50px_rgba(132,166,60,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
            >
              <Check size={16} strokeWidth={4} className="group-hover:scale-125 transition-transform" />
              Finalize &amp; Save
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
      `}} />
    </div>,
    document.body
  );
};

export default ImageCropper;