
import React, { useRef, useEffect, useState } from 'react';
import { RotateCcw, PenTool, Type } from 'lucide-react';

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  label: string;
  initialImage?: string;
}

type SignatureMode = 'draw' | 'type';

const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onSave, label, initialImage }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState<'font-signature-1' | 'font-signature-2'>('font-signature-1');

  // Load initial image if provided (e.g. from history)
  useEffect(() => {
    if (initialImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          setHasSignature(true);
        };
        img.src = initialImage;
      }
    } else if (!initialImage && canvasRef.current) {
        clear();
    }
  }, [initialImage]);

  useEffect(() => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'type' && typedName.trim()) {
      captureTypedSignature();
    }
  }, [typedName, selectedFont, mode]);

  const captureTypedSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fontName = selectedFont === 'font-signature-1' ? 'Dancing Script' : 'Pacifico';
    ctx.font = `italic 40px ${fontName}`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    
    setHasSignature(true);
    onSave(canvas.toDataURL());
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: (e as MouseEvent).clientX - rect.left,
        y: (e as MouseEvent).clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setTypedName('');
    onSave('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex bg-gray-200 p-0.5 rounded-md no-print">
          <button
            onClick={() => { setMode('draw'); clear(); }}
            className={`p-1 px-2 rounded flex items-center gap-1 text-[10px] font-bold uppercase transition-colors ${mode === 'draw' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            <PenTool size={12} /> Desenhar
          </button>
          <button
            onClick={() => { setMode('type'); clear(); }}
            className={`p-1 px-2 rounded flex items-center gap-1 text-[10px] font-bold uppercase transition-colors ${mode === 'type' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            <Type size={12} /> Digitar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {mode === 'type' && (
          <div className="flex gap-2 no-print">
            <input
              type="text"
              placeholder="Digite seu nome completo"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <select
              value={selectedFont}
              onChange={(e) => setSelectedFont(e.target.value as any)}
              className="p-2 border border-gray-300 rounded-md text-xs font-medium outline-none"
            >
              <option value="font-signature-1">Estilo 1</option>
              <option value="font-signature-2">Estilo 2</option>
            </select>
          </div>
        )}

        <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            className={`w-full h-32 touch-none ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'}`}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <button
            onClick={clear}
            className="absolute top-2 right-2 p-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors no-print"
            title="Limpar assinatura"
          >
            <RotateCcw size={16} />
          </button>
          {!hasSignature && !isDrawing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 italic text-sm">
              {mode === 'draw' ? 'Assine aqui' : 'A assinatura aparecerá aqui'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignatureCanvas;
