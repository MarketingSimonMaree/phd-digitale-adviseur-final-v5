"use client";

import StreamingAvatar, { 
  AvatarQuality, 
  StreamingEvents, 
  TaskMode, 
  TaskType,
  VoiceEmotion
} from "@heygen/streaming-avatar";
import type { StartAvatarResponse, SpeakRequest } from "@heygen/streaming-avatar";
import {
  Button,
  Spinner,
} from "@nextui-org/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import { Mic, MicOff, Send, X } from "lucide-react";
import ChatMessages from './ChatMessages';
import BackgroundVideo from './BackgroundVideo';
import { logSession, logMessage, endSession as logEndSession } from '../utils/sessionLogger'

// Constants
const AVATAR_ID = '00e7b435191b4dcc85936073262b9aa8';
const KNOWLEDGE_BASE_ID = '6a065e56b4a74f7a884d8323e10ceb90';
const LANGUAGE = 'nl';

interface Props {
  children?: React.ReactNode;
}

// Define message type for internal use
interface Message {
  text: string;
  sender: 'user' | 'avatar';
}

export default function InteractiveAvatar({ children }: Props) {
  // State management
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMode, setChatMode] = useState<"text_mode" | "voice_mode">("text_mode");
  const [isUserTalking, setIsUserTalking] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [showThumbnail, setShowThumbnail] = useState<boolean>(false);
  const [session_id, setSessionId] = useState<string | undefined>();
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState<boolean>(false);
  
  // Refs
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const messageBuffer = useRef<string>('');
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeRef = useRef<number>(0);
  const [loopCount, setLoopCount] = useState<number>(0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [hasPlayedWithSound, setHasPlayedWithSound] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Video loop patroon configuratie
  const audioLoops = 1;    // Aantal loops met geluid aan
  const muteLoops = 3;     // Aantal loops met geluid uit
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

  // Fetch access token
  async function fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      setDebug(`Token error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return "";
  }

  // Start avatar session
  async function startSession(): Promise<void> {
    setIsLoadingSession(true);
    try {
      const newToken = await fetchAccessToken();

      // Check microphone access first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error("Microphone access denied:", error);
        setDebug("Microphone access denied. Check browser settings.");
        throw new Error("Microphone access denied");
      }

      // Create new StreamingAvatar instance with proper config
      avatar.current = new StreamingAvatar({
        token: newToken
      });

      // Add event listeners for avatar feedback
      setupAvatarEventListeners();

      // Mount the avatar
      if (mediaStream.current && avatar.current) {
        if (typeof (avatar.current as any).mount === 'function') {
          (avatar.current as any).mount(mediaStream.current);
        }
        if (typeof (avatar.current as any).start === 'function') {
          (avatar.current as any).start();
        }
      }

      // Start the avatar with minimal configuration
      const res = await (avatar.current as any).createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: AVATAR_ID,
        knowledgeId: KNOWLEDGE_BASE_ID,
        language: LANGUAGE,
        disableIdleTimeout: true
      });
      
      // Log de nieuwe sessie
      await logSession();
      setData(res);
      
      // Set stream
      if (avatar.current.mediaStream) {
        setStream(avatar.current.mediaStream);
      }

      // Welkomstbericht
      setTimeout(() => {
        if (avatar.current) {
          (avatar.current as any).speak({
            text: "Hoi",
            taskType: TaskType.TALK,
            taskMode: TaskMode.SYNC,
            skipMessage: true
          });
        }
      }, 1000);
      
      // Set default mode to text
      setChatMode("text_mode");
      
      // Start voice chat met microfoon op mute
      setTimeout(async () => {
        try {
          if (avatar.current) {
            await (avatar.current as any).startVoiceChat({
              useSilencePrompt: true,
              silenceTimeout: 5000,
              isInputAudioMuted: true // Zet de microfoon standaard op mute
            });
          }
        } catch (error) {
          console.error("Error starting voice chat:", error);
          setDebug(`Voice chat error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, 100);

      // Zet de microfoonstatus op gemute
      setIsMicrophoneEnabled(false); // Update de status naar mute
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(`Session error: ${error instanceof Error ? error.message : String(error)}`);
      avatar.current = null;
      setStream(null);
    } finally {
      setIsLoadingSession(false);
    }
  }

  // Set up event listeners for the avatar based on SDK reference
  function setupAvatarEventListeners(): void {
    if (!avatar.current) return;
    
    // AVATAR_START_TALKING: Emitted when the avatar starts speaking
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (event: any) => {
      console.log("Avatar started talking", event);
    });
    
    // AVATAR_STOP_TALKING: Emitted when the avatar stops speaking
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (event: any) => {
      console.log("Avatar stopped talking", event);
    });
    
    // STREAM_DISCONNECTED: Triggered when the stream disconnects
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    
    // STREAM_READY: Indicates that the stream is ready for display
    avatar.current.on(StreamingEvents.STREAM_READY, (event: any) => {
      console.log("Stream ready:", event.detail);
      setStream(event.detail);
    });
    
    // USER_START: Indicates when the user starts speaking
    avatar.current.on(StreamingEvents.USER_START, (event: any) => {
      console.log("User started talking", event);
      setIsUserTalking(true);
    });
    
    // USER_STOP: Indicates when the user stops speaking
    avatar.current.on(StreamingEvents.USER_STOP, (event: any) => {
      console.log("User stopped talking", event);
      setIsUserTalking(false);
    });
    
    // USER_SILENCE: Indicates when the user is silent
    avatar.current.on(StreamingEvents.USER_SILENCE, () => {
      console.log("User is silent");
    });
    
    // USER_TALKING_MESSAGE: Voor alle user input (spraak én tekst)
    avatar.current.on(StreamingEvents.USER_TALKING_MESSAGE, (event: any) => {
      console.log('User message event:', event);
      
      if (event.detail?.message) {
        // Voor de UI altijd berichten tonen in text mode
        if (chatMode === 'text_mode') {
          // Voor getypte tekst: check op duplicaten
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.sender === 'user' && 
                lastMessage?.text === event.detail.message) {
              return prev;
            }
            return [...prev, {
              text: event.detail.message,
              sender: 'user'
            }];
          });
          
          // Log het bericht naar Supabase
          if (session_id) {
            logMessage(session_id, {
              sender: 'user',
              message: event.detail.message
            });
          }
        } 
        // In voice mode alleen berichten tonen en verwerken als microfoon aan staat
        else if (chatMode === 'voice_mode' && isMicrophoneEnabled) {
          setMessages(prev => [...prev, {
            text: event.detail.message,
            sender: 'user'
          }]);
          
          // Log het bericht naar Supabase
          if (session_id) {
            logMessage(session_id, {
              sender: 'user',
              message: event.detail.message
            });
          }
        } else {
          // Als we hier komen, dan is het een voice message maar microfoon staat uit
          // Dit zouden we niet moeten zien volgens HeyGen docs omdat isInputAudioMuted true is
          console.log("Genegeerd spraakbericht (microfoon uit):", event.detail.message);
        }
      }
    });

    // AVATAR_TALKING_MESSAGE: Voor avatar responses met zin-buffering
    avatar.current.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event: any) => {
      if (event.detail?.message) {
        // Skip het welkomstbericht
        if (event.detail.message.includes("Hoi")) return;
        
        messageBuffer.current += event.detail.message;
        
        // Process complete sentences
        const sentences = messageBuffer.current.match(/[^.!?]+[.!?]+/g);
        if (sentences) {
          sentences.forEach(sentence => {
            setMessages(prev => [...prev, {
              text: sentence.trim(),
              sender: 'avatar'
            }]);
            
            // Log elk compleet bericht naar Supabase
            if (session_id) {
              logMessage(session_id, {
                sender: 'avatar',
                message: sentence.trim()
              });
            }
          });
          messageBuffer.current = messageBuffer.current.replace(/[^.!?]+[.!?]+/g, '');
        }
      }
    });

    // Voice chat configuratie met snelle reactie
    if (chatMode === 'voice_mode') {
      try {
        avatar.current.startVoiceChat({
          useSilencePrompt: true,
          isInputAudioMuted: !isMicrophoneEnabled // Gebruik de huidige mute status
        });
      } catch (error) {
        if (!(error instanceof Error && error.message.includes("WebSocket"))) {
          console.error("Voice chat error:", error);
          setDebug(`Voice chat error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  // End the session according to API reference
  async function endSession(): Promise<void> {
  try {
    // Log sessie einde naar Supabase
    if (session_id) {
      await logEndSession(session_id);
    }

    if (avatar.current) {
      if (chatMode === "voice_mode") {
        try {
          await (avatar.current as any).closeVoiceChat();
        } catch (error) {
          console.error("Error closing voice chat:", error);
        }
      }
      
      await (avatar.current as any).stopAvatar();
      avatar.current = null;
    }
    
    // Reset states
    setStream(null);
    setMessages([]);
    setChatMode("text_mode");
    setText("");
    setIsUserTalking(false);
    messageBuffer.current = '';
    
    // BELANGRIJK: Reset de microfoon status naar UIT
    setIsMicrophoneEnabled(false);
  } catch (error) {
    console.error("Error ending session:", error);
    setDebug(`End session error: ${error instanceof Error ? error.message : String(error)}`);
    avatar.current = null;
    setStream(null);
  }
}

  // Send message to avatar
  async function handleSpeak(): Promise<void> {
    if (!text.trim() || !avatar.current) return;
    
    setIsLoadingRepeat(true);
    
    try {
      // Add user message to chat
      const userMessage = text.trim();
      setMessages(prev => [...prev, {
        text: userMessage,
        sender: 'user'
      }]);
      
      // Clear input
      setText("");
      
      // Use type assertion to bypass type checking for the SDK API call
      await (avatar.current as any).speak({ 
        text: userMessage, 
        taskType: TaskType.TALK,
        taskMode: TaskMode.SYNC 
      });
    } catch (error) {
      console.error("Error speaking:", error);
      setDebug(`Speak error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingRepeat(false);
    }
  }

  // Change chat mode between text and voice
  const handleModeChange = async (newMode: 'text_mode' | 'voice_mode'): Promise<void> => {
    if (newMode === chatMode || !avatar.current) return;

    try {
      if (newMode === 'voice_mode') {
        await (avatar.current as any).startVoiceChat({
          useSilencePrompt: true,
          silenceTimeout: 100,        
          silenceThreshold: -50,       
          isInputAudioMuted: !isMicrophoneEnabled, // Gebruik de huidige mic status
          onStartSpeaking: () => {
            console.log('User started speaking');
            setIsUserTalking(true);
          },
          onStopSpeaking: () => {
            console.log('User stopped speaking');
            setIsUserTalking(false);
          }
        });
      } else {
        await (avatar.current as any).closeVoiceChat();
      }
      
      setChatMode(newMode);
    } catch (error) {
      console.error('Mode change error:', error);
      setDebug(`Mode change error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Handle key press in text input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSpeak();
    }
  };

  // Show toast when trying to interact without starting
  const handleDisabledClick = (): void => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Setup video stream when ready
  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current?.play().catch(error => {
          console.error("Error playing video:", error);
        });
      };
    }
  }, [stream]);

  // Update video muted status wanneer audioEnabled verandert
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !audioEnabled;
    }
  }, [audioEnabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (avatar.current) {
        avatar.current.stopAvatar();
        avatar.current = null;
      }
      
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
      }
    };
  }, []);

  // Handle video end to mute after first play
  const handleVideoEnd = (): void => {
    console.log("Video ended, setting muted to true");
    setIsMuted(true);
  };

  // Log when muted status changes
  useEffect(() => {
    console.log("Muted status changed:", isMuted);
  }, [isMuted]);

  const createSession = async (): Promise<void> => {
    try {
      const new_session_id = await logSession();
      if (typeof new_session_id === 'string') {
        setSessionId(new_session_id);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  // Voeg useEffect toe om sessie te maken bij component mount
  useEffect(() => {
    const initSession = async () => {
      console.log('Initializing session...');
      const new_session_id = await logSession();
      console.log('Session initialized:', new_session_id);
      if (typeof new_session_id === 'string') {
        setSessionId(new_session_id);
      }
    };

    initSession();
  }, []);

  // Log wanneer messages worden bijgewerkt
  useEffect(() => {
    console.log('Messages updated:', {
      messageCount: messages.length,
      currentSessionId: session_id
    });
  }, [messages, session_id]);

  // Cleanup functie
  const handleClear = useCallback(async (): Promise<void> => {
    if (session_id) {
      console.log('Clearing chat and ending session:', session_id);
      await endSession();
      console.log('Session ended');
      setSessionId(undefined);
    }
    setMessages([]);
  }, [session_id]);

  // Cleanup bij unmount of pagina verlaten
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (session_id) {
        console.log('Page unloading, ending session:', session_id);
        await endSession();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (session_id) {
        console.log('Component unmounting, ending session:', session_id);
        endSession();
      }
    };
  }, [session_id]);

  // Functie om de microfoon in/uit te schakelen
  const toggleMicrophone = async (): Promise<void> => {
  if (!avatar.current) return;
  
  // Toggle de state direct voor onmiddellijke UI feedback
  const newStatus = !isMicrophoneEnabled;
  setIsMicrophoneEnabled(newStatus);
  
  try {
    // Geef feedback aan de gebruiker
    setDebug(newStatus 
      ? "Microfoon AAN: De digitale adviseur luistert naar je spraak" 
      : "Microfoon UIT: De digitale adviseur hoort je spraak niet"
    );
    
    // Clear feedback na enkele seconden
    setTimeout(() => {
      setDebug("");
    }, 3000);
    
    console.log("Microfoon status gewijzigd naar:", newStatus ? "AAN" : "UIT");
    
    // Als we in voice_mode zijn, pas dan alleen de interne flag aan
    // Dit vermijdt een volledige restart van de voice chat voor betere performance
    if (chatMode === 'voice_mode') {
      // Interne variabele gebruiken om te bepalen of berichten worden verwerkt
      // Dit hoeft niet de zware startVoiceChat aan te roepen
      if (avatar.current.mediaStreamAudioSource && 
          avatar.current.mediaStreamAudioSource.mediaStream) {
        const audioTracks = 
          avatar.current.mediaStreamAudioSource.mediaStream.getAudioTracks();
        
        if (audioTracks && audioTracks.length > 0) {
          // Enable/disable het audio track
          audioTracks[0].enabled = newStatus;
          console.log("Audio track enabled:", newStatus);
        }
      }
    }
  } catch (error) {
    console.error("Error toggling microphone:", error);
    setDebug(`Fout bij microfoon schakelen: ${error instanceof Error ? error.message : String(error)}`);
  }
};

  return (
    <div className="console-container relative w-full h-full">
      <div className="absolute inset-0 w-full h-full bg-gray-100">
        {stream ? (
          <video
            ref={mediaStream}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          >
            <track kind="captions" />
          </video>
        ) : (
          <BackgroundVideo isVisible={!stream} />
        )}
      </div>

      {/* Interface elements */}
      <div className="absolute inset-0 flex flex-col">
        {/* End session button */}
        {stream && (
          <div className="absolute top-6 right-6 z-10">
            <button
              onClick={endSession}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-black/20 hover:bg-amber-500 text-white transition-colors group relative"
            >
              <X size={18} />
              <span className="absolute right-full mr-2 whitespace-nowrap bg-black/75 text-white px-3 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Beëindig gesprek
              </span>
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {isLoadingSession && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-4">
                <Spinner color="warning" size="lg" />
              </div>
              <div className="text-white text-2xl font-medium px-4 drop-shadow-lg">
                Even geduld, de digitale adviseur wordt geladen...
              </div>
            </div>
          </div>
        )}

        {/* Start button */}
        {!stream && !isLoadingSession && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={startSession}
              className="bg-[#ce861b] text-white px-8 py-4 rounded-lg text-xl font-semibold
                         animate-scale-pulse hover:bg-amber-500 transition-colors"
            >
              Start gesprek
            </button>
          </div>
        )}

        {/* Microfoon aan/uit knop */}
        <div className="absolute top-6 left-6 z-10">
          <button
            onClick={toggleMicrophone}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${isMicrophoneEnabled ? 'bg-green-500' : 'bg-red-500'} text-white transition-colors group relative`}
          >
            {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            <span className="absolute left-full ml-2 whitespace-nowrap bg-black/75 text-white px-3 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {isMicrophoneEnabled ? 'Zet microfoon uit' : 'Zet microfoon aan'}
            </span>
          </button>
        </div>

        {/* Chat messages */}
        <div className="mt-auto centered-container">
          <div className="space-y-4 p-6">
            {stream && messages.length > 0 && (
              <ChatMessages 
                messages={messages} 
                onClear={handleClear} 
                session_id={session_id} 
              />
            )}
            
            {/* Text input */}
            {stream && (
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={chatMode === "voice_mode" ? "Schakel naar typen om een bericht te typen..." : "Type hier uw bericht..."}
                      className="w-full px-6 py-3 text-lg rounded-[12px] bg-white/90 backdrop-blur-sm pr-16"
                      disabled={chatMode === "voice_mode"}
                    />
                    
                    {text && (
                      <div 
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ zIndex: 50 }}
                      >
                        <button
                          onClick={handleSpeak}
                          disabled={isLoadingRepeat || !text.trim()}
                          className="w-12 h-12 flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 transition-colors"
                        >
                          {isLoadingRepeat ? (
                            <Spinner size="sm" color="white" />
                          ) : (
                            <Send size={20} className="text-white" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Debug info */}
      {debug && (
        <div className="absolute bottom-28 left-4 right-4 bg-amber-100 border border-amber-300 text-amber-800 p-2 rounded text-sm text-center">
          {debug}
        </div>
      )}

      {/* Toast notification */}
      {showToast && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-3 py-1 rounded text-sm transition-opacity">
          Start eerst een gesprek
        </div>
      )}
    </div>
  );
}
