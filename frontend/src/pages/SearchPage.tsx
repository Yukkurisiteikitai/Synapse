import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { searchGoogle, SearchResult } from '../lib/search';
import { supabase, getSession } from '../lib/supabase';
import { createOrGetRoom, getRooms } from '../lib/rooms';
import ChatInterface from '../components/ChatInterface';
import '../styles/SearchPage.css';

interface RoomListItem {
    id: string;
    dbId: string;
    created_by: string;
    created_at: string;
    participant_count?: number;
}

interface GoogleAppsIconProps {
    className?: string;
    size?: number;
    color?: string;
}

const GoogleAppsIcon: React.FC<GoogleAppsIconProps> = ({
    className = '',
    size = 24,
    color = 'currentColor'
}) => {
    return (
        <svg
            className={className}
            focusable="false"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill={color}
        >
            <path d="M6,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM16,6c0,1.1 0.9,2 2,2s2,-0.9 2,-2 -0.9,-2 -2,-2 -2,0.9 -2,2zM12,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2z" />
        </svg>
    );
};

export default function SearchPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeRoomId = searchParams.get('v');
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totalResults, setTotalResults] = useState<string>('0');
    const [showApps, setShowApps] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [session, setSession] = useState<any>(null);
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [roomInput, setRoomInput] = useState('');
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settingsName, setSettingsName] = useState('');
    const [settingsAvatarUrl, setSettingsAvatarUrl] = useState('');
    const [theme] = useState<'light' | 'dark'>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    });
    const query = searchParams.get('q');
    const [currentPage, setCurrentPage] = useState(1);
    const resultsPerPage = 10;
    const [loadingRooms, setLoadingRooms] = useState(false);
    const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [rooms, setRooms] = useState<RoomListItem[]>([]);

    useEffect(() => {
        const query = searchParams.get('q');
        const page = parseInt(searchParams.get('page') || '1');

        if (query) {
            setSearchQuery(query);
            setCurrentPage(page);
            performSearch(query, page);
        }
    }, [searchParams]);

    const handlePageChange = (page: number) => {
        const params: Record<string, string> = {
            q: searchQuery,
            page: page.toString()
        };
        if (activeRoomId) {
            params.v = activeRoomId;
        }
        setSearchParams(params);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const totalPages = Math.min(Math.ceil(parseInt(totalResults) / resultsPerPage), 10); // Googleは最大10ページ

    useEffect(() => {
        document.title = query ? `${query} - Synapse Search` : 'Synapse Search';

        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.setAttribute('name', 'description');
            document.head.appendChild(metaDescription);
        }
        metaDescription.setAttribute('content', `${query}の検索結果`);

        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
            ogTitle = document.createElement('meta');
            ogTitle.setAttribute('property', 'og:title');
            document.head.appendChild(ogTitle);
        }
        ogTitle.setAttribute('content', `${query} - Synapse検索`);
    }, [query]);

    useEffect(() => {
        const query = searchParams.get('q');
        if (query) {
            setSearchQuery(query);
            performSearch(query);
        }
    }, [searchParams]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                setSession(data.session);
                loadUserProfile(data.session.user);
            }
        });

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user) loadUserProfile(session.user);
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    const handleOpenSettings = () => {
        setSettingsName(displayName);
        setSettingsAvatarUrl(avatarUrl || '');
        setShowSettingsModal(true);
        setShowProfileMenu(false);
    };

    const handleJoinExistingRoom = (roomId: string) => {
        setSearchParams({ v: roomId });
        setShowRoomModal(false);
    };

    const handleSaveSettings = async () => {
        if (!session?.user) return;

        try {
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name: settingsName, picture: settingsAvatarUrl }
            });
            if (authError) throw authError;

            const { error: dbError } = await supabase
                .from('users')
                .update({ display_name: settingsName, avatar_url: settingsAvatarUrl })
                .eq('email', email);

            if (dbError) console.warn('DB Update failed (might be missing column):', dbError);

            setDisplayName(settingsName);
            setAvatarUrl(settingsAvatarUrl);
            setShowSettingsModal(false);
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('プロフィールの更新に失敗しました');
        }
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        const roomName = newRoomName.trim();
        if (!roomName) return;

        try {
            const session = await getSession();
            if (!session?.user) {
                alert('ルームを作成するにはログインが必要です');
                return;
            }

            const { error } = await createOrGetRoom(roomName, session.user.id, {
                isPrivate,
                allowCreate: true,
            });

            if (error) {
                console.error('Failed to create room:', error);
                alert('ルームの作成に失敗しました (すでに存在する名前かもしれません)');
                return;
            }

            setSearchParams({ v: roomName });
            setShowCreateRoomModal(false);
            setNewRoomName('');
            setIsPrivate(false);
        } catch (err) {
            console.error('Unexpected error creating room:', err);
            alert('エラーが発生しました');
        }
    };

    const performSearch = async (query: string, page: number = 1) => {
        if (!query.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const startIndex = (page - 1) * resultsPerPage + 1;
            const data = await searchGoogle({
                query,
                num: resultsPerPage,
                start: startIndex
            });

            setResults(data.items || []);
            setTotalResults(data.searchInformation.totalResults);
        } catch (err) {
            setError(err instanceof Error ? err.message : '検索に失敗しました');
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleJoinRoom();
        }
    };

    const handleSearch = (e: React.FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        if (searchQuery.trim()) {
            const params: Record<string, string> = { q: searchQuery };
            if (activeRoomId) {
                params.v = activeRoomId;
            }
            setSearchParams(params);
        }
    };

    const getOrCreateUser = async (name: string, email: string) => {
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select()
            .eq('email', email)
            .maybeSingle();
        if (users && !fetchError) return users;
        const { data } = await supabase
            .from('users')
            .insert([{ display_name: name, email }])
            .select()
            .single();
        return data;
    };

    const handleJoinRoom = async () => {
        if (!session) {
            alert('ログインが必要です');
            return;
        }
        if (!roomInput.trim()) {
            alert('ルーム名を入力してください');
            return;
        }

        const roomId = roomInput.trim();
        const user = await getOrCreateUser(displayName, email);

        await supabase.from('participants').insert([
            { room_id: roomId, user_id: user.id, role: 'member' }
        ]);

        setSearchParams({ q: searchParams.get('q') || '', v: roomId });
        setShowRoomModal(false);
    };

    const loadUserProfile = async (user: any) => {
        const userName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            'No Name';

        setDisplayName(userName);
        setEmail(user.email ?? '');
        setAvatarUrl(user.user_metadata?.picture ?? null);
    };

    const handleBackToHome = () => {
        navigate('/');
    };

    const handleGoogleSignIn = async () => {
        await supabase.auth.signInWithOAuth({ provider: 'google' });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setDisplayName('');
        setEmail('');
    };

    const loadRooms = async () => {
        setLoadingRooms(true);
        try {
            const { data, error } = await getRooms(30);
            if (error) {
                console.error('Failed to fetch rooms:', error);
                setRooms([]);
                return;
            }

            if (!data) {
                setRooms([]);
                return;
            }

            const roomsWithCounts = await Promise.all(
                data.map(async (room) => {
                    const { count, error: countError } = await supabase
                        .from('participants')
                        .select('id', { count: 'exact', head: true })
                        .eq('room_id', room.id);

                    if (countError) {
                        console.warn('Failed to fetch participant count:', countError);
                    }

                    return {
                        id: room.room_name,
                        dbId: room.id,
                        created_by: room.created_by,
                        created_at: room.created_at,
                        participant_count: typeof count === 'number' ? count : 0,
                    } as RoomListItem;
                })
            );

            setRooms(roomsWithCounts);
        } catch (err) {
            console.error('Unexpected error loading rooms:', err);
            setRooms([]);
        } finally {
            setLoadingRooms(false);
        }
    };

    useEffect(() => {
        if (showRoomModal) {
            loadRooms();
        }
    }, [showRoomModal]);

    const apps = [
        { name: 'Chat', icon: '/images/icon.png', action: () => setShowRoomModal(true) },
    ];

    return (
        <div className={`search-page-container ${theme === 'dark' ? 'dark-mode' : ''} ${activeRoomId ? 'with-sidebar' : ''}`}>

            {/* Sidebar Chat Interface */}
            {activeRoomId && (
                <div className="sidebar-chat">
                    <ChatInterface
                        roomId={activeRoomId}
                        onClose={() => {
                            setSearchParams({ q: searchParams.get('q') || '' });
                        }}
                    />
                </div>
            )}

            {/* Main Content Wrapper */}
            <div className="search-content-wrapper">
                {/* ヘッダー */}
                <header className="search-page-header">
                    <div className="header-content">
                        <h1 className="logo" onClick={handleBackToHome} style={{ cursor: 'pointer' }}>
                            Synapse
                        </h1>

                        <form onSubmit={handleSearch} className="search-form-header">
                            <div className="search-box-header">
                                <span className="search-icon">
                                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                                </span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search"
                                    className="search-input-header"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="search-clear"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </form>

                        {/* Apps Icon */}
                        <button className="apps-button" onClick={() => { setShowProfileMenu(false); setShowApps(!showApps); }}>
                            <GoogleAppsIcon />
                            {/* Apps Dropdown */}
                            {showApps && (
                                <div className="apps-dropdown" style={{ width: `${Math.min(apps.length, 3) * 80}px` }}>
                                    <div className="apps-grid" style={{ gridTemplateColumns: `repeat(${Math.min(apps.length, 3)}, 1fr)` }}>
                                        {apps.map((app, index) => (
                                            <div key={index} className="app-item" onClick={app.action}>
                                                <div className="app-icon-wrapper">
                                                    <img src={app.icon} alt={app.name} className="app-icon" />
                                                </div>
                                                <span className="app-name">{app.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </button>

                        {/* Profile */}
                        {displayName ? (
                            <button
                                className="profile-button"
                                onClick={() => {
                                    setShowApps(false);
                                    setShowProfileMenu(!showProfileMenu);
                                }}
                                onBlur={() => setTimeout(() => setShowProfileMenu(false), 200)}
                            >
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="avatar" className="profile-avatar" />
                                ) : (
                                    <span className="profile-initial">
                                        {displayName[0]?.toUpperCase()}
                                    </span>
                                )}

                                {/* プロフィールメニュー */}
                                {showProfileMenu && (
                                    <div
                                        className="auth-dropdown"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="profile-header">
                                            <div className="profile-avatar-large">
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt="avatar" className="profile-avatar" />
                                                ) : (
                                                    <span className="profile-initial">
                                                        {displayName[0]?.toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="profile-name">{displayName}</div>
                                            <div className="profile-email">{session?.user?.email}</div>
                                        </div>
                                        <div className="profile-actions">
                                            <button
                                                onClick={handleOpenSettings}
                                                className="btn-settings">
                                                <FontAwesomeIcon icon={faGear} /> 設定
                                            </button>
                                            <button
                                                onClick={handleLogout}
                                                className="btn-logout">
                                                <FontAwesomeIcon icon={faRightFromBracket} /> ログアウト
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </button>
                        ) : (
                            <button className="login-button" onClick={handleGoogleSignIn}>
                                ログイン
                            </button>
                        )}
                    </div>
                </header>

                {/* メインコンテンツ */}
                <main className="search-page-main">
                    {loading && (
                        <div className="loading">検索中...</div>
                    )}

                    {error && (
                        <div className="error-message">
                            エラー: {error}
                        </div>
                    )}

                    {!loading && !error && totalResults !== '0' && (
                        <div className="results-info">
                            約 {parseInt(totalResults).toLocaleString()} 件の結果
                        </div>
                    )}

                    {!loading && !error && results.length === 0 && searchParams.get('q') && (
                        <div className="no-results">
                            <p>「{searchParams.get('q')}」に一致する情報は見つかりませんでした。</p>
                        </div>
                    )}

                    <div className="search-results">
                        {results.map((result, index) => (
                            <div key={index} className="search-result-item">
                                <div className="result-url">
                                    {result.favicon && (
                                        <img
                                            src={result.favicon}
                                            alt=""
                                            className="result-favicon"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    )}
                                    {result.displayLink}
                                </div>
                                <h3 className="result-title">
                                    <a
                                        href={result.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {result.title}
                                    </a>
                                </h3>
                                <p className="result-snippet">{result.snippet}</p>
                            </div>
                        ))}
                    </div>

                    {/* ページネーション */}
                    {!loading && !error && results.length > 0 && totalPages > 1 && (
                        <div className="pagination">
                            <button
                                className="pagination-btn"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                ← 前へ
                            </button>

                            <div className="pagination-numbers">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                    <button
                                        key={page}
                                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                                        onClick={() => handlePageChange(page)}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="pagination-btn"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                            >
                                次へ →
                            </button>
                        </div>
                    )}
                </main>

                {/* Room Creation Modal */}
                {showCreateRoomModal && (
                    <div className="modal-overlay" onClick={() => setShowCreateRoomModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>ルームを作成</h3>
                                <button className="close-button" onClick={() => setShowCreateRoomModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleCreateRoom}>
                                <div className="form-group">
                                    <label>ルーム名 (URLになります)</label>
                                    <input
                                        type="text"
                                        value={newRoomName}
                                        onChange={(e) => setNewRoomName(e.target.value)}
                                        placeholder="例: general, random, my-room"
                                        className="modal-input"
                                        pattern="[a-zA-Z0-9-_]+"
                                        title="半角英数字、ハイフン、アンダースコアのみ使用可能です"
                                        required
                                    />
                                </div>
                                <div className="form-group checkbox-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={isPrivate}
                                            onChange={(e) => setIsPrivate(e.target.checked)}
                                            className="room-private"
                                        />
                                        プライベートルームにする
                                    </label>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-modal-secondary" onClick={() => setShowCreateRoomModal(false)}>キャンセル</button>
                                    <button type="submit" className="btn-modal-primary">作成</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ルームモーダル */}
                {showRoomModal && (
                    <div className="modal-overlay" onClick={() => setShowRoomModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <button className="modal-close" onClick={() => setShowRoomModal(false)}>
                                ×
                            </button>

                            <h2 className="modal-title">ルームに参加</h2>
                            <p className="modal-subtitle">
                                既存のルームに参加するか、新しいルームを作成しましょう
                            </p>

                            <div className="modal-input-group">
                                <label htmlFor="room-name">ルーム名</label>
                                <input
                                    id="room-name"
                                    type="text"
                                    placeholder="例: my-room"
                                    value={roomInput}
                                    onChange={(e) => setRoomInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    autoFocus
                                />
                            </div>

                            <button className="btn-modal-primary" onClick={handleJoinRoom}>
                                このルームに参加
                            </button>

                            <div className="create-room-section">
                                <button
                                    className="btn-create-room"
                                    onClick={() => {
                                        setShowRoomModal(false);
                                        setShowCreateRoomModal(true);
                                    }}
                                >
                                    <i className="fa-solid fa-plus"></i>
                                    新しいルームを作成する
                                </button>
                            </div>

                            <div className="modal-divider">
                                <span>ルーム一覧</span>
                            </div>

                            <div className="active-rooms">
                                {loadingRooms ? (
                                    <p style={{ color: '#999', textAlign: 'center' }}>読み込み中...</p>
                                ) : rooms.length === 0 ? (
                                    <p style={{ color: '#999', textAlign: 'center' }}>
                                        まだルームがありません。<br />上記から新しいルームを作成してください。
                                    </p>
                                ) : (
                                    <div className="room-list">
                                        {rooms.map((room) => (
                                            <button
                                                key={room.id}
                                                className="room-item"
                                                onClick={() => handleJoinExistingRoom(room.id)}
                                            >
                                                <span className="room-name">{room.id}</span>
                                                <span className="room-count">
                                                    <i className="fa-solid fa-user"></i> {room.participant_count || 0}人
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Settings Modal */}
                {showSettingsModal && (
                    <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <button className="modal-close" onClick={() => setShowSettingsModal(false)}>
                                ×
                            </button>

                            <h2 className="modal-title">プロフィール設定</h2>

                            <div className="modal-input-group">
                                <label>表示名</label>
                                <input
                                    type="text"
                                    value={settingsName}
                                    onChange={(e) => setSettingsName(e.target.value)}
                                    placeholder="表示名を入力"
                                />
                            </div>

                            <div style={{ marginTop: '20px' }}>
                                {settingsAvatarUrl && (
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                                        <img
                                            src={settingsAvatarUrl}
                                            alt="Preview"
                                            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    </div>
                                )}
                            </div>

                            <button className="btn-modal-primary" onClick={handleSaveSettings}>
                                保存
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}