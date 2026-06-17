import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react'
import { fetchProjects } from './api'

interface ProjectContextType {
    project: string | null
    setProject: (name: string | null) => void
    projects: { name: string; path: string }[]
    loading: boolean
}

const ProjectContext = createContext<ProjectContextType>({
    project: null,
    setProject: () => {
        /* no-op */
    },
    projects: [],
    loading: false,
})

const STORAGE_KEY = 'vein-project'

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [project, setProjectState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(STORAGE_KEY)
        }
        return null
    })
    const [projects, setProjects] = useState<{ name: string; path: string }[]>(
        []
    )
    const [loading, setLoading] = useState(true)

    // Load project list
    useEffect(() => {
        fetchProjects()
            .then(setProjects)
            .catch(() => setProjects([]))
            .finally(() => setLoading(false))
    }, [])

    const setProject = useCallback((name: string | null) => {
        setProjectState(name)
        if (name) {
            localStorage.setItem(STORAGE_KEY, name)
        } else {
            localStorage.removeItem(STORAGE_KEY)
        }
    }, [])

    return (
        <ProjectContext.Provider
            value={{ project, setProject, projects, loading }}
        >
            {children}
        </ProjectContext.Provider>
    )
}

export function useProject() {
    return useContext(ProjectContext)
}

/** Get the project header value for API requests */
export function getProjectHeader(): string | undefined {
    if (typeof window !== 'undefined') {
        const p = localStorage.getItem(STORAGE_KEY)
        return p || undefined
    }
    return undefined
}
