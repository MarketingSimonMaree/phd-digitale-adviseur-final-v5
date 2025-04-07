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
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMode, setChatMode] = useState("text_mode");
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [session_id, setSessionId] = useState<string>();
  
  // Refs
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const messageBuffer = useRef<string>('');
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeRef = useRef(0);
  const [loopCount, setLoopCount] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hasPlayedWithSound, setHasPlayedWithSound] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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
  async function fetchAccessToken() {
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
  async function startSession() {
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
        // Only include the token as this is the only valid property
        // in StreamingAvatarApiConfig according to the type definition
      });

      // Add event listeners for avatar feedback
      setupAvatarEventListeners();

      // Mount the avatar - use type assertion if method exists but isn't in type definition
      if (mediaStream.current && avatar.current) {
        // The SDK might have evolved and the types might not be up to date
        // We'll need to check the actual API implementation
        if (typeof (avatar.current as any).mount === 'function') {
          (avatar.current as any).mount(mediaStream.current);
        }
        
        // Similarly for start method
        if (typeof (avatar.current as any).start === 'function') {
          (avatar.current as any).start();
        }
      }

      // Start the avatar with minimal configuration to satisfy type checking
      const res = await (avatar.current as any).createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: AVATAR_ID,
        knowledgeId: KNOWLEDGE_BASE_ID,
        language: LANGUAGE,
        disableIdleTimeout: true  // Using camelCase as per TypeScript convention
      });
      
      // Log de nieuwe sessie
      await logSession();
      setData(res);
      
      // Set stream
      if (avatar.current.mediaStream) {
        setStream(avatar.current.mediaStream);
      }

      // Send welcome message with proper request format
      setTimeout(() => {
        if (avatar.current) {
          // Welkomstbericht alleen afspelen, niet toevoegen aan messages
          (avatar.current as any).speak({
            text: "Hoi",
            taskType: TaskType.TALK,
            taskMode: TaskMode.SYNC,
            skipMessage: true  // Custom flag om aan te geven dat dit bericht niet in chat moet
          });
        }
      }, 1000);
      
      // Set default mode to text
      setChatMode("text_mode");
      
      // Wacht even en start dan voice chat
      setTimeout(async () => {
        try {
          if (avatar.current) {
            await (avatar.current as any).startVoiceChat({
              useSilencePrompt: true,  // Gewijzigd naar true
              silenceTimeout: 5000,    // Optioneel: 5 seconden stilte timeout
              isInputAudioMuted: false
            });
          }
        } catch (error) {
          console.error("Error starting voice chat:", error);
          setDebug(`Voice chat error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, 100);
      
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
  function setupAvatarEventListeners() {
    if (!avatar.current) return;
    
    // AVATAR_START_TALKING: Emitted when the avatar starts speaking
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (event) => {
      console.log("Avatar started talking", event);
    });
    
    // AVATAR_STOP_TALKING: Emitted when the avatar stops speaking
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
      console.log("Avatar stopped talking", event);
    });
    
    // STREAM_DISCONNECTED: Triggered when the stream disconnects
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    
    // STREAM_READY: Indicates that the stream is ready for display
    avatar.current.on(StreamingEvents.STREAM_READY, (event) => {
      console.log("Stream ready:", event.detail);
      setStream(event.detail);
    });
    
    // USER_START: Indicates when the user starts speaking
    avatar.current.on(StreamingEvents.USER_START, (event) => {
      console.log("User started talking", event);
      setIsUserTalking(true);
    });
    
    // USER_STOP: Indicates when the user stops speaking
    avatar.current.on(StreamingEvents.USER_STOP, (event) => {
      console.log("User stopped talking", event);
      setIsUserTalking(false);
    });
    
    // USER_SILENCE: Indicates when the user is silent
    avatar.current.on(StreamingEvents.USER_SILENCE, () => {
      console.log("User is silent");
    });
    
    // USER_TALKING_MESSAGE: Voor alle user input (spraak én tekst)
    avatar.current.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
      console.log('User message event:', event);
      if (event.detail?.message) {
        if (chatMode === 'voice_mode') {
          // Voor spraak: voeg het bericht twee keer toe
          setMessages(prev => [...prev, 
            {
              text: event.detail.message,
              sender: 'user'
            },
            {
              text: event.detail.message,
              sender: 'user'
            }
          ]);
        } else {
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
        }

        // Log het bericht naar Supabase
        if (session_id) {
          logMessage(session_id, {
            sender: 'user',
            message: event.detail.message
          });
        }
      }
    });

    // AVATAR_TALKING_MESSAGE: Voor avatar responses met zin-buffering
    avatar.current.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
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

    // Interrupt handler
    const handleInterrupt = async () => {
      if (avatar.current) {
        try {
          await avatar.current.interrupt();
        } catch (error) {
          console.error('Interrupt error:', error);
        }
      }
    };

    // Voice chat configuratie met snelle reactie
    if (chatMode === 'voice_mode') {
      try {
        avatar.current.startVoiceChat({
          useSilencePrompt: true,
          isInputAudioMuted: false
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
  async function endSession() {
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
    } catch (error) {
      console.error("Error ending session:", error);
      setDebug(`End session error: ${error instanceof Error ? error.message : String(error)}`);
      avatar.current = null;
      setStream(null);
    }
  }

  // Send message to avatar
  async function handleSpeak() {
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
  const handleModeChange = async (newMode: 'text_mode' | 'voice_mode') => {
    if (newMode === chatMode || !avatar.current) return;

    try {
      if (newMode === 'voice_mode') {
        await (avatar.current as any).startVoiceChat({
          useSilencePrompt: true,
          silenceTimeout: 100,        // Verlaagd naar 1 seconde
          silenceThreshold: -50,       // Gevoeliger silence detection
          isInputAudioMuted: false,
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSpeak();
    }
  };

  // Show toast when trying to interact without starting
  const handleDisabledClick = () => {
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
  const handleVideoEnd = () => {
    console.log("Video ended, setting muted to true");
    setIsMuted(true);
  };

  // Log when muted status changes
  useEffect(() => {
    console.log("Muted status changed:", isMuted);
  }, [isMuted]);

  const createSession = async () => {
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
  const handleClear = useCallback(async () => {
    if (session_id) {
      console.log('Clearing chat and ending session:', session_id);
      const result = await endSession();
      console.log('Session end result:', result);
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
        <div className="absolute bottom-28 left-4 right-4 bg-red-100 border border-red-300 text-red-800 p-2 rounded text-sm">
          <strong>Debug:</strong> {debug}
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
