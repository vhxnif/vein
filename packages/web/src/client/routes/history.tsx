// ponytail: History merged into Ask multi-turn sessions. Redirect to /.
import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/history')({
    component: HistoryRedirect,
})

function HistoryRedirect() {
    return <Navigate to="/" />
}
