import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, ListOrdered, Package, X, ImageOff } from 'lucide-react';

export default function OrderHistory({ user, isActive, supabaseClient }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentOrderForFeedback, setCurrentOrderForFeedback] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const fetchedForUserIdRef = useRef(null);
  const isCurrentlyFetchingRef = useRef(false);

  const fetchOrdersViaRpc = useCallback(async (currentUserId, currentSupabaseClient) => {
    if (!currentUserId || !currentSupabaseClient) {
      return { error: "User not available or system misconfiguration.", data: [] };
    }
    console.log(`[OrderHistory] RPC: Fetching orders (WITH ITEMS & FEEDBACK VIA RPC) for User ID: ${currentUserId}.`);
    try {
      const { data, error: rpcError } = await currentSupabaseClient
        .rpc('get_user_orders', { 
          p_user_id: currentUserId 
        });

      if (rpcError) throw rpcError;
      
      console.log("[OrderHistory] RPC: Orders fetched (WITH ITEMS & FEEDBACK VIA RPC):", (data || []).length);
      return { 
          data: (data || []).map(o => ({ 
              ...o, 
              hasorderitems: o.order_items || [], 
              givesfeedback: o.feedback_details || [] // CORRECTED: Map from feedback_details
          })), 
          error: null 
      };

    } catch (err) {
      console.error("[OrderHistory] RPC: Error fetching orders (WITH ITEMS & FEEDBACK VIA RPC):", err.message);
      return { error: `Failed to fetch order history via RPC: ${err.message}`, data: [] };
    }
  }, []); 

  useEffect(() => {
    // console.log(`[OrderHistory useEffect] Triggered. isActive: ${isActive}, user?.id: ${user?.id}, fetchedForUserIdRef: ${fetchedForUserIdRef.current}, isCurrentlyFetching: ${isCurrentlyFetchingRef.current}`);
    
    if (isActive && user && user.id && supabaseClient) {
      const shouldFetch = (fetchedForUserIdRef.current !== user.id) || (orders.length === 0 && !error);

      if (shouldFetch && !isCurrentlyFetchingRef.current) {
        // console.log(`[OrderHistory useEffect] Conditions met. Calling fetchOrdersViaRpc.`);
        isCurrentlyFetchingRef.current = true;
        setIsLoading(true);
        setError(null);
        
        fetchOrdersViaRpc(user.id, supabaseClient).then(result => {
            setOrders(result.data);
            if (result.error) {
                setError(result.error);
                fetchedForUserIdRef.current = null; 
            } else {
                fetchedForUserIdRef.current = user.id; 
            }
        }).finally(() => {
            setIsLoading(false);
            isCurrentlyFetchingRef.current = false;
        });
      }
    } else {
      if (isLoading) setIsLoading(false); 
      if (isCurrentlyFetchingRef.current) isCurrentlyFetchingRef.current = false;
      if (orders.length > 0 && (!isActive || !user)) { 
          setOrders([]);
          fetchedForUserIdRef.current = null; 
      }
      if (error && (!isActive || !user)) {
          setError(null); 
      }
    }
  }, [isActive, user, supabaseClient, fetchOrdersViaRpc, orders.length, error, isLoading]);


  const handleOpenFeedbackModal = (order) => {
    setCurrentOrderForFeedback(order);
    if (order.givesfeedback && order.givesfeedback.length > 0) {
      setFeedbackRating(order.givesfeedback[0].rating || 0);
      setFeedbackComment(order.givesfeedback[0].comment || '');
    } else {
      setFeedbackRating(0);
      setFeedbackComment('');
    }
    setIsFeedbackModalOpen(true);
  };

  const handleCloseFeedbackModal = () => {
    setIsFeedbackModalOpen(false);
    setCurrentOrderForFeedback(null);
    setFeedbackRating(0);
    setFeedbackComment('');
  };

  const handleSubmitFeedback = async () => {
    if (!currentOrderForFeedback || feedbackRating === 0 || !supabaseClient || !user || !user.id) {
      alert("Cannot submit feedback: Missing information or not logged in.");
      return;
    }
    if (isCurrentlyFetchingRef.current) {
        alert("Please wait, orders are currently being updated.");
        return;
    }
    setIsSubmittingFeedback(true);
    try {
      const { data: existingFeedbackRecords } = await supabaseClient
        .from('givesfeedback') 
        .select('feedback_id')
        .eq('order_id', currentOrderForFeedback.order_id)
        .eq('user_id', user.id);

      const existingFeedback = existingFeedbackRecords && existingFeedbackRecords.length > 0 ? existingFeedbackRecords[0] : null;

      const feedbackPayload = {
        order_id: currentOrderForFeedback.order_id,
        user_id: user.id, 
        rating: feedbackRating,
        comment: feedbackComment,
      };

      let response;
      if (existingFeedback && existingFeedback.feedback_id) {
        response = await supabaseClient.from('givesfeedback').update(feedbackPayload).eq('feedback_id', existingFeedback.feedback_id);
      } else {
        response = await supabaseClient.from('givesfeedback').insert(feedbackPayload);
      }

      const { error : submitError } = response;
      if (submitError) throw submitError;

      alert("Feedback submitted successfully!");
      handleCloseFeedbackModal();
      if (isActive && user && user.id && supabaseClient && !isCurrentlyFetchingRef.current) {
        isCurrentlyFetchingRef.current = true; setIsLoading(true); setError(null);
        fetchOrdersViaRpc(user.id, supabaseClient).then(result => {
            setOrders(result.data);
            if (result.error) { setError(result.error); fetchedForUserIdRef.current = null; }
            else { fetchedForUserIdRef.current = user.id; }
        }).finally(() => { setIsLoading(false); isCurrentlyFetchingRef.current = false; });
      }
    } catch (err) {
      console.error("[OrderHistory] Error submitting feedback:", err.message);
      alert(`Failed to submit feedback: ${err.message}`);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (!isActive) return null;
  if (!user) return <div className="text-center py-16 text-gray-500"><ListOrdered size={64} className="mx-auto mb-6 opacity-40" /><p className="text-xl font-semibold">Please log in</p><p>Log in to view your order history.</p></div>;
  if (!supabaseClient) return <div className="text-center py-16 text-gray-500"><p>Order History Unavailable: System component missing.</p></div>;
  
  if (isLoading) return <div className="flex justify-center items-center h-64 pt-10"><Loader2 className="animate-spin text-indigo-500" size={48} /><span className="ml-3 text-lg">Loading orders...</span></div>;
  
  if (error) return <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 my-6"><p><strong className="font-bold">Error:</strong> {error}</p><button onClick={() => { if (!isCurrentlyFetchingRef.current) { setIsLoading(true); setError(null); isCurrentlyFetchingRef.current = true; fetchOrdersViaRpc(user.id, supabaseClient).then(result => {setOrders(result.data); if(result.error) setError(result.error); else fetchedForUserIdRef.current = user.id;}).finally(()=>{setIsLoading(false); isCurrentlyFetchingRef.current = false;});} }} className="mt-2 bg-red-200 px-3 py-1 rounded">Try Again</button></div>;
  
  if (orders.length === 0 && !isLoading && !error) return <div className="text-center py-16 text-gray-500"><ListOrdered size={64} className="mx-auto mb-6 opacity-40" /><p className="text-xl font-semibold">No orders found.</p></div>;

  return (
    <div className="space-y-8 pb-6">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Your Orders</h2>
      {orders.map((order) => (
        <div key={order.order_id} className="bg-white p-5 rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-shadow">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 pb-4 border-b">
            <div>
              <p className="text-lg font-semibold text-indigo-700">Order #{order.order_id}</p>
              <p className="text-sm text-gray-500">Placed: {new Date(order.ordered_at).toLocaleString()}</p>
            </div>
            <span className={`mt-2 sm:mt-0 text-sm font-medium px-3 py-1 rounded-full ${
              order.status === 'Delivered' ? 'bg-green-100 text-green-700' : order.status === 'Processing' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
              {order.status || 'Status N/A'} 
            </span>
          </div>
          
          {order.hasorderitems && order.hasorderitems.length > 0 ? (
            <div className="space-y-3 mb-4">
              {order.hasorderitems.map((item, index) => (
                <div key={`${order.order_id}-${item.product_id}-${index}`} className="flex items-center justify-between text-sm py-2">
                  <div className="flex items-center space-x-3 flex-grow mr-2">
                    <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 shadow-inner overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt={item.product_name || ''} className="w-full h-full object-cover"/> : <ImageOff size={24} className="text-slate-400" />}
                    </div>
                    <div className="flex-grow min-w-0">
                      <span className="font-medium text-gray-800">{item.quantity}x </span>
                      <span className="text-gray-700 truncate inline-block align-bottom" title={item.product_name || 'Product Name Not Available'}>
                          {item.product_name || 'Product Name Not Available'}
                      </span>
                    </div>
                  </div>
                  <span className="font-semibold text-gray-800 whitespace-nowrap">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500 italic">No item details for this order.</p>}
          
          {order.status === 'Delivered' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {order.givesfeedback && order.givesfeedback.length > 0 ? (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <p className="text-sm font-semibold text-gray-700">Your Feedback:</p>
                  {order.givesfeedback[0].rating && <p className="text-sm text-yellow-500 mt-1">Rating: {'⭐'.repeat(order.givesfeedback[0].rating)}</p>}
                  {order.givesfeedback[0].comment && <p className="text-sm text-gray-600 mt-1 italic">"{order.givesfeedback[0].comment}"</p>}
                  <button
                    onClick={() => handleOpenFeedbackModal(order)}
                    className="mt-2 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-1 px-2 rounded transition-colors"
                  >
                    Edit Feedback
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleOpenFeedbackModal(order)}
                  className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors"
                >
                  Give Feedback
                </button>
              )}
            </div>
          )}
          <div className="text-right font-bold text-xl text-indigo-800 pt-4 border-t mt-4">Total: ${order.total_price?.toFixed(2) || 'N/A'}</div>
        </div>
      ))}

      {isFeedbackModalOpen && currentOrderForFeedback && (
         <div className="fixed inset-0 z-[60] flex justify-center items-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleCloseFeedbackModal}>
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCloseFeedbackModal} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close feedback modal" disabled={isSubmittingFeedback}><X size={22} /></button>
            <h3 className="text-xl font-semibold text-gray-800 mb-5">Feedback for Order #{currentOrderForFeedback.order_id}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Rating:</label>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setFeedbackRating(star)}
                            className={`p-2 rounded transition-colors ${feedbackRating >= star ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`}
                            disabled={isSubmittingFeedback}>
                      <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.966-7.417 3.966 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="feedbackComment" className="block text-sm font-medium text-gray-700 mb-1.5">Comment (Optional):</label>
                <textarea
                  id="feedbackComment"
                  rows="4"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base disabled:bg-gray-100"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Share your thoughts..."
                  disabled={isSubmittingFeedback}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-3">
                <button
                  onClick={handleCloseFeedbackModal}
                  disabled={isSubmittingFeedback}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg shadow-sm disabled:opacity-60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmittingFeedback || feedbackRating === 0}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-60 transition-colors flex items-center"
                >
                  {isSubmittingFeedback ? <Loader2 className="animate-spin mr-2" size={18}/> : null}
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}