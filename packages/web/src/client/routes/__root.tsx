import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/Layout'
import { ProjectProvider } from '../lib/project'

export const Route = createRootRoute({
    component: () => (
        <ProjectProvider>
            <Layout>
                <Outlet />
            </Layout>
        </ProjectProvider>
    ),
})
