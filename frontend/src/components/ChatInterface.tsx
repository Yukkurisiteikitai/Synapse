import { useState, useEffect, useRef } from 'react';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightFromBracket, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { getSession } from '../lib/supabase';
import { createOrGetRoom, joinRoom, leaveRoom } from '../lib/rooms';
import '../styles/RoomPage.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

interface Message {
    id?: string;
    user: string;
    userId: string;
    text: string;
    timestamp: number;
}

interface CursorData {
    user: string;
    x: number;
    y: number;
    color: string;
}

interface ChatInterfaceProps {
    roomId: string;
    onClose?: () => void;
}

export default function ChatInterface({ roomId, onClose }: ChatInterfaceProps) {
    const [username, setUsername] = useState('');
    const [currentRoomId, setCurrentRoomId] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [onlineCount, setOnlineCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const cursorChannelRef = useRef<RealtimeChannel | null>(null);
    const chatChannelRef = useRef<RealtimeChannel | null>(null);
    const myUserIdRef = useRef<string>('');
    const myColorRef = useRef<string>('');
    const supabaseRef = useRef<SupabaseClient | null>(null);
    const currentRoomIdRef = useRef<string | null>(null);

    const addMessages = (newMsgs: Message | Message[]) => {
        setMessages(prev => {
            const msgsToAdd = Array.isArray(newMsgs) ? newMsgs : [newMsgs];
            if (msgsToAdd.length === 0) return prev;

            const seenKeys = new Set(
                prev.map(m => (m.id ? `id:${m.id}` : `tmp:${m.userId}-${m.timestamp}-${m.text}`))
            );

            const merged = [...prev];
            msgsToAdd.forEach(msg => {
                const key = msg.id ? `id:${msg.id}` : `tmp:${msg.userId}-${msg.timestamp}-${msg.text}`;
                if (seenKeys.has(key)) return;
                seenKeys.add(key);
                merged.push(msg);
            });

            return merged.sort((a, b) => a.timestamp - b.timestamp);
        });
    };

    useEffect(() => {
        const initializeRoom = async () => {
            try {
                const session = await getSession();
                if (!session?.user?.email) {
                    alert('ログインが必要です');
                    if (onClose) onClose();
                    return;
                }

                const email = session.user.email;
                const local = email.split('@')[0];
                const cleaned = local.replace(/[._]+/g, ' ');
                const words = cleaned.split(/\s+/).filter(Boolean);
                const displayName = words.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                setUsername(displayName);
                myUserIdRef.current = session.user.id;
                myColorRef.current = colors[Math.floor(Math.random() * colors.length)];

                if (!roomId) return;

                const { data: room, error: roomError } = await createOrGetRoom(roomId, session.user.id);

                if (roomError || !room) {
                    console.error('Room creation/fetch failed:', roomError);
                    alert('ルームの取得に失敗しました');
                    if (onClose) onClose();
                    return;
                }

                const dbRoomId = room.id;
                setCurrentRoomId(dbRoomId);
                currentRoomIdRef.current = dbRoomId; 
                const { error: joinError } = await joinRoom(dbRoomId, session.user.id, displayName);

                if (joinError) {
                    console.error('Join room failed:', joinError);
                }

                const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                initializeSupabase(supabaseClient, dbRoomId);

                const { data: history, error: historyError } = await supabaseClient
                    .from('messages')
                    .select('*')
                    .eq('room_id', dbRoomId)
                    .order('created_at', { ascending: true });

                if (!historyError && history) {
                    const formattedHistory: Message[] = history.map((m: any) => ({
                        id: m.id,
                        user: m.user_name,
                        userId: m.user_id,
                        text: m.content || m.text,
                        timestamp: new Date(m.created_at).getTime(),
                    }));
                    addMessages(formattedHistory);
                }

            } catch (error) {
                console.error('Room initialization failed:', error);
                if (onClose) onClose();
            } finally {
                setLoading(false);
            }
        };

        setMessages([]);
        setLoading(true);
        initializeRoom();

        return () => {
            if (currentRoomIdRef.current && myUserIdRef.current) {
                leaveRoom(currentRoomIdRef.current, myUserIdRef.current);
            }

            if (cursorChannelRef.current) {
                cursorChannelRef.current.unsubscribe();
            }
            if (chatChannelRef.current) {
                chatChannelRef.current.unsubscribe();
            }
        };
    }, [roomId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const initializeSupabase = (client: SupabaseClient, dbRoomId: string) => {
        const supabase = client || createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseRef.current = supabase;

        const cursorChannel = supabase.channel(`cursor:${dbRoomId}`, {
            config: {
                presence: {
                    key: myUserIdRef.current,
                },
            },
        });

        cursorChannel
            .on('presence', { event: 'sync' }, () => {
                const state = cursorChannel.presenceState();
                updateCursors(state);
                setOnlineCount(Object.keys(state).length);
            })
            .on('presence', { event: 'leave' }, () => {
            })
            .subscribe(async (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
                if (status === 'SUBSCRIBED') {
                    await cursorChannel.track({
                        user: username,
                        x: 0,
                        y: 0,
                        color: myColorRef.current,
                    });
                }
            });

        cursorChannelRef.current = cursorChannel;

        const chatChannel = supabase.channel(`chat:${dbRoomId}`, {
            config: {
                broadcast: { ack: true },
            },
        });

        chatChannel
            .on('broadcast', { event: 'message' }, ({ payload }: { payload: Message }) => {
                if (!payload) return;
                if (payload.userId === myUserIdRef.current) return;
                addMessages(payload);
            })
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `room_id=eq.${dbRoomId}`,
                },
                (payload: any) => {
                    const newMsg = payload.new;
                    if (!newMsg) return;
                    const formattedMsg: Message = {
                        id: newMsg.id,
                        user: newMsg.user_name,
                        userId: newMsg.user_id,
                        text: newMsg.content,
                        timestamp: new Date(newMsg.created_at).getTime(),
                    };
                    addMessages(formattedMsg);
                }
            )
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                }
            });

        chatChannelRef.current = chatChannel;
    };

    const updateCursors = (state: any) => {
        const newCursors = new Map<string, CursorData>();
        Object.entries(state).forEach(([userId, presence]: [string, any]) => {
            if (userId !== myUserIdRef.current && presence[0]) {
                const data = presence[0];
                newCursors.set(userId, {
                    user: data.user,
                    x: data.x,
                    y: data.y,
                    color: data.color,
                });
            }
        });
    };

    const handleSendMessage = async () => {
        const message = messageInput.trim();
        if (!message || !supabaseRef.current || !currentRoomId) return;

        setMessageInput('');

        const { data, error } = await supabaseRef.current
            .from('messages')
            .insert({
                room_id: currentRoomId,
                user_id: myUserIdRef.current,
                user_name: username,
                content: message,
            })
            .select()
            .single();

        if (error) {
            console.error('Error sending message:', error);
            alert('メッセージの送信に失敗しました');
            setMessageInput(message);
            return;
        }

        if (data) {
            const formattedMsg: Message = {
                id: data.id,
                user: data.user_name,
                userId: data.user_id,
                text: data.content,
                timestamp: new Date(data.created_at).getTime(),
            };
            addMessages(formattedMsg);

            if (chatChannelRef.current) {
                try {
                    await chatChannelRef.current.send({
                        type: 'broadcast',
                        event: 'message',
                        payload: formattedMsg,
                    });
                } catch (broadcastErr) {
                    console.error('Broadcast failed:', broadcastErr);
                }
            }
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    const handleExitRoom = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const roomToLeave = currentRoomIdRef.current;
        const userId = myUserIdRef.current;

        if (!roomToLeave || !userId) {
            if (onClose) onClose();
            return;
        }

        try {
            (cursorChannelRef.current as any)?.untrack?.();
            if (cursorChannelRef.current) {
                await cursorChannelRef.current.unsubscribe();
                cursorChannelRef.current = null;
            }

            if (chatChannelRef.current) {
                await chatChannelRef.current.unsubscribe();
                chatChannelRef.current = null;
            }

            const { error } = await leaveRoom(roomToLeave, userId);
            if (error) {
                console.error('退出に失敗しました:', error);
                alert('退出に失敗しました');
                return;
            }

            setOnlineCount(prev => Math.max(0, prev - 1));
            setMessages([]);
            setCurrentRoomId('');
            currentRoomIdRef.current = null;
            supabaseRef.current = null;
            setIsCollapsed(false);
        } catch (err) {
            console.error('退出処理でエラーが発生しました:', err);
            alert('退出処理でエラーが発生しました');
            return;
        } finally {
            if (onClose) onClose();
        }
    };

    if (loading) {
        return (
            <div className="chat-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="room-loading">読み込み中...</div>
            </div>
        );
    }

    return (
        <div
            className={`chat-container ${isCollapsed ? 'collapsed' : ''}`}
            onClick={isCollapsed ? () => setIsCollapsed(false) : undefined}
        >
            {isCollapsed && (
                <button
                    type="button"
                    className="chat-collapsed-toggle"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsCollapsed(false);
                    }}
                    aria-label="チャットを開く"
                >
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>
            )}
            <div className="chat-header">
                <button
                    type="button"
                    className="exit-button"
                    onClick={handleExitRoom}
                    title="ルームから退出する"
                >
                    <FontAwesomeIcon icon={faRightFromBracket} />
                    <span>退出</span>
                </button>
                <div className="chat-header-info">
                    <span className="chat-room-title"><i className="fa-jelly fa-regular fa-comment-dots"></i> {roomId}</span>
                    <span className="online-count"><i className="fa-solid fa-user"></i> {onlineCount}人</span>
                </div>
                <button
                    className="collapse-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsCollapsed(!isCollapsed);
                    }}
                    title={isCollapsed ? 'チャットを展開' : 'チャットを折りたたむ'}
                >
                    <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronLeft} />
                </button>
            </div>
            <div className="messages">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`message ${msg.userId === myUserIdRef.current ? 'own' : ''}`}
                    >
                        <div className="message-user">{msg.user}</div>
                        <div className="message-text">{msg.text}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="input-container">
                <input
                    type="text"
                    className="message-input"
                    placeholder="メッセージを入力..."
                    maxLength={200}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                />
                <button className="send-button" onClick={handleSendMessage}>
                    送信
                </button>
            </div>
        </div>
    );
}