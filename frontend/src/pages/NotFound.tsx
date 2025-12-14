import { Link } from 'react-router-dom'
import '../styles/NotFound.css'

function NotFound() {
    return (
        <div className="not-found">
            <h1>Synapse</h1>
            <p>404 Not Found.</p>
            <Link to="/" className="btn-primary">
                ホームに戻る
            </Link>
        </div>
    )
}

export default NotFound