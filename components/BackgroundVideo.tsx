import { useEffect, useRef, useState } from "react";

interface Props {
  isVisible: boolean;
}

export default function BackgroundVideo({ isVisible }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeRef = useRef(0);
  const [loopCount, setLoopCount] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Video loop patroon configuratie
  const audioLoops = 1;    // Aantal loops met geluid aan
  const muteLoops = 4;     // Aantal loops met geluid uit
  const totalPattern = audioLoops + muteLoops;

  // Check voor video loop
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      if (currentTime < lastTimeRef.current) {
        // Video is geloopt
        const newLoopCount = (loopCount + 1) % totalPattern;
        setLoopCount(newLoopCount);
        
        // Bepaal of audio aan of uit moet
        const shouldEnableAudio = newLoopCount < audioLoops;
        setAudioEnabled(shouldEnableAudio);
      }
      lastTimeRef.current = currentTime;
    }
  };

  // Update video muted status wanneer audioEnabled verandert
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !audioEnabled;
    }
  }, [audioEnabled]);

  // Reset video wanneer deze weer zichtbaar wordt
  useEffect(() => {
    if (isVisible && videoRef.current) {
      setLoopCount(0);
      setAudioEnabled(true);
      lastTimeRef.current = 0;
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(error => console.error("Failed to play video:", error));
    }
  }, [isVisible]);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      className="w-full h-full object-cover"
      onTimeUpdate={handleTimeUpdate}
      style={{ display: isVisible ? "block" : "none" }}
    >
      <source src="https://cdn.shopify.com/videos/c/o/v/e298230f87434d79a14598b1c41d0cb4.mp4" type="video/mp4" />
    </video>
  );
} 