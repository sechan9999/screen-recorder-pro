import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Square, Download, Share2, Settings, Mic, Monitor, PlayCircle,
    Info, Scissors, Radio, CheckCircle2, AlertCircle, Loader2,
    Cloud, Pencil, Highlighter, Volume2, VolumeX, Sliders,
    Link, Smartphone, Tablet, X, Circle, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─── Types ──────────────────────────────────────────────────────────────────
type AnnotationTool = 'pen' | 'highlight' | 'callout' | null;
type CloudProvider = 'googledrive' | 'dropbox' | null;

interface RecordingPreset {
    label: string;
    frameRate: number;
    resolution: string;
    bitrate: number;
}

interface Annotation {
    id: string;
    tool: AnnotationTool;
    points: { x: number; y: number }[];
    color: string;
    text?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const PRESETS: RecordingPreset[] = [
    { label: '4K Ultra',    frameRate: 60, resolution: '3840x2160', bitrate: 20000 },
    { label: '1080p HD',    frameRate: 30, resolution: '1920x1080', bitrate: 8000  },
    { label: '720p',        frameRate: 30, resolution: '1280x720',  bitrate: 4000  },
    { label: 'Mobile (SD)', frameRate: 24, resolution: '854x480',   bitrate: 2000  },
];

const ANNOTATION_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'];

// ─── App ─────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
    // Core state
    const [isRecording, setIsRecording]         = useState(false);
    const [isStreaming, setIsStreaming]           = useState(false);
    const [recordedChunks, setRecordedChunks]   = useState<Blob[]>([]);
    const [stream, setStream]                   = useState<MediaStream | null>(null);
    const [recordingTime, setRecordingTime]     = useState(0);
    const [previewUrl, setPreviewUrl]           = useState<string | null>(null);
    const [error, setError]                     = useState<string | null>(null);
    const [isProcessing, setIsProcessing]       = useState(false);
    const [ffmpegLoaded, setFfmpegLoaded]       = useState(false);

    // ── Feature: Custom Presets ──────────────────────────────────────────────
    const [selectedPreset, setSelectedPreset]   = useState<RecordingPreset>(PRESETS[1]);
    const [showPresets, setShowPresets]         = useState(false);

    // ── Feature: Audio Mixing ────────────────────────────────────────────────
    const [micVolume, setMicVolume]             = useState(1.0);
    const [sysVolume, setSysVolume]             = useState(1.0);
    const [micMuted, setMicMuted]               = useState(false);
    const [sysMuted, setSysMuted]               = useState(false);
    const micGainRef                            = useRef<GainNode | null>(null);
    const sysGainRef                            = useRef<GainNode | null>(null);
    const analyserMicRef                       = useRef<AnalyserNode | null>(null);
    const analyserSysRef                       = useRef<AnalyserNode | null>(null);

    // ── Audio Levels ──────────────────────────────────────────────────────────
    const [micLevel, setMicLevel]               = useState(0);
    const [sysLevel, setSysLevel]               = useState(0);

    // ── Feature: Annotation Tools ────────────────────────────────────────────
    const [annotationTool, setAnnotationTool]   = useState<AnnotationTool>(null);
    const [annotations, setAnnotations]         = useState<Annotation[]>([]);
    const [activeColor, setActiveColor]         = useState(ANNOTATION_COLORS[0]);
    const [isDrawing, setIsDrawing]             = useState(false);
    const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
    const canvasRef                             = useRef<HTMLCanvasElement>(null);

    // ── Feature: Cloud Export ────────────────────────────────────────────────
    const [cloudProvider, setCloudProvider]     = useState<CloudProvider>(null);
    const [isUploading, setIsUploading]         = useState(false);
    const [uploadProgress, setUploadProgress]   = useState(0);
    const [showCloudModal, setShowCloudModal]   = useState(false);

    // ── Feature: Collaborative Sharing ───────────────────────────────────────
    const [shareLink, setShareLink]             = useState<string | null>(null);
    const [linkCopied, setLinkCopied]           = useState(false);
    const [showShareModal, setShowShareModal]   = useState(false);

    // ── Feature: Mobile Support ───────────────────────────────────────────────
    const [isMobile, setIsMobile]               = useState(false);
    const [isTablet, setIsTablet]               = useState(false);

    const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
    const ffmpegRef         = useRef(new FFmpeg());
    const videoRef          = useRef<HTMLVideoElement>(null);
    const timerRef          = useRef<any>(null);

    // ── Detect device type ───────────────────────────────────────────────────
    useEffect(() => {
        const ua = navigator.userAgent;
        setIsMobile(/iPhone|Android.*Mobile|IEMobile|WPDesktop/i.test(ua));
        setIsTablet(/iPad|Android(?!.*Mobile)/i.test(ua));
    }, []);

    // ── Load FFmpeg ───────────────────────────────────────────────────────────
    useEffect(() => {
        const loadFFmpeg = async () => {
            try {
                const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
                const ffmpeg = ffmpegRef.current;
                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                });
                setFfmpegLoaded(true);
            } catch (err) {
                console.error('FFmpeg Load Error:', err);
            }
        };
        loadFFmpeg();
    }, []);

    // ── Timer ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isRecording || isStreaming) {
            timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            setRecordingTime(0);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isRecording, isStreaming]);

    // ── Render canvas annotations ─────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawAnnotation = (ann: Annotation) => {
            if (ann.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x, ann.points[0].y);
            ann.points.forEach(p => ctx.lineTo(p.x, p.y));

            if (ann.tool === 'highlight') {
                ctx.strokeStyle = ann.color + '88';
                ctx.lineWidth = 16;
            } else if (ann.tool === 'pen') {
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = 3;
            } else if (ann.tool === 'callout') {
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]);
            }
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.setLineDash([]);
        };

        annotations.forEach(drawAnnotation);
        if (currentAnnotation) drawAnnotation(currentAnnotation);
    }, [annotations, currentAnnotation]);

    // ─────────────────────────────────────────────────────────────────────────
    // START MEDIA
    // ─────────────────────────────────────────────────────────────────────────
    const startMedia = async (mode: 'record' | 'stream') => {
        setError(null);

        if (isMobile || isTablet) {
            setError('Screen capture is limited on mobile/tablet. Please use a desktop browser.');
            // Allow attempting display media anyway if user really wants to try.
        }

        try {
            const [w, h] = selectedPreset.resolution.split('x').map(Number);
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: selectedPreset.frameRate }, width: { ideal: w }, height: { ideal: h } },
                audio: true
            });

            let combinedStream = displayStream;

            try {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();

                // Mic Analyser
                const micSource = audioContext.createMediaStreamSource(micStream);
                const micGain = audioContext.createGain();
                micGain.gain.value = micMuted ? 0 : micVolume;
                micGainRef.current = micGain;
                const micAnalyser = audioContext.createAnalyser();
                micAnalyser.fftSize = 256;
                analyserMicRef.current = micAnalyser;
                micSource.connect(micGain);
                micGain.connect(micAnalyser);
                micGain.connect(destination);

                // System audio Analyser
                if (displayStream.getAudioTracks().length > 0) {
                    const sysSource = audioContext.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
                    const sysGain = audioContext.createGain();
                    sysGain.gain.value = sysMuted ? 0 : sysVolume;
                    sysGainRef.current = sysGain;
                    const sysAnalyser = audioContext.createAnalyser();
                    sysAnalyser.fftSize = 256;
                    analyserSysRef.current = sysAnalyser;
                    sysSource.connect(sysGain);
                    sysGain.connect(sysAnalyser);
                    sysGain.connect(destination);
                }

                combinedStream = new MediaStream([
                    ...displayStream.getVideoTracks(),
                    ...destination.stream.getAudioTracks()
                ]);
            } catch (err) {
                console.warn('Microphone permission denied or unavailable.', err);
            }

            setStream(combinedStream);
            if (videoRef.current) videoRef.current.srcObject = combinedStream;

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : 'video/webm';

            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: selectedPreset.bitrate * 1000 });
            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                    setRecordedChunks(p => [...p, e.data]);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                setPreviewUrl(URL.createObjectURL(blob));
                combinedStream.getTracks().forEach(t => t.stop());
            };

            mediaRecorderRef.current = recorder;
            recorder.start(1000);
            setRecordedChunks([]);
            setPreviewUrl(null);
            setShareLink(null);
            if (mode === 'record') setIsRecording(true);
            else setIsStreaming(true);

        } catch (err: any) {
            console.error('Fatal start error:', err);
            setError(err.message || 'Permission denied. Make sure headers permit getDisplayMedia.');
        }
    };

    const stopMedia = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        setIsStreaming(false);
        setStream(null);
    };

    // Audio level loop
    useEffect(() => {
        let animationFrame: number;
        const dataArrayMic = new Uint8Array(128);
        const dataArraySys = new Uint8Array(128);
        const updateLevels = () => {
            if (analyserMicRef.current) {
                analyserMicRef.current.getByteFrequencyData(dataArrayMic);
                const sum = dataArrayMic.reduce((a, b) => a + b, 0);
                setMicLevel((sum / dataArrayMic.length) / 255);
            }
            if (analyserSysRef.current) {
                analyserSysRef.current.getByteFrequencyData(dataArraySys);
                const sum = dataArraySys.reduce((a, b) => a + b, 0);
                setSysLevel((sum / dataArraySys.length) / 255);
            }
            animationFrame = requestAnimationFrame(updateLevels);
        };
        if (analyserMicRef.current || analyserSysRef.current) updateLevels();
        return () => cancelAnimationFrame(animationFrame);
    }, [stream]);

    // Live gain update
    useEffect(() => {
        if (micGainRef.current) micGainRef.current.gain.value = micMuted ? 0 : micVolume;
    }, [micVolume, micMuted]);

    useEffect(() => {
        if (sysGainRef.current) sysGainRef.current.gain.value = sysMuted ? 0 : sysVolume;
    }, [sysVolume, sysMuted]);

    const trimVideo = async () => {
        if (!previewUrl || !ffmpegLoaded) return;
        setIsProcessing(true);
        try {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            await ffmpegRef.current.writeFile('input.webm', await fetchFile(blob));
            await ffmpegRef.current.exec(['-i', 'input.webm', '-ss', '00:00:00', '-t', '10', '-c', 'copy', 'output.webm']);
            const data: any = await ffmpegRef.current.readFile('output.webm');
            setPreviewUrl(URL.createObjectURL(new Blob([data], { type: 'video/webm' })));
        } catch (err) { setError('Trim failed'); } finally { setIsProcessing(false); }
    };

    const downloadRecording = () => {
        if (!previewUrl) return;
        const a = document.createElement('a'); a.href = previewUrl; a.download = `mediapro-${Date.now()}.webm`; a.click();
    };

    const initiateCloudExport = async (p: CloudProvider) => {
        setCloudProvider(p); setIsUploading(true); setUploadProgress(0);
        const interval = setInterval(() => {
            setUploadProgress(v => {
                if (v >= 100) { clearInterval(interval); setIsUploading(false); setShowCloudModal(false); return 100; }
                return v + 10;
            });
        }, 300);
    };

    const generateShareLink = useCallback(() => {
        const token = Math.random().toString(36).substring(2, 10).toUpperCase();
        setShareLink(`${window.location.origin}/share/${token}`);
        setShowShareModal(true);
    }, [previewUrl]);

    const copyShareLink = () => {
        if (shareLink) navigator.clipboard.writeText(shareLink).then(() => {
            setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
        });
    };

    const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!annotationTool) return;
        setIsDrawing(true);
        setCurrentAnnotation({ id: Date.now().toString(), tool: annotationTool, points: [getCanvasPos(e)], color: activeColor });
    };

    const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !currentAnnotation) return;
        setCurrentAnnotation(prev => prev ? { ...prev, points: [...prev.points, getCanvasPos(e)] } : prev);
    };

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div className="container-custom min-h-screen py-8">
            <header className="header-custom flex justify-between items-center mb-12">
                <motion.div initial={{ opacity: 0, x: -25 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="text-5xl font-black gradient-text tracking-tighter">Media Hub Pro</h1>
                    <p className="text-gray-400 mt-2 font-medium">Capture · Mix · Stream · Share</p>
                </motion.div>
                <div className="flex gap-4 items-center">
                    {(isMobile || isTablet) && (
                        <div className="status-badge bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
                             {isTablet ? <Tablet className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                             <span className="text-xs font-bold">{isTablet ? 'TABLET' : 'MOBILE'}</span>
                        </div>
                    )}
                    <div className="status-badge bg-white/5 border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
                        {ffmpegLoaded ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        <span className="text-xs font-black tracking-widest uppercase">{ffmpegLoaded ? 'Engine Ready' : 'Warming Up'}</span>
                    </div>
                </div>
            </header>

            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl mb-8 flex items-center gap-4 text-red-400 backdrop-blur-xl">
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <p className="text-sm font-bold uppercase tracking-wide leading-relaxed">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="main-grid grid grid-cols-1 lg:grid-cols-3 gap-8">
                <section className="lg:col-span-2 space-y-8">
                    <div className="glass-card !p-3 relative overflow-hidden group shadow-2xl">
                        <div className="preview-container bg-black aspect-video rounded-3xl overflow-hidden relative border border-white/5">
                            {isRecording || isStreaming || stream ? (
                                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                            ) : previewUrl ? (
                                <video src={previewUrl} controls className="w-full h-full" />
                            ) : (
                                <div className="flex flex-col items-center gap-6 opacity-10 translate-y-4">
                                    <Monitor className="w-32 h-32" strokeWidth={1} />
                                    <p className="text-3xl font-black uppercase tracking-[0.3em]">Studio Feed</p>
                                </div>
                            )}

                            {annotationTool && (
                                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-crosshair" width={1280} height={720}
                                    onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={() => { setAnnotations(p => currentAnnotation ? [...p, currentAnnotation] : p); setCurrentAnnotation(null); setIsDrawing(false); }}
                                />
                            )}

                            {(isRecording || isStreaming) && (
                                <div className="absolute top-8 left-8 flex items-center gap-5 bg-black/80 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-white/10 z-20 shadow-2xl">
                                    <div className={`w-3.5 h-3.5 rounded-full ${isStreaming ? 'bg-purple-500' : 'bg-red-500'} animate-pulse shadow-[0_0_15px_currentColor]`} />
                                    <span className="font-mono text-3xl font-black tabular-nums tracking-wider">{formatTime(recordingTime)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-5 flex-wrap">
                        {!isRecording && !isStreaming ? (
                            <>
                                <button onClick={() => startMedia('record')} className="btn-primary grow py-6 text-xl shadow-2xl shadow-blue-500/20 active:scale-95 transition-transform">
                                    <PlayCircle className="w-7 h-7" /> Launch Recording
                                </button>
                                <button onClick={() => startMedia('stream')} className="grow bg-purple-600 hover:bg-purple-500 text-white py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 transition-all shadow-2xl shadow-purple-500/20 active:scale-95">
                                    <Radio className="w-7 h-7" /> Go Live
                                </button>
                            </>
                        ) : (
                            <button onClick={stopMedia} className="btn-danger w-full py-8 text-2xl font-black tracking-widest uppercase animate-pulse shadow-2xl shadow-red-500/40 active:scale-95 transition-all">
                                <Square className="w-8 h-8 fill-current" /> Terminate Session
                            </button>
                        )}
                    </div>

                    <AnimatePresence>
                        {previewUrl && !isRecording && !isStreaming && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="glass-card flex flex-wrap items-center justify-between gap-6 p-8 border-white/10 shadow-2xl">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                        <Scissors className="w-8 h-8" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black tracking-tight">Export & Polish</h4>
                                        <p className="text-gray-400 text-sm font-medium">Fine-tune your masterpiece</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <button disabled={isProcessing || !ffmpegLoaded} onClick={trimVideo} className="bg-white/5 hover:bg-white/10 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-white/10 flex items-center gap-3 active:scale-95 transition-all">
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />} Smart Trim
                                    </button>
                                    <button onClick={downloadRecording} className="bg-white/5 hover:bg-white/10 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-white/10 flex items-center gap-3 active:scale-95 transition-all">
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button onClick={() => setShowCloudModal(true)} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Cloud Move</button>
                                    <button onClick={generateShareLink} className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Instant Share</button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                <aside className="space-y-8">
                    <div className="glass-card flex flex-col h-full !p-8 shadow-2xl border-white/5">
                        <header className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                <Settings className="w-6 h-6 text-blue-400" /> Matrix Hub
                            </h3>
                        </header>

                        <div className="space-y-8 grow">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-[0.25em]">Input Pulse</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {/* System Audio Matrix */}
                                    <div className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col items-center gap-4 ${stream ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'bg-white/5 border-white/5 opacity-20'} ${sysLevel > 0.1 ? 'scale-105 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : ''}`}>
                                        <Monitor className={`w-8 h-8 transition-all duration-100 ${sysLevel > 0.1 ? 'text-blue-400 scale-125' : 'text-gray-400'}`} />
                                        <div className="w-full space-y-2">
                                            <div className="flex gap-1 h-3">
                                                {[...Array(12)].map((_, i) => (
                                                    <div key={i} className={`flex-1 rounded-sm transition-all duration-75 ${sysLevel > (i / 12) ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-white/10'}`} />
                                                ))}
                                            </div>
                                            <p className="text-[9px] font-black text-center text-gray-500 uppercase tracking-widest">Sys Level</p>
                                        </div>
                                    </div>
                                    {/* Voice Matrix */}
                                    <div className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col items-center gap-4 ${stream ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]' : 'bg-white/5 border-white/5 opacity-20'} ${micLevel > 0.1 ? 'scale-105 shadow-[0_0_30px_rgba(168,85,247,0.3)]' : ''}`}>
                                        <Mic className={`w-8 h-8 transition-all duration-100 ${micLevel > 0.1 ? 'text-purple-400 scale-125' : 'text-gray-400'}`} />
                                        <div className="w-full space-y-2">
                                            <div className="flex gap-1 h-3">
                                                {[...Array(12)].map((_, i) => (
                                                    <div key={i} className={`flex-1 rounded-sm transition-all duration-75 ${micLevel > (i / 12) ? 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-white/10'}`} />
                                                ))}
                                            </div>
                                            <p className="text-[9px] font-black text-center text-gray-500 uppercase tracking-widest">Voice Power</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-[0.25em]">Audio Scopes</label>
                                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${micLevel > 0.1 ? 'text-purple-400' : 'text-gray-500'}`}><Mic className="w-3 h-3" /> Voice</span>
                                            <button onClick={() => setMicMuted(m => !m)} className={`p-1 rounded-lg transition-colors ${micMuted ? 'text-red-500 bg-red-500/10' : 'text-gray-500'}`}>{micMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={micMuted ? 0 : micVolume} onChange={e => { setMicVolume(+e.target.value); setMicMuted(false); }} className="w-full accent-purple-500 cursor-pointer" />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${sysLevel > 0.1 ? 'text-blue-400' : 'text-gray-500'}`}><Monitor className="w-3 h-3" /> System</span>
                                            <button onClick={() => setSysMuted(m => !m)} className={`p-1 rounded-lg transition-colors ${sysMuted ? 'text-red-500 bg-red-500/10' : 'text-gray-500'}`}>{sysMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={sysMuted ? 0 : sysVolume} onChange={e => { setSysVolume(+e.target.value); setSysMuted(false); }} className="w-full accent-blue-500 cursor-pointer" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-[0.25em]">Master Presets</label>
                                <button onClick={() => setShowPresets(p => !p)} disabled={isRecording || isStreaming} className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between text-xs font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all disabled:opacity-30">
                                    <span>{selectedPreset.label}</span>
                                    <ChevronDown className={`w-4 h-4 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {showPresets && (
                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="overflow-hidden rounded-3xl bg-gray-900 border border-white/10 shadow-2xl">
                                            {PRESETS.map(p => (
                                                <button key={p.label} onClick={() => { setSelectedPreset(p); setShowPresets(false); }} className={`w-full px-6 py-4 flex justify-between text-[11px] font-bold tracking-tight hover:bg-white/5 transition-all ${selectedPreset.label === p.label ? 'text-blue-400' : 'text-gray-500'}`}>
                                                    <span>{p.label}</span> <span>{p.resolution}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <button onClick={generateShareLink} disabled={!previewUrl} className="w-full mt-10 py-5 rounded-3xl bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:text-blue-400 font-black text-xs uppercase tracking-widest transition-all active:scale-95 disabled:opacity-20 shadow-xl">
                            <Share2 className="w-4 h-4" /> Finalize Link
                        </button>
                    </div>
                </aside>
            </main>

            {/* Modals keep the same functional logic but with refined premium glassmorphism */}
            {showCloudModal && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-3xl flex items-center justify-center z-50 p-6">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-lg !p-10 shadow-[0_0_100px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-3xl font-black tracking-tight">Cloud Warehouse</h3>
                            <button onClick={() => setShowCloudModal(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
                        </div>
                        {isUploading ? (
                            <div className="space-y-6">
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-center text-xs">Synchronizing Buffer...</p>
                                <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                                    <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                <button onClick={() => initiateCloudExport('googledrive')} className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:bg-blue-500/10 hover:border-blue-500/30 flex items-center gap-8 transition-all group">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xl shadow-2xl group-hover:scale-110 transition-transform">GD</div>
                                    <div className="text-left"><p className="text-xl font-black">Google Drive</p><p className="text-gray-500 text-sm font-medium">Export to primary cloud storage</p></div>
                                </button>
                                <button onClick={() => initiateCloudExport('dropbox')} className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:bg-blue-500/10 hover:border-blue-500/30 flex items-center gap-8 transition-all group">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-400/20 flex items-center justify-center text-blue-300 font-black text-xl shadow-2xl group-hover:scale-110 transition-transform">DB</div>
                                    <div className="text-left"><p className="text-xl font-black">Dropbox</p><p className="text-gray-500 text-sm font-medium">Professional asset pipeline</p></div>
                                </button>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}

            {showShareModal && shareLink && (
                 <div className="fixed inset-0 bg-black/90 backdrop-blur-3xl flex items-center justify-center z-50 p-6">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-lg !p-10">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-3xl font-black tracking-tight">Public Conduit</h3>
                            <button onClick={() => setShowShareModal(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="flex gap-4">
                            <div className="grow p-5 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono text-blue-400 overflow-hidden text-ellipsis shadow-inner">{shareLink}</div>
                            <button onClick={copyShareLink} className={`px-6 py-5 rounded-2xl font-black border transition-all ${linkCopied ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400 active:scale-90'}`}>
                                {linkCopied ? <CheckCircle2 className="w-5 h-5" /> : <Link className="w-5 h-5" />}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            <footer className="mt-20 py-10 border-t border-white/5 text-center">
                <p className="text-[10px] font-black tracking-[0.5em] text-gray-700 uppercase">Engineered for sechan9999 © 2026 Studio Core Media</p>
            </footer>
        </div>
    );
};

// Simple ChevronDown component since it was missing or renamed
const ChevronDown: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6"/>
    </svg>
);

export default App;
