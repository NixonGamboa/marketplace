import { BrowserRouter, Routes, Route } from 'react-router-dom'
import OrdersList from './features/orders/OrdersList'

function OrderDetailPlaceholder() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-bold">Detalle del pedido</h1>
      <p className="text-gray-600 mt-2">Implementado en TASK-020</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">MAUI Admin</h1>
            <span className="text-sm text-gray-500">· Leche y Miel</span>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<OrdersList />} />
            <Route path="/pedido/:orderId" element={<OrderDetailPlaceholder />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
