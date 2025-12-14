import { supabase } from './supabase';

const CLEANUP_DELAY_MS = 60_000;
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearRoomCleanup = (roomId: string) => {
    const timer = roomCleanupTimers.get(roomId);
    if (timer) {
        clearTimeout(timer);
        roomCleanupTimers.delete(roomId);
    }
};

const scheduleRoomCleanup = (roomId: string) => {
    clearRoomCleanup(roomId);

    const timer = setTimeout(async () => {
        roomCleanupTimers.delete(roomId);

        try {
            const { count, error: countError } = await supabase
                .from('participants')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId);

            if (countError) {
                console.error('Failed to fetch participant count during cleanup:', countError);
                return;
            }

            if ((count ?? 0) > 0) {
                return;
            }

            const { error: deleteMessagesError } = await supabase
                .from('messages')
                .delete()
                .eq('room_id', roomId);

            if (deleteMessagesError) {
                console.warn('Failed to delete room messages during cleanup:', deleteMessagesError);
            }

            const { error: deleteRoomError } = await supabase
                .from('rooms')
                .delete()
                .eq('id', roomId);

            if (deleteRoomError) {
                console.error('Failed to delete room during cleanup:', deleteRoomError);
            }
        } catch (cleanupError) {
            console.error('Unexpected error during room cleanup:', cleanupError);
        }
    }, CLEANUP_DELAY_MS);

    roomCleanupTimers.set(roomId, timer);
};

export interface Room {
    id: string;
    room_name: string;
    is_private: boolean;
    created_by: string;
    created_at: string;
}

export interface Participant {
    id: string;
    room_id: string;
    user_id: string;
    user_name: string;
    role: string;
    joined_at: string;
}

/**
 * ルームを作成または取得する
 */
interface CreateOrGetRoomOptions {
    isPrivate?: boolean;
    allowCreate?: boolean;
}

export const createOrGetRoom = async (
    roomName: string,
    userId: string,
    { isPrivate = false, allowCreate = false }: CreateOrGetRoomOptions = {}
) => {
    try {
        // まず既存のルームを検索 (名前で検索)
        const { data: existingRoom, error: fetchError } = await supabase
            .from('rooms')
            .select('*')
            .eq('room_name', roomName)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching room:', fetchError);
            return { data: null, error: fetchError };
        }

        // 既存のルームがあればそれを返す
        if (existingRoom) {
            return { data: existingRoom, error: null };
        }

        if (!allowCreate) {
            const notFoundError = new Error('Room not found');
            (notFoundError as any).code = 'ROOM_NOT_FOUND';
            return { data: null, error: notFoundError };
        }

        // 新しいルームを作成
        // Note: is_private column needs to be added to the DB if not exists
        const { data: newRoom, error: createError } = await supabase
            .from('rooms')
            .insert([
                {
                    room_name: roomName,
                    created_by: userId,
                    is_private: isPrivate
                }
            ])
            .select()
            .single();

        if (createError) {
            console.error('Error creating room:', createError);
            return { data: null, error: createError };
        }

        return { data: newRoom, error: null };
    } catch (error) {
        console.error('Unexpected error in createOrGetRoom:', error);
        return { data: null, error };
    }
};

/**
 * ルームに参加する
 */
export const joinRoom = async (roomId: string, userId: string, userName: string) => {
    try {
        // 既に参加しているか確認
        const { data: existingParticipant, error: checkError } = await supabase
            .from('participants')
            .select('*')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking participant:', checkError);
            return { error: checkError };
        }

        // 既に参加していればスキップ
        if (existingParticipant) {
            clearRoomCleanup(roomId);
            return { error: null };
        }

        // 新規参加
        const { error: insertError } = await supabase
            .from('participants')
            .insert([
                {
                    room_id: roomId,
                    user_id: userId,
                    user_name: userName,
                    role: 'member'
                }
            ]);

        if (insertError) {
            console.error('Error joining room:', insertError);
            return { error: insertError };
        }

        clearRoomCleanup(roomId);
        return { error: null };
    } catch (error) {
        console.error('Unexpected error in joinRoom:', error);
        return { error };
    }
};

/**
 * ルームから退出する
 */
export const leaveRoom = async (roomId: string, userId: string) => {
    try {
        const { error } = await supabase
            .from('participants')
            .delete()
            .eq('room_id', roomId)
            .eq('user_id', userId);

        if (error) {
            console.error('Error leaving room:', error);
            return { error };
        }

        scheduleRoomCleanup(roomId);
        return { error: null };
    } catch (error) {
        console.error('Unexpected error in leaveRoom:', error);
        return { error };
    }
};

/**
 * ルーム一覧を取得する
 */
export const getRooms = async (limit: number = 10) => {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('is_private', false) // Only show public rooms
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching rooms:', error);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (error) {
        console.error('Unexpected error in getRooms:', error);
        return { data: null, error };
    }
};

/**
 * ルームの参加者を取得する
 */
export const getRoomParticipants = async (roomId: string) => {
    try {
        const { data, error } = await supabase
            .from('participants')
            .select('*')
            .eq('room_id', roomId);

        if (error) {
            console.error('Error fetching participants:', error);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (error) {
        console.error('Unexpected error in getRoomParticipants:', error);
        return { data: null, error };
    }
};