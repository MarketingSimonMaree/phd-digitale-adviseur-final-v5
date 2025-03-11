import React, { useEffect, useRef } from 'react';
import { logMessage } from '@/utils/sessionLogger';

interface Message {
  text: string;
  sender: 'avatar' | 'user';
}

interface Props {
  messages: Array<{ text: string; sender: 'avatar' | 'user' }>;
  onClear: () => void;
  session_id?: string;
}

export default function ChatMessages({ messages, onClear, session_id }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  useEffect(() => {
    const logNewMessage = async () => {
      if (session_id && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        try {
          await logMessage(session_id, {
            sender: lastMessage.sender,
            message: lastMessage.text
          });
        } catch (error) {
          console.error('Error logging message:', error);
        }
      }
    };

    logNewMessage();
  }, [messages, session_id]);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  return (
    <div className="mb-20 h-[40vh] flex flex-col w-[80%] ml-auto mr-4">
      {/* Header met kruisknop */}
      <div className="sticky top-0 z-20 p-3 flex justify-between items-center">
        <button 
          className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-[#ce861b] text-white transition-colors ml-auto"
          onClick={onClear}
        >
          ✕
        </button>
      </div>
      
      {/* Berichten container met mask voor fade-out */}
      <div 
        className="overflow-y-auto flex-1 p-4 relative pb-8"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%)'
        }}
      >
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              } mb-2 animate-[fadeInUp_0.3s_ease-out]`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  message.sender === 'user'
                    ? 'bg-[#ce861b] text-white'
                    : 'bg-white/90 backdrop-blur-sm text-black shadow-sm'
                }`}
              >
                <p className="text-[15px]">
                  {message.text}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}