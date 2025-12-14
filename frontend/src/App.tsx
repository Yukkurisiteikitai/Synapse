import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'
import NotFound from './pages/NotFound'
import SearchPage from './pages/SearchPage';

function App() {
    return (
        <Routes>
            {/* ホームページ */}
            <Route path="/" element={<HomePage />} />

            {/* ルームページ */}
            <Route path="/room/:roomId" element={<RoomPage />} />

            {/* search */}
            <Route path="/search" element={<SearchPage />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    )
}

export default App