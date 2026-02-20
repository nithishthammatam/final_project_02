"use client";
import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';

interface ImageViewerProps {
    imageUrl?: string | null;
    imagePreview?: string | null;
    fileName?: string;
    alt?: string;
    className?: string;
    showControls?: boolean;
}

export default function ImageViewer({ 
    imageUrl, 
    imagePreview, 
    fileName = "image", 
    alt = "Medical Image",
    className = "",
    showControls = true
}: ImageViewerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Determine which image source to use (prioritize imagePreview for base64)
    const imageSource = imagePreview || imageUrl;

    if (!imageSource) {
        return (
            <div className={`bg-black/40 rounded-lg border border-white/10 flex items-center justify-center ${className}`}>
                <p className="text-gray-500 text-sm">No image available</p>
            </div>
        );
    }

    const handleDownload = async () => {
        try {
            let blob: Blob;
            let downloadFileName = fileName;

            if (imagePreview && imagePreview.startsWith('data:')) {
                // Handle base64 image
                const response = await fetch(imagePreview);
                blob = await response.blob();
            } else if (imageUrl) {
                // Handle URL image
                const response = await fetch(imageUrl);
                blob = await response.blob();
            } else {
                return;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFileName || 'medical_image';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download image');
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom > 1) {
            setIsDragging(true);
            setDragStart({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && zoom > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const resetZoom = () => {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
    };

    return (
        <>
            {/* Thumbnail View */}
            <div 
                className={`relative bg-black rounded-lg overflow-hidden border border-white/10 group cursor-pointer ${className}`}
                onClick={() => setIsModalOpen(true)}
            >
                <img 
                    src={imageSource} 
                    alt={alt}
                    className="w-full h-full object-contain transition duration-300 group-hover:opacity-80"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.alt = 'Image failed to load';
                        target.src = '';
                    }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Maximize2 size={24} className="text-white" />
                </div>
            </div>

            {/* Full-Screen Modal */}
            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
                    onClick={() => {
                        setIsModalOpen(false);
                        resetZoom();
                    }}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => {
                            setIsModalOpen(false);
                            resetZoom();
                        }}
                        className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
                        title="Close (ESC)"
                    >
                        <X size={24} className="text-white" />
                    </button>

                    {/* Image Container */}
                    <div 
                        className="relative max-w-[95vw] max-h-[95vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="relative"
                            style={{
                                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                                transition: isDragging ? 'none' : 'transform 0.2s',
                                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <img 
                                src={imageSource} 
                                alt={alt}
                                className="max-w-full max-h-[90vh] object-contain"
                                draggable={false}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.alt = 'Image failed to load';
                                    target.src = '';
                                }}
                            />
                        </div>

                        {/* Controls */}
                        {showControls && (
                            <div 
                                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 rounded-lg px-4 py-2 flex items-center gap-4 z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                                    className="p-2 bg-white/10 hover:bg-white/20 rounded transition"
                                    title="Zoom Out"
                                >
                                    <ZoomOut size={20} className="text-white" />
                                </button>
                                
                                <span className="text-white text-sm min-w-[60px] text-center">
                                    {Math.round(zoom * 100)}%
                                </span>
                                
                                <button
                                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                                    className="p-2 bg-white/10 hover:bg-white/20 rounded transition"
                                    title="Zoom In"
                                >
                                    <ZoomIn size={20} className="text-white" />
                                </button>

                                <div className="w-px h-6 bg-white/20 mx-2" />

                                <button
                                    onClick={resetZoom}
                                    className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-white text-sm transition"
                                    title="Reset Zoom"
                                >
                                    Reset
                                </button>

                                <div className="w-px h-6 bg-white/20 mx-2" />

                                <button
                                    onClick={handleDownload}
                                    className="p-2 bg-blue-600/80 hover:bg-blue-600 rounded transition"
                                    title="Download Image"
                                >
                                    <Download size={20} className="text-white" />
                                </button>
                            </div>
                        )}

                        {/* Image Info */}
                        {fileName && (
                            <div 
                                className="absolute top-4 left-4 bg-black/80 rounded-lg px-3 py-2 z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className="text-white text-sm font-medium">{fileName}</p>
                            </div>
                        )}
                    </div>

                    {/* Keyboard Shortcuts */}
                    <div className="absolute bottom-4 right-4 bg-black/80 rounded-lg px-3 py-2 text-xs text-gray-400 z-10">
                        <p>ESC to close • Mouse wheel to zoom • Drag when zoomed</p>
                    </div>
                </div>
            )}

            {/* Keyboard Event Handler */}
            {isModalOpen && (
                <div
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setIsModalOpen(false);
                            resetZoom();
                        } else if (e.key === '+' || e.key === '=') {
                            setZoom(Math.min(3, zoom + 0.25));
                        } else if (e.key === '-') {
                            setZoom(Math.max(0.5, zoom - 0.25));
                        } else if (e.key === '0') {
                            resetZoom();
                        }
                    }}
                    tabIndex={0}
                    className="fixed inset-0"
                />
            )}
        </>
    );
}



