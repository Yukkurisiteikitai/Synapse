import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key must be provided.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: 'http://localhost:5173',
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    })

    if (error) {
        console.error('Error signing in with Google:', error)
        throw error
    }

    return data
}

export const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
        console.error('Error signing out:', error)
        throw error
    }
}

export const getSession = async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
        console.error('Error getting session:', error)
        throw error
    }
    return data.session
}

export const onAuthStateChange = (callback: (session: any) => void) => {
    const { data } = supabase.auth.onAuthStateChange((_, session) => {
        callback(session)
    })
    return data.subscription
}