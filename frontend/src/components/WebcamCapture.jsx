import React, { useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Webcam from 'react-webcam';
import { Camera, X, RefreshCw, CheckCircle2 } from 'lucide-react';

const WebcamCapture = ({ onCapture, onClose }) => {
  const webcamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    setCapturedImage(imageSrc);
  }, [webcamRef]);

  const handleConfirm = () => {
    onCapture(capturedImage);
    onClose();
  };

  const videoConstraints = {
    width: 1920,
    height: 1080,
    facingMode: "environment"
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-8">
      <div className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl animate-slide-up flex flex-col max-h-[90vh]">

        <div className="p-4 border-b border-[#DDE5D0] flex items-center justify-between bg-white">
          <div>
            <h3 className="text-lg font-bold text-[#1A2E05]">Capture ID Proof</h3>
            <p className="text-[10px] font-medium text-[#4A5E38]">Align the Aadhar card within the frame</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F0F3E8] rounded-xl transition-all">
            <X size={20} className="text-[#7A8A6A]" />
          </button>
        </div>

        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {!capturedImage ? (
            <>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="w-full h-full object-cover"
              />
              {/* Overlay Frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[80%] h-[60%] border-2 border-dashed border-white/50 rounded-2xl relative">
                   <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#84A63C]"></div>
                   <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#84A63C]"></div>
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#84A63C]"></div>
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#84A63C]"></div>
                </div>
              </div>
            </>
          ) : (
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="p-6 bg-white flex gap-4">
          {!capturedImage ? (
            <button
              onClick={capture}
              className="flex-1 py-4 bg-[#84A63C] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 shadow-lg shadow-[#84A63C]/20 transition-all"
            >
              <Camera size={20} />
              Capture Photo
            </button>
          ) : (
            <>
              <button
                onClick={() => setCapturedImage(null)}
                className="flex-1 py-4 bg-[#F0F3E8] text-[#1A2E05] rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#DDE5D0] transition-all"
              >
                <RefreshCw size={20} />
                Retake
              </button>
              <button
                onClick={handleConfirm}
                className="flex-[2] py-4 bg-[#1A2E05] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 shadow-lg transition-all"
              >
                <CheckCircle2 size={20} />
                Use This Image
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WebcamCapture;
