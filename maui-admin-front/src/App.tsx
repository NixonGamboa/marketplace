import { BrowserRouter, Routes, Route } from 'react-router-dom'
import OrdersList from './features/orders/OrdersList'
import OrderDetail from './features/orders/OrderDetail'

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
            <Route path="/pedido/:orderId" element={<OrderDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
