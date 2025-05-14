import { ArrowRight } from "lucide-react";

export default function OrdersPage({ user, orders, openAuth }) {
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <p className="text-lg font-medium mb-4">Sign in to view orders</p>
        <button
          onClick={openAuth}
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center"
        >
          Login <ArrowRight size={16} className="ml-1" />
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <p className="text-lg">No orders yet</p>
        <p className="text-sm">Place an order and it will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map(o => (
        <div key={o.id} className="border rounded-xl p-4 shadow-sm">
          <div className="flex justify-between mb-2 font-medium">
            <span>Order #{o.id}</span>
            <span>{o.date}</span>
          </div>
          <ul className="text-sm text-gray-700 mb-2">
            {o.items.map(i => (
              <li key={i.id}>
                {i.quantity}× {i.name} – ${i.discountedPrice.toFixed(2)}
              </li>
            ))}
          </ul>
          <div className="text-right font-bold">
            Total&nbsp;$ {(o.total).toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}

