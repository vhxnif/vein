import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/Layout'
import { ImportProvider } from '../lib/import-context'
import { ProjectProvider } from '../lib/project'

export const Route = createRootRoute({
    component: () => (
        <ProjectProvider>
            <ImportProvider>
                <Layout>
                    <Outlet />
                </Layout>
            </ImportProvider>
        </ProjectProvider>
    ),
})
