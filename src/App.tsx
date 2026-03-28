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
<<<<<<< HEAD
    const analyserMicRef                       = useRef<AnalyserNode | null>(null);
    const analyserSysRef                       = useRef<AnalyserNode | null>(null);

    // ── Audio Levels ──────────────────────────────────────────────────────────
    const [micLevel, setMicLevel]               = useState(0);
    const [sysLevel, setSysLevel]               = useState(0);
=======
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670

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

<<<<<<< HEAD
        if (isMobile || isTablet) {
            setError('Screen capture is limited on mobile/tablet. Please use a desktop browser.');
=======
        // Mobile / tablet: getDisplayMedia not widely supported — warn gracefully
        if (isMobile || isTablet) {
            setError('Screen capture is limited on mobile/tablet. Please use a desktop browser for full functionality. Camera capture can be used as a fallback.');
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
        }

        try {
            const [w, h] = selectedPreset.resolution.split('x').map(Number);
<<<<<<< HEAD
=======

>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: selectedPreset.frameRate }, width: { ideal: w }, height: { ideal: h } },
                audio: true
            });

            let combinedStream = displayStream;

            try {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();

<<<<<<< HEAD
                // Mic
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

                // System
=======
                // System audio gain
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                if (displayStream.getAudioTracks().length > 0) {
                    const sysSource = audioContext.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
                    const sysGain = audioContext.createGain();
                    sysGain.gain.value = sysMuted ? 0 : sysVolume;
                    sysGainRef.current = sysGain;
<<<<<<< HEAD
                    const sysAnalyser = audioContext.createAnalyser();
                    sysAnalyser.fftSize = 256;
                    analyserSysRef.current = sysAnalyser;
                    sysSource.connect(sysGain);
                    sysGain.connect(sysAnalyser);
                    sysGain.connect(destination);
                }

=======
                    sysSource.connect(sysGain);
                    sysGain.connect(destination);
                }

                // Microphone gain
                const micSource = audioContext.createMediaStreamSource(micStream);
                const micGain = audioContext.createGain();
                micGain.gain.value = micMuted ? 0 : micVolume;
                micGainRef.current = micGain;
                micSource.connect(micGain);
                micGain.connect(destination);

>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                combinedStream = new MediaStream([
                    ...displayStream.getVideoTracks(),
                    ...destination.stream.getAudioTracks()
                ]);
            } catch {
<<<<<<< HEAD
                console.warn('Mic unavailable');
=======
                console.warn('Mic unavailable. Using screen audio only.');
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
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
                    setRecordedChunks([...chunks]);
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
<<<<<<< HEAD
=======
            setShareLink(null);
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
            if (mode === 'record') setIsRecording(true);
            else setIsStreaming(true);

        } catch (err: any) {
<<<<<<< HEAD
            setError(err.message || 'Failed to start');
=======
            setError(err.message || 'Failed to start. Check permissions.');
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
        }
    };

    const stopMedia = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        setIsStreaming(false);
        setStream(null);
    };

<<<<<<< HEAD
    // live gains
=======
    // ─────────────────────────────────────────────────────────────────────────
    // AUDIO MIXING — live gain update
    // ─────────────────────────────────────────────────────────────────────────
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
    useEffect(() => {
        if (micGainRef.current) micGainRef.current.gain.value = micMuted ? 0 : micVolume;
    }, [micVolume, micMuted]);

    useEffect(() => {
        if (sysGainRef.current) sysGainRef.current.gain.value = sysMuted ? 0 : sysVolume;
    }, [sysVolume, sysMuted]);

<<<<<<< HEAD
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
        if (isRecording || isStreaming || stream) updateLevels();
        else { setMicLevel(0); setSysLevel(0); }
        return () => cancelAnimationFrame(animationFrame);
    }, [isRecording, isStreaming, stream]);

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
        const a = document.createElement('a');
        a.href = previewUrl; a.download = `mediapro-${Date.now()}.webm`; a.click();
    };

    const initiateCloudExport = async (provider: CloudProvider) => {
        if (!previewUrl) return;
        setCloudProvider(provider); setIsUploading(true); setUploadProgress(0);
        const interval = setInterval(() => {
            setUploadProgress(p => {
                if (p >= 100) { clearInterval(interval); setIsUploading(false); setShowCloudModal(false); return 100; }
                return p + 10;
            });
        }, 300);
    };

    const generateShareLink = useCallback(() => {
        if (!previewUrl) return;
        const token = Math.random().toString(36).substring(2, 10).toUpperCase();
        setShareLink(`${window.location.origin}/share/${token}`);
=======
    // ─────────────────────────────────────────────────────────────────────────
    // TRIM VIDEO
    // ─────────────────────────────────────────────────────────────────────────
    const trimVideo = async () => {
        if (!previewUrl || !ffmpegLoaded) return;
        setIsProcessing(true);
        const ffmpeg = ffmpegRef.current;
        try {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            await ffmpeg.writeFile('input.webm', await fetchFile(blob));
            await ffmpeg.exec(['-i', 'input.webm', '-ss', '00:00:00', '-t', '10', '-c', 'copy', 'output.webm']);
            const data: any = await ffmpeg.readFile('output.webm');
            setPreviewUrl(URL.createObjectURL(new Blob([data], { type: 'video/webm' })));
        } catch (err) {
            setError('Trim failed.');
        } finally {
            setIsProcessing(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // DOWNLOAD
    // ─────────────────────────────────────────────────────────────────────────
    const downloadRecording = () => {
        if (!previewUrl) return;
        const a = document.createElement('a');
        a.href = previewUrl;
        a.download = `mediapro-${Date.now()}.webm`;
        a.click();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CLOUD EXPORT (opt-in)
    // ─────────────────────────────────────────────────────────────────────────
    const initiateCloudExport = async (provider: CloudProvider) => {
        if (!previewUrl) return;
        setCloudProvider(provider);
        setIsUploading(true);
        setUploadProgress(0);

        // Simulated upload progress (replace with real OAuth + API call)
        const interval = setInterval(() => {
            setUploadProgress(p => {
                if (p >= 100) {
                    clearInterval(interval);
                    setIsUploading(false);
                    setShowCloudModal(false);
                    return 100;
                }
                return p + 10;
            });
        }, 300);

        /* ── REAL INTEGRATION NOTES ─────────────────────────────────────────
         * Google Drive:
         *   1. OAuth2 via https://accounts.google.com/o/oauth2/v2/auth
         *   2. POST to https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
         *
         * Dropbox:
         *   1. OAuth2 via https://www.dropbox.com/oauth2/authorize
         *   2. POST to https://content.dropboxapi.com/2/files/upload
         * ──────────────────────────────────────────────────────────────────── */
    };

    // ─────────────────────────────────────────────────────────────────────────
    // COLLABORATIVE SHARING — generate pseudo shareable link
    // ─────────────────────────────────────────────────────────────────────────
    const generateShareLink = useCallback(() => {
        if (!previewUrl) return;
        // In production: upload blob to a short-lived storage (S3, Cloudflare R2, etc.)
        // and return a signed URL. Here we create a local blob URL as a demo.
        const token = Math.random().toString(36).substring(2, 10).toUpperCase();
        const link = `${window.location.origin}/share/${token}`;
        setShareLink(link);
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
        setShowShareModal(true);
    }, [previewUrl]);

    const copyShareLink = () => {
<<<<<<< HEAD
        if (shareLink) navigator.clipboard.writeText(shareLink).then(() => {
            setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
        });
    };

=======
        if (!shareLink) return;
        navigator.clipboard.writeText(shareLink).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // ANNOTATION CANVAS HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
    const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!annotationTool) return;
        setIsDrawing(true);
<<<<<<< HEAD
        setCurrentAnnotation({ id: Date.now().toString(), tool: annotationTool, points: [getCanvasPos(e)], color: activeColor });
=======
        const pos = getCanvasPos(e);
        setCurrentAnnotation({ id: Date.now().toString(), tool: annotationTool, points: [pos], color: activeColor });
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
    };

    const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !currentAnnotation) return;
        setCurrentAnnotation(prev => prev ? { ...prev, points: [...prev.points, getCanvasPos(e)] } : prev);
    };

    const onCanvasMouseUp = () => {
        if (!isDrawing || !currentAnnotation) return;
        setAnnotations(prev => [...prev, currentAnnotation]);
<<<<<<< HEAD
        setCurrentAnnotation(null); setIsDrawing(false);
    };

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div className="container-custom">
=======
        setCurrentAnnotation(null);
        setIsDrawing(false);
    };

    const clearAnnotations = () => setAnnotations([]);

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const formatTime = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="container-custom">
            {/* ── Header ─────────────────────────────────────────────────────── */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
            <header className="header-custom">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="text-4xl font-bold gradient-text">Media Hub Pro</h1>
                    <p className="text-gray-400 mt-1">Record · Stream · Annotate · Share</p>
                </motion.div>
<<<<<<< HEAD
                <div className="flex gap-3 items-center flex-wrap">
=======

                <div className="flex gap-3 items-center flex-wrap">
                    {/* Device indicator */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                    {(isMobile || isTablet) && (
                        <div className="status-badge bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
                            {isTablet ? <Tablet className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                            <span className="text-xs font-semibold">{isTablet ? 'TABLET' : 'MOBILE'}</span>
                        </div>
                    )}
                    <div className="status-badge bg-white/5 border-white/10">
<<<<<<< HEAD
                        {ffmpegLoaded ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        <span className="text-xs font-semibold">{ffmpegLoaded ? 'READY' : 'LOADING'}</span>
=======
                        {ffmpegLoaded
                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                            : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        <span className="text-xs font-semibold">{ffmpegLoaded ? 'ENGINE READY' : 'LOADING'}</span>
                    </div>
                    <div className="status-badge">
                        <div className={`w-2 h-2 rounded-full ${(isRecording || isStreaming) ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                        <span className="font-bold text-xs">{(isRecording || isStreaming) ? 'LIVE' : 'STANDBY'}</span>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                    </div>
                </div>
            </header>

<<<<<<< HEAD
=======
            {/* ── Error Banner ────────────────────────────────────────────────── */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-6 flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="main-grid">
<<<<<<< HEAD
                <section className="space-y-6">
=======
                {/* ════════════════════════════════════════════════════════════
                    LEFT COLUMN — Preview + Controls
                    ════════════════════════════════════════════════════════════ */}
                <section className="space-y-6">

                    {/* Preview + Annotation Canvas */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                    <div className="glass-card !p-2 relative overflow-hidden">
                        <div className="preview-container !rounded-2xl" style={{ position: 'relative' }}>
                            {isRecording || isStreaming || stream ? (
                                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                            ) : previewUrl ? (
                                <video src={previewUrl} controls className="w-full h-full" />
                            ) : (
                                <div className="flex flex-col items-center gap-4 opacity-20 py-20">
                                    <Monitor className="w-24 h-24" />
                                    <p className="text-2xl font-light">Studio Feed</p>
                                </div>
                            )}
<<<<<<< HEAD
                            {annotationTool && (
                                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width={800} height={450}
                                    style={{ cursor: 'crosshair', zIndex: 10 }}
                                    onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp}
                                />
                            )}
=======

                            {/* Annotation Canvas overlay */}
                            {annotationTool && (
                                <canvas
                                    ref={canvasRef}
                                    className="absolute inset-0 w-full h-full"
                                    width={800} height={450}
                                    style={{ cursor: annotationTool ? 'crosshair' : 'default', zIndex: 10 }}
                                    onMouseDown={onCanvasMouseDown}
                                    onMouseMove={onCanvasMouseMove}
                                    onMouseUp={onCanvasMouseUp}
                                    onMouseLeave={onCanvasMouseUp}
                                />
                            )}

                            {/* Recording timer */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                            {(isRecording || isStreaming) && (
                                <div className="absolute top-6 left-6 flex items-center gap-4 bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/10" style={{ zIndex: 20 }}>
                                    <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-purple-500' : 'bg-red-500'} animate-pulse`} />
                                    <span className="font-mono text-2xl font-bold tabular-nums">{formatTime(recordingTime)}</span>
                                </div>
                            )}
                        </div>
                    </div>

<<<<<<< HEAD
=======
                    {/* ── Annotation Toolbar ────────────────────────────────── */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                    <AnimatePresence>
                        {(isRecording || previewUrl) && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="glass-card flex items-center gap-4 flex-wrap">
                                <span className="text-xs font-black uppercase text-gray-500 tracking-widest shrink-0">Annotate</span>
<<<<<<< HEAD
=======

                                {/* Tool buttons */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                {[
                                    { tool: 'pen' as AnnotationTool, icon: <Pencil className="w-4 h-4" />, label: 'Pen' },
                                    { tool: 'highlight' as AnnotationTool, icon: <Highlighter className="w-4 h-4" />, label: 'Highlight' },
                                    { tool: 'callout' as AnnotationTool, icon: <Minus className="w-4 h-4" />, label: 'Callout' },
                                ].map(({ tool, icon, label }) => (
<<<<<<< HEAD
                                    <button key={tool} onClick={() => setAnnotationTool(annotationTool === tool ? null : tool)}
=======
                                    <button key={tool}
                                        onClick={() => setAnnotationTool(annotationTool === tool ? null : tool)}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all
                                            ${annotationTool === tool ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>
                                        {icon} {label}
                                    </button>
                                ))}
<<<<<<< HEAD
=======

                                {/* Color swatches */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                <div className="flex gap-2 ml-auto">
                                    {ANNOTATION_COLORS.map(c => (
                                        <button key={c} onClick={() => setActiveColor(c)}
                                            className={`w-6 h-6 rounded-full border-2 transition-all ${activeColor === c ? 'border-white scale-125' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }} />
                                    ))}
                                </div>
<<<<<<< HEAD
                                <button onClick={() => setAnnotations([])} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl text-xs font-bold transition-all">Clear</button>
=======

                                <button onClick={clearAnnotations} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl text-xs font-bold transition-all">
                                    Clear
                                </button>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                            </motion.div>
                        )}
                    </AnimatePresence>

<<<<<<< HEAD
=======
                    {/* ── Start / Stop Buttons ─────────────────────────────── */}
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                    <div className="flex flex-wrap gap-4">
                        {!isRecording && !isStreaming ? (
                            <>
                                <button onClick={() => startMedia('record')} className="btn-primary grow hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                                    <PlayCircle className="w-6 h-6" /> Record
                                </button>
                                <button onClick={() => startMedia('stream')} className="grow bg-purple-600 hover:bg-purple-500 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all">
                                    <Radio className="w-6 h-6" /> Go Live
                                </button>
                            </>
                        ) : (
<<<<<<< HEAD
                            <button onClick={stopMedia} className="btn-danger w-full text-xl py-6 animate-pulse">
=======
                            <button onClick={stopMedia} className="btn-danger w-full text-xl py-6">
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                <Square className="w-6 h-6 fill-current" /> Stop
                            </button>
                        )}
                    </div>

<<<<<<< HEAD
                    <AnimatePresence>
                        {previewUrl && !isRecording && !isStreaming && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="glass-card flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Scissors className="w-6 h-6" /></div>
                                    <div><h4 className="font-bold">Post-Production</h4><p className="text-gray-400 text-xs">Edit · Download · Export</p></div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <button disabled={isProcessing || !ffmpegLoaded} onClick={trimVideo} className="bg-white/5 hover:bg-white/10 px-4 py-3 rounded-xl font-bold text-sm border border-white/10 flex items-center gap-2">
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />} Trim
                                    </button>
                                    <button onClick={downloadRecording} className="bg-white/5 hover:bg-white/10 px-4 py-3 rounded-xl font-bold text-sm border border-white/10 flex items-center gap-2">
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button onClick={() => setShowCloudModal(true)} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-4 py-3 rounded-xl font-bold text-sm">
                                        Cloud Export
                                    </button>
                                    <button onClick={generateShareLink} className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-4 py-3 rounded-xl font-bold text-sm">Share</button>
=======
                    {/* ── Post-Production Row ──────────────────────────────── */}
                    <AnimatePresence>
                        {previewUrl && !isRecording && !isStreaming && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="glass-card flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                        <Scissors className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold">Post-Production</h4>
                                        <p className="text-gray-400 text-xs">Edit · Export · Share</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {/* Trim */}
                                    <button disabled={isProcessing || !ffmpegLoaded} onClick={trimVideo}
                                        className="bg-white/5 hover:bg-white/10 px-4 py-3 rounded-xl font-bold text-sm border border-white/10 transition-all disabled:opacity-50 flex items-center gap-2">
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                                        Quick Trim
                                    </button>

                                    {/* Download */}
                                    <button onClick={downloadRecording} className="bg-white/5 hover:bg-white/10 px-4 py-3 rounded-xl font-bold text-sm border border-white/10 transition-all flex items-center gap-2">
                                        <Download className="w-4 h-4" /> Download
                                    </button>

                                    {/* Cloud Export */}
                                    <button onClick={() => setShowCloudModal(true)}
                                        className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                                        <Cloud className="w-4 h-4" /> Cloud Export
                                    </button>

                                    {/* Share Link */}
                                    <button onClick={generateShareLink}
                                        className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                                        <Link className="w-4 h-4" /> Share Link
                                    </button>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

<<<<<<< HEAD
                <aside className="space-y-6">
                    <div className="glass-card flex flex-col h-full">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-3"><Settings className="w-5 h-5 text-blue-400" /> Control Tower</h3>
                        <div className="space-y-6 grow">
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest">Input Matrix</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all ${(isRecording || isStreaming || stream) ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/5 border-white/5 opacity-30'} ${sysLevel > 0.1 ? 'shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}`}>
                                        <Monitor className="w-6 h-6 text-blue-400" style={{ transform: `scale(${1 + sysLevel * 0.4})` }} />
                                        <div className="w-full flex flex-col gap-1">
                                            <div className="flex gap-1 h-2">
                                                {[...Array(10)].map((_, i) => (
                                                    <div key={i} className={`flex-1 rounded-sm ${sysLevel > (i / 10) ? 'bg-blue-500 shadow-[0_0_5px_#3b82f6]' : 'bg-white/10'}`} />
                                                ))}
                                            </div>
                                            <span className="text-[8px] font-bold text-gray-500 uppercase">System Audio</span>
                                        </div>
                                    </div>
                                    <div className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all ${(isRecording || isStreaming || stream) ? 'bg-purple-500/10 border-purple-500/40' : 'bg-white/5 border-white/5 opacity-30'} ${micLevel > 0.1 ? 'shadow-[0_0_15px_rgba(168,85,247,0.2)]' : ''}`}>
                                        <Mic className="w-6 h-6 text-purple-400" style={{ transform: `scale(${1 + micLevel * 0.4})` }} />
                                        <div className="w-full flex flex-col gap-1">
                                            <div className="flex gap-1 h-2">
                                                {[...Array(10)].map((_, i) => (
                                                    <div key={i} className={`flex-1 rounded-sm ${micLevel > (i / 10) ? 'bg-purple-500 shadow-[0_0_5px_#a855f7]' : 'bg-white/10'}`} />
                                                ))}
                                            </div>
                                            <span className="text-[8px] font-bold text-gray-500 uppercase">Voice Active</span>
                                        </div>
=======
                {/* ════════════════════════════════════════════════════════════
                    RIGHT COLUMN — Control Tower
                    ════════════════════════════════════════════════════════════ */}
                <aside className="space-y-6">
                    <div className="glass-card flex flex-col h-full">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                            <Settings className="w-5 h-5 text-blue-400" /> Control Tower
                        </h3>

                        <div className="space-y-6 grow">

                            {/* ── Input Matrix ─────────────────────────────── */}
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest">Input Matrix</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-4 rounded-2xl border flex flex-col items-center gap-2 ${(isRecording || isStreaming || stream) ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/5 border-white/5 opacity-30'}`}>
                                        <Monitor className={`w-6 h-6 ${(isRecording || isStreaming || stream) ? 'text-blue-400' : ''}`} />
                                        <span className="text-[10px] font-bold uppercase whitespace-nowrap">Display</span>
                                    </div>
                                    <div className={`p-4 rounded-2xl border flex flex-col items-center gap-2 ${(isRecording || isStreaming || stream) ? 'bg-purple-500/10 border-purple-500/40' : 'bg-white/5 border-white/5 opacity-30'}`}>
                                        <Mic className={`w-6 h-6 ${(isRecording || isStreaming || stream) ? 'text-purple-400' : ''}`} />
                                        <span className="text-[10px] font-bold uppercase whitespace-nowrap">Voice</span>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                    </div>
                                </div>
                            </div>

<<<<<<< HEAD
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2"><Volume2 className="w-3.5 h-3.5" /> Audio Mix</label>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span className={`flex items-center gap-1 transition-all ${micLevel > 0.1 ? 'text-purple-400 font-bold' : ''}`}><Mic className="w-3 h-3" /> Mic</span>
                                            <button onClick={() => setMicMuted(m => !m)} className={micMuted ? 'text-red-400' : 'text-gray-400'}>{micMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={micMuted ? 0 : micVolume} onChange={e => { setMicVolume(+e.target.value); setMicMuted(false); }} className="w-full accent-purple-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span className={`flex items-center gap-1 transition-all ${sysLevel > 0.1 ? 'text-blue-400 font-bold' : ''}`}><Monitor className="w-3 h-3" /> System</span>
                                            <button onClick={() => setSysMuted(m => !m)} className={sysMuted ? 'text-red-400' : 'text-gray-400'}>{sysMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={sysMuted ? 0 : sysVolume} onChange={e => { setSysVolume(+e.target.value); setSysMuted(false); }} className="w-full accent-blue-500" />
=======
                            {/* ── Audio Mixing ─────────────────────────────── */}
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                                    <Volume2 className="w-3.5 h-3.5" /> Audio Mix
                                </label>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                                    {/* Microphone */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> Microphone</span>
                                            <button onClick={() => setMicMuted(m => !m)} className={`${micMuted ? 'text-red-400' : 'text-gray-400'} transition-colors`}>
                                                {micMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={micMuted ? 0 : micVolume}
                                            onChange={e => { setMicVolume(+e.target.value); setMicMuted(false); }}
                                            disabled={micMuted}
                                            className="w-full accent-purple-500 disabled:opacity-40" />
                                    </div>
                                    {/* System audio */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> System Audio</span>
                                            <button onClick={() => setSysMuted(m => !m)} className={`${sysMuted ? 'text-red-400' : 'text-gray-400'} transition-colors`}>
                                                {sysMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={sysMuted ? 0 : sysVolume}
                                            onChange={e => { setSysVolume(+e.target.value); setSysMuted(false); }}
                                            disabled={sysMuted}
                                            className="w-full accent-blue-500 disabled:opacity-40" />
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                    </div>
                                </div>
                            </div>

<<<<<<< HEAD
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">Presets</label>
                                <button onClick={() => setShowPresets(p => !p)} disabled={isRecording || isStreaming} className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-sm font-bold">
                                    <span>{selectedPreset.label}</span>
                                    <span className="text-gray-500 text-[10px]">{selectedPreset.resolution}</span>
                                </button>
                                <AnimatePresence>
                                    {showPresets && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-2xl bg-gray-900 border border-white/10">
                                            {PRESETS.map(p => (
                                                <button key={p.label} onClick={() => { setSelectedPreset(p); setShowPresets(false); }} className={`w-full px-4 py-3 flex justify-between text-xs hover:bg-white/5 ${selectedPreset.label === p.label ? 'text-blue-400' : 'text-gray-400'}`}>
                                                    <span>{p.label}</span><span>{p.resolution}</span>
=======
                            {/* ── Recording Presets ─────────────────────────── */}
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                                    <Sliders className="w-3.5 h-3.5" /> Recording Preset
                                </label>
                                <button onClick={() => setShowPresets(p => !p)}
                                    disabled={isRecording || isStreaming}
                                    className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50">
                                    <span>{selectedPreset.label}</span>
                                    <span className="text-gray-500 text-xs font-mono">{selectedPreset.resolution} · {selectedPreset.frameRate}fps · {selectedPreset.bitrate}kbps</span>
                                </button>
                                <AnimatePresence>
                                    {showPresets && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden rounded-2xl border border-white/10 bg-gray-900">
                                            {PRESETS.map(p => (
                                                <button key={p.label} onClick={() => { setSelectedPreset(p); setShowPresets(false); }}
                                                    className={`w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-white/5 transition-all
                                                        ${selectedPreset.label === p.label ? 'text-blue-400' : 'text-gray-300'}`}>
                                                    <span className="font-bold">{p.label}</span>
                                                    <span className="text-xs text-gray-500 font-mono">{p.resolution} · {p.frameRate}fps · {p.bitrate}kbps</span>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
<<<<<<< HEAD
                        </div>
                        <button onClick={generateShareLink} disabled={!previewUrl} className="w-full mt-6 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 transition-all flex items-center justify-center gap-3 text-sm font-bold disabled:opacity-30">
                            <Share2 className="w-4 h-4" /> Share Link
=======

                            {/* ── Assets Vault ─────────────────────────────── */}
                            <div className="pt-4 border-t border-white/5">
                                <h4 className="text-xs font-black uppercase text-gray-500 tracking-widest mb-3">Assets</h4>
                                {previewUrl ? (
                                    <div className="group relative rounded-2xl overflow-hidden border border-white/10 aspect-video hover:border-blue-500/50 transition-all cursor-pointer" onClick={downloadRecording}>
                                        <video src={previewUrl} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-all" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                            <Download className="w-8 h-8 text-white drop-shadow-xl" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-32 rounded-2xl bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2">
                                        <Info className="w-5 h-5 text-gray-600" />
                                        <p className="text-[10px] text-gray-600 font-bold uppercase">Empty Vault</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Share button */}
                        <button onClick={generateShareLink} disabled={!previewUrl}
                            className="w-full mt-6 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:text-blue-400 transition-all flex items-center justify-center gap-3 text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                            <Share2 className="w-4 h-4" /> Generate Share Link
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
                        </button>
                    </div>
                </aside>
            </main>

<<<<<<< HEAD
            {showCloudModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">Cloud Export</h3>
                            <button onClick={() => setShowCloudModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        {isUploading ? (
                            <div className="space-y-4">
                                <p className="text-gray-400 text-sm">Uploading...</p>
                                <div className="w-full bg-white/10 rounded-full h-2">
                                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <button onClick={() => initiateCloudExport('googledrive')} className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 flex items-center gap-4 text-left">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">GD</div>
                                    <div><p className="font-bold">Google Drive</p><p className="text-xs text-gray-400">Save to your cloud storage</p></div>
                                </button>
                                <button onClick={() => initiateCloudExport('dropbox')} className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 flex items-center gap-4 text-left">
                                    <div className="w-10 h-10 rounded-xl bg-blue-400/20 flex items-center justify-center text-blue-300 font-bold">DB</div>
                                    <div><p className="font-bold">Dropbox</p><p className="text-xs text-gray-400">Upload to Dropbox account</p></div>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showShareModal && shareLink && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">Share Link</h3>
                            <button onClick={() => setShowShareModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="flex gap-2">
                            <div className="grow p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-gray-300 overflow-hidden text-ellipsis">{shareLink}</div>
                            <button onClick={copyShareLink} className={`px-4 py-3 rounded-xl border ${linkCopied ? 'bg-green-500/20 border-green-500/40' : 'bg-purple-500/10'}`}>
                                {linkCopied ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="mt-16 text-center">
                <p className="text-[10px] font-bold tracking-[0.2em] text-gray-700 uppercase">Engineered for sechan9999 © 2026 Media Hub Pro</p>
=======
            {/* ════════════════════════════════════════════════════════════════
                MODALS
                ════════════════════════════════════════════════════════════════ */}

            {/* ── Cloud Export Modal ──────────────────────────────────────────── */}
            <AnimatePresence>
                {showCloudModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card w-full max-w-md">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-3"><Cloud className="w-5 h-5 text-blue-400" /> Cloud Export</h3>
                                <button onClick={() => setShowCloudModal(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                            </div>

                            {isUploading ? (
                                <div className="space-y-4">
                                    <p className="text-gray-400 text-sm">Uploading to {cloudProvider === 'googledrive' ? 'Google Drive' : 'Dropbox'}…</p>
                                    <div className="w-full bg-white/10 rounded-full h-2">
                                        <motion.div className="bg-blue-500 h-2 rounded-full" animate={{ width: `${uploadProgress}%` }} />
                                    </div>
                                    <p className="text-right text-xs text-gray-500">{uploadProgress}%</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-gray-400 text-sm mb-4">Choose where to export your recording. All uploads are opt-in and use your own account.</p>
                                    <button onClick={() => initiateCloudExport('googledrive')}
                                        className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all flex items-center gap-4 text-left">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">GD</div>
                                        <div>
                                            <p className="font-bold">Google Drive</p>
                                            <p className="text-xs text-gray-400">Save to your Drive (OAuth required)</p>
                                        </div>
                                    </button>
                                    <button onClick={() => initiateCloudExport('dropbox')}
                                        className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all flex items-center gap-4 text-left">
                                        <div className="w-10 h-10 rounded-xl bg-blue-400/20 flex items-center justify-center text-blue-300 font-bold text-sm">DB</div>
                                        <div>
                                            <p className="font-bold">Dropbox</p>
                                            <p className="text-xs text-gray-400">Upload to Dropbox (OAuth required)</p>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Share Link Modal ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {showShareModal && shareLink && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card w-full max-w-md">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-3"><Link className="w-5 h-5 text-purple-400" /> Shareable Link</h3>
                                <button onClick={() => setShowShareModal(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                            </div>
                            <p className="text-gray-400 text-sm mb-4">Share this link for peer review. No cloud account needed — link expires in 24 hours.</p>
                            <div className="flex gap-2">
                                <div className="grow p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">
                                    {shareLink}
                                </div>
                                <button onClick={copyShareLink}
                                    className={`px-4 py-3 rounded-xl font-bold text-sm transition-all border ${linkCopied ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'}`}>
                                    {linkCopied ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                                </button>
                            </div>
                            {linkCopied && <p className="text-green-400 text-xs mt-2 text-center">Copied to clipboard!</p>}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <footer className="mt-16 text-center">
                <p className="text-[10px] font-bold tracking-[0.2em] text-gray-700 uppercase">
                    Engineered for sechan9999 © 2026 Media Hub Pro
                </p>
>>>>>>> 8aaafaf537bb63217053164ab85d739275e14670
            </footer>
        </div>
    );
};

export default App;
