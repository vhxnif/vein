import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/Layout'
import { ImportProvider } from '../lib/import-context'
import { ProjectProvider } from '../lib/project'
import { SearchProvider } from '../lib/search-context'

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
