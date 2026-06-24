import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/Layout.tsx'
import { ImportProvider } from '../lib/import-context.tsx'
import { ProjectProvider } from '../lib/project.tsx'
import { SearchProvider } from '../lib/search-context.tsx'

export const Route = createRootRoute({
    component: () => (
        <ProjectProvider>
            <ImportProvider>
                <SearchProvider>
                    <Layout>
                        <Outlet />
                    </Layout>
                </SearchProvider>
            </ImportProvider>
        </ProjectProvider>
    ),
})
