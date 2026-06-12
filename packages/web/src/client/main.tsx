import { createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
        },
    },
})

const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    )
}

// Mount to DOM
const rootEl = document.getElementById('root')
if (rootEl) {
    createRoot(rootEl).render(<App />)
}
