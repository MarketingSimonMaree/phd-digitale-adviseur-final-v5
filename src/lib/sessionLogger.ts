import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Constante voor session timeout (5 minuten in milliseconden)
const SESSION_TIMEOUT = 5 * 60 * 1000;

// Interface voor session tracking
interface ActiveSession {
  id: string;
  lastActivity: number;
}

// Houdt de actieve sessie bij
let currentSession: ActiveSession | null = null;

/**
 * Controleert of een sessie nog actief is
 */
async function isSessionValid(): Promise<boolean> {
  if (!currentSession) return false;

  const now = Date.now();
  const timeSinceLastActivity = now - currentSession.lastActivity;

  if (timeSinceLastActivity > SESSION_TIMEOUT) {
    console.log('Session timed out:', {
      sessionId: currentSession.id,
      inactiveTime: timeSinceLastActivity
    });
    await endSession(currentSession.id);
    currentSession = null;
    return false;
  }

  return true;
}

export async function logSession(): Promise<string | null> {
  try {
    const sessionId = crypto.randomUUID();
    console.log('Creating new session:', sessionId);
    
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        session_id: sessionId,
        start_time: new Date().toISOString(),
        status: 'active'
      })
      .select();

    if (error) {
      console.error('Failed to create session:', error);
      return null;
    }

    currentSession = {
      id: sessionId,
      lastActivity: Date.now()
    };

    console.log('Session created successfully:', {
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    return sessionId;
  } catch (e) {
    console.error('Exception in logSession:', e);
    return null;
  }
}

export async function logMessage(messageData: {
  sender: 'user' | 'ai' | 'avatar';
  message: string;
}): Promise<boolean> {
  try {
    const isValid = await isSessionValid();
    
    if (!isValid) {
      const newSessionId = await logSession();
      if (!newSessionId) {
        console.error('Failed to create new session for message');
        return false;
      }
    }

    if (!currentSession) {
      console.error('No active session available');
      return false;
    }

    currentSession.lastActivity = Date.now();

    const normalizedSender = messageData.sender === 'ai' ? 'avatar' : messageData.sender;

    const { data: existingMessage } = await supabase
      .from('messages')
      .select()
      .match({
        session_id: currentSession.id,
        message: messageData.message,
        sender: normalizedSender
      })
      .single();

    if (existingMessage) {
      console.log('Duplicate message detected:', {
        sessionId: currentSession.id,
        message: messageData.message
      });
      return true;
    }

    const { error } = await supabase
      .from('messages')
      .insert({
        session_id: currentSession.id,
        sender: normalizedSender,
        message: messageData.message,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to log message:', error);
      return false;
    }

    console.log('Message logged successfully:', {
      sessionId: currentSession.id,
      sender: normalizedSender,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (e) {
    console.error('Exception in logMessage:', e);
    return false;
  }
}

export async function endSession(sessionId: string): Promise<boolean> {
  if (!sessionId) {
    console.error('No sessionId provided to endSession');
    return false;
  }

  try {
    console.log('Ending session:', sessionId);

    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        end_time: new Date().toISOString()
      })
      .match({ session_id: sessionId });

    if (error) {
      console.error('Failed to end session:', error);
      return false;
    }

    if (currentSession?.id === sessionId) {
      currentSession = null;
    }

    console.log('Session ended successfully:', sessionId);
    return true;
  } catch (e) {
    console.error('Exception in endSession:', e);
    return false;
  }
} 