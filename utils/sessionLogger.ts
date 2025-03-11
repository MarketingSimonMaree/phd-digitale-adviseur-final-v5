import { createClient } from '@supabase/supabase-js'

// Gebruik de public/anon key voor niet-ingelogde gebruikers
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // Gebruik de anonieme key
)

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minuten in milliseconds

interface ActiveSession {
  id: string;
  lastActivity: number;
}

let currentSession: ActiveSession | null = null;

async function isSessionValid(): Promise<boolean> {
  if (!currentSession) return false;

  const now = Date.now();
  const timeSinceLastActivity = now - currentSession.lastActivity;

  if (timeSinceLastActivity > SESSION_TIMEOUT) {
    console.log('Session timed out:', {
      session_id: currentSession.id,
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
    const session_id = crypto.randomUUID();
    console.log('Creating new session:', session_id);
    
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        session_id: session_id,
        start_time: new Date().toISOString(),
        status: 'active'
      })
      .select();

    if (error) {
      console.error('Failed to create session:', error);
      return null;
    }

    currentSession = {
      id: session_id,
      lastActivity: Date.now()
    };

    console.log('Session created successfully:', {
      session_id,
      timestamp: new Date().toISOString()
    });
    
    return session_id;
  } catch (e) {
    console.error('Exception in logSession:', e);
    return null;
  }
}

export async function logMessage(session_id: string, messageData: {
  sender: 'user' | 'ai' | 'avatar';
  message: string;
}): Promise<boolean> {
  try {
    const isValid = await isSessionValid();
    
    if (!isValid) {
      const new_session_id = await logSession();
      if (!new_session_id) {
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
        session_id: currentSession.id,
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
      session_id: currentSession.id,
      sender: normalizedSender,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (e) {
    console.error('Exception in logMessage:', e);
    return false;
  }
}

export async function endSession(session_id: string): Promise<boolean> {
  if (!session_id) {
    console.error('No session_id provided to endSession');
    return false;
  }

  try {
    console.log('Ending session:', session_id);

    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        end_time: new Date().toISOString()
      })
      .match({ session_id: session_id });

    if (error) {
      console.error('Failed to end session:', error);
      return false;
    }

    if (currentSession?.id === session_id) {
      currentSession = null;
    }

    console.log('Session ended successfully:', session_id);
    return true;
  } catch (e) {
    console.error('Exception in endSession:', e);
    return false;
  }
} 